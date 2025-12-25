/**
 * First-tier camera initialization (VP with 2+ points, then PnP with 3+ points).
 */

import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import { tryVPInitForCamera } from './vp-strategy';
import { tryPnPInitForCamera } from './pnp-strategy';
import { log } from '../optimization-logger';
import { saveCameraState, restoreCameraState, getConstrainedPointCount, countSharedPoints } from './helpers';
import { initializeCameraWithPnP } from '../pnp';
import { canInitializeWithVanishingPoints } from '../vanishing-points';
import { initializeCamerasWithEssentialMatrix } from '../essential-matrix';

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

      // Get points visible in this VP camera (for checking shared points later)
      const vpCameraPoints = new Set<WorldPoint>();
      for (const ip of camera.imagePoints) {
        vpCameraPoints.add(ip.worldPoint as WorldPoint);
      }

      // For multi-camera scenes with < 3 locked points, check if remaining cameras
      // can be reliably PnP'd or will use late PnP after triangulation.
      // NOTE: We do NOT VP-init additional cameras independently because their world
      // frames would be inconsistent (VP determines rotation independently).
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
          // When remaining cameras can't immediately PnP, we have three options:
          // 1. VP-init another camera that shares constrained points (gives consistent world frame)
          // 2. Use Essential Matrix to initialize a second camera
          // 3. Rely on late PnP (but this needs triangulated points, which requires 2+ cameras!)
          //
          // Option 1 is preferred when available because VP gives accurate orientation.

          // First, try VP-init for remaining cameras that share constrained points with first VP camera
          // If both cameras see the same constrained points, they will get consistent positions
          let vpInitSecondCamera: Viewpoint | null = null;
          const vpCameraConstrainedPoints = new Set<WorldPoint>();
          for (const ip of camera.imagePoints) {
            const wp = ip.worldPoint as WorldPoint;
            if (wp.isFullyConstrained()) {
              vpCameraConstrainedPoints.add(wp);
            }
          }

          for (const remainingCamera of remainingCameras) {
            // Check if this camera can VP-init
            const canVP = canInitializeWithVanishingPoints(remainingCamera, worldPoints, { allowSinglePoint: true });
            if (!canVP) continue;

            // Check if it shares constrained points with the first VP camera
            let sharedConstrained = 0;
            for (const ip of remainingCamera.imagePoints) {
              const wp = ip.worldPoint as WorldPoint;
              if (vpCameraConstrainedPoints.has(wp)) {
                sharedConstrained++;
              }
            }

            log(`[Init First-tier] ${remainingCamera.name} canVP=${canVP}, sharedConstrained=${sharedConstrained}`);

            // Need at least 1 shared constrained point for consistent world frame
            if (sharedConstrained >= 1) {
              vpInitSecondCamera = remainingCamera;
              log(`[Init First-tier] ${remainingCamera.name} can VP-init with shared constrained points`);
              break;
            }
          }

          if (vpInitSecondCamera) {
            // VP-init the second camera
            const savedRemaining = saveCameraState(vpInitSecondCamera);
            const vpResult = tryVPInitForCamera(vpInitSecondCamera, worldPoints, {
              allowSinglePoint: true,
              lockedPointCount: lockedPoints.length,
              totalUninitializedCameras: uninitializedCameras.length,
            });

            if (vpResult.success) {
              camerasInitialized.push(vpInitSecondCamera.name);
              camerasInitializedViaVP.add(vpInitSecondCamera);
              log(`[Init First-tier] VP-init second camera ${vpInitSecondCamera.name}`);

              // Now we have 2 VP cameras, remaining cameras can use late PnP
              for (const { camera: cam } of reliablyInitialized) {
                camerasInitialized.push(cam.name);
              }
            } else {
              restoreCameraState(vpInitSecondCamera, savedRemaining);
              vpInitSecondCamera = null;
            }
          }

          // If VP-init didn't work, try Essential Matrix
          let emCandidate: Viewpoint | null = null;
          if (!vpInitSecondCamera) {
            // Find a remaining camera with enough shared points for Essential Matrix (7+)
            for (const remainingCamera of remainingCameras) {
              const shared = countSharedPoints(camera, remainingCamera);
              log(`[Init First-tier] ${remainingCamera.name} shares ${shared} points with VP camera ${camera.name}`);
              if (shared >= 7) {
                emCandidate = remainingCamera;
                log(`[Init First-tier] ${remainingCamera.name} has enough for EM`);
                break;
              }
            }
          }

          if (emCandidate) {
            // Use Essential Matrix to initialize the second camera
            // This gives us 2 initialized cameras, enabling proper triangulation
            log(`[Init First-tier] Using Essential Matrix between ${camera.name} and ${emCandidate.name}`);

            // Save state before EM
            const emCameraState = saveCameraState(emCandidate);

            // Reset EM camera intrinsics to safe defaults
            emCandidate.focalLength = Math.max(emCandidate.imageWidth, emCandidate.imageHeight);
            emCandidate.principalPointX = emCandidate.imageWidth / 2;
            emCandidate.principalPointY = emCandidate.imageHeight / 2;

            // Run EM with VP camera as reference
            const emResult = initializeCamerasWithEssentialMatrix(camera, emCandidate, 10.0);

            if (emResult.success) {
              // EM succeeded - now we have 2 cameras initialized
              // The EM gives relative pose; we need to align it with VP camera's world frame

              // The VP camera's rotation defines the world frame. EM gives relative rotation.
              // We need to rotate EM camera's pose to match VP's world frame.
              // This is done by applying VP's rotation as a global rotation.

              // VP camera is already at correct rotation (from VP init)
              // EM camera needs its rotation composed with VP's world rotation
              const qVP = camera.rotation;
              const qEM = emCandidate.rotation;

              // Quaternion multiply: q_world = q_vp * q_em
              const qMult = (a: number[], b: number[]): [number, number, number, number] => {
                return [
                  a[0]*b[0] - a[1]*b[1] - a[2]*b[2] - a[3]*b[3],
                  a[0]*b[1] + a[1]*b[0] + a[2]*b[3] - a[3]*b[2],
                  a[0]*b[2] - a[1]*b[3] + a[2]*b[0] + a[3]*b[1],
                  a[0]*b[3] + a[1]*b[2] - a[2]*b[1] + a[3]*b[0]
                ];
              };

              // Rotate EM camera's position by VP's rotation
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

              // Apply VP's world rotation to EM camera
              emCandidate.rotation = qMult(qVP, qEM);
              emCandidate.position = rotateVec(qVP, emCandidate.position);

              // Also offset EM camera by VP camera's position (VP is the origin in EM frame)
              emCandidate.position = [
                emCandidate.position[0] + camera.position[0],
                emCandidate.position[1] + camera.position[1],
                emCandidate.position[2] + camera.position[2],
              ];

              camerasInitialized.push(emCandidate.name);
              log(`[Init First-tier] EM succeeded: ${emCandidate.name} pos=[${emCandidate.position.map(x => x.toFixed(2)).join(',')}]`);

              // Add any reliably initialized cameras from earlier
              for (const { camera: cam } of reliablyInitialized) {
                camerasInitialized.push(cam.name);
              }
            } else {
              // EM failed - restore state and fall back to late PnP check
              log(`[Init First-tier] EM failed: ${emResult.error}`);
              restoreCameraState(emCandidate, emCameraState);

              // Fall through to late PnP check below
              emCandidate = null;
            }
          }

          // If VP-init and EM both weren't used or failed, check if late PnP is viable
          if (!vpInitSecondCamera && !emCandidate) {
            // Check if late PnP is viable by counting shared points with VP camera
            let latePnPViable = false;

            // For each remaining camera, check if it shares enough points for triangulation
            let totalSharedPoints = 0;
            for (const remainingCamera of remainingCameras) {
              let sharedWithVP = 0;
              for (const ip of remainingCamera.imagePoints) {
                if (vpCameraPoints.has(ip.worldPoint as WorldPoint)) {
                  sharedWithVP++;
                }
              }
              if (sharedWithVP >= 3) {
                totalSharedPoints += sharedWithVP;
              }
            }
            // Late PnP is viable if at least one remaining camera shares enough points
            latePnPViable = totalSharedPoints >= 3;

            if (latePnPViable) {
              log(`[Init First-tier] Late PnP viable - keeping VP init, remaining cameras will use late PnP`);
              // Don't revert - add reliably initialized cameras
              for (const { camera: cam } of reliablyInitialized) {
                camerasInitialized.push(cam.name);
              }
            } else {
              // Revert VP camera and all reliably initialized cameras
              log(`[Init First-tier] Reverting VP init - remaining cameras not reliably initialized`);
              restoreCameraState(camera, savedState);
              for (const { camera: cam, state } of reliablyInitialized) {
                restoreCameraState(cam, state);
              }
              camerasInitialized.pop(); // Remove the VP camera we just added
              camerasInitializedViaVP.delete(camera);

              // Clear optimizedXyz for locked points so other paths can set them fresh
              for (const wp of lockedPoints) {
                wp.optimizedXyz = undefined;
              }

              // Return empty - let orchestrator try stepped VP or Essential Matrix
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
