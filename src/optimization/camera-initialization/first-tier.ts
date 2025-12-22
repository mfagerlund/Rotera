/**
 * First-tier camera initialization (VP with 2+ points, then PnP with 3+ points).
 */

import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import { tryVPInitForCamera } from './vp-strategy';
import { tryPnPInitForCamera } from './pnp-strategy';
import { log } from '../optimization-logger';
import { saveCameraState, restoreCameraState, getConstrainedPointCount } from './helpers';
import { initializeCameraWithPnP } from '../pnp';

/**
 * Run first-tier camera initialization (VP with 2+ points, then PnP with 3+ points).
 *
 * This function has fallback logic similar to stepped-vp: if VP succeeds for one camera
 * but remaining cameras can't be reliably PnP'd, it reverts and returns nothing.
 * This allows the orchestrator to fall back to stepped VP or Essential Matrix.
 *
 * @param uninitializedCameras - Cameras that need initialization
 * @param worldPoints - Set of all world points
 * @param lockedPoints - Points with all 3 coordinates constrained
 * @returns Object with initialized camera names and VP-initialized cameras
 */
export function runFirstTierInitialization(
  uninitializedCameras: Viewpoint[],
  worldPoints: Set<WorldPoint>,
  lockedPoints: WorldPoint[]
): {
  camerasInitialized: string[];
  camerasInitializedViaVP: Set<Viewpoint>;
} {
  const camerasInitialized: string[] = [];
  const camerasInitializedViaVP = new Set<Viewpoint>();

  // CRITICAL: When multiple cameras can VP init but have < 3 locked points each,
  // only VP init ONE camera. Independent VP init for each camera gives inconsistent
  // world frames since VP determines rotation but not a consistent position.
  // After one camera is VP-initialized, triangulate points, then PnP for the rest.

  for (const camera of uninitializedCameras) {
    // Try VP init (strict mode - requires 2+ constrained points)
    const vpResult = tryVPInitForCamera(camera, worldPoints, {
      allowSinglePoint: false,
      lockedPointCount: lockedPoints.length,
      totalUninitializedCameras: uninitializedCameras.length,
    });

    if (vpResult.success) {
      // Save state in case we need to revert
      const savedState = saveCameraState(camera);

      camerasInitialized.push(camera.name);
      camerasInitializedViaVP.add(camera);

      // For multi-camera scenes with < 3 locked points, check if remaining cameras
      // can be reliably PnP'd. If not, revert and let orchestrator try other paths.
      if (uninitializedCameras.length >= 2 && lockedPoints.length < 3) {
        const remainingCameras = uninitializedCameras.filter(c => c !== camera);
        let allRemainingReliable = true;
        const reliablyInitialized: { camera: Viewpoint; state: ReturnType<typeof saveCameraState> }[] = [];

        for (const remainingCamera of remainingCameras) {
          const constrainedCount = getConstrainedPointCount(remainingCamera);

          if (constrainedCount >= 3) {
            const savedRemaining = saveCameraState(remainingCamera);
            const pnpResult = initializeCameraWithPnP(remainingCamera, worldPoints);

            if (pnpResult.success && pnpResult.reliable) {
              reliablyInitialized.push({ camera: remainingCamera, state: savedRemaining });
            } else {
              // Revert this camera
              restoreCameraState(remainingCamera, savedRemaining);
              log(`[Init First-tier] ${remainingCamera.name} PnP unreliable after VP: ${pnpResult.reason || 'unknown'}`);
              allRemainingReliable = false;
              break;
            }
          } else {
            log(`[Init First-tier] ${remainingCamera.name} needs ${constrainedCount}/3 constrained points for PnP`);
            allRemainingReliable = false;
            break;
          }
        }

        if (!allRemainingReliable) {
          // Revert VP camera and all reliably initialized cameras
          log(`[Init First-tier] Reverting VP init - remaining cameras not reliably initialized`);
          restoreCameraState(camera, savedState);
          for (const { camera: cam, state } of reliablyInitialized) {
            restoreCameraState(cam, state);
          }

          // Clear optimizedXyz for locked points so other paths can set them fresh
          for (const wp of lockedPoints) {
            wp.optimizedXyz = undefined;
          }

          // Return empty - let orchestrator try stepped VP or Essential Matrix
          return { camerasInitialized: [], camerasInitializedViaVP: new Set() };
        }

        // All remaining cameras were reliably initialized
        for (const { camera: cam } of reliablyInitialized) {
          camerasInitialized.push(cam.name);
        }
      }

      // Skip remaining cameras in the loop - we've handled them above
      break;
    }

    // Try PnP if VP didn't work
    const pnpResult = tryPnPInitForCamera(camera, worldPoints);
    if (pnpResult.success && pnpResult.reliable) {
      camerasInitialized.push(camera.name);
    }
    // Other cases (unreliable, not enough points) - camera will try other methods
  }

  return { camerasInitialized, camerasInitializedViaVP };
}
