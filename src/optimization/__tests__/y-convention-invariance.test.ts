/**
 * Y Convention Invariance Test
 *
 * Tests that the system works equally well with +Y up or -Y up conventions.
 * The key insight: this is a CONVENTION CHOICE, not a data difference.
 *
 * When a user clicks on a point that's visually "above" in an image:
 * - With -Y up convention: they enter Y = -10
 * - With +Y up convention: they enter Y = +10
 *
 * The IMAGE DATA is the same. Only the world coordinate interpretation changes.
 * The system should handle both equally well.
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

describe('Y Convention Invariance', () => {
  it('should work with -Y up convention (original)', () => {
    const project = loadFixture('coordinate-sign-good.json');

    const camera = Array.from(project.viewpoints)[0] as Viewpoint;
    camera.position = [0, 0, 0];
    camera.rotation = [1, 0, 0, 0];

    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: false,
      maxIterations: 100,
      tolerance: 1e-6,
    });

    console.log('\n=== -Y UP CONVENTION ===');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Residual: ${result.residual.toFixed(6)}`);
    console.log(`Camera Y: ${camera.position[1].toFixed(2)}`);
    console.log(`Median reproj: ${result.medianReprojectionError?.toFixed(3)} px`);

    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(1.0);
  });

  it('should work with +Y up convention (flip world Y and Z to maintain handedness)', () => {
    const project = loadFixture('coordinate-sign-good.json');

    // Flip Y AND Z world coordinates to convert from -Y up to +Y up while maintaining right-handedness
    // Flipping only Y would create a left-handed system, which is incompatible with the rotation matrices
    for (const wp of project.worldPoints) {
      if (wp.lockedXyz[1] !== null) {
        wp.lockedXyz[1] = -wp.lockedXyz[1];
      }
      if (wp.lockedXyz[2] !== null) {
        wp.lockedXyz[2] = -wp.lockedXyz[2];
      }
      if (wp.inferredXyz[1] !== null) {
        wp.inferredXyz[1] = -wp.inferredXyz[1];
      }
      if (wp.inferredXyz[2] !== null) {
        wp.inferredXyz[2] = -wp.inferredXyz[2];
      }
      if (wp.optimizedXyz) {
        wp.optimizedXyz[1] = -wp.optimizedXyz[1];
        wp.optimizedXyz[2] = -wp.optimizedXyz[2];
      }
    }

    const camera = Array.from(project.viewpoints)[0] as Viewpoint;
    camera.position = [0, 0, 0];
    camera.rotation = [1, 0, 0, 0];

    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: false,
      maxIterations: 100,
      tolerance: 1e-6,
    });

    console.log('\n=== +Y UP CONVENTION ===');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Residual: ${result.residual.toFixed(6)}`);
    console.log(`Camera Y: ${camera.position[1].toFixed(2)}`);
    console.log(`Median reproj: ${result.medianReprojectionError?.toFixed(3)} px`);

    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(1.0);
    expect(camera.position[1]).toBeGreaterThan(0); // Camera Y should be positive with +Y up
    expect(camera.position[2]).toBeLessThan(0); // Camera Z should be negative (also flipped)
  });

  it('should produce equal quality for both conventions', () => {
    // Run -Y convention
    const projectNeg = loadFixture('coordinate-sign-good.json');
    const cameraNeg = Array.from(projectNeg.viewpoints)[0] as Viewpoint;
    cameraNeg.position = [0, 0, 0];
    cameraNeg.rotation = [1, 0, 0, 0];
    const resultNeg = optimizeProject(projectNeg, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: false,
    });

    // Run +Y convention (flip world Y and Z to maintain handedness)
    const projectPos = loadFixture('coordinate-sign-good.json');
    for (const wp of projectPos.worldPoints) {
      if (wp.lockedXyz[1] !== null) wp.lockedXyz[1] = -wp.lockedXyz[1];
      if (wp.lockedXyz[2] !== null) wp.lockedXyz[2] = -wp.lockedXyz[2];
      if (wp.inferredXyz[1] !== null) wp.inferredXyz[1] = -wp.inferredXyz[1];
      if (wp.inferredXyz[2] !== null) wp.inferredXyz[2] = -wp.inferredXyz[2];
      if (wp.optimizedXyz) {
        wp.optimizedXyz[1] = -wp.optimizedXyz[1];
        wp.optimizedXyz[2] = -wp.optimizedXyz[2];
      }
    }
    const cameraPos = Array.from(projectPos.viewpoints)[0] as Viewpoint;
    cameraPos.position = [0, 0, 0];
    cameraPos.rotation = [1, 0, 0, 0];
    const resultPos = optimizeProject(projectPos, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: false,
    });

    console.log('\n=== COMPARISON ===');
    console.log(`-Y residual: ${resultNeg.residual.toFixed(6)}`);
    console.log(`+Y residual: ${resultPos.residual.toFixed(6)}`);
    console.log(`-Y camera: Y=${cameraNeg.position[1].toFixed(2)}, Z=${cameraNeg.position[2].toFixed(2)}`);
    console.log(`+Y camera: Y=${cameraPos.position[1].toFixed(2)}, Z=${cameraPos.position[2].toFixed(2)}`);

    // Both should have similar quality (within 2x)
    const ratio = Math.max(resultNeg.residual, resultPos.residual) /
                  Math.min(resultNeg.residual, resultPos.residual);
    console.log(`Quality ratio: ${ratio.toFixed(2)}x`);

    expect(ratio).toBeLessThan(2.0);

    // Camera Y and Z should have opposite signs (since we flipped both)
    expect(cameraNeg.position[1] * cameraPos.position[1]).toBeLessThan(0);
    expect(cameraNeg.position[2] * cameraPos.position[2]).toBeLessThan(0);
  });
});
