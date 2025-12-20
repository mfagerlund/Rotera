/**
 * First-tier camera initialization (VP with 2+ points, then PnP with 3+ points).
 */

import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import { tryVPInitForCamera } from './vp-strategy';
import { tryPnPInitForCamera } from './pnp-strategy';
import { log } from '../optimization-logger';

/**
 * Run first-tier camera initialization (VP with 2+ points, then PnP with 3+ points).
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
  let vpInitializedOneCamera = false;

  for (const camera of uninitializedCameras) {
    // When multiple cameras exist and we've already VP-initialized one with < 3 locked points,
    // skip VP init for remaining cameras - they'll use late PnP after triangulation
    const skipVPForMultiCam = vpInitializedOneCamera && lockedPoints.length < 3;
    if (skipVPForMultiCam) {
      log(`[Init Path] ${camera.name}: skipping VP (already VP-inited one camera with < 3 locked points)`);
      continue;
    }

    // Try VP init (strict mode - requires 2+ constrained points)
    const vpResult = tryVPInitForCamera(camera, worldPoints, {
      allowSinglePoint: false,
      lockedPointCount: lockedPoints.length,
      totalUninitializedCameras: uninitializedCameras.length,
    });

    if (vpResult.success) {
      camerasInitialized.push(camera.name);
      camerasInitializedViaVP.add(camera);
      vpInitializedOneCamera = true;
      continue;
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
