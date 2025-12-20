/**
 * Stepped VP initialization: VP on one camera with single point, PnP on rest.
 */

import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import { canInitializeWithVanishingPoints, initializeCameraWithVanishingPoints } from '../vanishing-points';
import { initializeCameraWithPnP } from '../pnp';
import { log } from '../optimization-logger';
import type { SteppedVPInitResult } from '../initialization-types';
import {
  setupLockedPointsForInitialization,
  getConstrainedPointCount,
  saveCameraState,
  restoreCameraState,
} from './helpers';

/**
 * Run stepped VP initialization: VP on one camera with single point, PnP on rest.
 *
 * This is a fallback when first-tier initialization fails. It:
 * 1. Finds a camera that can use VP with single locked point
 * 2. Initializes that camera with VP
 * 3. Tries PnP on remaining cameras
 * 4. If all PnP attempts succeed, keeps the results
 * 5. If any PnP fails, reverts everything
 *
 * @param uninitializedCameras - Cameras that need initialization
 * @param worldPoints - Set of all world points
 * @param lockedPoints - Points with all 3 coordinates constrained
 * @returns Result with success flag, initialized cameras, and reverted flag
 */
export function runSteppedVPInitialization(
  uninitializedCameras: Viewpoint[],
  worldPoints: Set<WorldPoint>,
  lockedPoints: WorldPoint[]
): SteppedVPInitResult {
  // Set up locked points first
  setupLockedPointsForInitialization(lockedPoints);

  // Find and initialize the camera that can use VP with single point
  for (const camera of uninitializedCameras) {
    if (!canInitializeWithVanishingPoints(camera, worldPoints, { allowSinglePoint: true })) {
      continue;
    }

    // Save state in case we need to revert
    const savedState = saveCameraState(camera);

    const success = initializeCameraWithVanishingPoints(camera, worldPoints, { allowSinglePoint: true });
    if (!success) {
      continue;
    }

    log(`[Init Stepped] ${camera.name} via VP (single point), f=${camera.focalLength.toFixed(0)}`);

    // After VP init, try to initialize remaining cameras using PnP with constrained points
    const remainingCameras = uninitializedCameras.filter(c => c !== camera);
    let allRemainingReliable = true;
    const pnpCameras: Viewpoint[] = [];

    for (const remainingCamera of remainingCameras) {
      const constrainedCount = getConstrainedPointCount(remainingCamera);

      if (constrainedCount >= 3) {
        const pnpResult = initializeCameraWithPnP(remainingCamera, worldPoints);
        if (pnpResult.success && pnpResult.reliable) {
          log(`[Init Stepped] ${remainingCamera.name} via PnP (after VP), pos=[${remainingCamera.position.map(x => x.toFixed(1)).join(',')}]`);
          pnpCameras.push(remainingCamera);
        } else {
          log(`[Init Stepped] ${remainingCamera.name} PnP unreliable after VP: ${pnpResult.reason || 'unknown'}`);
          allRemainingReliable = false;
        }
      } else {
        log(`[Init Stepped] ${remainingCamera.name} needs ${constrainedCount}/3 constrained points for PnP`);
        allRemainingReliable = false;
      }
    }

    // If all remaining cameras were reliably initialized, commit the results
    if (allRemainingReliable && pnpCameras.length === remainingCameras.length) {
      return {
        success: true,
        reverted: false,
        vpCameras: [camera],
        pnpCameras,
      };
    }

    // Revert VP initialization and fall back to Essential Matrix
    log(`[Init Stepped] Reverting VP init - remaining cameras not reliably initialized, trying Essential Matrix`);
    restoreCameraState(camera, savedState);

    // Clear optimizedXyz for locked points so Essential Matrix can set them fresh
    for (const wp of lockedPoints) {
      wp.optimizedXyz = undefined;
    }

    return {
      success: false,
      reverted: true,
      vpCameras: [],
      pnpCameras: [],
    };
  }

  // No camera could use VP with single point
  return {
    success: false,
    reverted: false,
    vpCameras: [],
    pnpCameras: [],
  };
}
