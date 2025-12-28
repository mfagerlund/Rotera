/**
 * Helper functions for optimize-project.
 * Contains scale/translate, free solve, late PnP, stage1 optimization, and outlier handling.
 */

import { Project } from '../../entities/project';
import { ConstraintSystem, SolverResult } from '../constraint-system';
import { Viewpoint } from '../../entities/viewpoint';
import { WorldPoint } from '../../entities/world-point';
import { ImagePoint } from '../../entities/imagePoint';
import { Line } from '../../entities/line';
import { Constraint } from '../../entities/constraints';
import { initializeCameraWithPnP } from '../pnp';
import { initializeWorldPoints as unifiedInitialize } from '../unified-initialization/index';
import { initializeSingleCameraPoints } from '../single-camera-initialization';
import type { IOptimizableCamera } from '../IOptimizable';
import { log } from '../optimization-logger';
import { detectOutliers, OutlierInfo } from '../outlier-detection';
import { fineTuneProject } from '../fine-tune';
import { worldPointSavedInferredXyz } from '../state-reset';
import { validateProjectConstraints, hasPointsField } from '../validation';
import { canInitializeWithVanishingPoints } from '../vanishing-points';
import { applyScaleFromAxisLines, translateToAnchorPoint } from '../initialization-phases';

/**
 * Apply scale and translation for test solves (e.g., alignment quality callback).
 * Delegates to canonical functions in initialization-phases.ts.
 */
export function applyScaleAndTranslateForTest(
  axisConstrainedLines: Line[],
  pointArray: WorldPoint[],
  viewpointArray: Viewpoint[],
  lockedPoints: WorldPoint[]
): void {
  applyScaleFromAxisLines(axisConstrainedLines, pointArray, viewpointArray);
  translateToAnchorPoint(lockedPoints, pointArray, viewpointArray);
}

export function runFreeSolve(
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

export function runLatePnPInitialization(
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
    const canUseVP = canInitializeWithVanishingPoints(vpConcrete, worldPointSet);
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

  // Build set of initialized camera names for triangulation check
  const initializedCameraSet = new Set(camerasInitialized);

  for (const vp of stillUninitializedCameras) {
    const vpConcrete = vp as Viewpoint;
    const hasImagePoints = vpConcrete.imagePoints.size > 0;
    const hasTriangulatedPoints = Array.from(vpConcrete.imagePoints).some(ip =>
      (ip.worldPoint as WorldPoint).optimizedXyz !== undefined && (ip.worldPoint as WorldPoint).optimizedXyz !== null
    );

    if (hasImagePoints && hasTriangulatedPoints) {
      // Pass initialized camera names so PnP only uses truly triangulated points
      // (visible in 2+ initialized cameras), not single-camera points with optimizedXyz
      const pnpResult = initializeCameraWithPnP(vpConcrete, worldPointSet, {
        useTriangulatedPoints: true,
        initializedCameraNames: initializedCameraSet,
      });
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

export function runStage1Optimization(
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

/**
 * Run camera refinement when base solve has high reprojection error.
 * Uses the fine-tune function to allow camera pose adjustment with unlocked cameras.
 * This is the same mechanism that achieves near-zero error in manual fine-tune.
 * Returns improved result if refinement helped, null otherwise.
 */
export function runCameraRefinement(
  project: Project,
  initialResult: SolverResult,
  initialMedianError: number,
  initialOutliers: OutlierInfo[] | undefined,
  camerasInitializedViaVP: Set<Viewpoint>,
  tolerance: number,
  maxIterations: number
): { result: SolverResult; medianError: number; outliers: OutlierInfo[] | undefined } | null {
  // Only refine if we have VP cameras and high error
  if (camerasInitializedViaVP.size === 0 || initialMedianError < 3.0) {
    return null;
  }

  log(`[Refine] Median error ${initialMedianError.toFixed(2)}px is high - running fine-tune with unlocked cameras`);

  // Save original poses for all cameras and world points
  const savedCameraPoses = new Map<Viewpoint, { position: [number, number, number]; rotation: [number, number, number, number]; locked: boolean }>();
  const savedWorldPoints = new Map<WorldPoint, [number, number, number] | undefined>();

  for (const vp of project.viewpoints) {
    const viewpoint = vp as Viewpoint;
    savedCameraPoses.set(viewpoint, {
      position: [...viewpoint.position] as [number, number, number],
      rotation: [...viewpoint.rotation] as [number, number, number, number],
      locked: viewpoint.isPoseLocked,
    });
  }

  for (const wp of project.worldPoints) {
    const point = wp as WorldPoint;
    savedWorldPoints.set(point, point.optimizedXyz ? [...point.optimizedXyz] as [number, number, number] : undefined);
  }

  try {
    // Use the actual fine-tune function with cameras unlocked
    const fineTuneResult = fineTuneProject(project, {
      tolerance: tolerance,
      maxIterations: Math.min(maxIterations, 1000),
      damping: 0.01,
      lockCameraPoses: false, // Allow camera to move
      verbose: false,
    });

    // Check if error improved
    const { medianError: refinedMedianError, outliers: refinedOutliers } = detectOutliers(project, 3.0);

    if (refinedMedianError < initialMedianError * 0.5) {
      // Significant improvement (>50% reduction) - keep the refined state
      log(`[Refine] Success: ${initialMedianError.toFixed(2)}px → ${refinedMedianError.toFixed(2)}px (${((1 - refinedMedianError / initialMedianError) * 100).toFixed(0)}% reduction)`);

      return {
        result: {
          converged: fineTuneResult.converged,
          iterations: fineTuneResult.iterations,
          residual: fineTuneResult.residual,
          error: fineTuneResult.error ?? null,
        },
        medianError: refinedMedianError,
        outliers: refinedOutliers.length > 0 ? refinedOutliers : undefined,
      };
    } else {
      // No significant improvement - restore original state
      log(`[Refine] No improvement: ${initialMedianError.toFixed(2)}px → ${refinedMedianError.toFixed(2)}px - reverting`);

      for (const [viewpoint, saved] of savedCameraPoses) {
        viewpoint.position = saved.position;
        viewpoint.rotation = saved.rotation;
        viewpoint.isPoseLocked = saved.locked;
      }

      for (const [point, xyz] of savedWorldPoints) {
        point.optimizedXyz = xyz;
      }

      return null;
    }
  } catch (error) {
    // On error, restore original state
    log(`[Refine] Error: ${error instanceof Error ? error.message : 'unknown'}`);
    for (const [viewpoint, saved] of savedCameraPoses) {
      viewpoint.position = saved.position;
      viewpoint.rotation = saved.rotation;
      viewpoint.isPoseLocked = saved.locked;
    }
    for (const [point, xyz] of savedWorldPoints) {
      point.optimizedXyz = xyz;
    }
    return null;
  }
}

export function handleOutliersAndRerun(
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

  // Check if all cameras are now excluded - if so, the solve is meaningless
  const remainingCameras = Array.from(project.viewpoints).filter(v => !excludedCameras.has(v as Viewpoint));
  if (remainingCameras.length === 0) {
    log(`[ERROR] All cameras excluded - cannot compute meaningful solution`);
    // Return a failure result with high residual to prevent false success
    return {
      result: {
        converged: false,
        iterations: 0,
        residual: Infinity,
        error: 'All cameras excluded - late PnP failed for all cameras',
      },
      outliers,
      medianError,
    };
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
