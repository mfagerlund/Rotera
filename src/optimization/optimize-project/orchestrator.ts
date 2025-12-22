/**
 * Main optimization orchestrator.
 * Coordinates camera initialization, world point initialization, and bundle adjustment.
 */

import { Project } from '../../entities/project';
import { ConstraintSystem } from '../constraint-system';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';
import { ImagePoint } from '../../entities/imagePoint';
import { Line } from '../../entities/line';
import { initializeWorldPoints as unifiedInitialize } from '../unified-initialization/index';
import { canInitializeWithVanishingPoints } from '../vanishing-points';
import { alignSceneToLineDirections, alignSceneToLockedPoints, AlignmentQualityCallback, AlignmentResult } from '../coordinate-alignment/index';
import type { IOptimizableCamera } from '../IOptimizable';
import { log, clearOptimizationLogs } from '../optimization-logger';
import { initializeCameras, initializeCamerasIteratively } from '../camera-initialization';
import { checkAxisSigns, checkHandedness, applyAxisFlips } from '../coordinate-transforms';
import { detectOutliers } from '../outlier-detection';
import type { OutlierInfo } from '../outlier-detection';
import {
  resetOptimizationState,
  resetCamerasForInitialization,
  applyBranchToInferredXyz,
} from '../state-reset';
import { validateProjectConstraints } from '../validation';
import { retryWithOppositeAlignment, RetryContext } from '../alignment-retry';
import {
  applyScaleFromAxisLines,
  translateToAnchorPoint,
  fixCamerasAtLockedPoints,
  offsetCamerasFromOrigin,
  applyScaleFromLockedPointPairs,
} from '../initialization-phases';
import type { OptimizeProjectOptions, OptimizeProjectResult } from './types';
import { tryMultipleAttempts, applyCameraPerturbation, setAttemptSeed } from './multi-attempt';
import { testInferenceBranches } from './branch-testing';
import {
  applyScaleAndTranslateForTest,
  runFreeSolve,
  runLatePnPInitialization,
  runStage1Optimization,
  handleOutliersAndRerun,
} from './helpers';

// Version for tracking code updates
const OPTIMIZER_VERSION = '2.6.0-branch-first';

/**
 * Main optimization entry point for the project.
 * Orchestrates camera initialization, world point initialization, and bundle adjustment.
 *
 * If yieldToUI callback is provided, the function runs async with UI updates between phases.
 * Otherwise it runs synchronously for maximum performance.
 */
export async function optimizeProject(
  project: Project,
  options: OptimizeProjectOptions = {}
): Promise<OptimizeProjectResult> {
  const { yieldToUI } = options;
  // GUARD: Ensure we have an actual Project instance, not a plain object
  if (typeof project.propagateInferences !== 'function') {
    throw new Error(
      'optimizeProject received a plain object instead of a Project instance. ' +
      'DO NOT use spread operator on Project or create fake project objects. ' +
      'Pass the actual Project instance from the store.'
    );
  }

  // Log version FIRST and ONLY at top-level (not during recursive branch/attempt calls)
  if (!options._skipBranching && options._attempt === undefined) {
    clearOptimizationLogs();
    log(`[Optimize] v${OPTIMIZER_VERSION}`);
    log(`[Optimize] WP:${project.worldPoints.size} L:${project.lines.size} VP:${project.viewpoints.size} IP:${project.imagePoints.size} C:${project.constraints.size}`);
  }

  // MULTI-ATTEMPT SOLVING: Try different random seeds when solve fails
  const multiAttemptResult = await tryMultipleAttempts(project, options, optimizeProject);
  if (multiAttemptResult) {
    return multiAttemptResult;
  }

  // Set random seed for this attempt
  setAttemptSeed(options._seed, options._attempt ?? 0);

  // BRANCH-FIRST OPTIMIZATION: Test all inference branches
  const branchTestResult = await testInferenceBranches(project, options, optimizeProject);
  if (branchTestResult) {
    return branchTestResult;
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

  resetOptimizationState(project);

  // Apply branch coordinates if provided
  if (options._branch) {
    applyBranchToInferredXyz(project, options._branch);
  }

  const startTime = performance.now();

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
  await yieldToUI?.('Phase 1: Camera Initialization');
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

      // Apply camera perturbation on retry attempts
      applyCameraPerturbation(project, options._perturbCameras, usedEssentialMatrix);
    }
  }

  const wpArrayForCheck = Array.from(project.worldPoints) as WorldPoint[];
  const lockedPointsForCheck = wpArrayForCheck.filter(wp => wp.isFullyConstrained());
  let hasSingleAxisConstraint = false;

  // PHASE 2: World Point Initialization
  await yieldToUI?.('Phase 2: World Point Initialization');
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

      // Apply scale from axis lines (both Essential Matrix and VP paths can have targetLength lines)
      const linesWithTargetLength = axisConstrainedLines.filter(l => l.targetLength !== undefined);
      log(`[Scale] axisConstrainedLines=${axisConstrainedLines.length}, linesWithTargetLength=${linesWithTargetLength.length}, usedEssentialMatrix=${usedEssentialMatrix}`);
      if (linesWithTargetLength.length > 0) {
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
  await yieldToUI?.('Phase 3: Late PnP Initialization');
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
  await yieldToUI?.('Phase 4: Stage1 Multi-camera Optimization');
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

  // PHASE 5: Full Optimization (LM Solver)
  await yieldToUI?.('Phase 5: Running Levenberg-Marquardt solver...');
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
  await yieldToUI?.('Phase 6: Checking alignment...');
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
  await yieldToUI?.('Phase 7: Detecting outliers...');
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
  await yieldToUI?.('Phase 8: Finalizing...');
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
