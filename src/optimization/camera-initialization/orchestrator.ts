/**
 * Main camera initialization orchestrator.
 *
 * Supports two modes:
 * 1. Strategy dispatch: when _initStrategy is specified by candidate testing,
 *    runs exactly that strategy with no fallthrough.
 * 2. Legacy cascade: when no strategy specified (single-candidate case),
 *    uses the original if/else decision tree.
 */

import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import { canInitializeWithVanishingPoints } from '../vanishing-points';
import { log, logDebug } from '../optimization-logger';
import type { CameraInitializationResult } from '../initialization-types';
import { createDefaultDiagnostics } from '../initialization-types';
import { setupLockedPointsForInitialization, getConstrainedPointCount } from './helpers';
import { runFirstTierInitialization } from './first-tier';
import { runSteppedVPInitialization } from './stepped-vp';
import { runEssentialMatrixInitialization } from './essential-matrix-strategy';
import type { InitStrategyId } from './init-strategy';

/**
 * Options for the camera initialization orchestrator.
 */
export interface InitializeCamerasOptions {
  /** Cameras that need initialization (position at origin) */
  uninitializedCameras: Viewpoint[];

  /** All world points in the scene */
  worldPoints: Set<WorldPoint>;

  /** Fully constrained points (locked or inferred) */
  lockedPoints: WorldPoint[];

  /** Whether any camera can use VP with strict mode (2+ constrained points) */
  canAnyUseVPStrict: boolean;

  /** Whether any camera can use VP with relaxed mode (1 constrained point) */
  canAnyUseVPRelaxed: boolean;

  /** Explicit strategy to use (from candidate testing). If undefined, uses legacy cascade. */
  strategy?: InitStrategyId;
}

/**
 * Main camera initialization orchestrator.
 *
 * When a strategy is specified, dispatches directly to that strategy.
 * When no strategy is specified, falls back to the legacy if/else cascade.
 */
export function initializeCameras(options: InitializeCamerasOptions): CameraInitializationResult {
  if (options.strategy) {
    return initializeCamerasWithStrategy(options);
  }
  return initializeCamerasLegacy(options);
}

/**
 * Strategy dispatch mode: run exactly one strategy, no fallthrough.
 * If the strategy fails, it returns partial/empty - the probe score handles selection.
 */
function initializeCamerasWithStrategy(options: InitializeCamerasOptions): CameraInitializationResult {
  const { uninitializedCameras, worldPoints, lockedPoints, canAnyUseVPRelaxed, strategy } = options;

  const diagnostics = createDefaultDiagnostics();
  const camerasInitialized: string[] = [];
  const camerasInitializedViaVP = new Set<Viewpoint>();

  log(`[Init Strategy] Using strategy: ${strategy}`);

  switch (strategy) {
    case 'vp-pnp': {
      // Set up locked points for VP/PnP initialization
      setupLockedPointsForInitialization(lockedPoints);

      const firstTierResult = runFirstTierInitialization(uninitializedCameras, worldPoints, lockedPoints, {
        allowSinglePoint: canAnyUseVPRelaxed,
      });

      camerasInitialized.push(...firstTierResult.camerasInitialized);
      for (const vp of firstTierResult.camerasInitializedViaVP) {
        camerasInitializedViaVP.add(vp);
      }
      break;
    }

    case 'stepped-vp': {
      const steppedResult = runSteppedVPInitialization(uninitializedCameras, worldPoints, lockedPoints);

      if (steppedResult.success) {
        for (const vp of steppedResult.vpCameras) {
          camerasInitialized.push(vp.name);
          camerasInitializedViaVP.add(vp);
        }
        for (const vp of steppedResult.pnpCameras) {
          camerasInitialized.push(vp.name);
        }
      }
      // If steppedResult.reverted is true, we DON'T set diagnostics.steppedVPInitReverted
      // because in strategy mode there's no EM fallback within this call.
      break;
    }

    case 'essential-matrix': {
      if (uninitializedCameras.length < 2) {
        log(`[Init Strategy] Essential Matrix requires 2+ cameras, have ${uninitializedCameras.length}`);
        break;
      }

      const vp1 = uninitializedCameras[0];
      const vp2 = uninitializedCameras[1];

      // In strategy mode, never skip VP hybrid - let it try the best it can
      const emResult = runEssentialMatrixInitialization(vp1, vp2, false);

      if (emResult.success) {
        camerasInitialized.push(vp1.name, vp2.name);
        diagnostics.usedEssentialMatrix = true;
        diagnostics.vpEmHybridApplied = emResult.vpEmHybridApplied;
      } else {
        log(`[Init Strategy] Essential Matrix failed: ${emResult.error || 'Unknown'}`);
      }
      break;
    }

    case 'late-pnp-only': {
      // Don't initialize any cameras here - Phase 3 (late PnP) handles it.
      // Set up locked points so world point init can use them.
      setupLockedPointsForInitialization(lockedPoints);
      logDebug(`[Init Strategy] Late PnP only - camera will be initialized in Phase 3`);
      break;
    }
  }

  return {
    camerasInitialized,
    camerasInitializedViaVP,
    camerasInitializedViaLatePnP: new Set<Viewpoint>(),
    diagnostics,
  };
}

/**
 * Legacy cascade mode: original if/else decision tree.
 * Used when candidate testing returns a single candidate (no strategy variation).
 */
function initializeCamerasLegacy(options: InitializeCamerasOptions): CameraInitializationResult {
  const { uninitializedCameras, worldPoints, lockedPoints, canAnyUseVPStrict, canAnyUseVPRelaxed } = options;

  const diagnostics = createDefaultDiagnostics();
  const camerasInitialized: string[] = [];
  const camerasInitializedViaVP = new Set<Viewpoint>();

  const canAnyUseVP = canAnyUseVPStrict || canAnyUseVPRelaxed;

  logDebug(`[Init Debug] uninitCameras=${uninitializedCameras.length}, lockedPts=${lockedPoints.length}, canVP=${canAnyUseVP} (strict=${canAnyUseVPStrict}, relaxed=${canAnyUseVPRelaxed})`);

  // Try first-tier initialization if we have enough constraints.
  if (lockedPoints.length >= 2 || canAnyUseVP || (uninitializedCameras.length === 1 && lockedPoints.length >= 1)) {
    const canAnyCameraUsePnP = uninitializedCameras.some(vp => getConstrainedPointCount(vp) >= 3);
    const canAnyCameraUseVPInit = uninitializedCameras.some(vp =>
      canInitializeWithVanishingPoints(vp, worldPoints, { allowSinglePoint: canAnyUseVPRelaxed })
    );
    const willUseEssentialMatrix = !canAnyCameraUsePnP && !canAnyCameraUseVPInit;

    if (!willUseEssentialMatrix) {
      setupLockedPointsForInitialization(lockedPoints);
    }

    const firstTierResult = runFirstTierInitialization(uninitializedCameras, worldPoints, lockedPoints, {
      allowSinglePoint: canAnyUseVPRelaxed,
    });

    camerasInitialized.push(...firstTierResult.camerasInitialized);
    for (const vp of firstTierResult.camerasInitializedViaVP) {
      camerasInitializedViaVP.add(vp);
    }
  }

  if (camerasInitialized.length === 0) {
    if (uninitializedCameras.length >= 2 && canAnyUseVPRelaxed && lockedPoints.length >= 1) {
      logDebug(`[Init Stepped] Trying VP init with single locked point before Essential Matrix...`);

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
    const singleCameraWithConstrainedPoints = uninitializedCameras.length === 1 &&
      getConstrainedPointCount(uninitializedCameras[0]) > 0;

    logDebug(`[Init Debug] No cameras initialized. uninitCameras=${uninitializedCameras.length}, canUseLatePnP=${singleCameraWithConstrainedPoints}`);

    if (uninitializedCameras.length < 2 && !singleCameraWithConstrainedPoints) {
      logDebug(`[Init Debug] FAILING: Single camera needs constrained points visible`);
      throw new Error(
        'Single camera optimization requires the locked point(s) to be visible in the image. ' +
        'Either: (1) add image points for your locked world points, or (2) add a second camera ' +
        'with 7+ shared points for Essential Matrix initialization.'
      );
    }

    if (singleCameraWithConstrainedPoints) {
      logDebug(`[Init Debug] Single camera will use late PnP with constrained points`);
    } else {
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
