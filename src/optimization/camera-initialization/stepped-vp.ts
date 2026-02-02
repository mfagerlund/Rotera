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

    // Get points visible in the first VP camera for consistency checks
    const vpCameraPoints = new Set<WorldPoint>();
    for (const ip of camera.imagePoints) {
      vpCameraPoints.add(ip.worldPoint as WorldPoint);
    }

    // After VP init, try to initialize remaining cameras
    // First, try VP-init for cameras that share 2+ constrained points with the first VP camera
    // This ensures their world frames are geometrically consistent
    const remainingCameras = uninitializedCameras.filter(c => c !== camera);
    const vpCameras: Viewpoint[] = [camera];
    const vpCameraSavedStates = new Map<Viewpoint, ReturnType<typeof saveCameraState>>();
    vpCameraSavedStates.set(camera, savedState);
    const pnpCameras: Viewpoint[] = [];
    const stillUninitialized: Viewpoint[] = [];

    for (const remainingCamera of remainingCameras) {
      // Count shared constrained points with first VP camera
      let sharedConstrainedCount = 0;
      for (const ip of remainingCamera.imagePoints) {
        const wp = ip.worldPoint as WorldPoint;
        if (vpCameraPoints.has(wp) && wp.isFullyConstrained()) {
          sharedConstrainedCount++;
        }
      }

      // Try VP-init if camera shares 2+ constrained points with first VP camera
      // This ensures consistent world frame via triangulation
      if (sharedConstrainedCount >= 2 && canInitializeWithVanishingPoints(remainingCamera, worldPoints, { allowSinglePoint: true })) {
        const additionalSavedState = saveCameraState(remainingCamera);
        const vpSuccess = initializeCameraWithVanishingPoints(remainingCamera, worldPoints, { allowSinglePoint: true });
        if (vpSuccess) {
          log(`[Init Stepped] ${remainingCamera.name} via VP (shares ${sharedConstrainedCount} constrained pts), f=${remainingCamera.focalLength.toFixed(0)}`);
          vpCameras.push(remainingCamera);
          vpCameraSavedStates.set(remainingCamera, additionalSavedState);
          continue;
        }
      }

      // Try PnP if enough constrained points
      const constrainedCount = getConstrainedPointCount(remainingCamera);
      if (constrainedCount >= 3) {
        const pnpResult = initializeCameraWithPnP(remainingCamera, worldPoints);
        if (pnpResult.success && pnpResult.reliable) {
          log(`[Init Stepped] ${remainingCamera.name} via PnP (after VP), pos=[${remainingCamera.position.map(x => x.toFixed(1)).join(',')}]`);
          pnpCameras.push(remainingCamera);
          continue;
        } else {
          log(`[Init Stepped] ${remainingCamera.name} PnP unreliable after VP: ${pnpResult.reason || 'unknown'}`);
        }
      } else {
        log(`[Init Stepped] ${remainingCamera.name} needs ${constrainedCount}/3 constrained points for PnP`);
      }

      stillUninitialized.push(remainingCamera);
    }

    const allRemainingReliable = stillUninitialized.length === 0;

    // If all remaining cameras were reliably initialized, commit the results
    if (allRemainingReliable) {
      return {
        success: true,
        reverted: false,
        vpCameras,
        pnpCameras,
      };
    }

    // Some cameras couldn't be initialized. Check if we should keep partial VP init or revert.
    // Key insight: if we have 2+ VP cameras, late PnP can handle remaining cameras via triangulation.
    // Only revert to Essential Matrix if we only have 1 VP camera and EM is viable.
    if (vpCameras.length >= 2) {
      // 2+ VP cameras is a good initialization - keep it, late PnP will handle the rest
      log(`[Init Stepped] ${vpCameras.length} VP cameras initialized, ${stillUninitialized.length} will use late PnP`);
      return {
        success: true,
        reverted: false,
        vpCameras,
        pnpCameras,
      };
    }

    // Only 1 VP camera - check if Essential Matrix would be viable as alternative
    // Essential Matrix requires 7+ shared points between the first 2 cameras.
    const essentialMatrixViable = uninitializedCameras.length >= 2 && (() => {
      const cam1 = uninitializedCameras[0];
      const cam2 = uninitializedCameras[1];
      const cam1Points = new Set<WorldPoint>();
      for (const ip of cam1.imagePoints) {
        cam1Points.add(ip.worldPoint as WorldPoint);
      }
      let sharedCount = 0;
      for (const ip of cam2.imagePoints) {
        if (cam1Points.has(ip.worldPoint as WorldPoint)) {
          sharedCount++;
        }
      }
      return sharedCount >= 7;
    })();

    if (!essentialMatrixViable) {
      // Essential Matrix won't work. Keep partial VP initialization.
      log(`[Init Stepped] Essential Matrix not viable (< 7 shared). Keeping partial VP init.`);
      return {
        success: true,
        reverted: false,
        vpCameras,
        pnpCameras,
      };
    }

    // Revert VP initialization and fall back to Essential Matrix
    log(`[Init Stepped] Reverting VP init - trying Essential Matrix`);
    for (const [vp, state] of vpCameraSavedStates) {
      restoreCameraState(vp, state);
    }

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
