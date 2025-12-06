/**
 * Regression test for multi-camera fixture where C2's PnP initialization fails.
 *
 * The issue was:
 *  - C1 initializes with VP (great, 2.3 px error)
 *  - C2 initializes with PnP, converges with 0 error but 0/6 points in front
 *  - 180° flip puts 6/6 points in front but error jumps to 2384 px
 *  - Root cause: flip only rotated, didn't re-optimize position for new rotation
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import { Viewpoint } from '../../entities/viewpoint';

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  const json = fs.readFileSync(fixturePath, 'utf-8');
  return loadProjectFromJson(json);
}

describe('Multi-camera fixture with C2 PnP initialization', () => {
  it('should solve all 3 cameras with reasonable reprojection error', () => {
    const project = loadFixture('fails-c2-pnp.json');

    // Verify fixture structure
    expect(project.worldPoints.size).toBe(14);
    expect(project.viewpoints.size).toBe(3);
    expect(project.lines.size).toBe(7);

    // Run optimization
    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxIterations: 200,
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

    // Check each camera position (should not be at origin)
    const cameras = Array.from(project.viewpoints) as Viewpoint[];
    for (const cam of cameras) {
      console.log(`${cam.name}: position=[${cam.position.map(x => x.toFixed(2)).join(', ')}]`);
      // Should not be at origin
      const dist = Math.sqrt(cam.position[0]**2 + cam.position[1]**2 + cam.position[2]**2);
      expect(dist).toBeGreaterThan(10);
    }

    // With 6 locked points and 3 cameras, all should solve well
    // The key assertion: median error should be low for ALL cameras
    expect(result.medianReprojectionError).toBeDefined();
    expect(result.medianReprojectionError!).toBeLessThan(10);

    // Check per-camera: each camera should have low max reprojection error
    // This catches the case where C2 has 1414 px error on all points
    for (const cam of cameras) {
      let maxError = 0;
      for (const ip of cam.imagePoints) {
        if (ip.lastResiduals.length >= 2) {
          const error = Math.sqrt(ip.lastResiduals[0]**2 + ip.lastResiduals[1]**2);
          maxError = Math.max(maxError, error);
        }
      }
      console.log(`${cam.name}: max reprojection error = ${maxError.toFixed(2)} px`);
      expect(maxError).toBeLessThan(50); // Each camera should have < 50 px max error
    }

    // Should converge
    expect(result.converged).toBe(true);
  });
});
