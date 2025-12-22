/**
 * Main camera initialization orchestrator.
 */

import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import { canInitializeWithVanishingPoints } from '../vanishing-points';
import { log } from '../optimization-logger';
import type { CameraInitializationResult } from '../initialization-types';
import { createDefaultDiagnostics } from '../initialization-types';
import { setupLockedPointsForInitialization, getConstrainedPointCount } from './helpers';
import { runFirstTierInitialization } from './first-tier';
import { runSteppedVPInitialization } from './stepped-vp';
import { runEssentialMatrixInitialization } from './essential-matrix-strategy';
import type { InitializeCamerasOptions } from './iterative';

/**
 * Main camera initialization orchestrator.
 *
 * This function orchestrates the camera initialization flow:
 * 1. First-tier: VP with 2+ points, then PnP with 3+ points
 * 2. Stepped: VP on one camera with single point, PnP on rest
 * 3. Essential Matrix: For 2+ cameras when VP/PnP unavailable
 *
 * @param options - Options with cameras and constraint info
 * @returns Result with initialized cameras and diagnostics
 */
export function initializeCameras(options: InitializeCamerasOptions): CameraInitializationResult {
  const { uninitializedCameras, worldPoints, lockedPoints, canAnyUseVPStrict, canAnyUseVPRelaxed } = options;

  const diagnostics = createDefaultDiagnostics();
  const camerasInitialized: string[] = [];
  const camerasInitializedViaVP = new Set<Viewpoint>();

  // Use strict mode for decision-making, but note if relaxed mode is available
  const canAnyUseVP = canAnyUseVPStrict || (uninitializedCameras.length === 1 && canAnyUseVPRelaxed);

  // Debug logging for initialization path
  log(`[Init Debug] uninitCameras=${uninitializedCameras.length}, lockedPts=${lockedPoints.length}, canVP=${canAnyUseVP} (relaxed=${canAnyUseVPRelaxed})`);

  // Try first-tier initialization if we have enough constraints.
  // First-tier now has fallback logic - if VP succeeds but PnP fails for remaining
  // cameras, it reverts and returns empty to allow other paths to be tried.
  if (lockedPoints.length >= 2 || canAnyUseVP || (uninitializedCameras.length === 1 && lockedPoints.length >= 1)) {
    const canAnyCameraUsePnP = uninitializedCameras.some(vp => getConstrainedPointCount(vp) >= 3);
    const canAnyCameraUseVPInit = uninitializedCameras.some(vp =>
      canInitializeWithVanishingPoints(vp, worldPoints, { allowSinglePoint: uninitializedCameras.length === 1 })
    );
    const willUseEssentialMatrix = !canAnyCameraUsePnP && !canAnyCameraUseVPInit;

    // Set up locked points for VP/PnP initialization (not needed for Essential Matrix)
    if (!willUseEssentialMatrix) {
      setupLockedPointsForInitialization(lockedPoints);
    }

    // Run first-tier initialization (VP with 2+ points, then PnP with 3+ points)
    const firstTierResult = runFirstTierInitialization(uninitializedCameras, worldPoints, lockedPoints);

    camerasInitialized.push(...firstTierResult.camerasInitialized);
    for (const vp of firstTierResult.camerasInitializedViaVP) {
      camerasInitializedViaVP.add(vp);
    }
  }

  if (camerasInitialized.length === 0) {
    // STEPPED INITIALIZATION: Try VP init with single point for multi-camera scenes
    if (uninitializedCameras.length >= 2 && canAnyUseVPRelaxed && lockedPoints.length >= 1) {
      log(`[Init Stepped] Trying VP init with single locked point before Essential Matrix...`);

      const steppedResult = runSteppedVPInitialization(uninitializedCameras, worldPoints, lockedPoints);

      if (steppedResult.success) {
        for (const vp of steppedResult.vpCameras) {
          camerasInitialized.push(vp.name);
          camerasInitializedViaVP.add(vp);
        }
        for (const vp of steppedResult.pnpCameras) {
          camerasInitialized.push(vp.name);
        }
      } else if (steppedResult.reverted) {
        diagnostics.steppedVPInitReverted = true;
      }
    }
  }

  if (camerasInitialized.length === 0) {
    // For single-camera scenes, check if late PnP is viable
    const singleCameraWithConstrainedPoints = uninitializedCameras.length === 1 &&
      getConstrainedPointCount(uninitializedCameras[0]) > 0;

    log(`[Init Debug] No cameras initialized. uninitCameras=${uninitializedCameras.length}, canUseLatePnP=${singleCameraWithConstrainedPoints}`);

    if (uninitializedCameras.length < 2 && !singleCameraWithConstrainedPoints) {
      log(`[Init Debug] FAILING: Single camera needs constrained points visible`);
      throw new Error(
        'Single camera optimization requires the locked point(s) to be visible in the image. ' +
        'Either: (1) add image points for your locked world points, or (2) add a second camera ' +
        'with 7+ shared points for Essential Matrix initialization.'
      );
    }

    // Single camera will use late PnP - skip Essential Matrix
    if (singleCameraWithConstrainedPoints) {
      log(`[Init Debug] Single camera will use late PnP with constrained points`);
      // Skip Essential Matrix - camera will be initialized via late PnP
    } else {
      // Essential Matrix path requires 2+ cameras
      const vp1 = uninitializedCameras[0];
      const vp2 = uninitializedCameras[1];

      const emResult = runEssentialMatrixInitialization(vp1, vp2, diagnostics.steppedVPInitReverted);

      if (emResult.success) {
        camerasInitialized.push(vp1.name, vp2.name);
        diagnostics.usedEssentialMatrix = true;
        diagnostics.vpEmHybridApplied = emResult.vpEmHybridApplied;
      } else {
        throw new Error(`Essential Matrix failed: ${emResult.error || 'Unknown'}. Need 7+ shared points.`);
      }
    }
  }

  return {
    camerasInitialized,
    camerasInitializedViaVP,
    camerasInitializedViaLatePnP: new Set<Viewpoint>(),
    diagnostics,
  };
}
