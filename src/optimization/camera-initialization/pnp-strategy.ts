/**
 * PnP (Perspective-n-Point) initialization strategy.
 */

import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import { initializeCameraWithPnP } from '../pnp';
import { log } from '../optimization-logger';
import { getConstrainedPointCount } from './helpers';

/**
 * Try to initialize a single camera using PnP (Perspective-n-Point).
 * Requires 3+ fully constrained points visible in the camera.
 *
 * @param camera - The camera to initialize
 * @param worldPoints - Set of all world points in the scene
 * @returns True if PnP succeeded and result is reliable
 */
export function tryPnPInitForCamera(
  camera: Viewpoint,
  worldPoints: Set<WorldPoint>
): { success: boolean; reliable: boolean; reason?: string } {
  const constrainedCount = getConstrainedPointCount(camera);

  if (constrainedCount < 3) {
    return { success: false, reliable: false, reason: `Only ${constrainedCount}/3 constrained points` };
  }

  const pnpResult = initializeCameraWithPnP(camera, worldPoints);

  if (pnpResult.success && pnpResult.reliable) {
    log(`[Init] ${camera.name} via PnP, pos=[${camera.position.map(x => x.toFixed(1)).join(',')}]`);
    return { success: true, reliable: true };
  } else if (pnpResult.success && !pnpResult.reliable) {
    log(`[Init] ${camera.name} PnP unreliable: ${pnpResult.reason}`);
    // Reset camera to uninitialized state
    camera.position = [0, 0, 0];
    camera.rotation = [1, 0, 0, 0];
    return { success: true, reliable: false, reason: pnpResult.reason };
  } else {
    return { success: false, reliable: false, reason: 'PnP failed' };
  }
}
