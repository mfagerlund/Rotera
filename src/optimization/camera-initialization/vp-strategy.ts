/**
 * Vanishing Point initialization strategy.
 */

import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import {
  initializeCameraWithVanishingPoints,
  canInitializeWithVanishingPoints,
} from '../vanishing-points';
import { log } from '../optimization-logger';
import type { VPInitResult } from '../initialization-types';

/**
 * Try to initialize a single camera using vanishing points.
 *
 * @param camera - The camera to initialize
 * @param worldPoints - Set of all world points in the scene
 * @param options - Options for VP initialization
 * @returns Result indicating success/failure and diagnostics
 */
export function tryVPInitForCamera(
  camera: Viewpoint,
  worldPoints: Set<WorldPoint>,
  options: {
    allowSinglePoint: boolean;
    lockedPointCount: number;
    totalUninitializedCameras: number;
  }
): VPInitResult {
  const { allowSinglePoint, lockedPointCount, totalUninitializedCameras } = options;

  // For single-camera scenes with only 1-2 locked points AND no actual vanishing lines,
  // skip VP init and use late PnP instead. Late PnP uses ALL constrained points (including
  // inferred) and gives better results. VP init with only 1 locked point and only virtual VLs
  // (from axis-aligned Lines) gives unreliable camera positions.
  // If camera has actual VLs, VP init should be used - it handles handedness correctly.
  const hasActualVanishingLines = camera.getVanishingLineCount() > 0;
  const skipVPForLatePnP = totalUninitializedCameras === 1 && lockedPointCount < 3 && !hasActualVanishingLines;

  log(`[Init Path] skipVPForLatePnP=${skipVPForLatePnP} (uninit=${totalUninitializedCameras}, locked=${lockedPointCount}, hasVL=${hasActualVanishingLines})`);

  if (skipVPForLatePnP) {
    return { success: false };
  }

  // Check if VP init is possible
  if (!canInitializeWithVanishingPoints(camera, worldPoints, { allowSinglePoint })) {
    return { success: false };
  }

  // Try VP initialization
  const success = initializeCameraWithVanishingPoints(camera, worldPoints, { allowSinglePoint });
  if (success) {
    log(`[Init] ${camera.name} via VP, f=${camera.focalLength.toFixed(0)}`);
    return {
      success: true,
      camera,
      focalLength: camera.focalLength,
      rotation: [...camera.rotation] as [number, number, number, number],
    };
  }

  return { success: false };
}
