/**
 * Regression test for two-camera VP initialization bug.
 *
 * BUG: When two cameras both VP-initialize independently from axis-aligned lines
 * (without actual vanishing lines), they produce inconsistent camera poses.
 * The triangulated points have bad depths (opposite signs), and the LM solver
 * fails immediately with "Damping adjustment failed" at iter=0.
 *
 * FIX: Only VP-init ONE camera. The second camera should use late PnP after
 * triangulation from the first camera.
 *
 * Fixture: Farnsworth House with 2 images, many axis-aligned lines, no VLs.
 */
import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import * as fs from 'fs';
import * as path from 'path';

describe('Two-Camera VP Initialization Regression', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'farnsworth-house-2cam.rotera');

  it('should not fail with "Damping adjustment failed" on two-camera VP scene', async () => {
    if (!fs.existsSync(fixturePath)) {
      console.log('Fixture file not found, skipping test');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    expect(project.viewpoints.size).toBe(2);
    expect(project.worldPoints.size).toBeGreaterThan(10);

    const result = await optimizeProject(project, {
      maxIterations: 500,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: false,
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxAttempts: 1, // Single attempt for faster test
    });

    // The key regression check: should NOT fail at iter=0 with damping error
    // Before the fix: iter=0, error="Damping adjustment failed"
    // After the fix: iter>0, solver actually runs
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.error).not.toBe('Damping adjustment failed');

    // Should have reasonable residual (not Infinity)
    expect(result.residual).toBeLessThan(10000);
    expect(isFinite(result.residual)).toBe(true);

    // Log result for debugging
    console.log(`[Two-Camera VP Test] iter=${result.iterations}, residual=${result.residual.toFixed(1)}, converged=${result.converged}`);
  });

  it('should produce reasonable reprojection errors', async () => {
    if (!fs.existsSync(fixturePath)) {
      console.log('Fixture file not found, skipping test');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    const result = await optimizeProject(project, {
      maxIterations: 1000,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: false,
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxAttempts: 1,
    });

    // Should have median reprojection error under 50 pixels
    // (The original bug had errors of 200-800+ pixels)
    if (result.medianReprojectionError !== undefined) {
      console.log(`[Two-Camera VP Test] Median reproj error: ${result.medianReprojectionError.toFixed(1)}px`);
      expect(result.medianReprojectionError).toBeLessThan(50);
    }
  });
});
