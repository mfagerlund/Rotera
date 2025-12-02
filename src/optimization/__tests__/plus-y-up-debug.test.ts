/**
 * Test for +Y up convention with actual user data
 *
 * This fixture uses +Y up: elevated points have positive Y coordinates.
 * The test verifies that the optimizer can handle +Y up convention correctly.
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

describe('+Y Up User Data', () => {
  it('should optimize correctly with +Y up user data', () => {
    const project = loadFixture('plus-y-up-actual.json');
    const camera = Array.from(project.viewpoints)[0] as Viewpoint;

    // Store original pose for comparison
    const originalPos = [...camera.position];
    const originalY = camera.position[1];

    // Reset camera
    camera.position = [0, 0, 0];
    camera.rotation = [1, 0, 0, 0];

    // Clear optimized values
    for (const wp of project.worldPoints) {
      wp.optimizedXyz = undefined;
    }

    console.log('\n=== +Y UP USER DATA ===');
    console.log('World points:');
    for (const wp of project.worldPoints) {
      const locked = wp.lockedXyz;
      const effective = wp.getEffectiveXyz();
      console.log(`  ${wp.name}: locked=[${locked.map(v => v?.toFixed(1) ?? 'null').join(', ')}], effective=[${effective.map(v => v?.toFixed(1) ?? 'null').join(', ')}]`);
    }

    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: false,
      maxIterations: 100,
      tolerance: 1e-6,
    });

    console.log('\n=== RESULTS ===');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Residual: ${result.residual.toFixed(6)}`);
    console.log(`Camera position: [${camera.position.map(v => v.toFixed(2)).join(', ')}]`);
    console.log(`Original position: [${originalPos.map(v => v.toFixed(2)).join(', ')}]`);
    console.log(`Median reproj: ${result.medianReprojectionError?.toFixed(3)} px`);

    // For +Y up, camera should be at positive Y (above ground)
    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(20.0); // This fixture has some noise
    expect(camera.position[1]).toBeGreaterThan(0); // Camera Y should be positive
  });
});
