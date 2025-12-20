/**
 * Coordinate system transformations for handedness and axis corrections.
 * Handles right-handed coordinate system enforcement for Blender compatibility.
 */

import { WorldPoint } from '../entities/world-point';
import { Viewpoint } from '../entities/viewpoint';
import { log } from './optimization-logger';

/**
 * Check which axes need to be flipped to match locked coordinate signs.
 * Returns { flipX, flipY, flipZ } indicating which axes have wrong signs.
 *
 * We compare solved coordinates against locked coordinates to detect sign errors.
 * This is more robust than just checking handedness (which only tells us IF
 * something is wrong, not WHICH axis is wrong).
 */
export function checkAxisSigns(worldPoints: WorldPoint[]): { flipX: boolean; flipY: boolean; flipZ: boolean } {
  let flipX = false;
  let flipY = false;
  let flipZ = false;

  for (const wp of worldPoints) {
    const locked = wp.lockedXyz;
    const solved = wp.optimizedXyz;
    if (!locked || !solved) continue;

    // Check X axis: if locked X is non-zero and solved X has opposite sign
    if (locked[0] !== null && locked[0] !== 0 && solved[0] !== null) {
      if (Math.sign(locked[0]) !== Math.sign(solved[0])) {
        log(`[AxisSigns] X mismatch on ${wp.name}: locked=${locked[0]}, solved=${solved[0]}`);
        flipX = true;
      }
    }

    // Check Y axis: if locked Y is non-zero and solved Y has opposite sign
    if (locked[1] !== null && locked[1] !== 0 && solved[1] !== null) {
      if (Math.sign(locked[1]) !== Math.sign(solved[1])) {
        log(`[AxisSigns] Y mismatch on ${wp.name}: locked=${locked[1]}, solved=${solved[1]}`);
        flipY = true;
      }
    }

    // Check Z axis: if locked Z is non-zero and solved Z has opposite sign
    if (locked[2] !== null && locked[2] !== 0 && solved[2] !== null) {
      if (Math.sign(locked[2]) !== Math.sign(solved[2])) {
        log(`[AxisSigns] Z mismatch on ${wp.name}: locked=${locked[2]}, solved=${solved[2]}`);
        flipZ = true;
      }
    }
  }

  return { flipX, flipY, flipZ };
}

/**
 * Check if world points form a right-handed coordinate system.
 * Requires at least 3 axis points (on X, Y, Z axes from origin).
 * Returns null if not enough axis points are found.
 */
export function checkHandedness(worldPoints: WorldPoint[]): { isRightHanded: boolean; origin: WorldPoint; xPoint: WorldPoint; yPoint: WorldPoint; zPoint: WorldPoint } | null {
  // Find origin (fully locked at [0,0,0])
  const origin = worldPoints.find(wp => {
    const locked = wp.lockedXyz;
    return locked && locked[0] === 0 && locked[1] === 0 && locked[2] === 0;
  });
  if (!origin) return null;

  // Find X-axis point (locked to [null, 0, 0] or inferred)
  const xPoint = worldPoints.find(wp => {
    if (wp === origin) return false;
    const locked = wp.lockedXyz;
    if (locked && locked[0] === null && locked[1] === 0 && locked[2] === 0) return true;
    const effective = wp.getEffectiveXyz();
    if (effective && effective[1] === 0 && effective[2] === 0 && effective[0] !== 0) return true;
    return false;
  });

  // Find Y-axis point (locked to [0, null, 0] or [0, value, 0])
  const yPoint = worldPoints.find(wp => {
    if (wp === origin || wp === xPoint) return false;
    const locked = wp.lockedXyz;
    if (locked && locked[0] === 0 && locked[2] === 0) return true;
    const effective = wp.getEffectiveXyz();
    if (effective && effective[0] === 0 && effective[2] === 0 && effective[1] !== 0) return true;
    return false;
  });

  // Find Z-axis point (locked to [0, 0, null] or inferred)
  const zPoint = worldPoints.find(wp => {
    if (wp === origin || wp === xPoint || wp === yPoint) return false;
    const locked = wp.lockedXyz;
    if (locked && locked[0] === 0 && locked[1] === 0 && locked[2] === null) return true;
    const effective = wp.getEffectiveXyz();
    if (effective && effective[0] === 0 && effective[1] === 0 && effective[2] !== 0) return true;
    return false;
  });

  if (!xPoint || !yPoint || !zPoint) return null;

  // Get optimized or effective coordinates
  const oPos = origin.optimizedXyz ?? origin.getEffectiveXyz() ?? [0, 0, 0];
  const xPos = xPoint.optimizedXyz ?? xPoint.getEffectiveXyz();
  const yPos = yPoint.optimizedXyz ?? yPoint.getEffectiveXyz();
  const zPos = zPoint.optimizedXyz ?? zPoint.getEffectiveXyz();

  // Check all coordinates are fully defined
  if (!xPos || !yPos || !zPos) return null;
  if (xPos[0] === null || xPos[1] === null || xPos[2] === null) return null;
  if (yPos[0] === null || yPos[1] === null || yPos[2] === null) return null;
  if (zPos[0] === null || zPos[1] === null || zPos[2] === null) return null;
  if (oPos[0] === null || oPos[1] === null || oPos[2] === null) return null;

  // Compute vectors from origin (now TypeScript knows these are all numbers)
  const vx = [xPos[0] - oPos[0], xPos[1] - oPos[1], xPos[2] - oPos[2]];
  const vy = [yPos[0] - oPos[0], yPos[1] - oPos[1], yPos[2] - oPos[2]];
  const vz = [zPos[0] - oPos[0], zPos[1] - oPos[1], zPos[2] - oPos[2]];

  // Cross product X × Y
  const xCrossY = [
    vx[1] * vy[2] - vx[2] * vy[1],
    vx[2] * vy[0] - vx[0] * vy[2],
    vx[0] * vy[1] - vx[1] * vy[0]
  ];

  // Dot with Z - positive for right-handed
  const dot = xCrossY[0] * vz[0] + xCrossY[1] * vz[1] + xCrossY[2] * vz[2];

  return { isRightHanded: dot > 0, origin, xPoint, yPoint, zPoint };
}

/**
 * Apply axis flips to correct coordinate signs.
 *
 * For each flipped axis, we negate that coordinate in world points and camera position.
 * The camera rotation is transformed to preserve projection.
 *
 * Key insight: flipping an axis is a reflection (det=-1), which can't be a quaternion.
 * But an EVEN number of axis flips IS a rotation (det=+1).
 *
 * Algorithm:
 * - If odd number of flips: add one more flip (Z) to make it even, set isZReflected=true
 * - Apply the equivalent rotation to the camera quaternion
 *
 * Rotation equivalents for axis flips:
 * - X+Y flip = Rz_180: [w,x,y,z] * [0,0,0,1] = [-z, y, -x, w]
 * - X+Z flip = Ry_180: [w,x,y,z] * [0,0,1,0] = [-y, -z, w, x]
 * - Y+Z flip = Rx_180: [w,x,y,z] * [0,1,0,0] = [-x, w, z, -y]
 * - X+Y+Z flip = point inversion = no rotation change but isZReflected
 */
export function applyAxisFlips(
  worldPoints: WorldPoint[],
  viewpoints: Viewpoint[],
  flipX: boolean,
  flipY: boolean,
  flipZ: boolean
): void {
  const flips = [flipX, flipY, flipZ].filter(f => f).length;

  if (flips === 0) {
    log('[AxisFlips] No flips needed');
    return;
  }

  log(`[AxisFlips] Applying flips: X=${flipX}, Y=${flipY}, Z=${flipZ} (${flips} total)`);

  // Determine if we need isZReflected (odd number of flips)
  const needsZReflected = flips % 2 === 1;
  const actualFlipX = flipX;
  const actualFlipY = flipY;
  const actualFlipZ = flipZ;

  // If odd flips, we add one more Z flip to make it even for quaternion
  // But we still set isZReflected so rendering knows the sign convention
  if (needsZReflected) {
    // Keep track that the effective transform includes the extra Z flip
    // The world coordinates get the original flips, camera gets adjusted
    log('[AxisFlips] Odd number of flips - will set isZReflected=true');
  }

  // Apply flips to world points
  for (const wp of worldPoints) {
    if (wp.optimizedXyz) {
      wp.optimizedXyz = [
        actualFlipX ? -wp.optimizedXyz[0] : wp.optimizedXyz[0],
        actualFlipY ? -wp.optimizedXyz[1] : wp.optimizedXyz[1],
        actualFlipZ ? -wp.optimizedXyz[2] : wp.optimizedXyz[2]
      ];
    }
  }

  // Apply flips to camera position and rotation
  for (const vp of viewpoints) {
    // Flip position coordinates
    vp.position = [
      actualFlipX ? -vp.position[0] : vp.position[0],
      actualFlipY ? -vp.position[1] : vp.position[1],
      actualFlipZ ? -vp.position[2] : vp.position[2]
    ];

    // Transform quaternion based on which axes are flipped
    // We need to apply a rotation that compensates for the coordinate flip
    let [w, x, y, z] = vp.rotation;

    if (actualFlipX && actualFlipY && !actualFlipZ) {
      // X+Y flip = Rz_180: [w,x,y,z] * [0,0,0,1] = [-z, y, -x, w]
      [w, x, y, z] = [-z, y, -x, w];
    } else if (actualFlipX && !actualFlipY && actualFlipZ) {
      // X+Z flip = Ry_180: [w,x,y,z] * [0,0,1,0] = [-y, -z, w, x]
      [w, x, y, z] = [-y, -z, w, x];
    } else if (!actualFlipX && actualFlipY && actualFlipZ) {
      // Y+Z flip = Rx_180: [w,x,y,z] * [0,1,0,0] = [-x, w, z, -y]
      [w, x, y, z] = [-x, w, z, -y];
    } else if (actualFlipX && actualFlipY && actualFlipZ) {
      // X+Y+Z flip = point inversion = no rotation change needed
      // (The even part is X+Y which is Rz_180, plus Z flip makes it odd -> use Rz_180 + isZReflected)
      [w, x, y, z] = [-z, y, -x, w];
    } else if (actualFlipX && !actualFlipY && !actualFlipZ) {
      // X only: X flip = Ry_180 * Sz, so apply Ry_180 and flip Z back (via isZReflected)
      // Ry_180: [w,x,y,z] * [0,0,1,0] = [-y, -z, w, x]
      [w, x, y, z] = [-y, -z, w, x];
    } else if (!actualFlipX && actualFlipY && !actualFlipZ) {
      // Y only: Y flip = Rx_180 * Sz, so apply Rx_180 and flip Z back (via isZReflected)
      // Rx_180: [w,x,y,z] * [0,1,0,0] = [-x, w, z, -y]
      [w, x, y, z] = [-x, w, z, -y];
    } else if (!actualFlipX && !actualFlipY && actualFlipZ) {
      // Z only: our original Rz_180 trick
      // [w,x,y,z] * [0,0,0,1] = [-z, y, -x, w]
      [w, x, y, z] = [-z, y, -x, w];
    }

    vp.rotation = [w, x, y, z];
    vp.isZReflected = needsZReflected;

    log(`[AxisFlips] Camera ${vp.name}: position and rotation transformed, isZReflected=${needsZReflected}`);
  }
}
