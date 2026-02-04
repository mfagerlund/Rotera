/**
 * Main optimization orchestrator.
 * Coordinates camera initialization, world point initialization, and bundle adjustment.
 */

import { Project } from '../../entities/project';
import { ConstraintSystem, SolverResult } from '../constraint-system';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';
import { ImagePoint } from '../../entities/imagePoint';
import { Line } from '../../entities/line';
import { initializeWorldPoints as unifiedInitialize } from '../unified-initialization/index';
import { canInitializeWithVanishingPoints } from '../vanishing-points';
import { alignSceneToLineDirections, alignSceneToLockedPoints, AlignmentQualityCallback, AlignmentResult } from '../coordinate-alignment/index';
import type { IOptimizableCamera } from '../IOptimizable';
import { log, logProgress, clearOptimizationLogs, setVerbosity, getBestResidualSoFar } from '../optimization-logger';
import { initializeCameras } from '../camera-initialization';
import { checkAxisSigns, checkHandedness, applyAxisFlips } from '../coordinate-transforms';
import { detectOutliers } from '../outlier-detection';
import type { OutlierInfo } from '../outlier-detection';
import {
  resetOptimizationState,
  resetCamerasForInitialization,
  applyBranchToInferredXyz,
} from '../state-reset';
import { validateProjectConstraints } from '../validation';
import {
  applyScaleFromAxisLines,
  translateToAnchorPoint,
  fixCamerasAtLockedPoints,
  offsetCamerasFromOrigin,
  applyScaleFromLockedPointPairs,
} from '../initialization-phases';
import type { OptimizeProjectOptions, OptimizeProjectResult } from './types';
import { getSolveQuality } from './types';
import { applyCameraPerturbation, setAttemptSeed } from './multi-attempt';
import { testAllCandidates } from './candidate-testing';
import {
  applyScaleAndTranslateForTest,
  runFreeSolve,
  runLatePnPInitialization,
  runStage1Optimization,
  handleOutliersAndRerun,
  snapshotSolverState,
  restoreSolverState,
  SolverStateSnapshot,
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

  // TOP-LEVEL ENTRY POINT: Reset ALL stale state from previous solves
  // This is the SINGLE place where state is reset. Tests and UI both go through here.
  // Recursive calls (probes, re-runs) skip this because they manage their own state.
  const isTopLevel = !options._skipCandidateTesting && !options._skipBranching && options._attempt === undefined;

  if (isTopLevel) {
    clearOptimizationLogs();
    setVerbosity(options.verbose ? 'verbose' : 'normal');
    log(`[Optimize] v${OPTIMIZER_VERSION}`);
    log(`[Optimize] WP:${project.worldPoints.size} L:${project.lines.size} VP:${project.viewpoints.size} IP:${project.imagePoints.size} C:${project.constraints.size}`);
    // Log options for debugging test/UI discrepancies
    log(`[Optimize] Options: maxIter=${options.maxIterations ?? 500} maxAttempts=${options.maxAttempts ?? 3} autoInitCam=${options.autoInitializeCameras ?? true} autoInitWP=${options.autoInitializeWorldPoints ?? true}`);

    // CRITICAL: Reset ALL camera state that could be stale from previous solves
    // This ensures both test (fresh from JSON) and UI (reused project) start identically
    for (const vp of project.viewpoints) {
      const viewpoint = vp as Viewpoint;
      viewpoint.isZReflected = false;  // Set by handedness correction at END of solve
    }
  }

  // UNIFIED CANDIDATE TESTING: Replaces multi-attempt, branch-testing, and alignment-retry
  // Tests all combinations (seed × branch × alignment) with lightweight probes, then runs full solve on winner
  const candidateResult = await testAllCandidates(project, options, optimizeProject);
  if (candidateResult) {
    return candidateResult;
  }

  // Set random seed for this solve
  setAttemptSeed(options._seed, options._attempt ?? 0);

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
  } = options;

  resetOptimizationState(project);

  // Apply branch coordinates if provided
  if (options._branch) {
    applyBranchToInferredXyz(project, options._branch);
  }

  const startTime = performance.now();

  // Create arrays once from project collections - reuse throughout
  const worldPointArray = Array.from(project.worldPoints) as WorldPoint[];
  const lineArray = Array.from(project.lines) as Line[];
  // Filter to only include viewpoints that are enabled in solve
  const viewpointArray = (Array.from(project.viewpoints) as Viewpoint[]).filter(vp => vp.enabledInSolve);
  const constraintArray = Array.from(project.constraints);
  const worldPointSet = new Set<WorldPoint>(worldPointArray);

  // Log if any viewpoints are disabled
  const disabledCount = project.viewpoints.size - viewpointArray.length;
  if (disabledCount > 0) {
    log(`[Optimize] ${disabledCount} viewpoint(s) disabled, solving with ${viewpointArray.length} viewpoint(s)`);
  }

  const camerasInitialized: string[] = [];
  const camerasInitializedViaLatePnP = new Set<Viewpoint>();
  const camerasInitializedViaVP = new Set<Viewpoint>();
  let usedEssentialMatrix = false;
  let appliedScaleFactor = 1.0;
  let steppedVPInitReverted = false;
  let vpEmHybridApplied = false;

  // PHASE 1: Camera Initialization
  await yieldToUI?.('Phase 1: Camera Initialization');
  if (autoInitializeCameras || autoInitializeWorldPoints) {
    if (autoInitializeCameras) {
      resetCamerasForInitialization(project);
    }

    const uninitializedCameras = viewpointArray.filter(vp => {
      return vp.position[0] === 0 && vp.position[1] === 0 && vp.position[2] === 0;
    });

    if (uninitializedCameras.length >= 1 && autoInitializeCameras) {
      const lockedPoints = worldPointArray.filter(wp => wp.isFullyConstrained());

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

      const initResult = initializeCameras({
        uninitializedCameras: uninitializedCameras as Viewpoint[],
        worldPoints: worldPointSet,
        lockedPoints,
        canAnyUseVPStrict: canAnyUninitCameraUseVPStrict,
        canAnyUseVPRelaxed: canAnyUninitCameraUseVPRelaxed,
      });

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

  const lockedPointsForCheck = worldPointArray.filter(wp => wp.isFullyConstrained());
  let hasSingleAxisConstraint = false;

  // Helper to build initialized viewpoint set from camera names
  const buildInitializedViewpointSet = () => {
    const set = new Set<Viewpoint>();
    for (const vpName of camerasInitialized) {
      const vp = viewpointArray.find(v => v.name === vpName);
      if (vp) set.add(vp);
    }
    return set;
  };

  // PHASE 2: World Point Initialization
  await yieldToUI?.('Phase 2: World Point Initialization');
  if (autoInitializeWorldPoints) {
    const initializedViewpointSet = buildInitializedViewpointSet();

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

    unifiedInitialize(worldPointArray, lineArray, constraintArray, {
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
            applyScaleAndTranslateForTest(axisConstrainedLines, worldPointArray, viewpointArray, lockedPointsForCheck);

            // Force dense mode for quality testing - needs reliability
            const testSystem = new ConstraintSystem({
              maxIterations: maxIter,
              tolerance: 1e-4,
              verbose: false,
              forceSolverMode: 'dense',
            });
            worldPointArray.forEach(p => testSystem.addPoint(p));
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
        // Use forced alignment sign if provided (from candidate testing)
        const forceSign = options._alignmentSign;
        alignmentResult = alignSceneToLineDirections(viewpointArray, worldPointArray, lineArray, usedEssentialMatrix, qualityCallback, forceSign);
      }

      // Apply scale from axis lines (both Essential Matrix and VP paths can have targetLength lines)
      const linesWithTargetLength = axisConstrainedLines.filter(l => l.targetLength !== undefined);
      log(`[Scale] axisConstrainedLines=${axisConstrainedLines.length}, linesWithTargetLength=${linesWithTargetLength.length}, usedEssentialMatrix=${usedEssentialMatrix}`);
      if (linesWithTargetLength.length > 0) {
        appliedScaleFactor = applyScaleFromAxisLines(lineArray, worldPointArray, viewpointArray);
      }

      // Translate to anchor point
      if (usedEssentialMatrix && lockedPointsForCheck.length >= 1) {
        translateToAnchorPoint(lockedPointsForCheck, worldPointArray, viewpointArray);
      }

      if (usedEssentialMatrix && uniqueAxisDirections.size < 2) {
        log('[WARN] Single axis constraint - one rotational DoF unresolved');
        hasSingleAxisConstraint = true;
      }

      // Fix cameras at locked points - only for cameras that are actually initialized
      const initializedCameraSet = new Set(camerasInitialized);
      fixCamerasAtLockedPoints(viewpointArray, lockedPointsForCheck, appliedScaleFactor, initializedCameraSet);

    } else if (usedEssentialMatrix && lockedPointsForCheck.length < 2) {
      log('[WARN] No axis constraints + <2 locked points - orientation arbitrary');
    }

    // Free solve path
    if (useFreeSolve && constraintArray.length > 0) {
      runFreeSolve(project, worldPointArray, lineArray, constraintArray, lockedPointsForCheck, tolerance, damping);
    }

    // Apply similarity transform for free-solve path or scale for PnP path
    if (useFreeSolve && lockedPointsForCheck.length >= 1) {
      alignSceneToLockedPoints(viewpointArray, worldPointArray, lockedPointsForCheck);
    } else if (!usedEssentialMatrix && lockedPointsForCheck.length >= 2) {
      applyScaleFromLockedPointPairs(lockedPointsForCheck, worldPointArray, viewpointArray);
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

  // Build initialized viewpoint set (reuse helper from earlier)
  const initializedViewpointSet = buildInitializedViewpointSet();

  // PHASE 4: Stage1 Multi-camera Optimization
  await yieldToUI?.('Phase 4: Stage1 Multi-camera Optimization');
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
  let stage1Snapshot: SolverStateSnapshot | undefined;
  if (needsStage1) {
    const stage1Residual = runStage1Optimization(
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
    // Snapshot state after Stage1 in case full solve diverges
    stage1Snapshot = snapshotSolverState(worldPointArray, viewpointArray, stage1Residual);
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
    // Force dense mode when Stage1 ran successfully - analytical mode can diverge
    // when adding single-camera points to a well-converged multi-camera solution
    forceSolverMode: stage1Snapshot ? 'dense' : undefined,
  });

  project.worldPoints.forEach(p => system.addPoint(p as WorldPoint));
  project.lines.forEach(l => system.addLine(l));
  // Only add enabled viewpoints to the solver
  viewpointArray.forEach(v => system.addCamera(v));
  // Only add image points from enabled viewpoints
  project.imagePoints.forEach(ip => {
    const ipConcrete = ip as ImagePoint;
    const vp = ipConcrete.viewpoint as Viewpoint;
    if (vp.enabledInSolve && !excludedCameras.has(vp)) {
      system.addImagePoint(ipConcrete);
    }
  });
  project.constraints.forEach(c => system.addConstraint(c));

  let result: SolverResult = system.solve();

  // PHASE 7: Outlier Detection
  await yieldToUI?.('Phase 7: Detecting outliers...');
  let outliers: OutlierInfo[] | undefined;
  let rmsReprojectionError: number | undefined;
  let medianReprojectionError: number | undefined;

  if (shouldDetectOutliers && project.imagePoints.size > 0) {
    // Reset outlier flags only for enabled viewpoints
    for (const vp of viewpointArray) {
      for (const ip of vp.imagePoints) {
        (ip as ImagePoint).isOutlier = false;
      }
    }

    const detection = detectOutliers(project, outlierThreshold, viewpointArray);
    outliers = detection.outliers;
    rmsReprojectionError = detection.rmsError;
    medianReprojectionError = detection.medianError;
  }

  // Log solve result with progress tracking
  const camInfo = viewpointArray.map(v => `${v.name}:f=${v.focalLength.toFixed(0)}`).join(' ');
  logProgress('Solve', result.residual, `conv=${result.converged} iter=${result.iterations} rms=${rmsReprojectionError?.toFixed(2) ?? '?'}px | ${camInfo}${result.error ? ` | err=${result.error}` : ''}`);

  // If full solve diverged compared to Stage1, restore Stage1 state
  // This happens when single-camera points or full constraints destabilize the solve
  if (stage1Snapshot && result.residual > stage1Snapshot.residual * 10) {
    log(`[Restore] Full solve diverged (${result.residual.toFixed(1)} vs Stage1: ${stage1Snapshot.residual.toFixed(1)}) - restoring Stage1 state`);
    restoreSolverState(stage1Snapshot);
    result = {
      converged: true,
      iterations: result.iterations,
      residual: stage1Snapshot.residual,
      error: null,
    };
    // Recalculate outliers with restored state
    if (shouldDetectOutliers && project.imagePoints.size > 0) {
      const detection = detectOutliers(project, outlierThreshold, viewpointArray);
      outliers = detection.outliers;
      rmsReprojectionError = detection.rmsError;
      medianReprojectionError = detection.medianError;
    }
  }

  // Handle outliers and potential re-run
  if (outliers && outliers.length > 0) {
    const rerunResult = handleOutliersAndRerun(
      project,
      outliers,
      rmsReprojectionError!,
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
      rmsReprojectionError = rerunResult.rmsError;
      medianReprojectionError = rerunResult.medianError;
    }
  }

  // PHASE 8: Post-solve Handedness Check
  await yieldToUI?.('Phase 8: Finalizing...');
  if (forceRightHanded) {
    const { flipX, flipY, flipZ } = checkAxisSigns(worldPointArray);

    if (flipX || flipY || flipZ) {
      log(`[Handedness] Axis sign corrections needed: flipX=${flipX}, flipY=${flipY}, flipZ=${flipZ}`);
      applyAxisFlips(worldPointArray, viewpointArray, flipX, flipY, flipZ);

      const afterFlips = checkAxisSigns(worldPointArray);
      log(`[Handedness] After flips: flipX=${afterFlips.flipX}, flipY=${afterFlips.flipY}, flipZ=${afterFlips.flipZ}`);
    } else {
      const handedness = checkHandedness(worldPointArray);
      if (handedness && !handedness.isRightHanded) {
        log('[Handedness] Result is LEFT-HANDED (no locked coords to determine axis), applying Z-flip');
        applyAxisFlips(worldPointArray, viewpointArray, false, false, true);
      } else if (handedness) {
        log('[Handedness] Result is already RIGHT-HANDED');
        // Explicitly reset isZReflected since we confirmed right-handed without flips
        for (const vp of viewpointArray) {
          if (vp.isZReflected) {
            log(`[Handedness] Resetting isZReflected=false for ${vp.name} (was stale)`);
            vp.isZReflected = false;
          }
        }
      } else {
        log('[Handedness] Cannot determine handedness (no axis points found)');
        // When handedness cannot be determined, reset isZReflected to safe default
        // This prevents stale isZReflected=true from previous solves causing issues
        for (const vp of viewpointArray) {
          if (vp.isZReflected) {
            log(`[Handedness] Resetting isZReflected=false for ${vp.name} (was stale, handedness unknown)`);
            vp.isZReflected = false;
          }
        }
      }
    }
  }

  // Final summary
  const solveTimeMs = performance.now() - startTime;
  const quality = getSolveQuality(rmsReprojectionError, result.residual);
  const bestRes = getBestResidualSoFar();
  const isBest = Math.abs(result.residual - bestRes) < 0.01;
  const bestInfo = isBest ? '' : ` (best was ${bestRes.toFixed(1)})`;
  log(`[Summary] ${'*'.repeat(quality.stars)} ${quality.label} | error=${result.residual.toFixed(3)}${bestInfo} | rms=${rmsReprojectionError?.toFixed(2) ?? '?'}px | iter=${result.iterations} | conv=${result.converged} | ${solveTimeMs.toFixed(0)}ms`);

  return {
    ...result,
    camerasInitialized: camerasInitialized.length > 0 ? camerasInitialized : undefined,
    camerasExcluded: excludedCameraNames.length > 0 ? excludedCameraNames : undefined,
    outliers,
    rmsReprojectionError,
    medianReprojectionError,
    solveTimeMs,
    quality,
  };
}
