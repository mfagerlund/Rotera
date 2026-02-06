/**
 * Debug test for "No Vanisining Lines.rotera" issue.
 *
 * Problem: RMS 439460093.73px when all cameras are enabled.
 * "Broken ViewPoint" alone solves fine (RMS: 0.19px).
 *
 * Working ViewPoint 2's PnP sees garbage centroids (313305, 376190, 876)
 * while Working ViewPoint 1's PnP sees reasonable centroids (2.06, -2.23, 0.32).
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'Calibration', 'No Vanisining Lines.rotera');

describe('No Vanishing Lines Debug', () => {
  it('should solve multi-camera No Vanishing Lines', async () => {
    if (!fs.existsSync(FIXTURE_PATH)) {
      console.log('Fixture not found, skipping');
      return;
    }

    const fixtureJson = fs.readFileSync(FIXTURE_PATH, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    console.log('\n=== INITIAL STATE (from file) ===');

    // Check camera intrinsics
    for (const vp of project.viewpoints) {
      const v = vp as Viewpoint;
      console.log(`Camera ${v.name}:`);
      console.log(`  imageSize: ${v.imageWidth}x${v.imageHeight}`);
      console.log(`  focalLength: ${v.focalLength.toFixed(1)}`);
      console.log(`  principalPoint: (${v.principalPointX.toFixed(1)}, ${v.principalPointY.toFixed(1)})`);
      console.log(`  position: [${v.position.map(p => p.toFixed(2)).join(', ')}]`);

      // Check if principal point is garbage
      const ppxGarbage = v.principalPointX < 0 || v.principalPointX > v.imageWidth;
      const ppyGarbage = v.principalPointY < 0 || v.principalPointY > v.imageHeight;
      if (ppxGarbage || ppyGarbage) {
        console.log(`  *** GARBAGE PRINCIPAL POINT ***`);
      }
    }

    // Check world point positions
    console.log('\n=== WORLD POINT POSITIONS (from file) ===');
    for (const wp of project.worldPoints) {
      const w = wp as WorldPoint;
      const lockedStr = w.lockedXyz.map(v => v === null ? 'null' : v.toFixed(1)).join(', ');
      const optStr = w.optimizedXyz
        ? w.optimizedXyz.map(v => v.toFixed(1)).join(', ')
        : 'undefined';
      const isGarbage = w.optimizedXyz && (
        Math.abs(w.optimizedXyz[0]) > 1000 ||
        Math.abs(w.optimizedXyz[1]) > 1000 ||
        Math.abs(w.optimizedXyz[2]) > 1000
      );
      console.log(`${w.name}: locked=[${lockedStr}], optimized=[${optStr}]${isGarbage ? ' *** GARBAGE ***' : ''}`);
    }

    // DON'T manually reset - let optimizeProject do it (like the UI does)
    // This tests the REAL code path that the user hits
    console.log('\n=== RUNNING OPTIMIZATION (no manual reset - like UI) ===');
    // Use PRODUCTION defaults to match UI behavior exactly
    const result = await optimizeProject(project, {
      // maxIterations: 500 (default)
      // maxAttempts: 3 (default) - this generates 12 candidates
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      verbose: true,
    });

    console.log('\n=== AFTER OPTIMIZATION ===');
    console.log(`Converged: ${result.converged}`);
    console.log(`Residual: ${result.residual.toFixed(2)}`);
    console.log(`RMS: ${result.rmsReprojectionError?.toFixed(2) ?? 'N/A'}px`);

    // Check final world point positions
    console.log('\n=== FINAL WORLD POINT POSITIONS ===');
    for (const wp of project.worldPoints) {
      const w = wp as WorldPoint;
      const optStr = w.optimizedXyz
        ? w.optimizedXyz.map(v => v.toFixed(1)).join(', ')
        : 'undefined';
      const isGarbage = w.optimizedXyz && (
        Math.abs(w.optimizedXyz[0]) > 1000 ||
        Math.abs(w.optimizedXyz[1]) > 1000 ||
        Math.abs(w.optimizedXyz[2]) > 1000
      );
      console.log(`${w.name}: [${optStr}]${isGarbage ? ' *** GARBAGE ***' : ''}`);
    }

    // Check final camera positions
    console.log('\n=== FINAL CAMERA POSITIONS ===');
    for (const vp of project.viewpoints) {
      const v = vp as Viewpoint;
      const posStr = v.position.map(p => p.toFixed(2)).join(', ');
      const isGarbage = Math.abs(v.position[0]) > 1000 ||
                        Math.abs(v.position[1]) > 1000 ||
                        Math.abs(v.position[2]) > 1000;
      console.log(`${v.name}: [${posStr}]${isGarbage ? ' *** GARBAGE ***' : ''}`);
    }

    // The issue: if WV2's late PnP sees garbage centroids, it means
    // world points have garbage positions BEFORE WV2's PnP runs.
    // But WV1's PnP sees reasonable centroids from the SAME points.
    // This can only happen if:
    // 1. Points get modified between WV1 and WV2 PnP
    // 2. Different points are used for each PnP (isTrulyTriangulated filter)
    // 3. Something in the initialization produces garbage for specific points

    // For now, just check that result is reasonable
    expect(result.rmsReprojectionError).toBeLessThan(100);
  });

  it('should work with only Broken ViewPoint enabled', async () => {
    if (!fs.existsSync(FIXTURE_PATH)) {
      console.log('Fixture not found, skipping');
      return;
    }

    const fixtureJson = fs.readFileSync(FIXTURE_PATH, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    // Disable all cameras except Broken ViewPoint
    for (const vp of project.viewpoints) {
      const v = vp as Viewpoint;
      if (v.name !== 'Broken ViewPoint') {
        v.enabledInSolve = false;
      }
    }

    console.log('\n=== SINGLE CAMERA TEST (Broken ViewPoint only) ===');

    const result = await optimizeProject(project, {
      maxIterations: 200,
      maxAttempts: 1,
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      verbose: false,
    });

    console.log(`Converged: ${result.converged}`);
    console.log(`RMS: ${result.rmsReprojectionError?.toFixed(2) ?? 'N/A'}px`);

    // Single camera should work
    expect(result.rmsReprojectionError).toBeLessThan(5);
  });
});
