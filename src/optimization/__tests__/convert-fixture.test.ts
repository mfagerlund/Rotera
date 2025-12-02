/**
 * Test that both +Y up and -Y up coordinate conventions work correctly
 *
 * IMPORTANT: These tests verify that each convention works with NATIVE data.
 * You CANNOT convert a -Y fixture to +Y by simply flipping Y coordinates -
 * this creates an impossible geometry where image observations don't match
 * the 3D world structure.
 *
 * Mathematical explanation:
 * When you flip world Y coordinates but keep the same image observations:
 * - rel' = [rel.x, -rel.y, rel.z]  (flipped relative coordinates)
 * - For same projection, need cam' = cam (same camera space)
 * - This requires R' * rel' = R * rel
 * - Which means R' = R * diag(1,-1,1)
 * - But det(diag(1,-1,1)) = -1, making R' a reflection, not a rotation
 * - Quaternions cannot represent reflections!
 *
 * The correct approach:
 * 1. User defines coordinate convention at project start (+Y up or -Y up)
 * 2. User places world points and draws vanishing lines consistently
 * 3. VP init and optimizer work correctly for either convention
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

describe('Y Coordinate Convention Tests', () => {
  it('should work correctly with -Y up convention (coordinate-sign-good.json)', () => {
    // This fixture uses -Y up: elevated points have negative Y coordinates
    // WP4 is at [0, -10, 0] - elevated 10 units "up" in -Y convention
    const project = loadFixture('coordinate-sign-good.json');
    const camera = Array.from(project.viewpoints)[0] as Viewpoint;

    // Reset camera
    camera.position = [0, 0, 0];
    camera.rotation = [1, 0, 0, 0];

    console.log('\n=== -Y UP CONVENTION TEST ===');
    console.log('World points:');
    for (const wp of project.worldPoints) {
      const eff = wp.getEffectiveXyz();
      if (eff.every(v => v !== null)) {
        console.log(`  ${wp.name}: [${eff.map(v => v?.toFixed(1) ?? 'null').join(', ')}]`);
      }
    }

    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: false,
    });

    console.log(`\nResult: residual=${result.residual.toFixed(4)}, camY=${camera.position[1].toFixed(2)}`);

    // For -Y up, camera should be at negative Y (below ground plane)
    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(1.0);
    expect(camera.position[1]).toBeLessThan(0); // Camera Y should be negative
  });

  it('should work correctly with +Y up convention (plus-y-up-actual.json)', () => {
    // This fixture uses +Y up: elevated points have positive Y coordinates
    // WP4 is at [0, +10, 0] - elevated 10 units "up" in +Y convention
    const project = loadFixture('plus-y-up-actual.json');
    const camera = Array.from(project.viewpoints)[0] as Viewpoint;

    // Store original pose for comparison
    const originalY = camera.position[1];

    // Reset camera
    camera.position = [0, 0, 0];
    camera.rotation = [1, 0, 0, 0];

    // Clear optimized values
    for (const wp of project.worldPoints) {
      wp.optimizedXyz = undefined;
    }

    console.log('\n=== +Y UP CONVENTION TEST ===');
    console.log('World points:');
    for (const wp of project.worldPoints) {
      const eff = wp.getEffectiveXyz();
      if (eff.every(v => v !== null)) {
        console.log(`  ${wp.name}: [${eff.map(v => v?.toFixed(1) ?? 'null').join(', ')}]`);
      }
    }

    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: false,
    });

    console.log(`\nResult: residual=${result.residual.toFixed(4)}, camY=${camera.position[1].toFixed(2)} (original=${originalY.toFixed(2)})`);

    // For +Y up, camera should be at positive Y (above ground plane)
    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(20.0); // This fixture has some noise
    expect(camera.position[1]).toBeGreaterThan(0); // Camera Y should be positive
  });

  it('should explain why Y-flip conversion is mathematically invalid', () => {
    // This test documents why you cannot simply flip Y coordinates
    // and expect the same optimization quality.

    console.log('\n=== Y-FLIP CONVERSION ANALYSIS ===');
    console.log('');
    console.log('Given: -Y up fixture with working camera pose');
    console.log('  World point at [0, -10, 0] (elevated)');
    console.log('  Camera at [50, -40, 60]');
    console.log('  rel = [0-50, -10-(-40), 0-60] = [-50, 30, -60]');
    console.log('');
    console.log('After flipping Y:');
    console.log('  World point at [0, +10, 0] (flipped)');
    console.log('  Camera at [50, +40, 60] (flipped)');
    console.log('  rel\' = [0-50, +10-(+40), 0-60] = [-50, -30, -60]');
    console.log('');
    console.log('Note: rel.y changed from +30 to -30');
    console.log('');
    console.log('For same projection, need R\' * rel\' = R * rel');
    console.log('This requires R\' = R * diag(1,-1,1)');
    console.log('But det(diag(1,-1,1)) = -1 (reflection)');
    console.log('');
    console.log('Conclusion: Y-flip requires a REFLECTION matrix,');
    console.log('which quaternions cannot represent.');
    console.log('');
    console.log('Solution: Use native +Y or -Y convention from start.');
    console.log('The optimizer handles both conventions correctly.');

    // This is a documentation test - it always passes
    expect(true).toBe(true);
  });
});
