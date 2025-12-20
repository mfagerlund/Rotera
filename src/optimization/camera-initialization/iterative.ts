/**
 * Iterative camera initialization using multiple strategies.
 */

import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import type { ImagePoint } from '../../entities/imagePoint';
import { log } from '../optimization-logger';
import type { CameraInitializationResult } from '../initialization-types';
import { createDefaultDiagnostics } from '../initialization-types';
import { setupLockedPointsForInitialization } from './helpers';
import { trySingleCameraInit } from './single-camera-init';
import { runEssentialMatrixInitialization } from './essential-matrix-strategy';

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
}

/**
 * Iteratively initialize cameras using multiple strategies.
 *
 * This function implements an iterative initialization loop:
 * 1. Try to initialize remaining cameras using available strategies (VP, PnP)
 * 2. Run preliminary solve to triangulate points
 * 3. Use triangulated points to help initialize remaining cameras
 * 4. Repeat until all cameras initialized or no progress
 *
 * If cameras cannot be initialized iteratively, falls back to Essential Matrix.
 *
 * @param options - Options with cameras and constraint info
 * @param project - The project (needed for preliminary solves)
 * @param maxIterations - Maximum number of iterations (default 5)
 * @returns Result with initialized cameras, strategies used, and diagnostics
 */
export function initializeCamerasIteratively(
  options: InitializeCamerasOptions,
  project: {
    worldPoints: Iterable<WorldPoint>;
    lines: Iterable<{ pointA: WorldPoint; pointB: WorldPoint }>;
    constraints: Iterable<any>;
    imagePoints: Iterable<ImagePoint>;
  },
  maxIterations: number = 5
): CameraInitializationResult {
  const { uninitializedCameras, worldPoints, lockedPoints } = options;

  const diagnostics = createDefaultDiagnostics();
  const initializedCameras = new Set<Viewpoint>();
  const camerasInitializedViaVP = new Set<Viewpoint>();
  const camerasInitializedViaLatePnP = new Set<Viewpoint>();
  const strategyUsed = new Map<string, string>();
  const remainingCameras = new Set<Viewpoint>(uninitializedCameras);

  let iteration = 0;
  let madeProgress = true;

  // Import ConstraintSystem here to avoid circular dependency
  const { ConstraintSystem } = require('../constraint-system');

  log(`[Iterative Init] Starting with ${remainingCameras.size} cameras to initialize`);

  while (remainingCameras.size > 0 && iteration < maxIterations && madeProgress) {
    iteration++;
    madeProgress = false;
    const camerasInitializedThisIteration: Viewpoint[] = [];

    log(`[Iterative Init] Iteration ${iteration}: ${remainingCameras.size} cameras remaining`);

    // Try to initialize each remaining camera
    for (const camera of Array.from(remainingCameras)) {
      // For first iteration, use strict VP mode (2+ points)
      // For subsequent iterations, allow single point VP if only one camera remains
      const allowSinglePointVP = iteration > 1 && remainingCameras.size === 1;

      const initResult = trySingleCameraInit(
        camera,
        worldPoints,
        initializedCameras,
        lockedPoints,
        allowSinglePointVP
      );

      if (initResult.success && initResult.strategy) {
        log(`[Iterative Init] ${camera.name} initialized via ${initResult.strategy}`);
        initializedCameras.add(camera);
        camerasInitializedThisIteration.push(camera);
        strategyUsed.set(camera.name, initResult.strategy);
        madeProgress = true;

        if (initResult.strategy === 'vp') {
          camerasInitializedViaVP.add(camera);
        } else if (initResult.strategy === 'pnp') {
          camerasInitializedViaLatePnP.add(camera);
        }
      } else {
        log(`[Iterative Init] ${camera.name} not ready: ${initResult.reason || 'unknown'}`);
      }
    }

    // Remove cameras that were initialized this iteration
    for (const camera of camerasInitializedThisIteration) {
      remainingCameras.delete(camera);
    }

    // If we made progress and there are still cameras remaining, run a preliminary solve
    if (madeProgress && remainingCameras.size > 0 && initializedCameras.size > 0) {
      log(`[Iterative Init] Running preliminary solve with ${initializedCameras.size} initialized cameras`);

      // Set up locked points for the solve
      setupLockedPointsForInitialization(lockedPoints);

      // Create a preliminary constraint system
      const prelimSystem = new ConstraintSystem({
        tolerance: 1e-4,
        maxIterations: 200,
        damping: 0.1,
        verbose: false,
        optimizeCameraIntrinsics: false,
      });

      // Add world points that are visible in at least one initialized camera
      const worldPointArray = Array.from(worldPoints);
      const prelimPoints = new Set<WorldPoint>();
      for (const wp of worldPointArray) {
        const visibleInInitialized = Array.from(wp.imagePoints).some(ip =>
          initializedCameras.has((ip as ImagePoint).viewpoint)
        );
        if (visibleInInitialized) {
          prelimSystem.addPoint(wp);
          prelimPoints.add(wp);
        }
      }

      // Add lines where both endpoints are in prelimPoints
      for (const line of project.lines) {
        if (prelimPoints.has(line.pointA) && prelimPoints.has(line.pointB)) {
          prelimSystem.addLine(line);
        }
      }

      // Add only initialized cameras
      for (const camera of initializedCameras) {
        prelimSystem.addCamera(camera);
      }

      // Add image points for initialized cameras and prelimPoints
      for (const ip of project.imagePoints) {
        const ipConcrete = ip as ImagePoint;
        if (prelimPoints.has(ipConcrete.worldPoint as WorldPoint) &&
            initializedCameras.has(ipConcrete.viewpoint)) {
          prelimSystem.addImagePoint(ipConcrete);
        }
      }

      // Add constraints
      for (const c of project.constraints) {
        prelimSystem.addConstraint(c);
      }

      const prelimResult = prelimSystem.solve();
      log(`[Iterative Init] Prelim solve: conv=${prelimResult.converged}, iter=${prelimResult.iterations}, res=${prelimResult.residual.toFixed(3)}`);
    }
  }

  // If we still have uninitialized cameras, try Essential Matrix as fallback
  if (remainingCameras.size > 0) {
    log(`[Iterative Init] ${remainingCameras.size} cameras remain after ${iteration} iterations`);

    // Check if we can use Essential Matrix (need exactly 2 cameras or fall back to pair)
    if (remainingCameras.size >= 2) {
      const [camera1, camera2] = Array.from(remainingCameras).slice(0, 2);

      log(`[Iterative Init] Attempting Essential Matrix for ${camera1.name} and ${camera2.name}`);

      const emResult = runEssentialMatrixInitialization(camera1, camera2, false);

      if (emResult.success) {
        initializedCameras.add(camera1);
        initializedCameras.add(camera2);
        remainingCameras.delete(camera1);
        remainingCameras.delete(camera2);
        strategyUsed.set(camera1.name, 'essential-matrix');
        strategyUsed.set(camera2.name, 'essential-matrix');
        diagnostics.usedEssentialMatrix = true;
        diagnostics.vpEmHybridApplied = emResult.vpEmHybridApplied;
        log(`[Iterative Init] Essential Matrix succeeded for ${camera1.name} and ${camera2.name}`);
      } else {
        log(`[Iterative Init] Essential Matrix failed: ${emResult.error}`);
      }
    } else if (remainingCameras.size === 1) {
      const camera = Array.from(remainingCameras)[0];
      log(`[Iterative Init] Single camera ${camera.name} will use late PnP if possible`);
      // Leave it uninitialized - will be handled by late PnP in optimize-project
    }
  }

  const camerasFailed = Array.from(remainingCameras).map(c => c.name);

  return {
    camerasInitialized: Array.from(initializedCameras).map(c => c.name),
    camerasInitializedViaVP,
    camerasInitializedViaLatePnP,
    diagnostics,
    strategyUsed,
    camerasFailed,
    iterations: iteration,
  };
}
