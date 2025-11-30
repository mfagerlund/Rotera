/**
 * Coordinate Sign Invariance Test
 *
 * Tests that the optimization system works correctly regardless of which
 * direction the coordinate axes point. Both positive and negative Y coordinates
 * should produce equally good results when the scene is properly reflected.
 *
 * NOTE: The original "bad" fixture was geometrically INVALID - it had WP4 at
 * [0, +10, 0] but with image observations from when WP4 was at [0, -10, 0].
 * This is impossible - the same camera can't see both positions at the same
 * image location.
 *
 * The "reflected" fixture properly reflects the ENTIRE scene (world points,
 * camera, and image observations) about the XZ plane, which is geometrically
 * valid.
 */

import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import { Viewpoint } from '../../entities/viewpoint';
import * as fs from 'fs';
import * as path from 'path';

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  const json = fs.readFileSync(fixturePath, 'utf-8');
  return loadProjectFromJson(json);
}

describe('Coordinate Sign Invariance', () => {
  const runOptimization = (fixtureName: string) => {
    const project = loadFixture(fixtureName);

    // Reset camera to force re-initialization
    const camera = Array.from(project.viewpoints)[0] as Viewpoint;
    camera.position = [0, 0, 0];
    camera.rotation = [1, 0, 0, 0];

    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: false,
      maxIterations: 100,
      tolerance: 1e-6,
      verbose: true
    });

    return { project, result, camera };
  };

  it('should solve the GOOD fixture (negative Y) with low error', () => {
    const { result, camera } = runOptimization('coordinate-sign-good.json');

    console.log('\n=== GOOD FIXTURE RESULTS ===');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Residual: ${result.residual.toFixed(6)}`);
    console.log(`Camera position: [${camera.position.map(p => p.toFixed(2)).join(', ')}]`);

    expect(result.converged).toBe(true);
    // Residual should be low (< 1 means sub-pixel accuracy)
    expect(result.residual).toBeLessThan(1.0);
  });

  it('should solve the REFLECTED fixture (positive Y) with low error', () => {
    const { result, camera } = runOptimization('coordinate-sign-reflected.json');

    console.log('\n=== REFLECTED FIXTURE RESULTS ===');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Residual: ${result.residual.toFixed(6)}`);
    console.log(`Camera position: [${camera.position.map(p => p.toFixed(2)).join(', ')}]`);

    expect(result.converged).toBe(true);
    // Residual should be low (< 1 means sub-pixel accuracy)
    expect(result.residual).toBeLessThan(1.0);
  });

  it('should produce similar quality results for both coordinate systems', () => {
    const good = runOptimization('coordinate-sign-good.json');
    const reflected = runOptimization('coordinate-sign-reflected.json');

    console.log('\n=== COMPARISON ===');
    console.log(`Good residual: ${good.result.residual.toFixed(6)}`);
    console.log(`Reflected residual: ${reflected.result.residual.toFixed(6)}`);
    console.log(`Good camera Y: ${good.camera.position[1].toFixed(2)}`);
    console.log(`Reflected camera Y: ${reflected.camera.position[1].toFixed(2)}`);

    // Both should converge
    expect(good.result.converged).toBe(true);
    expect(reflected.result.converged).toBe(true);

    // Both should have similar quality (within 10x)
    const goodResidual = good.result.residual;
    const reflectedResidual = reflected.result.residual;
    const ratio = Math.max(goodResidual, reflectedResidual) / Math.min(goodResidual, reflectedResidual);
    console.log(`Quality ratio: ${ratio.toFixed(2)}x`);

    expect(ratio).toBeLessThan(10);

    // Camera Y positions should be opposite signs (scene is reflected about XZ plane)
    expect(good.camera.position[1] * reflected.camera.position[1]).toBeLessThan(0);
  });
});
