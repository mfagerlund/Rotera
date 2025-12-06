/**
 * Regression test for "Simplest" fixture.
 *
 * Single camera with:
 *  - 4 world points at axis corners (O, X, Y, Z)
 *  - 9 vanishing lines (3 per axis)
 *  - 1 vertical line connecting O to Y
 *
 * The issue was:
 *  - VP initialization succeeds with excellent 2.6 px error
 *  - But then optimization diverges to 59 px median error
 *  - Root cause: garbage intrinsics from previous failed solve
 *    (skewCoefficient: -136, aspectRatio: -2.95)
 *  - Fix: Reset skew and aspectRatio to sane defaults during VP init
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  const json = fs.readFileSync(fixturePath, 'utf-8');
  return loadProjectFromJson(json);
}

describe('Simplest fixture (4 locked points, 9 vanishing lines)', () => {
  it('should solve with low reprojection error despite garbage intrinsics in fixture', () => {
    const project = loadFixture('simplest.json');

    // Verify fixture structure
    expect(project.worldPoints.size).toBe(4);
    expect(project.viewpoints.size).toBe(1);
    expect(project.lines.size).toBe(1);

    // All 4 points should be fully constrained (3 locked, 1 inferred from vertical line)
    const constrainedPoints = Array.from(project.worldPoints).filter(
      wp => (wp as WorldPoint).isFullyConstrained()
    );
    expect(constrainedPoints.length).toBe(4);

    // The fixture has garbage intrinsics, but they get reset during optimization
    const camera = Array.from(project.viewpoints)[0] as Viewpoint;

    // Run optimization
    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxIterations: 100,
      tolerance: 1e-6,
      verbose: false,
    });

    // Log result for debugging
    console.log('Optimization result:', {
      converged: result.converged,
      iterations: result.iterations,
      residual: result.residual,
      medianReprojectionError: result.medianReprojectionError,
      error: result.error,
    });

    // Check camera was initialized (not at origin)
    expect(camera.position[0]).not.toBe(0);
    expect(camera.position[1]).not.toBe(0);
    expect(camera.position[2]).not.toBe(0);

    // After VP initialization, intrinsics should be reset to sane values
    expect(camera.skewCoefficient).toBe(0);
    expect(camera.aspectRatio).toBe(1);

    // With 4 locked points and good VP initialization (2.6 px),
    // reprojection should be very low
    expect(result.medianReprojectionError).toBeDefined();
    expect(result.medianReprojectionError!).toBeLessThan(10);

    // Should converge or at least not error
    const acceptableErrors = [null, 'Max iterations reached'];
    expect(acceptableErrors).toContain(result.error);
  });
});
