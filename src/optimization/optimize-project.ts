/**
 * Main optimization entry point for the project.
 * Orchestrates camera initialization, world point initialization, and bundle adjustment.
 */

import { Project } from '../entities/project';
import { ConstraintSystem, SolverResult, SolverOptions } from './constraint-system';
import { initializeCameraWithPnP } from './pnp';
import { Viewpoint } from '../entities/viewpoint';
import { WorldPoint } from '../entities/world-point';
import { ImagePoint } from '../entities/imagePoint';
import { Line } from '../entities/line';
import { Constraint } from '../entities/constraints';
import { initializeWorldPoints as unifiedInitialize } from './unified-initialization';
import { initializeSingleCameraPoints } from './single-camera-initialization';
import { canInitializeWithVanishingPoints } from './vanishing-points';
import { alignSceneToLineDirections, alignSceneToLockedPoints, AlignmentQualityCallback, AlignmentResult } from './coordinate-alignment';
import type { IOptimizableCamera } from './IOptimizable';
import { log, clearOptimizationLogs, optimizationLogs } from './optimization-logger';
import { initializeCameras, initializeCamerasIteratively } from './camera-initialization';
import { generateAllInferenceBranches, type InferenceBranch } from './inference-branching';

// Import from new extracted modules
import { checkAxisSigns, checkHandedness, applyAxisFlips } from './coordinate-transforms';
import { detectOutliers, OutlierInfo } from './outlier-detection';
import {
  resetOptimizationState,
  resetCamerasForInitialization,
  applyBranchToInferredXyz,
  viewpointInitialVps,
  worldPointSavedInferredXyz,
} from './state-reset';
import { validateProjectConstraints, hasPointsField } from './validation';
import { retryWithOppositeAlignment, RetryContext } from './alignment-retry';
import {
  applyScaleFromAxisLines,
  translateToAnchorPoint,
  fixCamerasAtLockedPoints,
  offsetCamerasFromOrigin,
  applyScaleFromLockedPointPairs,
} from './initialization-phases';
import { setSeed, random } from './seeded-random';

// Re-export for backwards compatibility
export { log, clearOptimizationLogs, optimizationLogs } from './optimization-logger';
export type { OutlierInfo } from './outlier-detection';
export { viewpointInitialVps } from './state-reset';
export { resetOptimizationState } from './state-reset';

// Version for tracking code updates
const OPTIMIZER_VERSION = '2.6.0-branch-first';

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
  /**
   * If true (default), cameras initialized via vanishing points will have their
   * pose (position and rotation) locked during the final solve. VP initialization
   * provides accurate calibration that shouldn't be disturbed by less-constrained cameras.
   */
  lockVPCameras?: boolean;
  /**
   * If true (default), apply XY-plane reflection after solving if the result
   * is left-handed, to ensure right-handed coordinate system for Blender compatibility.
   * Set to false to preserve the original coordinate sign convention.
   */
  forceRightHanded?: boolean;
  /**
   * If true, use iterative multi-strategy initialization instead of the standard orchestrator.
   * This allows cameras to be initialized in multiple rounds with intermediate solves,
   * improving robustness for complex multi-camera scenes. Default: false (opt-in).
   */
  useIterativeInit?: boolean;
  /**
   * Maximum number of solve attempts with different random seeds.
   * If a solve fails (median error > 2px), retry with a new seed.
   * Default: 3. Set to 1 to disable multi-attempt solving.
   */
  maxAttempts?: number;
  /** @internal Skip branch testing (used during recursive branch attempts) */
  _skipBranching?: boolean;
  /** @internal The branch to apply (used during recursive branch attempts) */
  _branch?: InferenceBranch;
  /** @internal Current attempt number (used during recursive multi-attempt) */
  _attempt?: number;
  /** @internal Seed for this attempt (used during recursive multi-attempt) */
  _seed?: number;
  /** @internal Perturbation scale for camera positions (used on retry attempts) */
  _perturbCameras?: number;
}

export interface OptimizeProjectResult extends SolverResult {
  camerasInitialized?: string[];
  camerasExcluded?: string[];
  outliers?: OutlierInfo[];
  medianReprojectionError?: number;
  solveTimeMs?: number;
}

export function optimizeProject(
  project: Project,
  options: OptimizeProjectOptions = {}
): OptimizeProjectResult {
  // GUARD: Ensure we have an actual Project instance, not a plain object
  if (typeof project.propagateInferences !== 'function') {
    throw new Error(
      'optimizeProject received a plain object instead of a Project instance. ' +
      'DO NOT use spread operator on Project or create fake project objects. ' +
      'Pass the actual Project instance from the store.'
    );
  }

  // Extract multi-attempt options
  const { maxAttempts = 3, _attempt = 0, _seed } = options;

  // MULTI-ATTEMPT SOLVING: Try different random seeds when solve fails
  // This helps with configurations that are sensitive to initial random state
  // (e.g., single axis-aligned line with Essential Matrix initialization)
  if (_attempt === 0 && maxAttempts > 1) {
    const GOOD_ENOUGH_THRESHOLD = 2.0;
    let bestResult: OptimizeProjectResult | null = null;
    let bestMedianError = Infinity;
    let bestSeed = 42;

    // Try different seeds
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Use deterministic seeds: 42, 12345, 98765 (easily reproducible)
      const seed = attempt === 1 ? 42 : attempt === 2 ? 12345 : 98765 + attempt;

      // On retry attempts, add camera perturbation to escape local minima
      // This helps with degenerate Essential Matrix solutions where cameras collapse
      const perturbScale = attempt > 1 ? 0.5 * attempt : undefined;

      const attemptResult = optimizeProject(project, {
        ...options,
        maxAttempts: 1, // Disable recursion
        _attempt: attempt,
        _seed: seed,
        _perturbCameras: perturbScale,
      });

      const medianError = attemptResult.medianReprojectionError ?? Infinity;

      // Log attempt result
      if (maxAttempts > 1) {
        log(`[Attempt] #${attempt}/${maxAttempts}: seed=${seed}, median=${medianError.toFixed(1)}px`);
      }

      // If good enough, return immediately
      if (medianError < GOOD_ENOUGH_THRESHOLD) {
        log(`[Attempt] Selected #${attempt} (good enough: ${medianError.toFixed(1)}px < ${GOOD_ENOUGH_THRESHOLD}px)`);
        return attemptResult;
      }

      // Track best result
      if (medianError < bestMedianError) {
        bestMedianError = medianError;
        bestResult = attemptResult;
        bestSeed = seed;
      }
    }

    // Return best result if none were good enough
    if (bestResult) {
      log(`[Attempt] Selected best: seed=${bestSeed}, median=${bestMedianError.toFixed(1)}px`);
      return bestResult;
    }
  }

  // Set the random seed for this solve (deterministic results)
  if (_seed !== undefined) {
    setSeed(_seed);
  } else if (_attempt === 0) {
    // First solve with default seed for reproducibility
    setSeed(42);
  }

  // BRANCH-FIRST OPTIMIZATION: When axis-aligned lines have target lengths,
  // there's sign ambiguity (e.g., +10 or -10). Generate all valid branches
  // and try each from scratch, picking the best result.
  const { _skipBranching = false, _branch } = options;

  if (!_skipBranching) {
    const branches = generateAllInferenceBranches(project);

    if (branches.length > 1) {
      log(`[Branch] Found ${branches.length} inference branches - testing each from scratch`);

      // Save deterministic inferredXyz values BEFORE branching overwrites them
      project.propagateInferences();
      const savedDeterministicInferred = new Map<WorldPoint, [number | null, number | null, number | null]>();
      for (const wp of project.worldPoints) {
        const point = wp as WorldPoint;
        savedDeterministicInferred.set(point, [...point.inferredXyz] as [number | null, number | null, number | null]);
      }

      let bestResult: OptimizeProjectResult | null = null;
      let bestMedianError = Infinity;
      const GOOD_ENOUGH_THRESHOLD = 2.0;

      for (let i = 0; i < branches.length; i++) {
        const branch = branches[i];
        const choiceStr = branch.choices.length > 0 ? branch.choices.join(', ') : 'default';

        // Run full optimization with this branch
        const branchResult = optimizeProject(project, {
          ...options,
          _skipBranching: true,
          _branch: branch,
          verbose: false,
        });

        const medianError = branchResult.medianReprojectionError ?? Infinity;
        log(`[Branch] #${i + 1}: median=${medianError.toFixed(1)}px, choices=[${choiceStr}]`);

        if (medianError < GOOD_ENOUGH_THRESHOLD) {
          log(`[Branch] Selected #${i + 1} (good enough: ${medianError.toFixed(1)}px < ${GOOD_ENOUGH_THRESHOLD}px)`);
          for (const [point, inferred] of savedDeterministicInferred) {
            point.inferredXyz = inferred;
          }
          return branchResult;
        }

        if (medianError < bestMedianError) {
          bestMedianError = medianError;
          bestResult = branchResult;
        }
      }

      if (bestResult) {
        log(`[Branch] Selected best: median=${bestMedianError.toFixed(1)}px`);
        for (const [point, inferred] of savedDeterministicInferred) {
          point.inferredXyz = inferred;
        }
        return bestResult;
      }
    }
  }

  const {
    autoInitializeCameras = true,
    autoInitializeWorldPoints = true,
    detectOutliers: shouldDetectOutliers = true,
    outlierThreshold = 3.0,
    tolerance = 1e-6,
    maxIterations = 10000,
    damping = 0.1,
    verbose = false,
    optimizeCameraIntrinsics = 'auto',
    lockVPCameras = false,
    forceRightHanded = true,
    useIterativeInit,
  } = options;

  // Only clear logs at top level, not during recursive branch testing
  if (!_skipBranching) {
    clearOptimizationLogs();
  }
  resetOptimizationState(project);

  // Apply branch coordinates if provided
  if (_branch) {
    applyBranchToInferredXyz(project, _branch);
  }

  const startTime = performance.now();

  log(`[Optimize] v${OPTIMIZER_VERSION}`);
  log(`[Optimize] WP:${project.worldPoints.size} L:${project.lines.size} VP:${project.viewpoints.size} IP:${project.imagePoints.size} C:${project.constraints.size}`);

  const camerasInitialized: string[] = [];
  const camerasInitializedViaLatePnP = new Set<Viewpoint>();
  const camerasInitializedViaVP = new Set<Viewpoint>();
  let usedEssentialMatrix = false;
  let alignmentWasAmbiguous = false;
  let alignmentSignUsed: 'positive' | 'negative' | undefined;
  let appliedScaleFactor = 1.0;
  let steppedVPInitReverted = false;
  let vpEmHybridApplied = false;

  // PHASE 1: Camera Initialization
  if (autoInitializeCameras || autoInitializeWorldPoints) {
    const viewpointArray = Array.from(project.viewpoints);

    if (autoInitializeCameras) {
      resetCamerasForInitialization(project);
    }

    const uninitializedCameras = viewpointArray.filter(vp => {
      const v = vp as Viewpoint;
      return v.position[0] === 0 && v.position[1] === 0 && v.position[2] === 0;
    });

    if (uninitializedCameras.length >= 1 && autoInitializeCameras) {
      const worldPointArray = Array.from(project.worldPoints) as WorldPoint[];
      const lockedPoints = worldPointArray.filter(wp => wp.isFullyConstrained());
      const worldPointSet = new Set<WorldPoint>(worldPointArray);

      const validation = validateProjectConstraints(project);
      if (!validation.valid) {
        throw new Error(validation.error!);
      }

      const canAnyUninitCameraUseVPStrict = uninitializedCameras.some(vp =>
        canInitializeWithVanishingPoints(vp as Viewpoint, worldPointSet, { allowSinglePoint: false })
      );
      const canAnyUninitCameraUseVPRelaxed = uninitializedCameras.some(vp =>
        canInitializeWithVanishingPoints(vp as Viewpoint, worldPointSet, { allowSinglePoint: true })
      );

      const shouldUseIterative = useIterativeInit === true;

      let initResult: ReturnType<typeof initializeCameras>;

      if (shouldUseIterative) {
        log(`[Init] Using iterative multi-strategy initialization`);
        initResult = initializeCamerasIteratively(
          {
            uninitializedCameras: uninitializedCameras as Viewpoint[],
            worldPoints: worldPointSet,
            lockedPoints,
            canAnyUseVPStrict: canAnyUninitCameraUseVPStrict,
            canAnyUseVPRelaxed: canAnyUninitCameraUseVPRelaxed,
          },
          project
        );
      } else {
        log(`[Init] Using standard initialization orchestrator`);
        initResult = initializeCameras({
          uninitializedCameras: uninitializedCameras as Viewpoint[],
          worldPoints: worldPointSet,
          lockedPoints,
          canAnyUseVPStrict: canAnyUninitCameraUseVPStrict,
          canAnyUseVPRelaxed: canAnyUninitCameraUseVPRelaxed,
        });
      }

      camerasInitialized.push(...initResult.camerasInitialized);
      for (const vp of initResult.camerasInitializedViaVP) {
        camerasInitializedViaVP.add(vp);
      }
      usedEssentialMatrix = initResult.diagnostics.usedEssentialMatrix;
      steppedVPInitReverted = initResult.diagnostics.steppedVPInitReverted;
      vpEmHybridApplied = initResult.diagnostics.vpEmHybridApplied;

      // Apply camera perturbation on retry attempts to escape degenerate local minima
      // This helps when Essential Matrix produces cameras at nearly the same position
      if (options._perturbCameras && usedEssentialMatrix) {
        const perturbScale = options._perturbCameras;
        const viewpointArray = Array.from(project.viewpoints) as Viewpoint[];

        for (const vp of viewpointArray) {
          // Add random perturbation to camera position (seeded for reproducibility)
          vp.position = [
            vp.position[0] + (random() - 0.5) * perturbScale,
            vp.position[1] + (random() - 0.5) * perturbScale,
            vp.position[2] + (random() - 0.5) * perturbScale,
          ];
        }
        log(`[Perturb] Applied camera position perturbation (scale=${perturbScale.toFixed(2)})`);
      }
    }
  }

  const wpArrayForCheck = Array.from(project.worldPoints) as WorldPoint[];
  const lockedPointsForCheck = wpArrayForCheck.filter(wp => wp.isFullyConstrained());
  let hasSingleAxisConstraint = false;

  // PHASE 2: World Point Initialization
  if (autoInitializeWorldPoints) {
    const pointArray = Array.from(project.worldPoints) as WorldPoint[];
    const lineArray = Array.from(project.lines) as Line[];
    const constraintArray = Array.from(project.constraints);
    const viewpointArray = Array.from(project.viewpoints) as Viewpoint[];

    const initializedViewpointSet = new Set<Viewpoint>();
    for (const vpName of camerasInitialized) {
      const vp = Array.from(project.viewpoints).find(v => v.name === vpName);
      if (vp) {
        initializedViewpointSet.add(vp as Viewpoint);
      }
    }

    const axisConstrainedLines = lineArray.filter(l => l.direction && ['x', 'y', 'z'].includes(l.direction));
    const uniqueAxisDirections = new Set(axisConstrainedLines.map(l => l.direction));
    const hasSingleAxisOnly = uniqueAxisDirections.size === 1;

    // Handle camera-at-origin conflict
    if (usedEssentialMatrix && (hasSingleAxisOnly || steppedVPInitReverted)) {
      offsetCamerasFromOrigin(viewpointArray, lockedPointsForCheck, axisConstrainedLines);
    }

    const useFreeSolve = usedEssentialMatrix && axisConstrainedLines.length === 0;
    if (useFreeSolve) {
      log('[FreeSolve] No axis constraints - using free solve then align');
    }

    unifiedInitialize(pointArray, lineArray, constraintArray, {
      sceneScale: 10.0,
      verbose: false,
      initializedViewpoints: initializedViewpointSet,
      vpInitializedViewpoints: camerasInitializedViaVP,
      skipLockedPoints: useFreeSolve,
    });

    if (axisConstrainedLines.length > 0) {
      // Create quality callback for degenerate Essential Matrix cases
      const qualityCallback: AlignmentQualityCallback | undefined = usedEssentialMatrix
        ? (maxIter: number) => {
            // Apply scale and translation before testing
            applyScaleAndTranslateForTest(axisConstrainedLines, pointArray, viewpointArray, lockedPointsForCheck);

            const testSystem = new ConstraintSystem({
              maxIterations: maxIter,
              tolerance: 1e-4,
              verbose: false,
            });
            pointArray.forEach(p => testSystem.addPoint(p));
            lineArray.forEach(l => testSystem.addLine(l));
            viewpointArray.forEach(v => testSystem.addCamera(v));
            for (const ip of project.imagePoints) {
              testSystem.addImagePoint(ip as ImagePoint);
            }
            for (const c of constraintArray) {
              testSystem.addConstraint(c);
            }
            const testResult = testSystem.solve();
            return testResult.residual ?? Infinity;
          }
        : undefined;

      // Align scene to line directions
      let alignmentResult: AlignmentResult;
      if (vpEmHybridApplied) {
        log(`[Align] Skipping - VP+EM hybrid already aligned world frame`);
        alignmentResult = { success: true, ambiguous: false };
      } else {
        alignmentResult = alignSceneToLineDirections(viewpointArray, pointArray, lineArray, usedEssentialMatrix, qualityCallback);
      }

      alignmentWasAmbiguous = alignmentResult.ambiguous;
      alignmentSignUsed = 'positive';

      // Apply scale from axis lines
      log(`[Scale] axisConstrainedLines=${axisConstrainedLines.length}, linesWithTargetLength=${axisConstrainedLines.filter(l => l.targetLength !== undefined).length}, usedEssentialMatrix=${usedEssentialMatrix}`);
      if (usedEssentialMatrix) {
        appliedScaleFactor = applyScaleFromAxisLines(lineArray, pointArray, viewpointArray);
      }

      // Translate to anchor point
      if (usedEssentialMatrix && lockedPointsForCheck.length >= 1) {
        translateToAnchorPoint(lockedPointsForCheck, pointArray, viewpointArray);
      }

      if (usedEssentialMatrix && uniqueAxisDirections.size < 2) {
        log('[WARN] Single axis constraint - one rotational DoF unresolved');
        hasSingleAxisConstraint = true;
      }

      // Fix cameras at locked points
      fixCamerasAtLockedPoints(viewpointArray, lockedPointsForCheck, appliedScaleFactor);

    } else if (usedEssentialMatrix && lockedPointsForCheck.length < 2) {
      log('[WARN] No axis constraints + <2 locked points - orientation arbitrary');
    }

    // Free solve path
    if (useFreeSolve && constraintArray.length > 0) {
      runFreeSolve(project, pointArray, lineArray, constraintArray, lockedPointsForCheck, tolerance, damping);
    }

    // Apply similarity transform for free-solve path or scale for PnP path
    if (useFreeSolve && lockedPointsForCheck.length >= 1) {
      const vpArrayForAlignment = Array.from(project.viewpoints) as Viewpoint[];
      alignSceneToLockedPoints(vpArrayForAlignment, pointArray, lockedPointsForCheck);
    } else if (!usedEssentialMatrix && lockedPointsForCheck.length >= 2) {
      applyScaleFromLockedPointPairs(lockedPointsForCheck, pointArray, viewpointArray);
    }
  }

  // PHASE 3: Late PnP Initialization
  if (autoInitializeCameras) {
    runLatePnPInitialization(
      project,
      camerasInitialized,
      camerasInitializedViaLatePnP,
      camerasInitializedViaVP,
      tolerance,
      damping
    );
  }

  // Build intrinsics optimization function
  const shouldOptimizeIntrinsics = (vp: IOptimizableCamera) => {
    if (typeof optimizeCameraIntrinsics === 'boolean') {
      return optimizeCameraIntrinsics;
    }
    if (vp.vanishingLines.size > 0) {
      return false;
    }
    if (hasSingleAxisConstraint) {
      return false;
    }
    return true;
  };

  // Build initialized viewpoint set
  const initializedViewpointSet = new Set<Viewpoint>();
  for (const vpName of camerasInitialized) {
    const vp = Array.from(project.viewpoints).find(v => v.name === vpName);
    if (vp) {
      initializedViewpointSet.add(vp as Viewpoint);
    }
  }

  // PHASE 4: Stage1 Multi-camera Optimization
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

  const needsStage1 = (singleCameraPoints.size > 0 || usedEssentialMatrix) && multiCameraPoints.size >= 4;
  if (needsStage1) {
    runStage1Optimization(
      project,
      multiCameraPoints,
      singleCameraPoints,
      initializedViewpointSet,
      worldPointArray,
      tolerance,
      maxIterations,
      damping,
      verbose
    );
  }

  // PHASE 5: Full Optimization
  const excludedCameras = new Set<Viewpoint>();
  const excludedCameraNames: string[] = [];

  if (lockVPCameras && camerasInitializedViaVP.size > 0) {
    for (const vp of camerasInitializedViaVP) {
      vp.isPoseLocked = true;
    }
    log(`[Lock] ${camerasInitializedViaVP.size} VP camera(s) pose-locked for final solve`);
  }

  const system = new ConstraintSystem({
    tolerance,
    maxIterations,
    damping,
    verbose,
    optimizeCameraIntrinsics: shouldOptimizeIntrinsics,
    regularizationWeight: hasSingleAxisConstraint ? 0.1 : 0,
  });

  project.worldPoints.forEach(p => system.addPoint(p as WorldPoint));
  project.lines.forEach(l => system.addLine(l));
  project.viewpoints.forEach(v => system.addCamera(v as Viewpoint));
  project.imagePoints.forEach(ip => {
    if (!excludedCameras.has((ip as ImagePoint).viewpoint as Viewpoint)) {
      system.addImagePoint(ip as ImagePoint);
    }
  });
  project.constraints.forEach(c => system.addConstraint(c));

  let result: OptimizeProjectResult = system.solve();

  // PHASE 6: Retry with opposite alignment if needed
  const retryCtx: RetryContext = {
    project,
    alignmentWasAmbiguous,
    usedEssentialMatrix,
    alignmentSignUsed,
    hasSingleAxisConstraint,
    excludedCameras,
    tolerance,
    maxIterations,
    damping,
    verbose,
    shouldOptimizeIntrinsics,
  };

  const retryResult = retryWithOppositeAlignment(result, retryCtx);
  result = retryResult.result;

  // PHASE 7: Outlier Detection
  let outliers: OutlierInfo[] | undefined;
  let medianReprojectionError: number | undefined;

  if (shouldDetectOutliers && project.imagePoints.size > 0) {
    for (const vp of project.viewpoints) {
      for (const ip of vp.imagePoints) {
        (ip as ImagePoint).isOutlier = false;
      }
    }

    const detection = detectOutliers(project, outlierThreshold);
    outliers = detection.outliers;
    medianReprojectionError = detection.medianError;
  }

  // Log solve result
  const vpArray = Array.from(project.viewpoints) as Viewpoint[];
  const camInfo = vpArray.map(v => `${v.name}:f=${v.focalLength.toFixed(0)}`).join(' ');
  log(`[Solve] conv=${result.converged}, iter=${result.iterations}, median=${medianReprojectionError?.toFixed(2) ?? '?'}px | ${camInfo}${result.error ? ` | err=${result.error}` : ''}`);

  // Handle outliers and potential re-run
  if (outliers && outliers.length > 0) {
    const rerunResult = handleOutliersAndRerun(
      project,
      outliers,
      medianReprojectionError!,
      camerasInitializedViaLatePnP,
      camerasInitializedViaVP,
      excludedCameras,
      excludedCameraNames,
      tolerance,
      maxIterations,
      damping,
      verbose,
      shouldOptimizeIntrinsics,
      outlierThreshold
    );

    if (rerunResult) {
      result = rerunResult.result;
      outliers = rerunResult.outliers;
      medianReprojectionError = rerunResult.medianError;
    }
  }

  // PHASE 8: Post-solve Handedness Check
  if (forceRightHanded) {
    const wpArray = Array.from(project.worldPoints) as WorldPoint[];
    const vpArray = Array.from(project.viewpoints) as Viewpoint[];

    const { flipX, flipY, flipZ } = checkAxisSigns(wpArray);

    if (flipX || flipY || flipZ) {
      log(`[Handedness] Axis sign corrections needed: flipX=${flipX}, flipY=${flipY}, flipZ=${flipZ}`);
      applyAxisFlips(wpArray, vpArray, flipX, flipY, flipZ);

      const afterFlips = checkAxisSigns(wpArray);
      log(`[Handedness] After flips: flipX=${afterFlips.flipX}, flipY=${afterFlips.flipY}, flipZ=${afterFlips.flipZ}`);
    } else {
      const handedness = checkHandedness(wpArray);
      if (handedness && !handedness.isRightHanded) {
        log('[Handedness] Result is LEFT-HANDED (no locked coords to determine axis), applying Z-flip');
        applyAxisFlips(wpArray, vpArray, false, false, true);
      } else if (handedness) {
        log('[Handedness] Result is already RIGHT-HANDED');
      } else {
        log('[Handedness] Cannot determine handedness (no axis points found)');
      }
    }
  }

  // Final summary
  const solveTimeMs = performance.now() - startTime;
  const quality = result.residual < 1 ? 'Excellent' : result.residual < 5 ? 'Good' : 'Poor';
  const qualityStars = result.residual < 1 ? '***' : result.residual < 5 ? '**' : '*';
  log(`[Summary] ${qualityStars} ${quality} | error=${result.residual.toFixed(3)} | median=${medianReprojectionError?.toFixed(2) ?? '?'}px | iter=${result.iterations} | conv=${result.converged} | ${solveTimeMs.toFixed(0)}ms`);

  return {
    ...result,
    camerasInitialized: camerasInitialized.length > 0 ? camerasInitialized : undefined,
    camerasExcluded: excludedCameraNames.length > 0 ? excludedCameraNames : undefined,
    outliers,
    medianReprojectionError,
    solveTimeMs,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function applyScaleAndTranslateForTest(
  axisConstrainedLines: Line[],
  pointArray: WorldPoint[],
  viewpointArray: Viewpoint[],
  lockedPoints: WorldPoint[]
): void {
  const linesWithTargetLength = axisConstrainedLines.filter(l => l.targetLength !== undefined);
  if (linesWithTargetLength.length > 0) {
    let sumScale = 0;
    let count = 0;
    for (const line of linesWithTargetLength) {
      const posA = line.pointA.optimizedXyz;
      const posB = line.pointB.optimizedXyz;
      if (posA && posB && line.targetLength) {
        const currentLength = Math.sqrt(
          (posB[0] - posA[0]) ** 2 + (posB[1] - posA[1]) ** 2 + (posB[2] - posA[2]) ** 2
        );
        if (currentLength > 0.01) {
          sumScale += line.targetLength / currentLength;
          count++;
        }
      }
    }
    if (count > 0) {
      const scale = sumScale / count;
      for (const wp of pointArray) {
        if (wp.optimizedXyz) {
          wp.optimizedXyz = [wp.optimizedXyz[0] * scale, wp.optimizedXyz[1] * scale, wp.optimizedXyz[2] * scale];
        }
      }
      for (const vp of viewpointArray) {
        vp.position = [vp.position[0] * scale, vp.position[1] * scale, vp.position[2] * scale];
      }
    }
  }

  const anchorPoint = lockedPoints.find(wp => wp.optimizedXyz !== undefined);
  if (anchorPoint && anchorPoint.optimizedXyz) {
    const target = anchorPoint.getEffectiveXyz();
    const current = anchorPoint.optimizedXyz;
    const translation = [
      target[0]! - current[0],
      target[1]! - current[1],
      target[2]! - current[2],
    ];
    for (const wp of pointArray) {
      if (wp.optimizedXyz) {
        wp.optimizedXyz = [
          wp.optimizedXyz[0] + translation[0],
          wp.optimizedXyz[1] + translation[1],
          wp.optimizedXyz[2] + translation[2],
        ];
      }
    }
    for (const vp of viewpointArray) {
      vp.position = [
        vp.position[0] + translation[0],
        vp.position[1] + translation[1],
        vp.position[2] + translation[2],
      ];
    }
  }
}

function runFreeSolve(
  project: Project,
  pointArray: WorldPoint[],
  lineArray: Line[],
  constraintArray: Constraint[],
  lockedPoints: WorldPoint[],
  tolerance: number,
  damping: number
): void {
  const savedLockedXyz = new Map<WorldPoint, [number | null, number | null, number | null]>();
  for (const wp of lockedPoints) {
    savedLockedXyz.set(wp, [...wp.lockedXyz] as [number | null, number | null, number | null]);
    wp.lockedXyz = [null, null, null];
    worldPointSavedInferredXyz.set(wp, [...wp.inferredXyz] as [number | null, number | null, number | null]);
    wp.inferredXyz = [null, null, null];
  }

  const freeSystem = new ConstraintSystem({
    tolerance,
    maxIterations: 200,
    damping,
    verbose: false,
    optimizeCameraIntrinsics: false,
  });

  pointArray.forEach(p => freeSystem.addPoint(p));
  lineArray.forEach(l => freeSystem.addLine(l));
  const vpArray = Array.from(project.viewpoints) as Viewpoint[];
  vpArray.forEach(v => freeSystem.addCamera(v));
  for (const ip of project.imagePoints) {
    freeSystem.addImagePoint(ip as ImagePoint);
  }
  for (const c of constraintArray) {
    freeSystem.addConstraint(c);
  }

  const freeResult = freeSystem.solve();
  log(`[FreeSolve] Prelim: conv=${freeResult.converged}, iter=${freeResult.iterations}, res=${freeResult.residual.toFixed(3)}`);

  for (const [wp, lockedXyz] of savedLockedXyz) {
    wp.lockedXyz = lockedXyz;
    const savedInferred = worldPointSavedInferredXyz.get(wp);
    if (savedInferred) {
      wp.inferredXyz = savedInferred;
      worldPointSavedInferredXyz.delete(wp);
    }
  }
}

function runLatePnPInitialization(
  project: Project,
  camerasInitialized: string[],
  camerasInitializedViaLatePnP: Set<Viewpoint>,
  camerasInitializedViaVP: Set<Viewpoint>,
  tolerance: number,
  damping: number
): void {
  const viewpointArray = Array.from(project.viewpoints);
  const worldPointSet = new Set(project.worldPoints);

  const stillUninitializedCameras = viewpointArray.filter(vp => {
    return !camerasInitialized.includes(vp.name);
  });

  const camerasNeedingLatePnP = stillUninitializedCameras.filter(vp => {
    const vpConcrete = vp as Viewpoint;
    const hasImagePoints = vpConcrete.imagePoints.size > 0;
    const vpConstrainedPoints = Array.from(vpConcrete.imagePoints).filter(ip =>
      (ip.worldPoint as WorldPoint).isFullyConstrained()
    );
    const canUseVP = vpConcrete.canInitializeWithVanishingPoints(worldPointSet);
    return hasImagePoints && vpConstrainedPoints.length < 3 && !canUseVP;
  });

  let latePnPCamerasCanSelfConstrain = false;
  if (camerasNeedingLatePnP.length >= 2) {
    const worldPointsSeenByLatePnP = new Map<WorldPoint, number>();
    for (const vp of camerasNeedingLatePnP) {
      const vpConcrete = vp as Viewpoint;
      for (const ip of vpConcrete.imagePoints) {
        const wp = ip.worldPoint as WorldPoint;
        const count = worldPointsSeenByLatePnP.get(wp) ?? 0;
        worldPointsSeenByLatePnP.set(wp, count + 1);
      }
    }
    const sharedPoints = Array.from(worldPointsSeenByLatePnP.values()).filter(count => count >= 2).length;
    if (sharedPoints >= 5) {
      latePnPCamerasCanSelfConstrain = true;
      log(`[Prelim] Skip: ${camerasNeedingLatePnP.length} late-PnP cameras share ${sharedPoints} points`);
    }
  }

  if (camerasInitialized.length > 0 && camerasNeedingLatePnP.length > 0 && !latePnPCamerasCanSelfConstrain) {
    log(`[Prelim] ${camerasInitialized.length} init camera(s), ${camerasNeedingLatePnP.length} need late PnP`);
    const prelimSystem = new ConstraintSystem({
      tolerance,
      maxIterations: 500,
      damping,
      verbose: false,
      optimizeCameraIntrinsics: false,
    });

    const worldPointArray = Array.from(project.worldPoints) as WorldPoint[];
    const initializedCameraSet = new Set(camerasInitialized);
    const prelimPoints = new Set<WorldPoint>();
    const minVisibility = camerasInitialized.length === 1 ? 1 : 2;
    for (const wp of worldPointArray) {
      const visibleInCount = Array.from(wp.imagePoints).filter(ip =>
        initializedCameraSet.has((ip as ImagePoint).viewpoint.name)
      ).length;
      if (visibleInCount >= minVisibility) {
        prelimSystem.addPoint(wp);
        prelimPoints.add(wp);
      }
    }

    for (const line of project.lines) {
      if (prelimPoints.has(line.pointA as WorldPoint) && prelimPoints.has(line.pointB as WorldPoint)) {
        prelimSystem.addLine(line);
      }
    }

    for (const vp of viewpointArray) {
      if (initializedCameraSet.has(vp.name)) {
        prelimSystem.addCamera(vp as Viewpoint);
      }
    }

    for (const ip of project.imagePoints) {
      const ipConcrete = ip as ImagePoint;
      if (prelimPoints.has(ipConcrete.worldPoint as WorldPoint) &&
          initializedCameraSet.has(ipConcrete.viewpoint.name)) {
        prelimSystem.addImagePoint(ipConcrete);
      }
    }

    for (const c of project.constraints) {
      prelimSystem.addConstraint(c);
    }

    const prelimResult = prelimSystem.solve();
    log(`[Prelim] Single-cam solve: conv=${prelimResult.converged}, iter=${prelimResult.iterations}, res=${prelimResult.residual.toFixed(3)}`);
  }

  for (const vp of stillUninitializedCameras) {
    const vpConcrete = vp as Viewpoint;
    const hasImagePoints = vpConcrete.imagePoints.size > 0;
    const hasTriangulatedPoints = Array.from(vpConcrete.imagePoints).some(ip =>
      (ip.worldPoint as WorldPoint).optimizedXyz !== undefined && (ip.worldPoint as WorldPoint).optimizedXyz !== null
    );

    if (hasImagePoints && hasTriangulatedPoints) {
      const pnpResult = initializeCameraWithPnP(vpConcrete, worldPointSet, { useTriangulatedPoints: true });
      if (pnpResult.success && pnpResult.reliable) {
        camerasInitialized.push(vpConcrete.name);
        camerasInitializedViaLatePnP.add(vpConcrete);
        log(`[Init] ${vpConcrete.name} via late PnP`);
      } else if (pnpResult.success && !pnpResult.reliable) {
        log(`[Init] ${vpConcrete.name} late PnP unreliable: ${pnpResult.reason}`);
        vpConcrete.position = [0, 0, 0];
        vpConcrete.rotation = [1, 0, 0, 0];
      }
    }
  }
}

function runStage1Optimization(
  project: Project,
  multiCameraPoints: Set<WorldPoint>,
  singleCameraPoints: Set<WorldPoint>,
  initializedViewpointSet: Set<Viewpoint>,
  worldPointArray: WorldPoint[],
  tolerance: number,
  maxIterations: number,
  damping: number,
  verbose: boolean
): void {
  const stage1System = new ConstraintSystem({
    tolerance,
    maxIterations,
    damping,
    verbose,
    optimizeCameraIntrinsics: false,
    regularizationWeight: 0.5,
  });

  multiCameraPoints.forEach(p => stage1System.addPoint(p));
  let stage1Lines = 0;
  project.lines.forEach(l => {
    if (multiCameraPoints.has(l.pointA as WorldPoint) && multiCameraPoints.has(l.pointB as WorldPoint)) {
      stage1System.addLine(l);
      stage1Lines++;
    }
  });

  for (const vp of project.viewpoints) {
    if (initializedViewpointSet.has(vp as Viewpoint)) {
      stage1System.addCamera(vp as Viewpoint);
    }
  }

  let stage1ImagePoints = 0;
  project.imagePoints.forEach(ip => {
    const ipConcrete = ip as ImagePoint;
    if (multiCameraPoints.has(ipConcrete.worldPoint as WorldPoint) &&
        initializedViewpointSet.has(ipConcrete.viewpoint as Viewpoint)) {
      stage1System.addImagePoint(ipConcrete);
      stage1ImagePoints++;
    }
  });

  project.constraints.forEach(c => {
    const points = hasPointsField(c) ? c.points : [];
    if (points.length === 0 || points.every(p => multiCameraPoints.has(p))) {
      stage1System.addConstraint(c);
    }
  });

  if (verbose) {
    log(`[Stage1] WP positions BEFORE:`);
    for (const wp of multiCameraPoints) {
      const pos = wp.optimizedXyz;
      if (pos) {
        const dist = Math.sqrt(pos[0]**2 + pos[1]**2 + pos[2]**2);
        log(`  ${wp.name}: dist=${dist.toFixed(1)}, pos=[${pos.map(x => x.toFixed(1)).join(', ')}]`);
      }
    }
  }

  const stage1Result = stage1System.solve();
  log(`[Stage1] Multi-cam only: WP:${multiCameraPoints.size} L:${stage1Lines} IP:${stage1ImagePoints} -> conv=${stage1Result.converged}, iter=${stage1Result.iterations}, res=${stage1Result.residual.toFixed(3)}`);

  if (verbose) {
    log(`[Stage1] WP positions AFTER:`);
    for (const wp of multiCameraPoints) {
      const pos = wp.optimizedXyz;
      if (pos) {
        const dist = Math.sqrt(pos[0]**2 + pos[1]**2 + pos[2]**2);
        if (dist > 100) {
          log(`  ${wp.name}: dist=${dist.toFixed(1)} [DIVERGED!]`);
        }
      }
    }
  }

  if (singleCameraPoints.size > 0) {
    for (const wp of singleCameraPoints) {
      wp.optimizedXyz = undefined;
    }

    const initResult = initializeSingleCameraPoints(
      worldPointArray,
      Array.from(project.lines),
      Array.from(project.constraints),
      initializedViewpointSet,
      { verbose: false }
    );
    log(`[Stage2] Single-cam init: ${initResult.initialized} ok, ${initResult.failed} failed`);
  }
}

function handleOutliersAndRerun(
  project: Project,
  outliers: OutlierInfo[],
  medianError: number,
  camerasInitializedViaLatePnP: Set<Viewpoint>,
  camerasInitializedViaVP: Set<Viewpoint>,
  excludedCameras: Set<Viewpoint>,
  excludedCameraNames: string[],
  tolerance: number,
  maxIterations: number,
  damping: number,
  verbose: boolean,
  shouldOptimizeIntrinsics: (vp: IOptimizableCamera) => boolean,
  outlierThreshold: number
): { result: SolverResult; outliers: OutlierInfo[]; medianError: number } | null {
  log(`[Outliers] ${outliers.length} found (threshold=${Math.round(medianError * 3)}px):`);
  for (const outlier of outliers) {
    log(`  ${outlier.worldPointName}@${outlier.viewpointName}: ${outlier.error.toFixed(1)}px`);
    outlier.imagePoint.isOutlier = true;
  }

  const outliersByCamera = new Map<Viewpoint, number>();
  for (const outlier of outliers) {
    const vp = outlier.imagePoint.viewpoint as Viewpoint;
    outliersByCamera.set(vp, (outliersByCamera.get(vp) || 0) + 1);
  }

  const camerasToExclude: Viewpoint[] = [];
  for (const [vp, outlierCount] of outliersByCamera) {
    if (camerasInitializedViaLatePnP.has(vp) && !excludedCameras.has(vp) && vp.imagePoints) {
      const totalImagePoints = Array.from(vp.imagePoints).filter(ip => !excludedCameras.has(ip.viewpoint as Viewpoint)).length;
      if (outlierCount === totalImagePoints && totalImagePoints > 0) {
        log(`[WARN] ${vp.name}: 100% outliers - failed late PnP`);
        camerasToExclude.push(vp);
      }
    }
  }

  if (camerasToExclude.length === 0) {
    return null;
  }

  log(`[Rerun] Excluding: ${camerasToExclude.map(c => c.name).join(', ')}`);

  for (const vp of camerasToExclude) {
    excludedCameras.add(vp);
    excludedCameraNames.push(vp.name);
  }

  for (const wp of project.worldPoints) {
    if (!(wp as WorldPoint).isFullyConstrained()) {
      (wp as WorldPoint).optimizedXyz = undefined;
    }
  }
  for (const vp of camerasToExclude) {
    vp.position = [0, 0, 0];
    vp.rotation = [1, 0, 0, 0];
  }

  const goodCameras = Array.from(project.viewpoints).filter(v => !excludedCameras.has(v as Viewpoint)) as Viewpoint[];
  const goodVPCameras = Array.from(camerasInitializedViaVP).filter(vp => !excludedCameras.has(vp));
  unifiedInitialize(
    Array.from(project.worldPoints),
    Array.from(project.lines),
    Array.from(project.constraints),
    {
      sceneScale: 10.0,
      verbose: false,
      initializedViewpoints: new Set<Viewpoint>(goodCameras),
      vpInitializedViewpoints: new Set<Viewpoint>(goodVPCameras),
    }
  );

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
    if (!excludedCameras.has(v as Viewpoint)) {
      system2.addCamera(v as Viewpoint);
    }
  });
  project.imagePoints.forEach(ip => {
    if (!excludedCameras.has((ip as ImagePoint).viewpoint as Viewpoint)) {
      system2.addImagePoint(ip as ImagePoint);
    }
  });
  project.constraints.forEach(c => system2.addConstraint(c));

  const result2 = system2.solve();
  log(`[Rerun] conv=${result2.converged}, iter=${result2.iterations}, res=${result2.residual.toFixed(3)}`);

  const detection2 = detectOutliers(project, outlierThreshold);
  for (const outlier of detection2.outliers) {
    outlier.imagePoint.isOutlier = true;
  }

  return {
    result: result2,
    outliers: detection2.outliers,
    medianError: detection2.medianError,
  };
}
