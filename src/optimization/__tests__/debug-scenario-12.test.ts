/**
 * Debug test for scenario-12 fixture to investigate camera orientation issue
 */

import { describe, it, expect } from '@jest/globals';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { loadProjectFromJson } from '../../store/project-serialization';
import { initializeCameraWithVanishingPoints, validateVanishingPoints } from '../vanishing-points';
import { V, Vec3, Vec4 } from 'scalar-autograd';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';
import fs from 'fs';
import path from 'path';

function checkCameraPointGeometry(
  camera: Viewpoint,
  worldPoints: WorldPoint[]
): { behindCount: number; frontCount: number; details: string[] } {
  const position = camera.position;
  const rotation = camera.rotation;
  const details: string[] = [];
  let behindCount = 0;
  let frontCount = 0;

  // Convert quaternion to rotation matrix
  const qw = rotation[0], qx = rotation[1], qy = rotation[2], qz = rotation[3];
  const R = [
    [1 - 2*(qy*qy + qz*qz), 2*(qx*qy - qw*qz), 2*(qx*qz + qw*qy)],
    [2*(qx*qy + qw*qz), 1 - 2*(qx*qx + qz*qz), 2*(qy*qz - qw*qx)],
    [2*(qx*qz - qw*qy), 2*(qy*qz + qw*qx), 1 - 2*(qx*qx + qy*qy)]
  ];

  for (const wp of worldPoints) {
    const effective = wp.getEffectiveXyz();
    if (effective.some(c => c === null)) continue;

    const wx = effective[0]!;
    const wy = effective[1]!;
    const wz = effective[2]!;

    // Transform to camera coordinates: P_cam = R * (P_world - C)
    const dx = wx - position[0];
    const dy = wy - position[1];
    const dz = wz - position[2];

    const camZ = R[2][0]*dx + R[2][1]*dy + R[2][2]*dz;

    if (camZ < 0) {
      details.push(`${wp.name} [${wx}, ${wy}, ${wz}]: camZ = ${camZ.toFixed(2)} BEHIND`);
      behindCount++;
    } else {
      details.push(`${wp.name} [${wx}, ${wy}, ${wz}]: camZ = ${camZ.toFixed(2)} IN FRONT`);
      frontCount++;
    }
  }

  return { behindCount, frontCount, details };
}

describe('Debug scenario-12: VP initialization camera orientation', () => {
  it('should have points IN FRONT of camera after VP initialization', () => {
    console.log('\n=== DEBUG SCENARIO-12: CAMERA ORIENTATION ===\n');

    // Load fixture
    const fixturePath = path.join(__dirname, 'fixtures', 'scenario-12-two-locked-points.json');
    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');

    const project = loadProjectFromJson(fixtureJson);

    const camera = Array.from(project.viewpoints)[0] as Viewpoint;
    const worldPoints = Array.from(project.worldPoints) as WorldPoint[];
    const worldPointSet = new Set(worldPoints);

    console.log('FIXTURE DATA:');
    console.log(`  Camera: ${camera.name}`);
    console.log(`  Image size: ${camera.imageWidth} x ${camera.imageHeight}`);
    console.log(`  Focal length: ${camera.focalLength}`);
    console.log(`  Principal point: [${camera.principalPointX}, ${camera.principalPointY}]`);
    console.log(`  Vanishing lines: ${camera.vanishingLines.size}`);
    console.log(`\nWorld Points:`);
    for (const wp of worldPoints) {
      const effective = wp.getEffectiveXyz();
      const locked = wp.lockedXyz.every(c => c !== null);
      console.log(`  ${wp.name}: [${effective.map(c => c?.toFixed(2) ?? 'null').join(', ')}] ${locked ? '(LOCKED)' : '(inferred)'}`);
    }

    // Validate VP setup
    console.log('\n=== VALIDATING VANISHING POINTS ===');
    const validation = validateVanishingPoints(camera);
    console.log(`  Valid: ${validation.isValid}`);
    if (validation.errors?.length) {
      console.log(`  Errors: ${validation.errors.join(', ')}`);
    }
    if (validation.vanishingPoints) {
      for (const [axis, vp] of Object.entries(validation.vanishingPoints)) {
        if (vp) {
          const isAtInfinity = Math.abs(vp.u) > 10000 || Math.abs(vp.v) > 10000;
          console.log(`  ${axis.toUpperCase()} axis VP: [${vp.u.toFixed(2)}, ${vp.v.toFixed(2)}] (${isAtInfinity ? 'at infinity' : 'finite'})`);
        }
      }
    }

    // Run VP initialization
    console.log('\n=== RUNNING VP INITIALIZATION ===');
    camera.position = [0, 0, 0];
    camera.rotation = [1, 0, 0, 0];

    const success = initializeCameraWithVanishingPoints(camera, worldPointSet);

    console.log(`\n  Success: ${success}`);
    console.log(`  Camera position: [${camera.position.map(x => x.toFixed(3)).join(', ')}]`);
    console.log(`  Camera rotation: [${camera.rotation.map(x => x.toFixed(4)).join(', ')}]`);
    console.log(`  Focal length: ${camera.focalLength.toFixed(1)}`);

    // Check camera-point geometry
    console.log('\n=== CHECKING CAMERA-POINT GEOMETRY ===');
    const geometry = checkCameraPointGeometry(camera, worldPoints);
    console.log(`  Points behind camera: ${geometry.behindCount}`);
    console.log(`  Points in front: ${geometry.frontCount}`);
    console.log('\n  Details:');
    for (const detail of geometry.details) {
      console.log(`    ${detail}`);
    }

    // Test projection
    console.log('\n=== TESTING PROJECTION ===');
    for (const wp of worldPoints) {
      const effective = wp.getEffectiveXyz();
      if (effective.some(c => c === null)) continue;

      const worldVec = new Vec3(V.C(effective[0]!), V.C(effective[1]!), V.C(effective[2]!));
      const camPosVec = new Vec3(V.C(camera.position[0]), V.C(camera.position[1]), V.C(camera.position[2]));
      const camRotQuat = new Vec4(
        V.C(camera.rotation[0]),
        V.C(camera.rotation[1]),
        V.C(camera.rotation[2]),
        V.C(camera.rotation[3])
      );

      const result = projectWorldPointToPixelQuaternion(
        worldVec,
        camPosVec,
        camRotQuat,
        V.C(camera.focalLength),
        V.C(camera.aspectRatio),
        V.C(camera.principalPointX),
        V.C(camera.principalPointY),
        V.C(camera.skewCoefficient),
        V.C(camera.radialDistortion[0]),
        V.C(camera.radialDistortion[1]),
        V.C(camera.radialDistortion[2]),
        V.C(camera.tangentialDistortion[0]),
        V.C(camera.tangentialDistortion[1])
      );

      if (result) {
        console.log(`  ${wp.name}: projected to [${result[0].data.toFixed(2)}, ${result[1].data.toFixed(2)}]`);
      } else {
        console.log(`  ${wp.name}: PROJECTION RETURNED NULL (behind camera)`);
      }
    }

    // ASSERTIONS
    expect(success).toBe(true);

    // The key assertion: most points should be IN FRONT of the camera
    expect(geometry.frontCount).toBeGreaterThan(geometry.behindCount);
  });
});
