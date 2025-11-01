/**
 * Debug the camera pose solver in detail
 * Trace through rotation and position computation to find the bug
 */

import { describe, it } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import * as fs from 'fs';
import * as path from 'path';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';
import { validateVanishingPoints, computeRotationFromVPs, computeCameraPosition } from '../vanishing-points';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';
import { V, Vec3, Vec4 } from 'scalar-autograd';

describe('VP Camera Pose Debug', () => {
  it('should trace through camera pose computation step by step - EXAGGERATED PERSPECTIVE', () => {
    const jsonPath = path.join(__dirname, 'fixtures', 'cube-2vps-exaggerated.json');
    const jsonData = fs.readFileSync(jsonPath, 'utf8');
    const project = loadProjectFromJson(jsonData);

    const viewpoint = Array.from(project.viewpoints)[0] as Viewpoint;
    const worldPoints = new Set(Array.from(project.worldPoints) as WorldPoint[]);

    console.log('\n=== STEP 1: VALIDATE AND GET VPs ===');
    const validation = validateVanishingPoints(viewpoint);

    if (!validation.isValid || !validation.vanishingPoints) {
      console.log('Validation failed!');
      return;
    }

    const vps = validation.vanishingPoints;
    console.log('Vanishing Points (image space):');
    if (vps.x) console.log(`  X: (${vps.x.u.toFixed(1)}, ${vps.x.v.toFixed(1)})`);
    if (vps.y) console.log(`  Y: (${vps.y.u.toFixed(1)}, ${vps.y.v.toFixed(1)})`);
    if (vps.z) console.log(`  Z: (${vps.z.u.toFixed(1)}, ${vps.z.v.toFixed(1)})`);

    const principalPoint = {
      u: viewpoint.principalPointX,
      v: viewpoint.principalPointY
    };
    const focalLength = viewpoint.focalLength;

    console.log(`\nPrincipal point: (${principalPoint.u}, ${principalPoint.v})`);
    console.log(`Focal length: ${focalLength.toFixed(1)}`);

    console.log('\n=== STEP 2: COMPUTE ROTATION ===');
    const rotation = computeRotationFromVPs(vps, focalLength, principalPoint);

    if (!rotation) {
      console.log('Rotation computation failed!');
      return;
    }

    console.log(`Quaternion: [${rotation.map(v => v.toFixed(3)).join(', ')}]`);

    // Convert quaternion to rotation matrix to visualize
    const qw = rotation[0], qx = rotation[1], qy = rotation[2], qz = rotation[3];
    const R = [
      [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy)],
      [2 * (qx * qy + qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qw * qx)],
      [2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), 1 - 2 * (qx * qx + qy * qy)]
    ];

    console.log('Rotation matrix R (world-to-camera):');
    R.forEach((row, i) => {
      console.log(`  [${row.map(v => v.toFixed(3)).join(', ')}]`);
    });

    console.log('\n=== STEP 3: PREPARE LOCKED POINTS ===');
    const fullyConstrainedPoints = Array.from(worldPoints).filter(wp => {
      const effectiveXyz = wp.getEffectiveXyz();
      return effectiveXyz.every(coord => coord !== null);
    });

    const lockedPointsData = fullyConstrainedPoints
      .map(wp => {
        const imagePoints = viewpoint.getImagePointsForWorldPoint(wp);
        if (imagePoints.length === 0) return null;
        return {
          worldPoint: wp,
          imagePoint: { u: imagePoints[0].u, v: imagePoints[0].v }
        };
      })
      .filter(p => p !== null) as Array<{
      worldPoint: WorldPoint;
      imagePoint: { u: number; v: number };
    }>;

    console.log(`Found ${lockedPointsData.length} locked points with image observations:`);
    lockedPointsData.forEach(({ worldPoint, imagePoint }) => {
      const xyz = worldPoint.getEffectiveXyz();
      console.log(`  ${worldPoint.name}: world=(${xyz.map(v => v!.toFixed(1)).join(', ')}), image=(${imagePoint.u.toFixed(1)}, ${imagePoint.v.toFixed(1)})`);
    });

    console.log('\n=== STEP 4: COMPUTE CAMERA POSITION ===');
    const position = computeCameraPosition(rotation, focalLength, principalPoint, lockedPointsData);

    if (!position) {
      console.log('Camera position computation failed!');
      return;
    }

    console.log(`Camera position: [${position.map(v => v.toFixed(3)).join(', ')}]`);

    console.log('\n=== STEP 5: VERIFY BY FORWARD PROJECTION ===');
    console.log('Forward projecting locked points using computed camera pose:');

    for (const { worldPoint, imagePoint } of lockedPointsData) {
      const xyz = worldPoint.getEffectiveXyz();
      const worldPt = new Vec3(V.C(xyz[0]!), V.C(xyz[1]!), V.C(xyz[2]!));
      const camPos = new Vec3(V.C(position[0]), V.C(position[1]), V.C(position[2]));
      const camRot = new Vec4(V.C(rotation[0]), V.C(rotation[1]), V.C(rotation[2]), V.C(rotation[3]));

      const projected = projectWorldPointToPixelQuaternion(
        worldPt,
        camPos,
        camRot,
        V.C(focalLength),
        V.C(viewpoint.aspectRatio),
        V.C(principalPoint.u),
        V.C(principalPoint.v),
        V.C(0), V.C(0), V.C(0), V.C(0), V.C(0), V.C(0)
      );

      if (projected) {
        const projU = projected[0].data;
        const projV = projected[1].data;
        const errorU = projU - imagePoint.u;
        const errorV = projV - imagePoint.v;
        const error = Math.sqrt(errorU * errorU + errorV * errorV);

        console.log(`\n  ${worldPoint.name}:`);
        console.log(`    World coords: (${xyz.map(v => v!.toFixed(1)).join(', ')})`);
        console.log(`    Expected image: (${imagePoint.u.toFixed(1)}, ${imagePoint.v.toFixed(1)})`);
        console.log(`    Projected to: (${projU.toFixed(1)}, ${projV.toFixed(1)})`);
        console.log(`    Error: ${error.toFixed(1)} px ${error < 1 ? '✓' : error < 10 ? '⚠' : '✗'}`);
      } else {
        console.log(`\n  ${worldPoint.name}: BEHIND CAMERA`);
      }
    }

    console.log('\n=== STEP 6: MANUAL VERIFICATION ===');
    console.log('Checking the ray-point intersection math:');

    const Rt = [
      [R[0][0], R[1][0], R[2][0]],
      [R[0][1], R[1][1], R[2][1]],
      [R[0][2], R[1][2], R[2][2]]
    ];

    for (const { worldPoint, imagePoint } of lockedPointsData) {
      const xyz = worldPoint.getEffectiveXyz();
      const P = [xyz[0]!, xyz[1]!, xyz[2]!];

      // Compute normalized image coordinates
      const u_norm = (imagePoint.u - principalPoint.u) / focalLength;
      const v_norm = (principalPoint.v - imagePoint.v) / focalLength;

      // Ray in camera space
      const ray_cam = [u_norm, v_norm, 1];

      // Transform to world space
      const ray_world = [
        Rt[0][0] * ray_cam[0] + Rt[0][1] * ray_cam[1] + Rt[0][2] * ray_cam[2],
        Rt[1][0] * ray_cam[0] + Rt[1][1] * ray_cam[1] + Rt[1][2] * ray_cam[2],
        Rt[2][0] * ray_cam[0] + Rt[2][1] * ray_cam[1] + Rt[2][2] * ray_cam[2]
      ];

      console.log(`\n  ${worldPoint.name}:`);
      console.log(`    World point P: (${P.map(v => v.toFixed(2)).join(', ')})`);
      console.log(`    Image (u,v): (${imagePoint.u.toFixed(1)}, ${imagePoint.v.toFixed(1)})`);
      console.log(`    Normalized: (${u_norm.toFixed(3)}, ${v_norm.toFixed(3)})`);
      console.log(`    Ray (camera): [${ray_cam.map(v => v.toFixed(3)).join(', ')}]`);
      console.log(`    Ray (world): [${ray_world.map(v => v.toFixed(3)).join(', ')}]`);

      // The constraint is: C + t * ray_world = P
      // So: t = ||P - C|| / ||ray_world|| (approximately)
      const PC = [P[0] - position[0], P[1] - position[1], P[2] - position[2]];
      const dist = Math.sqrt(PC[0] * PC[0] + PC[1] * PC[1] + PC[2] * PC[2]);
      const ray_len = Math.sqrt(ray_world[0] * ray_world[0] + ray_world[1] * ray_world[1] + ray_world[2] * ray_world[2]);
      console.log(`    Distance ||P - C||: ${dist.toFixed(2)}`);
      console.log(`    Ray length: ${ray_len.toFixed(3)}`);

      // Check if ray points toward P
      const dot = PC[0] * ray_world[0] + PC[1] * ray_world[1] + PC[2] * ray_world[2];
      const cos_angle = dot / (dist * ray_len);
      const angle = Math.acos(Math.max(-1, Math.min(1, cos_angle))) * 180 / Math.PI;
      console.log(`    Angle between ray and (P-C): ${angle.toFixed(1)}° ${angle < 1 ? '✓ GOOD' : '✗ BAD'}`);
    }
  });
});
