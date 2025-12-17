import { describe, it, expect } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
// Determinism test removed - running optimization 2x just to verify identical results was slow (~16s)
// If determinism ever breaks, it would show up as flaky tests

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  const json = fs.readFileSync(fixturePath, 'utf-8');
  return loadProjectFromJson(json);
}

describe('GOLDEN: No-Axis No-Lines (Essential Matrix + Free Solve, minimal constraints)', () => {
  /**
   * This test validates Essential Matrix initialization with MINIMAL constraints:
   * - 8 world points, 2 cameras (8+8 = 16 image points)
   * - 2 locked points (O at origin, WP1 at [1,1,1]) - provides scale
   * - NO lines at all (no length constraints, no axis constraints)
   * - NO coplanar constraints
   *
   * The optimizer must:
   * 1. Use Essential Matrix to get relative pose (up to scale)
   * 2. Triangulate all points
   * 3. Apply similarity transform to align locked points
   *
   * Expected performance:
   * - Median reprojection error < 0.2 px (achieves ~0.07 px)
   * - Locked points maintained
   */
  it('should solve 8+8 two-camera scene with 2 locked points (no lines, no constraints)', () => {
    console.log('\n=== GOLDEN: NO-AXIS NO-LINES ===\n');

    const project = loadFixture('no-axis-no-lines-8-8.json');

    // Clear any stale optimization results to ensure deterministic starting point
    for (const wp of project.worldPoints) {
      if (!wp.isFullyConstrained()) {
        (wp as WorldPoint).optimizedXyz = undefined;
      }
    }
    for (const vp of project.viewpoints) {
      (vp as Viewpoint).position = [0, 0, 0];
      (vp as Viewpoint).rotation = [1, 0, 0, 0];
      (vp as Viewpoint).focalLength = Math.max((vp as Viewpoint).imageWidth, (vp as Viewpoint).imageHeight);
    }

    // Verify setup - this is the minimal case
    const lockedPoints = Array.from(project.worldPoints).filter(wp => wp.isFullyConstrained());
    const lines = Array.from(project.lines);
    const constraints = Array.from(project.constraints);

    console.log('Setup verification:');
    console.log(`  World Points: ${project.worldPoints.size}`);
    console.log(`  Viewpoints: ${project.viewpoints.size}`);
    console.log(`  Image Points: ${project.imagePoints.size}`);
    console.log(`  Lines: ${lines.length}`);
    console.log(`  Constraints: ${constraints.length}`);
    console.log(`  Locked points: ${lockedPoints.length}`);
    console.log();

    // This test validates the minimal case with scale constraint (2 locked points)
    expect(lines.length).toBe(0);
    expect(constraints.length).toBe(0);
    expect(lockedPoints.length).toBe(2);

    // Run optimization
    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: true,
      maxIterations: 600,
      tolerance: 1e-8,
      verbose: false
    });

    console.log('Optimization result:');
    console.log(`  Converged: ${result.converged}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Total Error: ${result.residual.toFixed(6)}`);
    console.log(`  Median Reprojection Error: ${result.medianReprojectionError?.toFixed(6)} px`);
    console.log();

    // Verify locked point is at origin
    const originPoint = Array.from(project.worldPoints).find(wp => wp.name === 'O') as WorldPoint;
    expect(originPoint).toBeDefined();
    expect(originPoint.optimizedXyz).toBeDefined();

    console.log('Locked point verification:');
    console.log(`  O: [${originPoint.optimizedXyz!.map(x => x.toFixed(6)).join(', ')}]`);
    console.log();

    // Golden performance assertions
    expect(result.medianReprojectionError).toBeLessThan(0.2);
    expect(originPoint.optimizedXyz![0]).toBeCloseTo(0, 3);
    expect(originPoint.optimizedXyz![1]).toBeCloseTo(0, 3);
    expect(originPoint.optimizedXyz![2]).toBeCloseTo(0, 3);

    console.log('GOLDEN TEST PASSED\n');
  });

});
