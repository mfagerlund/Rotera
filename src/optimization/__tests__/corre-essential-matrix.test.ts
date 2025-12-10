/**
 * Test for Corre project Essential Matrix initialization
 * This is a debugging test for a real-world project that fails to solve correctly.
 */

import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject, resetOptimizationState } from '../optimize-project';
import { initializeCamerasWithEssentialMatrix } from '../essential-matrix';
import * as fs from 'fs';
import * as path from 'path';

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  const json = fs.readFileSync(fixturePath, 'utf-8');
  return loadProjectFromJson(json);
}

describe('Corre Essential Matrix Debug', () => {
  it('should initialize and optimize the Corre project correctly', () => {
    const project = loadFixture('corre-essential-matrix-debug.json');

    console.log('\n=== Corre Essential Matrix Debug ===\n');
    console.log(`World Points: ${project.worldPoints.size}`);
    console.log(`Lines: ${project.lines.size}`);
    console.log(`Viewpoints: ${project.viewpoints.size}`);
    console.log(`Image Points: ${project.imagePoints.size}`);

    // Check viewpoints
    const viewpoints = Array.from(project.viewpoints);
    for (const vp of viewpoints) {
      console.log(`\nViewpoint ${vp.name}:`);
      console.log(`  Image: ${vp.imageWidth}x${vp.imageHeight}`);
      console.log(`  Focal length: ${vp.focalLength}`);
      console.log(`  Principal point: (${vp.principalPointX}, ${vp.principalPointY})`);
      console.log(`  Image points: ${vp.imagePoints.size}`);
    }

    // Check world points
    const worldPoints = Array.from(project.worldPoints);
    console.log('\nWorld Points:');
    for (const wp of worldPoints) {
      console.log(`  ${wp.name}: locked=${JSON.stringify(wp.lockedXyz)}, inferred=${JSON.stringify(wp.inferredXyz)}`);
    }

    // Check lines
    const lines = Array.from(project.lines);
    console.log('\nLines:');
    for (const line of lines) {
      console.log(`  ${line.name}: ${line.pointA.name} -> ${line.pointB.name}, direction=${line.direction}, targetLength=${line.targetLength}`);
    }

    // Reset state and fix garbage intrinsics
    resetOptimizationState(project);

    // CRITICAL: The saved project has garbage intrinsics from a previous failed solve
    // Reset them to sane values before optimization
    for (const vp of viewpoints) {
      // Reset focal length to image width (reasonable default)
      vp.focalLength = vp.imageWidth;
      // Reset principal point to image center
      vp.principalPointX = vp.imageWidth / 2;
      vp.principalPointY = vp.imageHeight / 2;
      // Reset camera pose
      vp.position = [0, 0, 0];
      vp.rotation = [1, 0, 0, 0];
      console.log(`  Reset ${vp.name}: focal=${vp.focalLength}, pp=(${vp.principalPointX}, ${vp.principalPointY})`);
    }

    // Also clear optimizedXyz on world points so they get re-triangulated
    for (const wp of worldPoints) {
      if (wp.lockedXyz.every((v: number | null) => v === null)) {
        wp.optimizedXyz = undefined;
      }
    }

    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: true,
      maxIterations: 200,
      tolerance: 1e-6,
      damping: 1e-3, // Use low damping for better convergence with limited iterations
      verbose: false
    });

    console.log('\n=== Optimization Result ===');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Residual: ${result.residual}`);
    console.log(`Error: ${result.error}`);
    console.log(`Median reprojection error: ${result.medianReprojectionError?.toFixed(2)} px`);
    console.log(`Cameras initialized: ${result.camerasInitialized?.join(', ')}`);
    console.log(`Cameras excluded: ${result.camerasExcluded?.join(', ')}`);

    // Check camera positions after optimization
    console.log('\nCamera positions after optimization:');
    for (const vp of viewpoints) {
      console.log(`  ${vp.name}: pos=[${vp.position.map(v => v.toFixed(3)).join(', ')}], focal=${vp.focalLength.toFixed(1)}`);
    }

    // Check world point positions
    console.log('\nWorld point positions after optimization:');
    for (const wp of worldPoints) {
      if (wp.optimizedXyz) {
        console.log(`  ${wp.name}: [${wp.optimizedXyz.map(v => v.toFixed(3)).join(', ')}]`);
      } else {
        console.log(`  ${wp.name}: no optimizedXyz`);
      }
    }

    // For now, just check it doesn't crash and produces some result
    expect(result.residual).toBeDefined();

    // The real test: median reprojection error should be reasonable for a good solve
    // Note: This is real photo data which may have some measurement noise
    if (result.medianReprojectionError !== undefined) {
      console.log(`\nMedian reprojection error: ${result.medianReprojectionError.toFixed(2)} px`);
      expect(result.medianReprojectionError).toBeLessThan(10);
    }
  });

  it('should test Essential Matrix initialization directly', () => {
    const project = loadFixture('corre-essential-matrix-debug.json');
    resetOptimizationState(project);

    const viewpoints = Array.from(project.viewpoints);
    const vp1 = viewpoints[0];
    const vp2 = viewpoints[1];

    // Reset intrinsics to reasonable values
    vp1.focalLength = vp1.imageWidth;
    vp1.principalPointX = vp1.imageWidth / 2;
    vp1.principalPointY = vp1.imageHeight / 2;

    vp2.focalLength = vp2.imageWidth;
    vp2.principalPointX = vp2.imageWidth / 2;
    vp2.principalPointY = vp2.imageHeight / 2;

    console.log('\n=== Direct Essential Matrix Test ===\n');
    console.log(`VP1: ${vp1.name}, ${vp1.imageWidth}x${vp1.imageHeight}, f=${vp1.focalLength}`);
    console.log(`VP2: ${vp2.name}, ${vp2.imageWidth}x${vp2.imageHeight}, f=${vp2.focalLength}`);

    // Count correspondences
    let correspondences = 0;
    for (const ip1 of vp1.imagePoints) {
      for (const ip2 of vp2.imagePoints) {
        if (ip1.worldPoint === ip2.worldPoint) {
          correspondences++;
          console.log(`  ${ip1.worldPoint.name}: vp1=(${ip1.u.toFixed(1)}, ${ip1.v.toFixed(1)}), vp2=(${ip2.u.toFixed(1)}, ${ip2.v.toFixed(1)})`);
        }
      }
    }
    console.log(`\nTotal correspondences: ${correspondences}`);

    // Run Essential Matrix initialization
    const result = initializeCamerasWithEssentialMatrix(vp1, vp2, 10.0);

    console.log(`\nResult: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }

    expect(result.success).toBe(true);

    console.log(`\nCamera 1: pos=[${vp1.position.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`Camera 2: pos=[${vp2.position.map(v => v.toFixed(3)).join(', ')}]`);

    // Verify camera 1 is at origin
    expect(vp1.position).toEqual([0, 0, 0]);
    expect(vp1.rotation).toEqual([1, 0, 0, 0]);

    // Verify camera 2 has moved
    const cam2Dist = Math.sqrt(
      vp2.position[0]**2 + vp2.position[1]**2 + vp2.position[2]**2
    );
    console.log(`Camera 2 distance from origin: ${cam2Dist.toFixed(3)}`);
    expect(cam2Dist).toBeCloseTo(10.0, 0);
  });
});
