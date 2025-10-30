/**
 * Test if there's a rotation convention mismatch
 * between matrixToQuaternion and quaternionToMatrix
 */

import { describe, it } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import * as fs from 'fs';
import * as path from 'path';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';
import { validateVanishingPoints, computeRotationFromVPs } from '../vanishing-points';
import { Quaternion } from '../Quaternion';
import { V, Vec3, Vec4 } from 'scalar-autograd';

describe('Rotation Convention Test', () => {
  it('should check if quaternion and matrix conversions are consistent', () => {
    const jsonPath = path.join(__dirname, 'fixtures', 'cube-2vps-exaggerated.json');
    const jsonData = fs.readFileSync(jsonPath, 'utf8');
    const project = loadProjectFromJson(jsonData);

    const viewpoint = Array.from(project.viewpoints)[0] as Viewpoint;

    const validation = validateVanishingPoints(viewpoint);
    if (!validation.isValid || !validation.vanishingPoints) {
      console.log('Validation failed');
      return;
    }

    const vps = validation.vanishingPoints;
    const principalPoint = { u: viewpoint.principalPointX, v: viewpoint.principalPointY };
    const focalLength = viewpoint.focalLength;

    const quaternion = computeRotationFromVPs(vps, focalLength, principalPoint);
    if (!quaternion) {
      console.log('Failed to compute rotation');
      return;
    }

    console.log('\n=== QUATERNION ===');
    console.log(`q = [${quaternion.map(v => v.toFixed(4)).join(', ')}]`);

    const qMag = Math.sqrt(quaternion[0]**2 + quaternion[1]**2 + quaternion[2]**2 + quaternion[3]**2);
    console.log(`||q|| = ${qMag.toFixed(6)} ${Math.abs(qMag - 1.0) < 0.0001 ? '✓ NORMALIZED' : '✗ NOT NORMALIZED'}`);

    // Convert quaternion back to matrix using the SAME formula as computeCameraPosition
    const qw = quaternion[0], qx = quaternion[1], qy = quaternion[2], qz = quaternion[3];
    const R_from_quat = [
      [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy)],
      [2 * (qx * qy + qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qw * qx)],
      [2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), 1 - 2 * (qx * qx + qy * qy)]
    ];

    console.log('\n=== MATRIX FROM QUATERNION (world-to-camera) ===');
    R_from_quat.forEach((row, i) => {
      console.log(`  [${row.map(v => v.toFixed(4)).join(', ')}]`);
    });

    // Now test by rotating a world vector using the matrix vs using Quaternion.rotateVector
    const testVectors = [
      [1, 0, 0],  // World X-axis
      [0, 1, 0],  // World Y-axis
      [0, 0, 1],  // World Z-axis
    ];

    console.log('\n=== ROTATION TEST ===');
    testVectors.forEach((worldVec, i) => {
      const axis = ['X', 'Y', 'Z'][i];

      // Rotate using matrix
      const cam_via_matrix = [
        R_from_quat[0][0] * worldVec[0] + R_from_quat[0][1] * worldVec[1] + R_from_quat[0][2] * worldVec[2],
        R_from_quat[1][0] * worldVec[0] + R_from_quat[1][1] * worldVec[1] + R_from_quat[1][2] * worldVec[2],
        R_from_quat[2][0] * worldVec[0] + R_from_quat[2][1] * worldVec[1] + R_from_quat[2][2] * worldVec[2]
      ];

      // Rotate using Quaternion.rotateVector
      const worldVecV3 = new Vec3(V.C(worldVec[0]), V.C(worldVec[1]), V.C(worldVec[2]));
      const quat = new Vec4(V.C(qw), V.C(qx), V.C(qy), V.C(qz));
      const cam_via_quat = Quaternion.rotateVector(quat, worldVecV3);

      console.log(`\nWorld ${axis}-axis [${worldVec.join(', ')}]:`);
      console.log(`  Matrix:     [${cam_via_matrix.map(v => v.toFixed(4)).join(', ')}]`);
      console.log(`  Quaternion: [${cam_via_quat.x.data.toFixed(4)}, ${cam_via_quat.y.data.toFixed(4)}, ${cam_via_quat.z.data.toFixed(4)}]`);

      // Check if they match
      const diff = Math.sqrt(
        (cam_via_matrix[0] - cam_via_quat.x.data) ** 2 +
        (cam_via_matrix[1] - cam_via_quat.y.data) ** 2 +
        (cam_via_matrix[2] - cam_via_quat.z.data) ** 2
      );

      if (diff < 0.0001) {
        console.log(`  ✓ MATCH (diff: ${diff.toExponential(2)})`);
      } else {
        console.log(`  ✗ MISMATCH (diff: ${diff.toFixed(4)})`);
      }
    });
  });
});
