/**
 * Numerical vs Analytical Gradient Comparison
 *
 * Compares three solver configurations:
 * 1. Autodiff - known working baseline
 * 2. Numerical gradients + sparse solver - validates sparse infrastructure
 * 3. Analytical gradients + sparse solver - current implementation
 *
 * If (1) and (2) match but (3) differs, the problem is in the analytical gradients.
 * If (1) and (2) differ, the problem is in the sparse solver infrastructure.
 *
 * Run with: npm test -- --watchAll=false --testPathPattern="numerical-vs-analytical"
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { fineTuneProject } from '../fine-tune';
import { solveWithNumericalJacobian } from '../explicit-jacobian/adapter/numerical-adapter';
import { setSolverBackend, getSolverBackend, SolverBackend } from '../solver-config';
import type { WorldPoint } from '../../entities/world-point/WorldPoint';
import type { Viewpoint } from '../../entities/viewpoint/Viewpoint';
import type { ImagePoint } from '../../entities/imagePoint/ImagePoint';
import type { Line } from '../../entities/line/Line';
import type { Project } from '../../entities/project';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const log = (msg: string) => process.stderr.write(msg + '\n');

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

describe('Numerical vs Analytical Gradient Comparison', () => {
  describe('Minimal 1 Image test case', () => {
    it('compares all three solver backends', () => {
      const fixturePath = path.join(FIXTURES_DIR, 'minimal-1-image.rotera');
      if (!fs.existsSync(fixturePath)) {
        log(`Skipping: fixture not found at ${fixturePath}`);
        return;
      }

      const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');

      log('');
      log('=== Testing Minimal 1 Image ===');
      log('');

      // Test 1: Autodiff (baseline)
      log('1. AUTODIFF (baseline):');
      setSolverBackend('autodiff');
      const project1 = loadProjectFromJson(fixtureJson);

      const result1 = fineTuneProject(project1, {
        maxIterations: 200,
        tolerance: 1e-6,
        verbose: false,
      });
      const rms1 = computeRmsReprojectionError(project1);
      log(`   Converged: ${result1.converged}, Residual: ${result1.residual.toFixed(4)}, RMS: ${rms1.toFixed(4)}px`);

      // Test 2: Numerical gradients + sparse solver
      log('2. NUMERICAL + SPARSE:');
      const project2 = loadProjectFromJson(fixtureJson);

      // Collect entities
      const points2 = Array.from(project2.worldPoints) as WorldPoint[];
      const lines2 = Array.from(project2.lines) as Line[];
      const cameras2 = Array.from(project2.viewpoints) as Viewpoint[];
      const imagePoints2 = Array.from(project2.imagePoints) as ImagePoint[];

      log(`   Points: ${points2.length}, Lines: ${lines2.length}, Cameras: ${cameras2.length}, ImagePoints: ${imagePoints2.length}`);

      const result2 = solveWithNumericalJacobian(points2, lines2, cameras2, imagePoints2, {
        maxIterations: 200,
        tolerance: 1e-6,
        verbose: true,
      });
      const rms2 = computeRmsReprojectionError(project2);
      log(`   Converged: ${result2.converged}, Residual: ${Math.sqrt(2 * result2.finalCost).toFixed(4)}, RMS: ${rms2.toFixed(4)}px`);

      // Test 3: Analytical gradients + sparse solver
      log('3. ANALYTICAL + SPARSE:');
      setSolverBackend('explicit-sparse');
      const project3 = loadProjectFromJson(fixtureJson);

      const result3 = fineTuneProject(project3, {
        maxIterations: 200,
        tolerance: 1e-6,
        verbose: false,
      });
      const rms3 = computeRmsReprojectionError(project3);
      log(`   Converged: ${result3.converged}, Residual: ${result3.residual.toFixed(4)}, RMS: ${rms3.toFixed(4)}px`);

      log('');
      log('=== DIAGNOSIS ===');

      const autodiffOk = rms1 < 10;
      const numericalOk = rms2 < 10;
      const analyticalOk = rms3 < 10;

      log(`Autodiff works:    ${autodiffOk ? 'YES' : 'NO'} (RMS: ${rms1.toFixed(2)}px)`);
      log(`Numerical works:   ${numericalOk ? 'YES' : 'NO'} (RMS: ${rms2.toFixed(2)}px)`);
      log(`Analytical works:  ${analyticalOk ? 'YES' : 'NO'} (RMS: ${rms3.toFixed(2)}px)`);
      log('');

      if (autodiffOk && numericalOk && !analyticalOk) {
        log('CONCLUSION: Bug is in ANALYTICAL GRADIENTS (hand-coded gradient functions)');
      } else if (autodiffOk && !numericalOk && !analyticalOk) {
        log('CONCLUSION: Bug is in SPARSE SOLVER INFRASTRUCTURE');
      } else if (!autodiffOk) {
        log('CONCLUSION: Autodiff also fails - problem is in test setup or data');
      } else if (autodiffOk && numericalOk && analyticalOk) {
        log('CONCLUSION: All solvers work! No bug found.');
      } else {
        log('CONCLUSION: Unexpected pattern - needs investigation');
      }
      log('');

      // Assertions
      expect(autodiffOk).toBe(true);
      // We're testing to find where the bug is, so we don't assert on numerical/analytical
    });
  });

  describe('Farnsworth House test case', () => {
    it('compares all three solver backends on 2-camera setup', () => {
      const fixturePath = path.join(FIXTURES_DIR, 'farnsworth-house-2cam.rotera');
      if (!fs.existsSync(fixturePath)) {
        log(`Skipping: fixture not found at ${fixturePath}`);
        return;
      }

      const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');

      log('');
      log('=== Testing Farnsworth House 2-cam ===');
      log('');

      // Test 1: Autodiff (baseline)
      log('1. AUTODIFF (baseline):');
      setSolverBackend('autodiff');
      const project1 = loadProjectFromJson(fixtureJson);

      const result1 = fineTuneProject(project1, {
        maxIterations: 200,
        tolerance: 1e-6,
        verbose: false,
      });
      const rms1 = computeRmsReprojectionError(project1);
      log(`   Converged: ${result1.converged}, Residual: ${result1.residual.toFixed(4)}, RMS: ${rms1.toFixed(4)}px`);

      // Test 2: Numerical gradients + sparse solver
      log('2. NUMERICAL + SPARSE:');
      const project2 = loadProjectFromJson(fixtureJson);

      const points2 = Array.from(project2.worldPoints) as WorldPoint[];
      const lines2 = Array.from(project2.lines) as Line[];
      const cameras2 = Array.from(project2.viewpoints) as Viewpoint[];
      const imagePoints2 = Array.from(project2.imagePoints) as ImagePoint[];

      const result2 = solveWithNumericalJacobian(points2, lines2, cameras2, imagePoints2, {
        maxIterations: 200,
        tolerance: 1e-6,
        verbose: false,
      });
      const rms2 = computeRmsReprojectionError(project2);
      log(`   Converged: ${result2.converged}, Residual: ${Math.sqrt(2 * result2.finalCost).toFixed(4)}, RMS: ${rms2.toFixed(4)}px`);

      // Test 3: Analytical gradients + sparse solver
      log('3. ANALYTICAL + SPARSE:');
      setSolverBackend('explicit-sparse');
      const project3 = loadProjectFromJson(fixtureJson);

      const result3 = fineTuneProject(project3, {
        maxIterations: 200,
        tolerance: 1e-6,
        verbose: false,
      });
      const rms3 = computeRmsReprojectionError(project3);
      log(`   Converged: ${result3.converged}, Residual: ${result3.residual.toFixed(4)}, RMS: ${rms3.toFixed(4)}px`);

      log('');
      log('=== DIAGNOSIS ===');

      const autodiffOk = rms1 < 10;
      const numericalOk = rms2 < 10;
      const analyticalOk = rms3 < 10;

      log(`Autodiff works:    ${autodiffOk ? 'YES' : 'NO'} (RMS: ${rms1.toFixed(2)}px)`);
      log(`Numerical works:   ${numericalOk ? 'YES' : 'NO'} (RMS: ${rms2.toFixed(2)}px)`);
      log(`Analytical works:  ${analyticalOk ? 'YES' : 'NO'} (RMS: ${rms3.toFixed(2)}px)`);
      log('');

      // Assertions
      expect(autodiffOk).toBe(true);
    });
  });
});
