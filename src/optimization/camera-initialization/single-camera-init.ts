/**
 * Single camera initialization attempt using available strategies.
 */

import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import { tryVPInitForCamera } from './vp-strategy';
import { tryPnPInitForCamera } from './pnp-strategy';

/**
 * Try all applicable initialization strategies for a single camera.
 * Returns the first strategy that succeeds, or indicates failure.
 *
 * Strategy priority order:
 * 1. VP init (if has vanishing lines + constrained points)
 * 2. PnP init (if 3+ triangulated/constrained points visible)
 * 3. Essential Matrix is handled separately in the iterative loop
 *
 * @param camera - The camera to initialize
 * @param worldPoints - Set of all world points in the scene
 * @param initializedCameras - Set of cameras that are already initialized
 * @param lockedPoints - Fully constrained points (locked or inferred)
 * @param allowSinglePointVP - Whether to allow VP with single constrained point
 * @returns Result indicating success, strategy used, and error if any
 */
export function trySingleCameraInit(
  camera: Viewpoint,
  worldPoints: Set<WorldPoint>,
  initializedCameras: Set<Viewpoint>,
  lockedPoints: WorldPoint[],
  allowSinglePointVP: boolean
): { success: boolean; strategy?: string; error?: number; reason?: string } {
  // Strategy 1: Try VP initialization
  const vpResult = tryVPInitForCamera(camera, worldPoints, {
    allowSinglePoint: allowSinglePointVP,
    lockedPointCount: lockedPoints.length,
    totalUninitializedCameras: 1, // Assume this is being called for one camera at a time
  });

  if (vpResult.success) {
    return { success: true, strategy: 'vp' };
  }

  // Strategy 2: Try PnP initialization
  const pnpResult = tryPnPInitForCamera(camera, worldPoints);
  if (pnpResult.success && pnpResult.reliable) {
    return { success: true, strategy: 'pnp' };
  } else if (pnpResult.success && !pnpResult.reliable) {
    // PnP succeeded but unreliable - mark as deferred
    return { success: false, reason: pnpResult.reason || 'PnP unreliable' };
  }

  // No strategy worked
  return { success: false, reason: pnpResult.reason || 'No strategy applicable' };
}
