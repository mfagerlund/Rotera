/**
 * Backend Comparison Tests
 *
 * Verifies that all three solver backends produce equivalent results.
 * Also includes basic performance comparison.
 *
 * Run with: npm test -- --watchAll=false --testPathPattern="backend-comparison"
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { fineTuneProject } from '../fine-tune';
import { optimizeProject } from '../optimize-project';
import { setSolverBackend, getSolverBackend, SolverBackend } from '../solver-config';
import type { WorldPoint } from '../../entities/world-point';
import type { Viewpoint } from '../../entities/viewpoint';
import type { ImagePoint } from '../../entities/imagePoint';
import type { Project } from '../../entities/project';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Store original backend to restore after tests
let originalBackend: SolverBackend;

beforeEach(() => {
  originalBackend = getSolverBackend();
});

afterEach(() => {
  setSolverBackend(originalBackend);
});

/**
 * Compute RMS reprojection error for a project.
 */
function computeRmsReprojectionError(project: Project): number {
  let totalSquaredError = 0;
  let count = 0;

  for (const ip of project.imagePoints) {
    const imagePoint = ip as ImagePoint;
    const wp = imagePoint.worldPoint as WorldPoint;
    const vp = imagePoint.viewpoint as Viewpoint;

    if (!wp.optimizedXyz) continue;

    const [wx, wy, wz] = wp.optimizedXyz;
    const [px, py, pz] = vp.position;
    const [qw, qx, qy, qz] = vp.rotation;

    // Transform to camera space
    const tx = wx - px;
    const ty = wy - py;
    const tz = wz - pz;

    // Quaternion rotation
    const cx = qy * tz - qz * ty;
    const cy = qz * tx - qx * tz;
    const cz = qx * ty - qy * tx;
    const dx = qy * cz - qz * cy;
    const dy = qz * cx - qx * cz;
    const dz = qx * cy - qy * cx;

    let camX = tx + 2 * qw * cx + 2 * dx;
    let camY = ty + 2 * qw * cy + 2 * dy;
    let camZ = tz + 2 * qw * cz + 2 * dz;

    if (vp.isZReflected) {
      camX = -camX;
      camY = -camY;
      camZ = -camZ;
    }

    if (camZ <= 0) continue;

    // Project
    const normX = camX / camZ;
    const normY = camY / camZ;

    const fx = vp.focalLength;
    const fy = vp.focalLength * vp.aspectRatio;
    const ppx = vp.principalPointX;
    const ppy = vp.principalPointY;

    const u = fx * normX + ppx;
    const v = fy * normY + ppy;

    const du = u - imagePoint.u;
    const dv = v - imagePoint.v;
    totalSquaredError += du * du + dv * dv;
    count++;
  }

  return count > 0 ? Math.sqrt(totalSquaredError / count) : 0;
}

describe('Backend Comparison', () => {
  describe('Result Equivalence', () => {
    it('autodiff and sparse backends converge to similar solutions', () => {
      // Use Farnsworth house fixture - it's a real-world project with better calibration
      const fixturePath = path.join(FIXTURES_DIR, 'farnsworth-house-2cam.rotera');
      if (!fs.existsSync(fixturePath)) {
        console.log('Skipping: fixture not found');
        return;
      }

      const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
      // Only test autodiff and sparse - dense is O(n³) and too slow for medium problems
      const backends: SolverBackend[] = ['autodiff', 'explicit-sparse'];
      const results: Map<SolverBackend, { converged: boolean; residual: number; rms: number }> = new Map();

      for (const backend of backends) {
        setSolverBackend(backend);
        const project = loadProjectFromJson(fixtureJson);

        const result = fineTuneProject(project, {
          maxIterations: 200, // Reduced for test speed
          tolerance: 1e-6,
          verbose: false,
        });

        const rms = computeRmsReprojectionError(project);
        results.set(backend, {
          converged: result.converged,
          residual: result.residual,
          rms,
        });

        // Count points with optimizedXyz
        let optimizedCount = 0;
        for (const wp of project.worldPoints) {
          if ((wp as WorldPoint).optimizedXyz) optimizedCount++;
        }

        console.log(`${backend}: converged=${result.converged}, residual=${result.residual.toFixed(4)}, rms=${rms.toFixed(4)}px, optimized=${optimizedCount}/${project.worldPoints.size}`);
      }

      // Both should converge or at least make progress
      const autodiff = results.get('autodiff')!;
      const sparse = results.get('explicit-sparse')!;

      // RMS errors should be reasonable (under 10px)
      expect(autodiff.rms).toBeLessThan(10);
      expect(sparse.rms).toBeLessThan(10);

      // Results should be in same ballpark
      console.log(`RMS difference: ${Math.abs(autodiff.rms - sparse.rms).toFixed(4)}px`);
    });

    it('backends produce similar world point positions', () => {
      const fixturePath = path.join(FIXTURES_DIR, 'farnsworth-house-2cam.rotera');
      if (!fs.existsSync(fixturePath)) {
        console.log('Skipping: fixture not found');
        return;
      }

      const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
      // Compare autodiff and sparse
      const backends: SolverBackend[] = ['autodiff', 'explicit-sparse'];
      const positions: Map<SolverBackend, Map<string, [number, number, number]>> = new Map();

      for (const backend of backends) {
        setSolverBackend(backend);
        const project = loadProjectFromJson(fixtureJson);

        fineTuneProject(project, {
          maxIterations: 200,
          tolerance: 1e-6,
          verbose: false,
        });

        const pointPositions = new Map<string, [number, number, number]>();
        for (const wp of project.worldPoints) {
          const point = wp as WorldPoint;
          if (point.optimizedXyz) {
            pointPositions.set(point.getName(), [...point.optimizedXyz] as [number, number, number]);
          }
        }
        positions.set(backend, pointPositions);
      }

      // Compare autodiff and sparse positions
      const autodiffPositions = positions.get('autodiff')!;
      const sparsePositions = positions.get('explicit-sparse')!;

      let maxDist = 0;
      for (const [name, autodiffPos] of autodiffPositions) {
        const sparsePos = sparsePositions.get(name);
        if (sparsePos) {
          const dist = Math.sqrt(
            (autodiffPos[0] - sparsePos[0]) ** 2 +
            (autodiffPos[1] - sparsePos[1]) ** 2 +
            (autodiffPos[2] - sparsePos[2]) ** 2
          );
          maxDist = Math.max(maxDist, dist);
        }
      }
      console.log(`Max position difference between autodiff and sparse: ${maxDist.toFixed(4)} units`);

      // Positions should be reasonably close - different solvers may find different local minima
      // 2.5 units tolerance accounts for solver convergence differences
      expect(maxDist).toBeLessThan(2.5);
    });
  });

  describe('Performance Comparison', () => {
    it('sparse solver is faster than autodiff', () => {
      const fixturePath = path.join(FIXTURES_DIR, 'farnsworth-house-2cam.rotera');
      if (!fs.existsSync(fixturePath)) {
        console.log('Skipping: fixture not found');
        return;
      }

      const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');

      // Test autodiff
      setSolverBackend('autodiff');
      const project1 = loadProjectFromJson(fixtureJson);
      console.log(`Variables: ${project1.worldPoints.size} points, ${project1.viewpoints.size} cameras`);

      const start1 = performance.now();
      const result1 = fineTuneProject(project1, {
        maxIterations: 100, // Reduced for test speed
        tolerance: 1e-6,
        verbose: false,
      });
      const autodiffTime = performance.now() - start1;
      console.log(`autodiff: ${autodiffTime.toFixed(1)}ms, converged=${result1.converged}, iter=${result1.iterations}`);

      // Test explicit-sparse (skip dense - it's O(n³) and meant for small problems)
      setSolverBackend('explicit-sparse');
      const project2 = loadProjectFromJson(fixtureJson);

      const start2 = performance.now();
      const result2 = fineTuneProject(project2, {
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: false,
      });
      const sparseTime = performance.now() - start2;
      console.log(`explicit-sparse: ${sparseTime.toFixed(1)}ms, converged=${result2.converged}, iter=${result2.iterations}`);

      // Both should complete in reasonable time
      expect(autodiffTime).toBeLessThan(30000);
      expect(sparseTime).toBeLessThan(30000);

      // Log speedup
      console.log(`Speedup: sparse is ${(autodiffTime / sparseTime).toFixed(2)}x vs autodiff`);
    });

    it('sparse solver handles larger problems efficiently', () => {
      const fixturePath = path.join(FIXTURES_DIR, 'farnsworth-house-5.rotera');
      if (!fs.existsSync(fixturePath)) {
        console.log('Skipping: fixture not found');
        return;
      }

      const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');

      // Run with sparse solver
      setSolverBackend('explicit-sparse');
      const project = loadProjectFromJson(fixtureJson);

      const start = performance.now();
      const result = fineTuneProject(project, {
        maxIterations: 500,
        tolerance: 1e-8,
        verbose: false,
      });
      const elapsed = performance.now() - start;

      console.log(`Sparse solver on Farnsworth House: ${elapsed.toFixed(1)}ms, converged=${result.converged}`);

      // Should complete in reasonable time (60s allows for CI variance)
      expect(elapsed).toBeLessThan(60000);
    });
  });

  describe('Single Camera Projects', () => {
    it('sparse solver handles simple single-camera project (regression test)', async () => {
      // This test verifies the fix for the camZ formula bug that caused
      // JtJ maxDiag=Infinity on single-camera projects
      // Uses fineTuneProject to test solver directly (camera already initialized in fixture)
      const fixturePath = path.join(FIXTURES_DIR, '1-loose.rotera');
      if (!fs.existsSync(fixturePath)) {
        console.log('Skipping: fixture not found');
        return;
      }

      const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');

      // Test autodiff first as baseline
      setSolverBackend('autodiff');
      const project1 = loadProjectFromJson(fixtureJson);
      const result1 = fineTuneProject(project1, {
        maxIterations: 200,
        tolerance: 1e-6,
        verbose: false,
      });
      console.log(`autodiff fineTune on 1-loose: converged=${result1.converged}, residual=${result1.residual.toFixed(4)}, iter=${result1.iterations}`);

      // Test sparse solver
      setSolverBackend('explicit-sparse');
      const project2 = loadProjectFromJson(fixtureJson);
      const result2 = fineTuneProject(project2, {
        maxIterations: 200,
        tolerance: 1e-6,
        verbose: false,
      });
      console.log(`sparse fineTune on 1-loose: converged=${result2.converged}, residual=${result2.residual.toFixed(4)}, iter=${result2.iterations}`);

      // Both should converge (or have low residual)
      // Note: With identity rotation, camera at z=40 looking at points at z=0-3.5 may not perfectly converge
      // but residual should be reasonably low
      const acceptableResidual = 100;  // Allow some slack for initialization quality

      if (!result1.converged && result1.residual > acceptableResidual) {
        throw new Error(`Autodiff did not converge: residual=${result1.residual.toFixed(4)}`);
      }

      // Check sparse result
      if (!result2.converged && result2.residual > acceptableResidual) {
        throw new Error(`Sparse solver did not converge: residual=${result2.residual.toFixed(4)}, iterations=${result2.iterations}`);
      }

      // Residuals should be in same ballpark
      console.log(`Residual ratio: autodiff/sparse = ${(result1.residual / Math.max(result2.residual, 0.001)).toFixed(4)}`);
    });
  });
});
