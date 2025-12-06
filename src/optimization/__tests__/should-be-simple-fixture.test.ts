/**
 * Regression test for "Should Be Simple" fixture (user-provided).
 *
 * Single camera with:
 *  - 5 world points (4 locked at corners of a 10-unit cube: O, X, Y, Z)
 *  - Vanishing lines for X/Y/Z axes
 *  - 1 unlocked point (WP5)
 *
 * The issue was:
 *  - VP initialization fails ("Not enough locked points with image observations")
 *  - PnP gets error of 50.56 px which is just above the 50px threshold
 *  - Camera gets marked as unreliable and excluded
 *  - With only 1 camera, optimization fails completely
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

describe('Should Be Simple fixture', () => {
  it('should successfully optimize single camera with 4 locked points', () => {
    const project = loadFixture('ShouldBeSimple.json');

    // Verify fixture structure
    expect(project.worldPoints.size).toBe(5);
    expect(project.viewpoints.size).toBe(1);

    const lockedPoints = Array.from(project.worldPoints).filter(
      wp => (wp as WorldPoint).isFullyConstrained()
    );
    expect(lockedPoints.length).toBe(4);

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
    const camera = Array.from(project.viewpoints)[0] as Viewpoint;
    expect(camera.position[0]).not.toBe(0);
    expect(camera.position[1]).not.toBe(0);
    expect(camera.position[2]).not.toBe(0);

    // Check reprojection error is reasonable
    // With 4 locked points and manually clicked image points, 60px is acceptable
    // (manual clicking accuracy + potential lens distortion not modeled)
    expect(result.medianReprojectionError).toBeDefined();
    expect(result.medianReprojectionError!).toBeLessThan(60);

    // Optimization may not fully converge but should make progress
    // "Max iterations reached" is acceptable; fatal errors are not
    const acceptableErrors = [null, 'Max iterations reached'];
    expect(acceptableErrors).toContain(result.error);

    // Verify the unlocked point got optimized
    const wp3 = Array.from(project.worldPoints).find(
      wp => wp.name === 'WP3'
    ) as WorldPoint;
    expect(wp3).toBeDefined();
    expect(wp3.optimizedXyz).toBeDefined();
  });
});
