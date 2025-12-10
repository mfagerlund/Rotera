import { Project } from '../entities/project';
import { ConstraintSystem, SolverResult, SolverOptions } from './constraint-system';
import { initializeWorldPoints } from './entity-initialization';
import { initializeCameraWithPnP, PnPInitializationResult } from './pnp';
import { Viewpoint } from '../entities/viewpoint';
import { WorldPoint } from '../entities/world-point';
import { ImagePoint } from '../entities/imagePoint';
import { Line } from '../entities/line';
import { initializeCamerasWithEssentialMatrix } from './essential-matrix';
import { initializeWorldPoints as unifiedInitialize } from './unified-initialization';
import { initializeSingleCameraPoints } from './single-camera-initialization';
import { initializeCameraWithVanishingPoints } from './vanishing-points';
import { alignSceneToLineDirections, alignSceneToLockedPoints } from './coordinate-alignment';
import { log, clearOptimizationLogs, optimizationLogs } from './optimization-logger';

// Re-export for backwards compatibility
export { log, clearOptimizationLogs, optimizationLogs } from './optimization-logger';

/**
 * Reset all cached optimization state on project entities.
 * Call this before each solve to ensure no stale data is reused.
 */
export function resetOptimizationState(project: Project) {
  log('[resetOptimizationState] Clearing all cached optimization state...');

  // Reset world points
  // NOTE: Do NOT clear optimizedXyz here - tests and callers may provide initial values.
  // The auto-initialization pipeline will overwrite if autoInitializeWorldPoints is true.
  for (const wp of project.worldPoints) {
    const point = wp as WorldPoint;
    point.inferredXyz = [null, null, null];
    point.lastResiduals = [];
  }

  // Reset viewpoints (cameras)
  // NOTE: Do NOT clear position/rotation here - tests and callers may provide initial values.
  // The auto-initialization pipeline will overwrite if autoInitializeCameras is true.
  for (const vp of project.viewpoints) {
    const viewpoint = vp as Viewpoint;
    viewpoint.lastResiduals = [];
    // Clear hidden VP cache
    delete (viewpoint as any).__initialCameraVps;
  }

  // Reset image points
  for (const ip of project.imagePoints) {
    const imagePoint = ip as ImagePoint;
    imagePoint.lastResiduals = [];
    imagePoint.isOutlier = false;
    imagePoint.reprojectedU = undefined;
    imagePoint.reprojectedV = undefined;
  }

  // Reset lines
  for (const line of project.lines) {
    (line as Line).lastResiduals = [];
  }

  // Reset constraints
  for (const constraint of project.constraints) {
    constraint.lastResiduals = [];
  }

  // Re-run inference propagation to rebuild inferredXyz from constraints
  // CRITICAL: This MUST run synchronously before optimization starts
  // Do NOT rely on MobX reactions - they may not have executed yet
  project.propagateInferences();
  log('[resetOptimizationState] Inference propagation complete');

  log('[resetOptimizationState] Done - all optimization state cleared');
}

function detectOutliers(
  project: Project,
  threshold: number
): { outliers: OutlierInfo[]; medianError: number; actualThreshold: number } {
  const errors: number[] = [];
  const imagePointErrors: Array<{ imagePoint: ImagePoint; error: number }> = [];

  for (const vp of project.viewpoints) {
    for (const ip of vp.imagePoints) {
      const ipConcrete = ip as ImagePoint;
      if (ipConcrete.lastResiduals && ipConcrete.lastResiduals.length === 2) {
        const error = Math.sqrt(ipConcrete.lastResiduals[0] ** 2 + ipConcrete.lastResiduals[1] ** 2);
        errors.push(error);
        imagePointErrors.push({ imagePoint: ipConcrete, error });
      }
    }
  }

  errors.sort((a, b) => a - b);
  const medianError = errors.length > 0 ? errors[Math.floor(errors.length / 2)] : 0;

  const outlierThreshold = medianError < 20
    ? Math.max(threshold * medianError, 50)
    : Math.min(threshold * medianError, 80);

  const outliers: OutlierInfo[] = [];
  for (const { imagePoint, error } of imagePointErrors) {
    if (error > outlierThreshold) {
      outliers.push({
        imagePoint,
        error,
        worldPointName: imagePoint.worldPoint.getName(),
        viewpointName: imagePoint.viewpoint.getName(),
      });
    }
  }

  outliers.sort((a, b) => b.error - a.error);

  return { outliers, medianError, actualThreshold: outlierThreshold };
}

export interface OutlierInfo {
  imagePoint: ImagePoint;
  error: number;
  worldPointName: string;
  viewpointName: string;
}

export interface OptimizeProjectOptions extends Omit<SolverOptions, 'optimizeCameraIntrinsics'> {
  autoInitializeCameras?: boolean;
  autoInitializeWorldPoints?: boolean;
  detectOutliers?: boolean;
  outlierThreshold?: number;
  /**
   * If true, optimize camera intrinsics for all cameras.
   * If false, keep intrinsics fixed.
   * If 'auto' (default), optimize intrinsics only for cameras without vanishing lines.
   */
  optimizeCameraIntrinsics?: boolean | 'auto';
}

export interface OptimizeProjectResult extends SolverResult {
  camerasInitialized?: string[];
  camerasExcluded?: string[];
  outliers?: OutlierInfo[];
  medianReprojectionError?: number;
}

export function optimizeProject(
  project: Project,
  options: OptimizeProjectOptions = {}
): OptimizeProjectResult {
  // GUARD: Ensure we have an actual Project instance, not a plain object
  // This catches the bug where someone does `{ ...project }` or creates a fake project object
  if (typeof project.propagateInferences !== 'function') {
    throw new Error(
      'optimizeProject received a plain object instead of a Project instance. ' +
      'DO NOT use spread operator on Project or create fake project objects. ' +
      'Pass the actual Project instance from the store.'
    );
  }

  const {
    autoInitializeCameras = true,
    autoInitializeWorldPoints = true,
    detectOutliers: shouldDetectOutliers = true,
    outlierThreshold = 3.0,
    tolerance = 1e-6,
    maxIterations = 100,
    damping = 1e-3,
    verbose = false,
    optimizeCameraIntrinsics = 'auto',
  } = options;

  // Clear logs and reset all cached state before solving
  clearOptimizationLogs();
  resetOptimizationState(project);

  log('[optimizeProject] Starting optimization...');
  log(`  World Points: ${project.worldPoints.size}`);
  log(`  Lines: ${project.lines.size}`);
  log(`  Viewpoints: ${project.viewpoints.size}`);
  log(`  Image Points: ${project.imagePoints.size}`);
  log(`  Constraints: ${project.constraints.size}`);

  // DEBUG: Check world point initialization
  const wpArray = Array.from(project.worldPoints);
  const wpWithOptimizedXyz = wpArray.filter(p => (p as WorldPoint).optimizedXyz !== null);
  log(`[optimizeProject] World points with optimizedXyz: ${wpWithOptimizedXyz.length}/${wpArray.length}`);

  // DEBUG: Check camera positions
  Array.from(project.viewpoints).forEach(vp => {
    const v = vp as Viewpoint;
    log(`[optimizeProject] Camera ${v.name} position: [${v.position.join(', ')}], imagePoints: ${v.imagePoints.size}`);
  });

  const camerasInitialized: string[] = [];
  // Track cameras initialized via "late PnP" (using triangulated points) - these are vulnerable to degenerate solutions
  const camerasInitializedViaLatePnP = new Set<Viewpoint>();

  if (autoInitializeCameras || autoInitializeWorldPoints) {
    log('[optimizeProject] Running initialization pipeline...');

    const viewpointArray = Array.from(project.viewpoints);

    if (autoInitializeCameras) {
      log('[optimizeProject] Resetting all camera poses and problematic intrinsics');
      for (const vp of viewpointArray) {
        const v = vp as Viewpoint;
        // Reset pose
        v.position = [0, 0, 0];
        v.rotation = [1, 0, 0, 0];
        // Reset intrinsics that could be garbage from a previous failed solve
        v.skewCoefficient = 0;
        v.aspectRatio = 1;
        v.radialDistortion = [0, 0, 0];
        v.tangentialDistortion = [0, 0];

        // Also reset focalLength and principalPoint if they're clearly garbage
        // (e.g., negative, outside image bounds, or unreasonable)
        const minFocalLength = Math.min(v.imageWidth, v.imageHeight) * 0.3;
        const maxFocalLength = Math.max(v.imageWidth, v.imageHeight) * 5;
        if (v.focalLength < minFocalLength || v.focalLength > maxFocalLength) {
          log(`  ${v.name}: Resetting garbage focalLength ${v.focalLength.toFixed(1)} to ${Math.max(v.imageWidth, v.imageHeight)}`);
          v.focalLength = Math.max(v.imageWidth, v.imageHeight);
        }
        // Principal point should be within image bounds
        if (v.principalPointX < 0 || v.principalPointX > v.imageWidth ||
            v.principalPointY < 0 || v.principalPointY > v.imageHeight) {
          log(`  ${v.name}: Resetting garbage principalPoint (${v.principalPointX.toFixed(1)}, ${v.principalPointY.toFixed(1)}) to image center`);
          v.principalPointX = v.imageWidth / 2;
          v.principalPointY = v.imageHeight / 2;
        }
      }

      // Also clear optimizedXyz on unconstrained world points - they may have garbage
      // values from previous failed optimizations that would corrupt the new solve
      const wpArray = Array.from(project.worldPoints) as WorldPoint[];
      let clearedCount = 0;
      for (const wp of wpArray) {
        if (!wp.isFullyConstrained() && wp.optimizedXyz) {
          wp.optimizedXyz = undefined;
          clearedCount++;
        }
      }
      if (clearedCount > 0) {
        log(`[optimizeProject] Cleared stale optimizedXyz on ${clearedCount} unconstrained world points`);
      }
    }

    const uninitializedCameras = viewpointArray.filter(vp => {
      const v = vp as Viewpoint;
      return v.position[0] === 0 && v.position[1] === 0 && v.position[2] === 0;
    });

    log(`[optimizeProject] Cameras needing initialization: ${uninitializedCameras.length}/${viewpointArray.length}`);

    if (uninitializedCameras.length >= 1 && autoInitializeCameras) {
      const worldPointArray = Array.from(project.worldPoints) as WorldPoint[];
      const lockedPoints = worldPointArray.filter(wp => wp.isFullyConstrained());
      const worldPointSet = new Set<WorldPoint>(worldPointArray);

      if (lockedPoints.length >= 2 || uninitializedCameras.some(vp => (vp as Viewpoint).canInitializeWithVanishingPoints(worldPointSet))) {
        log(`[optimizeProject] Found ${lockedPoints.length} constrained points`);

        const canAnyCameraUsePnP = uninitializedCameras.some(vp => {
          const vpConcrete = vp as Viewpoint;
          const vpLockedPoints = Array.from(vpConcrete.imagePoints).filter(ip =>
            (ip.worldPoint as WorldPoint).isFullyConstrained()
          );
          return vpLockedPoints.length >= 3;
        });

        const canAnyCameraUseVP = uninitializedCameras.some(vp =>
          (vp as Viewpoint).canInitializeWithVanishingPoints(worldPointSet)
        );

        const willUseEssentialMatrix = !canAnyCameraUsePnP && !canAnyCameraUseVP;

        if (!willUseEssentialMatrix) {
          for (const wp of lockedPoints) {
            const effective = wp.getEffectiveXyz();
            wp.optimizedXyz = [effective[0]!, effective[1]!, effective[2]!];
            log(`  ${wp.name}: [${wp.optimizedXyz.join(', ')}]`);
          }
        } else {
          log(`[optimizeProject] Skipping locked point initialization (will use Essential Matrix with scale resolution)`);
        }

        for (const vp of uninitializedCameras) {
          const vpConcrete = vp as Viewpoint;

          if (vpConcrete.canInitializeWithVanishingPoints(worldPointSet)) {
            log(`[optimizeProject] Checking vanishing point initialization for ${vpConcrete.name}...`);
            log(`  Vanishing lines: ${vpConcrete.getVanishingLineCount()}`);

            const success = initializeCameraWithVanishingPoints(vpConcrete, worldPointSet);
            if (success) {
              // DON'T lock pose after VP initialization - let the optimizer refine it
              // The VP initialization gives a good starting point, but may not be perfect
              // vpConcrete.setPoseLocked(true);
              log(`[optimizeProject] ${vpConcrete.name} initialized with vanishing points (pose NOT locked - will be refined)`);
              log(`  Position: [${vpConcrete.position.map(x => x.toFixed(3)).join(', ')}]`);
              log(`  Focal length: ${vpConcrete.focalLength.toFixed(1)}`);
              camerasInitialized.push(vpConcrete.name);
              continue;
            } else {
              log(`[optimizeProject] Vanishing point initialization failed for ${vpConcrete.name}, falling back to PnP`);
            }
          }

          const vpLockedPoints = Array.from(vpConcrete.imagePoints).filter(ip =>
            (ip.worldPoint as WorldPoint).isFullyConstrained()
          );

          if (vpLockedPoints.length >= 3) {
            log(`[optimizeProject] Initializing ${vpConcrete.name} with PnP (${vpLockedPoints.length} constrained points visible)...`);
            const pnpResult = initializeCameraWithPnP(vpConcrete, worldPointSet);
            if (pnpResult.success && pnpResult.reliable) {
              log(`[optimizeProject] ${vpConcrete.name} initialized: pos=[${vpConcrete.position.map(x => x.toFixed(3)).join(', ')}]`);
              camerasInitialized.push(vpConcrete.name);
            } else if (pnpResult.success && !pnpResult.reliable) {
              log(`[optimizeProject] ${vpConcrete.name} PnP result unreliable: ${pnpResult.reason}`);
              log(`[optimizeProject] ${vpConcrete.name} will be excluded from optimization`);
              // Reset the camera to mark it as not initialized
              vpConcrete.position = [0, 0, 0];
              vpConcrete.rotation = [1, 0, 0, 0];
            } else {
              const errorMsg = `Cannot initialize ${vpConcrete.name}: PnP failed with ${vpLockedPoints.length} locked points. Check that locked points have valid coordinates and are visible in the image.`;
              log(`[optimizeProject] ${errorMsg}`);
              throw new Error(errorMsg);
            }
          } else {
            log(`[optimizeProject] ${vpConcrete.name} has only ${vpLockedPoints.length} locked points (need 3 for PnP) - will try later with triangulated points`);
          }
        }
      }

      if (camerasInitialized.length === 0) {
        if (uninitializedCameras.length < 2) {
          const errorMsg = `Cannot initialize: need at least 2 cameras for Essential Matrix initialization, but only ${uninitializedCameras.length} available. Lock at least 3 world points with known coordinates to use PnP initialization instead.`;
          log(`[optimizeProject] ${errorMsg}`);
          throw new Error(errorMsg);
        }

        log('[optimizeProject] No locked points - using Essential Matrix initialization');

        const vp1 = uninitializedCameras[0] as Viewpoint;
        const vp2 = uninitializedCameras[1] as Viewpoint;

        // CRITICAL: For Essential Matrix initialization (no locked points), we have no ground truth
        // for intrinsics. Reset to safe defaults - the optimizer will refine them.
        // This is necessary because previous failed solves may have left "valid-looking" but
        // completely wrong intrinsics (e.g., focalLength=3000 for a 1000px image).
        for (const vp of [vp1, vp2]) {
          const originalFocal = vp.focalLength;
          const originalPP = [vp.principalPointX, vp.principalPointY];
          vp.focalLength = Math.max(vp.imageWidth, vp.imageHeight);
          vp.principalPointX = vp.imageWidth / 2;
          vp.principalPointY = vp.imageHeight / 2;
          log(`  ${vp.name}: Reset intrinsics for Essential Matrix: f=${originalFocal.toFixed(0)}->${vp.focalLength}, pp=(${originalPP[0].toFixed(0)},${originalPP[1].toFixed(0)})->(${vp.principalPointX.toFixed(0)},${vp.principalPointY.toFixed(0)})`);
        }

        const result = initializeCamerasWithEssentialMatrix(vp1, vp2, 10.0);

        if (result.success) {
          log('[optimizeProject] Essential Matrix initialization successful');
          log(`  ${vp1.name}: [${vp1.position.map(x => x.toFixed(3)).join(', ')}]`);
          log(`  ${vp2.name}: [${vp2.position.map(x => x.toFixed(3)).join(', ')}]`);
          camerasInitialized.push(vp1.name, vp2.name);
        } else {
          const errorMsg = `Cannot initialize cameras: ${result.error || 'Unknown error'}. Need at least 7 shared point correspondences between two cameras for Essential Matrix initialization. Add more image points or lock some world point coordinates to use PnP instead.`;
          log(`[optimizeProject] ${errorMsg}`);
          throw new Error(errorMsg);
        }
      }
    }
  }

  // Check if we used Essential Matrix (fewer than 3 locked points means no PnP)
  const wpArrayForCheck = Array.from(project.worldPoints) as WorldPoint[];
  const lockedPointsForCheck = wpArrayForCheck.filter(wp => wp.isFullyConstrained());
  const usedEssentialMatrix = autoInitializeCameras && lockedPointsForCheck.length < 3;

  if (autoInitializeWorldPoints) {
    const pointArray = Array.from(project.worldPoints);
    const lineArray = Array.from(project.lines);
    const constraintArray = Array.from(project.constraints);

    const initializedViewpointSet = new Set<Viewpoint>();
    for (const vpName of camerasInitialized) {
      const vp = Array.from(project.viewpoints).find(v => v.name === vpName);
      if (vp) {
        initializedViewpointSet.add(vp as Viewpoint);
      }
    }

    // Compute axis-constrained lines early so we know if free-solve is needed
    const viewpointArray = Array.from(project.viewpoints) as Viewpoint[];
    const axisConstrainedLines = lineArray.filter(l => l.direction && ['x', 'y', 'z'].includes(l.direction));

    // For Essential Matrix WITHOUT axis constraints, use "free solve then align" approach:
    // 1. DON'T pre-set locked points to their target positions
    // 2. Triangulate everything in the Essential Matrix coordinate frame
    // 3. Run a preliminary optimization to satisfy geometric constraints
    // 4. Apply a similarity transform to align with locked points
    // This is ONLY needed when axis constraints don't exist to fix orientation.
    const useFreeSolve = usedEssentialMatrix && axisConstrainedLines.length === 0;
    if (useFreeSolve) {
      log('[optimizeProject] Using FREE SOLVE approach for Essential Matrix initialization (no axis constraints)');
    }

    unifiedInitialize(pointArray, lineArray, constraintArray, {
      sceneScale: 10.0,
      verbose: false,
      initializedViewpoints: initializedViewpointSet,
      skipLockedPoints: useFreeSolve,  // Only skip locked points for free-solve path
    });

    // Log positions after triangulation (before any alignment)
    if (useFreeSolve) {
      log(`[optimizeProject] After triangulation (before alignment): ${lockedPointsForCheck.length} locked points`);
      for (const wp of lockedPointsForCheck) {
        log(`  ${wp.name}: optimizedXyz = ${JSON.stringify(wp.optimizedXyz)}`);
      }
    }

    if (axisConstrainedLines.length > 0) {
      alignSceneToLineDirections(viewpointArray, pointArray, lineArray);

      // Check if we have enough constraints to fully resolve rotation
      const uniqueAxes = new Set(axisConstrainedLines.map(l => l.direction));
      if (usedEssentialMatrix && uniqueAxes.size < 2) {
        log('[optimizeProject] WARNING: Essential Matrix initialization with only one axis constraint.');
        log('  A single axis constraint leaves one rotational degree of freedom unresolved.');
        log('  For best results, add a second axis constraint on a perpendicular line,');
        log('  or lock at least 2 world point positions.');
      }
    } else if (usedEssentialMatrix && lockedPointsForCheck.length < 2) {
      log('[optimizeProject] WARNING: Essential Matrix initialization without axis constraints.');
      log('  The scene orientation is arbitrary and may converge to incorrect local minima.');
      log('  For best results, either:');
      log('    - Add axis direction constraints (x, y, z) to at least 2 perpendicular lines');
      log('    - Lock at least 2 world point positions');
    }

    // For Essential Matrix WITHOUT axis constraints: Run preliminary optimization WITHOUT locked point constraints
    // to let geometric constraints (coplanar, etc.) be satisfied first.
    // This is ONLY needed when there are no axis constraints, because then the scene orientation
    // is arbitrary and we need to let the optimizer find a valid configuration before aligning.
    // When axis constraints exist, alignSceneToLineDirections already handles orientation properly.
    // Only run preliminary free optimization if using free-solve AND there are constraints to satisfy
    if (useFreeSolve && constraintArray.length > 0) {
      log('\n=== PRELIMINARY FREE OPTIMIZATION (Essential Matrix) ===');
      log('Running optimization with all points free to satisfy geometric constraints...');

      // Temporarily clear lockedXyz on locked points so they become free variables
      // Store original values to restore later
      const savedLockedXyz = new Map<WorldPoint, [number | null, number | null, number | null]>();
      for (const wp of lockedPointsForCheck) {
        log(`  ${wp.name} before unlock: lockedXyz=${JSON.stringify(wp.lockedXyz)}, inferredXyz=${JSON.stringify(wp.inferredXyz)}`);
        savedLockedXyz.set(wp, [...wp.lockedXyz] as [number | null, number | null, number | null]);
        // Clear BOTH lockedXyz AND inferredXyz to make the point truly free
        wp.lockedXyz = [null, null, null];
        (wp as any).savedInferredXyz = [...wp.inferredXyz];  // Save for later restoration
        wp.inferredXyz = [null, null, null];
        log(`  Temporarily unlocked ${wp.name} for free optimization`);
      }

      const freeSystem = new ConstraintSystem({
        tolerance,
        maxIterations: 200,  // More iterations for preliminary pass
        damping,
        verbose: false,
        optimizeCameraIntrinsics: false,  // Keep intrinsics fixed for stability
      });

      // Add all entities
      pointArray.forEach(p => freeSystem.addPoint(p));
      lineArray.forEach(l => freeSystem.addLine(l));

      const vpArray = Array.from(project.viewpoints) as Viewpoint[];
      vpArray.forEach(v => freeSystem.addCamera(v));

      for (const ip of project.imagePoints) {
        freeSystem.addImagePoint(ip as ImagePoint);
      }

      // Add geometric constraints (coplanar, etc.) but NOT locked point constraints
      // The locked point constraints are handled via post-hoc alignment
      for (const c of constraintArray) {
        freeSystem.addConstraint(c);
      }

      const freeResult = freeSystem.solve();
      log(`Preliminary optimization: converged=${freeResult.converged}, iterations=${freeResult.iterations}, residual=${freeResult.residual.toFixed(6)}`);
      if (freeResult.error) {
        log(`  Preliminary error: ${freeResult.error}`);
      }

      // Log where O ended up after free optimization
      const oPoint = lockedPointsForCheck[0];
      if (oPoint && oPoint.optimizedXyz) {
        log(`  O after free optimization: [${oPoint.optimizedXyz.map(x => x.toFixed(3)).join(', ')}]`);
      }

      // Restore lockedXyz and inferredXyz on locked points
      for (const [wp, lockedXyz] of savedLockedXyz) {
        wp.lockedXyz = lockedXyz;
        if ((wp as any).savedInferredXyz) {
          wp.inferredXyz = (wp as any).savedInferredXyz;
          delete (wp as any).savedInferredXyz;
        }
        log(`  Restored lock on ${wp.name}`);
      }
    }

    // Now apply similarity transform to align with locked points (ONLY for free-solve path)
    if (useFreeSolve && lockedPointsForCheck.length >= 1) {
      log('\n=== POST-HOC ALIGNMENT TO LOCKED POINTS ===');
      const vpArrayForAlignment = Array.from(project.viewpoints) as Viewpoint[];
      alignSceneToLockedPoints(vpArrayForAlignment, pointArray, lockedPointsForCheck);
    } else if (!usedEssentialMatrix && lockedPointsForCheck.length >= 2) {
      // Old path: PnP initialization - use the scale computation
      const lockedPoints = lockedPointsForCheck;
      const triangulatedLockedPoints = lockedPoints.filter(wp => wp.optimizedXyz !== undefined);

      if (triangulatedLockedPoints.length >= 2) {
        log(`[optimizeProject] Computing scale from ${triangulatedLockedPoints.length} locked points...`);

        let sumScale = 0;
        let count = 0;

        for (let i = 0; i < triangulatedLockedPoints.length; i++) {
          for (let j = i + 1; j < triangulatedLockedPoints.length; j++) {
            const wp1 = triangulatedLockedPoints[i];
            const wp2 = triangulatedLockedPoints[j];

            const tri1 = wp1.optimizedXyz!;
            const tri2 = wp2.optimizedXyz!;
            const lock1 = wp1.getEffectiveXyz();
            const lock2 = wp2.getEffectiveXyz();

            const triDist = Math.sqrt(
              (tri2[0] - tri1[0]) ** 2 +
              (tri2[1] - tri1[1]) ** 2 +
              (tri2[2] - tri1[2]) ** 2
            );

            const lockDist = Math.sqrt(
              (lock2[0]! - lock1[0]!) ** 2 +
              (lock2[1]! - lock1[1]!) ** 2 +
              (lock2[2]! - lock1[2]!) ** 2
            );

            if (triDist > 0.01) {
              const scale = lockDist / triDist;
              log(`  ${wp1.name} <-> ${wp2.name}: triangulated=${triDist.toFixed(3)}, locked=${lockDist.toFixed(3)}, scale=${scale.toFixed(4)}`);
              log(`    ${wp1.name}: tri=[${tri1.map(v => v.toFixed(2)).join(', ')}], lock=[${lock1.map(v => v!.toFixed(2)).join(', ')}]`);
              log(`    ${wp2.name}: tri=[${tri2.map(v => v.toFixed(2)).join(', ')}], lock=[${lock2.map(v => v!.toFixed(2)).join(', ')}]`);
              sumScale += scale;
              count++;
            }
          }
        }

        if (count > 0) {
          const scale = sumScale / count;
          log(`[optimizeProject] Computed scale factor: ${scale.toFixed(4)}`);

          for (const wp of pointArray) {
            if (wp.optimizedXyz) {
              wp.optimizedXyz = [
                wp.optimizedXyz[0] * scale,
                wp.optimizedXyz[1] * scale,
                wp.optimizedXyz[2] * scale
              ];
            }
          }

          const viewpointArray = Array.from(project.viewpoints);
          for (const vp of viewpointArray) {
            const vpConcrete = vp as Viewpoint;
            vpConcrete.position = [
              vpConcrete.position[0] * scale,
              vpConcrete.position[1] * scale,
              vpConcrete.position[2] * scale
            ];
          }

          log('[optimizeProject] Applied scale to all cameras and world points');
        }
      }
    }
  }

  if (autoInitializeCameras) {
    const viewpointArray = Array.from(project.viewpoints);
    const worldPointSet = new Set(project.worldPoints);

    const stillUninitializedCameras = viewpointArray.filter(vp => {
      return !camerasInitialized.includes(vp.name);
    });

    for (const vp of stillUninitializedCameras) {
      const vpConcrete = vp as Viewpoint;
      const hasImagePoints = vpConcrete.imagePoints.size > 0;
      const hasTriangulatedPoints = Array.from(vpConcrete.imagePoints).some(ip =>
        (ip.worldPoint as WorldPoint).optimizedXyz !== null
      );

      if (hasImagePoints && hasTriangulatedPoints) {
        log(`[optimizeProject] Initializing camera ${vpConcrete.name} with PnP (using triangulated points)...`);
        const pnpResult = initializeCameraWithPnP(vpConcrete, worldPointSet);
        if (pnpResult.success && pnpResult.reliable) {
          camerasInitialized.push(vpConcrete.name);
          camerasInitializedViaLatePnP.add(vpConcrete); // Track for potential re-run
          log(`[optimizeProject] Camera ${vpConcrete.name} initialized successfully (late PnP)`);
        } else if (pnpResult.success && !pnpResult.reliable) {
          log(`[optimizeProject] PnP result unreliable for ${vpConcrete.name}: ${pnpResult.reason}`);
          log(`[optimizeProject] Camera ${vpConcrete.name} will be excluded from optimization`);
          // Reset the camera to mark it as not initialized
          vpConcrete.position = [0, 0, 0];
          vpConcrete.rotation = [1, 0, 0, 0];
        } else {
          log(`[optimizeProject] PnP initialization failed for ${vpConcrete.name}`);
        }
      }
    }
  }

  const shouldOptimizeIntrinsics = (vp: Viewpoint) => {
    if (typeof optimizeCameraIntrinsics === 'boolean') {
      return optimizeCameraIntrinsics;
    }
    // 'auto': optimize intrinsics when no vanishing lines are available to anchor the pose/focal length
    return (vp as Viewpoint).getVanishingLineCount() === 0;
  };

  // Build set of initialized viewpoints
  const initializedViewpointSet = new Set<Viewpoint>();
  for (const vpName of camerasInitialized) {
    const vp = Array.from(project.viewpoints).find(v => v.name === vpName);
    if (vp) {
      initializedViewpointSet.add(vp as Viewpoint);
    }
  }

  // Identify multi-camera vs single-camera world points
  const worldPointArray = Array.from(project.worldPoints) as WorldPoint[];
  const multiCameraPoints = new Set<WorldPoint>();
  const singleCameraPoints = new Set<WorldPoint>();

  for (const wp of worldPointArray) {
    const visibleInCameras = Array.from(wp.imagePoints)
      .filter(ip => initializedViewpointSet.has((ip as ImagePoint).viewpoint as Viewpoint))
      .length;

    if (visibleInCameras >= 2) {
      multiCameraPoints.add(wp);
    } else if (visibleInCameras === 1) {
      singleCameraPoints.add(wp);
    }
  }

  log(`[optimizeProject] Multi-camera points: ${multiCameraPoints.size}, Single-camera points: ${singleCameraPoints.size}`);

  // TWO-STAGE OPTIMIZATION: First optimize with only multi-camera points
  // This gives us stable camera poses and triangulated positions
  if (singleCameraPoints.size > 0 && multiCameraPoints.size >= 4) {
    log('\n=== STAGE 1: Optimizing with multi-camera points only ===');

    // Stage 1: Don't optimize intrinsics - with few constraints this can lead to bad local minima
    // Keep intrinsics fixed to stabilize the optimization
    const stage1System = new ConstraintSystem({
      tolerance,
      maxIterations,
      damping,
      verbose,
      optimizeCameraIntrinsics: false,
    });

    // Add only multi-camera points
    multiCameraPoints.forEach(p => stage1System.addPoint(p));
    log(`  Added ${multiCameraPoints.size} multi-camera world points`);

    // Add lines that connect multi-camera points
    const stage1Lines: Line[] = [];
    project.lines.forEach(l => {
      if (multiCameraPoints.has(l.pointA as WorldPoint) && multiCameraPoints.has(l.pointB as WorldPoint)) {
        stage1System.addLine(l);
        stage1Lines.push(l);
      }
    });
    log(`  Added ${stage1Lines.length} lines between multi-camera points`);

    // Add all cameras
    project.viewpoints.forEach(v => stage1System.addCamera(v as Viewpoint));
    log(`  Added ${project.viewpoints.size} cameras`);

    // Add only image points for multi-camera world points
    let stage1ImagePoints = 0;
    project.imagePoints.forEach(ip => {
      const ipConcrete = ip as ImagePoint;
      if (multiCameraPoints.has(ipConcrete.worldPoint as WorldPoint)) {
        stage1System.addImagePoint(ipConcrete);
        stage1ImagePoints++;
      }
    });
    log(`  Added ${stage1ImagePoints} image points`);

    // Add constraints that only involve multi-camera points
    project.constraints.forEach(c => {
      const points = 'points' in c ? (c as any).points as WorldPoint[] : [];
      const allMultiCamera = points.length === 0 || points.every(p => multiCameraPoints.has(p));
      if (allMultiCamera) {
        stage1System.addConstraint(c);
      }
    });

    log('[Stage 1] Running optimization...');
    const stage1Result = stage1System.solve();
    log(`[Stage 1] Complete: converged=${stage1Result.converged}, iterations=${stage1Result.iterations}, residual=${stage1Result.residual.toFixed(6)}`);

    // Clear optimizedXyz on single-camera points - they have garbage values from unified initialization
    // (unified init uses random fallback for points that can't be triangulated)
    for (const wp of singleCameraPoints) {
      wp.optimizedXyz = undefined;
    }
    log(`[Stage 1] Cleared stale optimizedXyz on ${singleCameraPoints.size} single-camera points`);

    // Now initialize single-camera points using the solved geometry
    log('\n=== STAGE 2: Initializing single-camera points ===');
    const lineArray = Array.from(project.lines);
    const constraintArray = Array.from(project.constraints);

    const initResult = initializeSingleCameraPoints(
      worldPointArray,
      lineArray,
      constraintArray,
      initializedViewpointSet,
      { verbose: true }
    );

    log(`[Stage 2] Initialized ${initResult.initialized} single-camera points, ${initResult.failed} could not be initialized`);
  }

  // Now run the full optimization with all points
  log('\n=== FULL OPTIMIZATION ===');
  const system = new ConstraintSystem({
    tolerance,
    maxIterations,
    damping,
    verbose,
    optimizeCameraIntrinsics: shouldOptimizeIntrinsics,
  });

  log('[optimizeProject] Adding entities to constraint system...');

  project.worldPoints.forEach(p => system.addPoint(p as WorldPoint));
  log(`  Added ${project.worldPoints.size} world points`);

  project.lines.forEach(l => system.addLine(l));
  log(`  Added ${project.lines.size} lines`);

  // Note: We do NOT exclude cameras based on position anymore.
  // Cameras that failed PnP initialization during this run will be detected
  // after optimization via outlier detection (all image points are outliers).
  // Pre-existing cameras (loaded from file) may legitimately start at [0,0,0].
  const excludedCameras = new Set<Viewpoint>();
  const excludedCameraNames: string[] = [];
  let addedCameras = 0;
  project.viewpoints.forEach(v => {
    const vp = v as Viewpoint;
    system.addCamera(vp);
    addedCameras++;
  });
  log(`  Added ${addedCameras}/${project.viewpoints.size} cameras`);

  // Only add image points for cameras that are included in the optimization
  let addedImagePoints = 0;
  let skippedImagePoints = 0;
  project.imagePoints.forEach(ip => {
    const ipConcrete = ip as ImagePoint;
    if (!excludedCameras.has(ipConcrete.viewpoint as Viewpoint)) {
      system.addImagePoint(ipConcrete);
      addedImagePoints++;
    } else {
      skippedImagePoints++;
    }
  });
  log(`  Added ${addedImagePoints}/${project.imagePoints.size} image points (skipped ${skippedImagePoints} for excluded cameras)`);

  project.constraints.forEach(c => system.addConstraint(c));
  log(`  Added ${project.constraints.size} constraints`);

  log('[optimizeProject] Running optimization...');
  const result = system.solve();

  log('[optimizeProject] Optimization complete');
  log(`  Converged: ${result.converged}`);
  log(`  Iterations: ${result.iterations}`);
  log(`  Residual: ${result.residual.toFixed(6)}`);
  if (result.error) {
    log(`  Error: ${result.error}`);
  }

  let outliers: OutlierInfo[] | undefined;
  let medianReprojectionError: number | undefined;

  if (shouldDetectOutliers && project.imagePoints.size > 0) {
    log('\n=== OUTLIER DETECTION ===');

    // Clear all previous outlier flags before re-detecting
    for (const vp of project.viewpoints) {
      for (const ip of vp.imagePoints) {
        (ip as ImagePoint).isOutlier = false;
      }
    }

    const detection = detectOutliers(project, outlierThreshold);
    outliers = detection.outliers;
    medianReprojectionError = detection.medianError;

    log(`Median reprojection error: ${medianReprojectionError.toFixed(2)} px`);
    log(`Outlier threshold: ${detection.actualThreshold.toFixed(2)} px (adaptive based on median quality)`);

    if (outliers.length > 0) {
      log(`\nFound ${outliers.length} potential outlier image points (error > ${detection.actualThreshold.toFixed(1)} px):`);
      for (const outlier of outliers) {
        log(`  - ${outlier.worldPointName} @ ${outlier.viewpointName}: ${outlier.error.toFixed(1)} px (median: ${medianReprojectionError.toFixed(1)} px)`);
        outlier.imagePoint.isOutlier = true;
      }

      // Check for cameras where ALL image points are outliers - this indicates a failed PnP initialization
      // IMPORTANT: Only consider cameras that were initialized via "late PnP" (using triangulated points)
      // Cameras initialized via Essential Matrix or Vanishing Points should NOT be excluded
      const outliersByCamera = new Map<Viewpoint, number>();
      for (const outlier of outliers) {
        const vp = outlier.imagePoint.viewpoint as Viewpoint;
        outliersByCamera.set(vp, (outliersByCamera.get(vp) || 0) + 1);
      }

      const camerasToExclude: Viewpoint[] = [];
      for (const [vp, outlierCount] of outliersByCamera) {
        // Only check cameras that:
        // 1. Were initialized via late PnP (vulnerable to degenerate solutions)
        // 2. Are not already excluded
        // 3. Have image points
        if (camerasInitializedViaLatePnP.has(vp) && !excludedCameras.has(vp) && vp.imagePoints) {
          const totalImagePoints = Array.from(vp.imagePoints).filter(ip => !excludedCameras.has(ip.viewpoint as Viewpoint)).length;
          if (outlierCount === totalImagePoints && totalImagePoints > 0) {
            log(`\nCamera ${vp.name} has ${outlierCount}/${totalImagePoints} outlier image points (100%) - likely failed late PnP initialization`);
            camerasToExclude.push(vp);
          }
        }
      }

      if (camerasToExclude.length > 0) {
        log(`\nRe-running optimization without problematic camera(s): ${camerasToExclude.map(c => c.name).join(', ')}`);

        // Add to excluded cameras
        for (const vp of camerasToExclude) {
          excludedCameras.add(vp);
          excludedCameraNames.push(vp.name);
        }

        // CRITICAL: Reset world points - they were corrupted by the failed camera
        // We need to re-triangulate using only the good cameras
        log('\n=== RESETTING WORLD POINTS FOR RE-INITIALIZATION ===');
        for (const wp of project.worldPoints) {
          const point = wp as WorldPoint;
          // Keep locked coordinates, but clear triangulated positions
          if (!point.isFullyConstrained()) {
            point.optimizedXyz = undefined;
          }
        }

        // Reset excluded cameras to [0,0,0] so they're clearly marked as uninitialized
        for (const vp of camerasToExclude) {
          vp.position = [0, 0, 0];
          vp.rotation = [1, 0, 0, 0];
        }

        // Re-triangulate world points using only good cameras
        const goodCameras = Array.from(project.viewpoints)
          .filter(v => !excludedCameras.has(v as Viewpoint)) as Viewpoint[];

        log(`Re-triangulating world points using ${goodCameras.length} camera(s): ${goodCameras.map(c => c.name).join(', ')}`);

        // Build a set of initialized viewpoints (only the good ones)
        const initializedViewpointSet = new Set<Viewpoint>(goodCameras);

        // Re-run unified initialization with only good cameras
        const pointArray = Array.from(project.worldPoints);
        const lineArray = Array.from(project.lines);
        const constraintArray = Array.from(project.constraints);

        unifiedInitialize(pointArray, lineArray, constraintArray, {
          sceneScale: 10.0,
          verbose: false,
          initializedViewpoints: initializedViewpointSet
        });

        // Re-create constraint system without the excluded cameras
        const system2 = new ConstraintSystem({
          tolerance,
          maxIterations,
          damping,
          verbose,
          optimizeCameraIntrinsics: shouldOptimizeIntrinsics,
        });

        project.worldPoints.forEach(p => system2.addPoint(p as WorldPoint));
        project.lines.forEach(l => system2.addLine(l));

        project.viewpoints.forEach(v => {
          const vp = v as Viewpoint;
          if (!excludedCameras.has(vp)) {
            system2.addCamera(vp);
          }
        });

        project.imagePoints.forEach(ip => {
          const ipConcrete = ip as ImagePoint;
          if (!excludedCameras.has(ipConcrete.viewpoint as Viewpoint)) {
            system2.addImagePoint(ipConcrete);
          }
        });

        project.constraints.forEach(c => system2.addConstraint(c));

        const result2 = system2.solve();
        log('\n=== RE-RUN OPTIMIZATION COMPLETE ===');
        log(`  Converged: ${result2.converged}`);
        log(`  Iterations: ${result2.iterations}`);
        log(`  Residual: ${result2.residual.toFixed(6)}`);

        // Update the result to use the new optimization result
        result.converged = result2.converged;
        result.iterations = result2.iterations;
        result.residual = result2.residual;
        result.error = result2.error;

        // Re-run outlier detection with the updated solution
        const detection2 = detectOutliers(project, outlierThreshold);
        outliers = detection2.outliers;
        medianReprojectionError = detection2.medianError;

        if (outliers.length > 0) {
          for (const outlier of outliers) {
            outlier.imagePoint.isOutlier = true;
          }
        }
      }

      log('\nThese points may have incorrect manual clicks.');
      log('Consider reviewing or removing them.');
    } else {
      log('No outliers detected - all reprojection errors are within acceptable range.');
    }
  }

  return {
    ...result,
    camerasInitialized: camerasInitialized.length > 0 ? camerasInitialized : undefined,
    camerasExcluded: excludedCameraNames.length > 0 ? excludedCameraNames : undefined,
    outliers,
    medianReprojectionError,
  };
}
