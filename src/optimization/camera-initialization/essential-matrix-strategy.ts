/**
 * Essential Matrix initialization strategy.
 */

import type { Viewpoint } from '../../entities/viewpoint';
import { initializeCamerasWithEssentialMatrix } from '../essential-matrix';
import {
  validateVanishingPoints,
  computeRotationsFromVPs,
  estimateFocalLength,
} from '../vanishing-points';
import { log } from '../optimization-logger';
import type { EssentialMatrixInitResult } from '../initialization-types';

/**
 * Run Essential Matrix initialization for two cameras.
 *
 * This also applies VP+EM hybrid if cameras have vanishing lines:
 * - Uses VP rotation to align the world frame
 * - Applies VP-estimated focal length if available
 *
 * @param vp1 - First camera
 * @param vp2 - Second camera
 * @param skipVPHybrid - If true, skip the VP+EM hybrid step
 * @returns Result with success, cameras, and vpEmHybridApplied flag
 */
export function runEssentialMatrixInitialization(
  vp1: Viewpoint,
  vp2: Viewpoint,
  skipVPHybrid: boolean
): EssentialMatrixInitResult {
  // Reset intrinsics to safe defaults for Essential Matrix
  for (const vp of [vp1, vp2]) {
    vp.focalLength = Math.max(vp.imageWidth, vp.imageHeight);
    vp.principalPointX = vp.imageWidth / 2;
    vp.principalPointY = vp.imageHeight / 2;
  }

  const result = initializeCamerasWithEssentialMatrix(vp1, vp2, 10.0);

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Unknown error',
      cameras: [],
      vpEmHybridApplied: false,
    };
  }

  log(`[Init] EssentialMatrix: ${vp1.name}=[${vp1.position.map(x => x.toFixed(1)).join(',')}], ${vp2.name}=[${vp2.position.map(x => x.toFixed(1)).join(',')}]`);

  // HYBRID VP+EM: If cameras have vanishing lines, use VP rotation BEFORE triangulation
  // This ensures the coordinate frame is world-axis-aligned from the start
  let vpEmHybridApplied = false;

  if (skipVPHybrid) {
    log(`[VP+EM] Skipping - stepped VP init was reverted`);
  } else {
    log(`[VP+EM] Checking cameras for VP rotation...`);

    for (const vp of [vp1, vp2]) {
      const vpValidation = validateVanishingPoints(vp);
      const vpCount = vpValidation.vanishingPoints ? Object.keys(vpValidation.vanishingPoints).length : 0;
      log(`[VP+EM] ${vp.name}: isValid=${vpValidation.isValid}, vpCount=${vpCount}`);

      if (vpValidation.isValid && vpCount >= 2) {
        // Compute focal length from VPs if we have 2+
        const vps = vpValidation.vanishingPoints!;
        const pp = { u: vp.principalPointX, v: vp.principalPointY };
        const vpKeys = Object.keys(vps) as ('x' | 'y' | 'z')[];

        // Try to estimate focal length from orthogonal VPs
        let vpFocalLength: number | null = null;
        if (vpKeys.length >= 2) {
          vpFocalLength = estimateFocalLength(vps[vpKeys[0]]!, vps[vpKeys[1]]!, pp);
        }
        const focalLength = vpFocalLength && vpFocalLength > 100 ? vpFocalLength : vp.focalLength;

        const vpRotations = computeRotationsFromVPs(vps, focalLength, pp);
        if (vpRotations && vpRotations.length > 0) {
          const q_vp = vpRotations[0]; // Use first candidate rotation

          // Save the EM-derived rotation before overwriting
          const q_em_2 = [...vp2.rotation] as [number, number, number, number];
          const pos_2 = [...vp2.position] as [number, number, number];

          // Apply VP rotation as global rotation to the scene
          // vp1 gets the VP rotation directly
          vp1.rotation = q_vp;

          // Quaternion multiplication helper
          const qMult = (a: number[], b: number[]): [number, number, number, number] => {
            return [
              a[0]*b[0] - a[1]*b[1] - a[2]*b[2] - a[3]*b[3],
              a[0]*b[1] + a[1]*b[0] + a[2]*b[3] - a[3]*b[2],
              a[0]*b[2] - a[1]*b[3] + a[2]*b[0] + a[3]*b[1],
              a[0]*b[3] + a[1]*b[2] - a[2]*b[1] + a[3]*b[0]
            ];
          };

          // In EM frame: cam1 at identity, cam2 at q_em_2
          // We want cam1 at q_vp instead
          // This is a global rotation of the world by q_vp
          // In new frame: cam1 = q_vp, cam2 = q_vp * q_em_2 (quaternion multiply)
          vp2.rotation = qMult(q_vp, q_em_2);

          // Rotate vp2's position by q_vp (since we're rotating the world frame)
          const rotateVec = (q: number[], v: number[]): [number, number, number] => {
            const qw = q[0], qx = q[1], qy = q[2], qz = q[3];
            const vx = v[0], vy = v[1], vz = v[2];
            const tx = 2 * (qy * vz - qz * vy);
            const ty = 2 * (qz * vx - qx * vz);
            const tz = 2 * (qx * vy - qy * vx);
            return [
              vx + qw * tx + (qy * tz - qz * ty),
              vy + qw * ty + (qz * tx - qx * tz),
              vz + qw * tz + (qx * ty - qy * tx)
            ];
          };
          vp2.position = rotateVec(q_vp, pos_2);

          // Update focal length if VP-estimated was better
          if (vpFocalLength && vpFocalLength > 100) {
            vp.focalLength = vpFocalLength;
            log(`[Init] VP focal: ${vp.name} f=${vpFocalLength.toFixed(0)}`);
          }

          log(`[Init] VP+EM hybrid: Applied VP rotation from ${vp.name} to align world frame`);
          log(`[Init] VP+EM: ${vp1.name} rot=[${vp1.rotation.map(x => x.toFixed(3)).join(',')}]`);
          log(`[Init] VP+EM: ${vp2.name} pos=[${vp2.position.map(x => x.toFixed(1)).join(',')}] rot=[${vp2.rotation.map(x => x.toFixed(3)).join(',')}]`);
          vpEmHybridApplied = true;
          break; // Only apply from first camera with good VPs
        }
      }
    }
  }

  return {
    success: true,
    cameras: [vp1, vp2],
    vpEmHybridApplied,
  };
}
