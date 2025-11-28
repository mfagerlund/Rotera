/**
 * Test to reproduce and fix the camera orientation issue using actual user fixture
 */

import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import { initializeCameraWithVanishingPoints } from '../vanishing-points';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';
import { V, Vec3, Vec4 } from 'scalar-autograd';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';
import fs from 'fs';
import path from 'path';

function computeCameraZ(
  worldPoint: [number, number, number],
  cameraPosition: [number, number, number],
  rotation: [number, number, number, number]
): number {
  const [qw, qx, qy, qz] = rotation;
  const R = [
    [1 - 2*(qy*qy + qz*qz), 2*(qx*qy - qw*qz), 2*(qx*qz + qw*qy)],
    [2*(qx*qy + qw*qz), 1 - 2*(qx*qx + qz*qz), 2*(qy*qz - qw*qx)],
    [2*(qx*qz - qw*qy), 2*(qy*qz + qw*qx), 1 - 2*(qx*qx + qy*qy)]
  ];

  const dx = worldPoint[0] - cameraPosition[0];
  const dy = worldPoint[1] - cameraPosition[1];
  const dz = worldPoint[2] - cameraPosition[2];

  return R[2][0]*dx + R[2][1]*dy + R[2][2]*dz;
}

function testProjection(
  worldPoint: [number, number, number],
  camera: Viewpoint
): [number, number] | null {
  const worldVec = new Vec3(V.C(worldPoint[0]), V.C(worldPoint[1]), V.C(worldPoint[2]));
  const camPosVec = new Vec3(V.C(camera.position[0]), V.C(camera.position[1]), V.C(camera.position[2]));
  const camRotQuat = new Vec4(V.C(camera.rotation[0]), V.C(camera.rotation[1]), V.C(camera.rotation[2]), V.C(camera.rotation[3]));

  const result = projectWorldPointToPixelQuaternion(
    worldVec, camPosVec, camRotQuat,
    V.C(camera.focalLength), V.C(camera.aspectRatio),
    V.C(camera.principalPointX), V.C(camera.principalPointY),
    V.C(camera.skewCoefficient),
    V.C(camera.radialDistortion[0]), V.C(camera.radialDistortion[1]), V.C(camera.radialDistortion[2]),
    V.C(camera.tangentialDistortion[0]), V.C(camera.tangentialDistortion[1])
  );

  if (!result) return null;
  return [result[0].data, result[1].data];
}

describe('Camera Orientation Fix - User Fixture', () => {
  it('should initialize camera with VP and have all points IN FRONT of camera', () => {
    console.log('\n=== USER FIXTURE TEST: scenario-13-user-vp-issue ===\n');

    // Load the actual user fixture
    const fixturePath = path.join(__dirname, 'fixtures', 'scenario-13-user-vp-issue.json');
    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    const camera = Array.from(project.viewpoints)[0] as Viewpoint;
    const worldPoints = Array.from(project.worldPoints) as WorldPoint[];
    const worldPointSet = new Set(worldPoints);

    console.log('FIXTURE DATA:');
    console.log(`  Camera: ${camera.name}`);
    console.log(`  Image size: ${camera.imageWidth} x ${camera.imageHeight}`);
    console.log(`  Focal length: ${camera.focalLength.toFixed(1)}`);
    console.log(`  Principal point: [${camera.principalPointX}, ${camera.principalPointY}]`);
    console.log(`  Vanishing lines: ${camera.vanishingLines.size}`);

    console.log('\nWorld Points:');
    for (const wp of worldPoints) {
      const effective = wp.getEffectiveXyz();
      const locked = wp.lockedXyz.every(c => c !== null);
      console.log(`  ${wp.name}: [${effective.map(c => c?.toFixed(2) ?? 'null').join(', ')}] ${locked ? '(LOCKED)' : '(inferred)'}`);
    }

    console.log('\nImage Points (observed clicks):');
    for (const ip of camera.imagePoints) {
      console.log(`  ${ip.worldPoint.name}: [${ip.u.toFixed(1)}, ${ip.v.toFixed(1)}]`);
    }

    // Reset camera position and rotation
    console.log('\n=== RESETTING CAMERA ===');
    camera.position = [0, 0, 0];
    camera.rotation = [1, 0, 0, 0];

    // Run VP initialization
    console.log('\n=== RUNNING VP INITIALIZATION ===');
    const success = initializeCameraWithVanishingPoints(camera, worldPointSet);

    console.log(`\nVP Init success: ${success}`);
    console.log(`Camera position: [${camera.position.map(x => x.toFixed(3)).join(', ')}]`);
    console.log(`Camera rotation: [${camera.rotation.map(x => x.toFixed(4)).join(', ')}]`);

    expect(success).toBe(true);

    // Check that ALL locked points are IN FRONT of camera
    console.log('\n=== CHECKING CAMERA-POINT GEOMETRY ===');
    const lockedPoints = worldPoints.filter(wp => wp.lockedXyz.every(c => c !== null));

    let allInFront = true;
    for (const wp of lockedPoints) {
      const pos: [number, number, number] = [wp.lockedXyz[0]!, wp.lockedXyz[1]!, wp.lockedXyz[2]!];
      const camZ = computeCameraZ(pos, camera.position as [number, number, number], camera.rotation as [number, number, number, number]);
      const inFront = camZ > 0;
      console.log(`  ${wp.name} [${pos.join(', ')}]: camZ = ${camZ.toFixed(2)} ${inFront ? 'IN FRONT' : 'BEHIND'}`);
      if (!inFront) allInFront = false;
    }

    expect(allInFront).toBe(true);

    // Check that projections work
    console.log('\n=== CHECKING PROJECTIONS ===');
    let allProjectionsSucceed = true;
    for (const wp of lockedPoints) {
      const pos: [number, number, number] = [wp.lockedXyz[0]!, wp.lockedXyz[1]!, wp.lockedXyz[2]!];
      const projected = testProjection(pos, camera);

      // Find observed click
      const ip = Array.from(camera.imagePoints).find(i => i.worldPoint === wp);

      if (projected) {
        const observed = ip ? `[${ip.u.toFixed(1)}, ${ip.v.toFixed(1)}]` : 'N/A';
        console.log(`  ${wp.name}: projected [${projected[0].toFixed(1)}, ${projected[1].toFixed(1)}], observed ${observed}`);
      } else {
        console.log(`  ${wp.name}: PROJECTION FAILED`);
        allProjectionsSucceed = false;
      }
    }

    expect(allProjectionsSucceed).toBe(true);
  });

  it('should achieve low reprojection error after optimization', () => {
    console.log('\n=== FULL OPTIMIZATION TEST ===\n');

    // Load fixture fresh
    const fixturePath = path.join(__dirname, 'fixtures', 'scenario-13-user-vp-issue.json');
    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    // Reset camera
    const camera = Array.from(project.viewpoints)[0] as Viewpoint;
    camera.position = [0, 0, 0];
    camera.rotation = [1, 0, 0, 0];

    // Reset world points optimizedXyz
    for (const wp of project.worldPoints) {
      (wp as WorldPoint).optimizedXyz = undefined;
    }

    // Run optimization
    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxIterations: 100,
      tolerance: 1e-6,
      verbose: false,
    });

    console.log('OPTIMIZATION RESULT:');
    console.log(`  Converged: ${result.converged}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Residual: ${result.residual.toFixed(4)}`);
    console.log(`  Median reprojection error: ${result.medianReprojectionError?.toFixed(2)} px`);

    if (result.outliers && result.outliers.length > 0) {
      console.log(`  Outliers: ${result.outliers.map(o => o.worldPointName).join(', ')}`);
    }

    // The key assertion: median reprojection error should be low (under 50 px for real data)
    expect(result.medianReprojectionError).toBeLessThan(50);
  });

  it('should handle Y-axis disambiguation via inferred points', () => {
    console.log('\n=== Y-AXIS DISAMBIGUATION TEST ===\n');

    // This fixture has locked points at Y=0 (can't distinguish +Y from -Y)
    // but has a point WP4 with inferred Y=10 via line constraint
    const fixturePath = path.join(__dirname, 'fixtures', 'scenario-14-y-axis-test.json');
    if (!fs.existsSync(fixturePath)) {
      console.log('Fixture not found, skipping test');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    const camera = Array.from(project.viewpoints)[0] as Viewpoint;
    const worldPoints = Array.from(project.worldPoints) as WorldPoint[];
    const worldPointSet = new Set(worldPoints);

    console.log('World Points:');
    for (const wp of worldPoints) {
      const effective = wp.getEffectiveXyz();
      const locked = wp.lockedXyz.every(c => c !== null);
      const fullyConstrained = wp.isFullyConstrained();
      console.log(`  ${wp.name}: effective=[${effective.map(c => c?.toFixed(2) ?? 'null').join(', ')}] ${locked ? 'LOCKED' : fullyConstrained ? 'INFERRED' : 'partial'}`);
    }

    // Reset camera
    camera.position = [0, 0, 0];
    camera.rotation = [1, 0, 0, 0];

    // Reset world points optimizedXyz
    for (const wp of project.worldPoints) {
      (wp as WorldPoint).optimizedXyz = undefined;
    }

    // Run optimization
    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxIterations: 100,
      tolerance: 1e-6,
      verbose: false,
    });

    console.log('\nOPTIMIZATION RESULT:');
    console.log(`  Converged: ${result.converged}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Residual: ${result.residual.toFixed(4)}`);
    console.log(`  Median reprojection error: ${result.medianReprojectionError?.toFixed(2)} px`);

    // Check WP4 - should have Y close to +10 (not -10 or wildly different)
    const wp4 = worldPoints.find(wp => wp.name === 'WP4');
    if (wp4?.optimizedXyz) {
      console.log(`  WP4 optimized Y: ${wp4.optimizedXyz[1].toFixed(2)} (expected close to +10)`);
      // Y should be positive and close to 10
      expect(wp4.optimizedXyz[1]).toBeGreaterThan(5);
      expect(wp4.optimizedXyz[1]).toBeLessThan(15);
    }

    expect(result.medianReprojectionError).toBeLessThan(50);
  });
});
