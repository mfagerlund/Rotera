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
import { canInitializeWithVanishingPoints } from '../vanishing-points';

export interface FirstTierOptions {
  /** Allow VP init with single locked point (when scale reference exists) */
  allowSinglePoint?: boolean;
}

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
 * @param options - Additional options
 * @returns Object with initialized camera names and VP-initialized cameras
 */
export function runFirstTierInitialization(
  uninitializedCameras: Viewpoint[],
  worldPoints: Set<WorldPoint>,
  lockedPoints: WorldPoint[],
  options: FirstTierOptions = {}
): {
  camerasInitialized: string[];
  camerasInitializedViaVP: Set<Viewpoint>;
} {
  const { allowSinglePoint = false } = options;
  const camerasInitialized: string[] = [];
  const camerasInitializedViaVP = new Set<Viewpoint>();

  // CRITICAL: When multiple cameras can VP init but have < 3 locked points each,
  // only VP init ONE camera. Independent VP init for each camera gives inconsistent
  // world frames since VP determines rotation but not a consistent position.
  // After one camera is VP-initialized, triangulate points, then PnP for the rest.

  for (const camera of uninitializedCameras) {
    // Try VP init - use relaxed mode (1 locked point) only for 2-camera scenes with scale reference
    // For 3+ cameras, use strict mode to avoid initialization instability
    const useRelaxedMode = allowSinglePoint && uninitializedCameras.length === 2;
    const vpResult = tryVPInitForCamera(camera, worldPoints, {
      allowSinglePoint: useRelaxedMode,
      lockedPointCount: lockedPoints.length,
      totalUninitializedCameras: uninitializedCameras.length,
    });

    if (vpResult.success) {
      // Save state in case we need to revert
      const savedState = saveCameraState(camera);

      camerasInitialized.push(camera.name);
      camerasInitializedViaVP.add(camera);

      // For multi-camera scenes with < 3 locked points, check if remaining cameras
      // can be reliably PnP'd. If not, check if late PnP is viable (shared points exist).
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
          // Some cameras couldn't immediately PnP. Try VP-init for remaining cameras
          // that can use VP (they share constrained points with the first VP camera).
          // If we get 2+ cameras initialized, remaining ones can use late PnP with
          // triangulated/optimized points.

          // Get points visible in the first VP camera
          const vpCameraPoints = new Set<WorldPoint>();
          for (const ip of camera.imagePoints) {
            vpCameraPoints.add(ip.worldPoint as WorldPoint);
          }

          // CRITICAL FIX: Do NOT VP-init remaining cameras independently!
          // Independent VP-init produces inconsistent world frames because VP determines
          // rotation but not a consistent position. Instead, let remaining cameras use
          // late PnP after triangulation from the first VP camera.
          // See comment at top of function for explanation.
          const stillRemaining: Viewpoint[] = [];
          for (const remainingCamera of remainingCameras) {
            // Skip cameras already reliably initialized via PnP
            if (reliablyInitialized.some(ri => ri.camera === remainingCamera)) {
              continue;
            }
            // All other cameras go to late PnP
            stillRemaining.push(remainingCamera);
          }

          // Add any cameras that were reliably PnP'd earlier
          for (const { camera: cam } of reliablyInitialized) {
            camerasInitialized.push(cam.name);
          }

          // If we have 2+ cameras initialized, remaining cameras can use late PnP
          // with triangulated points. Check if late PnP is viable.
          if (camerasInitialized.length >= 2 && stillRemaining.length > 0) {
            // Check if remaining cameras share enough points with initialized cameras
            let latePnPViable = false;
            for (const rem of stillRemaining) {
              let sharedWithVP = 0;
              for (const ip of rem.imagePoints) {
                if (vpCameraPoints.has(ip.worldPoint as WorldPoint)) {
                  sharedWithVP++;
                }
              }
              // Need at least 3 shared points to triangulate for late PnP
              if (sharedWithVP >= 3) {
                latePnPViable = true;
                break;
              }
            }

            if (latePnPViable) {
              log(`[Init First-tier] ${camerasInitialized.length} cameras initialized, ${stillRemaining.length} will use late PnP`);
            } else {
              // Remaining cameras don't share enough points - they won't be initialized
              log(`[Init First-tier] ${camerasInitialized.length} cameras initialized, ${stillRemaining.length} lack shared points for late PnP`);
            }
          } else if (camerasInitialized.length < 2) {
            // Only one camera initialized, and no remaining cameras can be initialized
            // For 2-camera scenes with relaxed mode, check if late PnP is viable
            if (useRelaxedMode && remainingCameras.length === 1) {
              let sharedWithVP = 0;
              for (const ip of remainingCameras[0].imagePoints) {
                if (vpCameraPoints.has(ip.worldPoint as WorldPoint)) {
                  sharedWithVP++;
                }
              }
              // Need at least 3 shared points to triangulate for PnP
              if (sharedWithVP >= 3) {
                log(`[Init First-tier] Late PnP viable - keeping VP init`);
              } else {
                // Revert - can't proceed with only 1 camera in multi-camera scene
                log(`[Init First-tier] Reverting VP init - need 2+ cameras or late PnP viable`);
                restoreCameraState(camera, savedState);
                for (const { camera: cam, state } of reliablyInitialized) {
                  restoreCameraState(cam, state);
                }
                camerasInitialized.length = 0;
                camerasInitializedViaVP.clear();

                for (const wp of lockedPoints) {
                  wp.optimizedXyz = undefined;
                }

                return { camerasInitialized: [], camerasInitializedViaVP: new Set() };
              }
            } else {
              // Not a 2-camera relaxed scene, revert
              log(`[Init First-tier] Reverting VP init - only 1 camera initialized in multi-camera scene`);
              restoreCameraState(camera, savedState);
              for (const { camera: cam, state } of reliablyInitialized) {
                restoreCameraState(cam, state);
              }
              camerasInitialized.length = 0;
              camerasInitializedViaVP.clear();

              for (const wp of lockedPoints) {
                wp.optimizedXyz = undefined;
              }

              return { camerasInitialized: [], camerasInitializedViaVP: new Set() };
            }
          }
        } else {
          // All remaining cameras were reliably initialized
          for (const { camera: cam } of reliablyInitialized) {
            camerasInitialized.push(cam.name);
          }
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
