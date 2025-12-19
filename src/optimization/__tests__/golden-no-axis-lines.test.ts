import { describe, it, expect } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  const json = fs.readFileSync(fixturePath, 'utf-8');
  return loadProjectFromJson(json);
}

describe.skip('GOLDEN: No-Axis Lines (Essential Matrix + Free Solve)', () => {
  /**
   * This test validates the "free solve then align" approach for Essential Matrix initialization
   * when there are NO axis constraints on lines.
   *
   * Scenario:
   * - 8 world points, 2 cameras (8+8 = 16 image points)
   * - 1 locked point (O at origin)
   * - 1 length constraint (O -> WP1 = 20 units)
   * - 2 coplanar constraints
   * - NO axis direction constraints (x, y, z) on lines
   *
   * The challenge: Without axis constraints, the scene orientation is arbitrary after
   * Essential Matrix initialization. The optimizer must:
   * 1. Triangulate all points freely (ignoring locked point positions)
   * 2. Run preliminary optimization to satisfy geometric constraints
   * 3. Apply similarity transform to align with locked points
   * 4. Run final optimization to minimize reprojection error
   *
   * Expected performance:
   * - Median reprojection error < 0.2 px (achieves ~0.11 px)
   * - Length constraint satisfied to < 0.1 units (achieves ~0.001 units)
   */
  it('should solve 8+8 two-camera scene without axis constraints on lines', () => {
    console.log('\n=== GOLDEN: NO-AXIS LINES ===\n');

    const project = loadFixture('no-axis-simple-8-8.json');

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

    // Verify setup
    const lockedPoints = Array.from(project.worldPoints).filter(wp => wp.isFullyConstrained());
    const linesWithLength = Array.from(project.lines).filter(l => l.targetLength !== undefined);
    const axisConstrainedLines = Array.from(project.lines).filter(l =>
      l.direction && ['x', 'y', 'z'].includes(l.direction)
    );

    console.log('Setup verification:');
    console.log(`  World Points: ${project.worldPoints.size}`);
    console.log(`  Viewpoints: ${project.viewpoints.size}`);
    console.log(`  Image Points: ${project.imagePoints.size}`);
    console.log(`  Constraints: ${project.constraints.size}`);
    console.log(`  Locked points: ${lockedPoints.length}`);
    console.log(`  Lines with length: ${linesWithLength.length}`);
    console.log(`  Axis-constrained lines: ${axisConstrainedLines.length}`);
    console.log();

    // This test specifically validates the case with NO axis constraints
    expect(axisConstrainedLines.length).toBe(0);
    expect(lockedPoints.length).toBeGreaterThan(0);
    expect(linesWithLength.length).toBeGreaterThan(0);

    // Run optimization
    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: true,
      maxIterations: 100,
      tolerance: 1e-8,
      verbose: false
    });

    console.log('Optimization result:');
    console.log(`  Converged: ${result.converged}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Total Error: ${result.residual.toFixed(6)}`);
    console.log(`  Median Reprojection Error: ${result.medianReprojectionError?.toFixed(6)} px`);
    console.log();

    // Check length constraint satisfaction
    const originPoint = Array.from(project.worldPoints).find(wp => wp.name === 'O') as WorldPoint;
    const wp1 = Array.from(project.worldPoints).find(wp => wp.name === 'WP1') as WorldPoint;

    expect(originPoint).toBeDefined();
    expect(wp1).toBeDefined();
    expect(originPoint.optimizedXyz).toBeDefined();
    expect(wp1.optimizedXyz).toBeDefined();

    const computedDistance = Math.sqrt(
      (wp1.optimizedXyz![0] - originPoint.optimizedXyz![0]) ** 2 +
      (wp1.optimizedXyz![1] - originPoint.optimizedXyz![1]) ** 2 +
      (wp1.optimizedXyz![2] - originPoint.optimizedXyz![2]) ** 2
    );
    const targetLength = linesWithLength[0].targetLength!;
    const lengthError = Math.abs(computedDistance - targetLength);

    console.log('Length constraint verification:');
    console.log(`  Target: ${targetLength}`);
    console.log(`  Computed: ${computedDistance.toFixed(6)}`);
    console.log(`  Error: ${lengthError.toFixed(6)}`);
    console.log();

    // Golden performance assertions
    // These thresholds are based on achieved performance (with margin):
    // - Actual median reprojection: ~0.11 px -> threshold 0.2 px
    // - Actual length error: ~0.001 -> threshold 0.1
    expect(result.medianReprojectionError).toBeLessThan(0.2);
    expect(lengthError).toBeLessThan(0.1);

    // Verify locked point is at origin
    expect(originPoint.optimizedXyz![0]).toBeCloseTo(0, 3);
    expect(originPoint.optimizedXyz![1]).toBeCloseTo(0, 3);
    expect(originPoint.optimizedXyz![2]).toBeCloseTo(0, 3);

    console.log('GOLDEN TEST PASSED\n');
  });

  it('should produce deterministic results across multiple runs', () => {
    // Run 1
    const project1 = loadFixture('no-axis-simple-8-8.json');
    for (const wp of project1.worldPoints) {
      if (!wp.isFullyConstrained()) {
        (wp as WorldPoint).optimizedXyz = undefined;
      }
    }
    for (const vp of project1.viewpoints) {
      (vp as Viewpoint).position = [0, 0, 0];
      (vp as Viewpoint).rotation = [1, 0, 0, 0];
      (vp as Viewpoint).focalLength = Math.max((vp as Viewpoint).imageWidth, (vp as Viewpoint).imageHeight);
    }

    const result1 = optimizeProject(project1, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: true,
      maxIterations: 100,
      tolerance: 1e-8,
      verbose: false
    });

    // Run 2
    const project2 = loadFixture('no-axis-simple-8-8.json');
    for (const wp of project2.worldPoints) {
      if (!wp.isFullyConstrained()) {
        (wp as WorldPoint).optimizedXyz = undefined;
      }
    }
    for (const vp of project2.viewpoints) {
      (vp as Viewpoint).position = [0, 0, 0];
      (vp as Viewpoint).rotation = [1, 0, 0, 0];
      (vp as Viewpoint).focalLength = Math.max((vp as Viewpoint).imageWidth, (vp as Viewpoint).imageHeight);
    }

    const result2 = optimizeProject(project2, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: true,
      maxIterations: 100,
      tolerance: 1e-8,
      verbose: false
    });

    // Results should be identical (deterministic)
    expect(result1.residual).toBeCloseTo(result2.residual, 6);
    expect(result1.medianReprojectionError).toBeCloseTo(result2.medianReprojectionError!, 6);
    expect(result1.iterations).toBe(result2.iterations);
  });
});
