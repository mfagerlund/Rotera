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
import { initializeSingleCameraPoints } from '../single-camera-initialization';
import type { IOptimizableCamera } from '../IOptimizable';
import { log, logProgress } from '../optimization-logger';
import type { OutlierInfo } from '../outlier-detection';
import { worldPointSavedInferredXyz } from '../state-reset';
import { hasPointsField } from '../validation';
import { canInitializeWithVanishingPoints } from '../vanishing-points';
import { applyScaleFromAxisLines, translateToAnchorPoint } from '../initialization-phases';

/**
 * Snapshot of solver state that can be restored if optimization diverges.
 */
export interface SolverStateSnapshot {
  worldPoints: Map<WorldPoint, [number, number, number] | undefined>;
  cameras: Map<Viewpoint, {
    position: [number, number, number];
    rotation: [number, number, number, number];
    focalLength: number;
  }>;
  residual: number;
}

/**
 * Take a snapshot of current solver state (world point positions and camera poses).
 */
export function snapshotSolverState(
  worldPoints: WorldPoint[],
  viewpoints: Viewpoint[],
  residual: number
): SolverStateSnapshot {
  const snapshot: SolverStateSnapshot = {
    worldPoints: new Map(),
    cameras: new Map(),
    residual,
  };

  for (const wp of worldPoints) {
    snapshot.worldPoints.set(wp, wp.optimizedXyz ? [...wp.optimizedXyz] as [number, number, number] : undefined);
  }

  for (const vp of viewpoints) {
    snapshot.cameras.set(vp, {
      position: [...vp.position] as [number, number, number],
      rotation: [...vp.rotation] as [number, number, number, number],
      focalLength: vp.focalLength,
    });
  }

  return snapshot;
}

/**
 * Restore solver state from a snapshot.
 */
export function restoreSolverState(snapshot: SolverStateSnapshot): void {
  for (const [wp, pos] of snapshot.worldPoints) {
    wp.optimizedXyz = pos ? [...pos] as [number, number, number] : undefined;
  }

  for (const [vp, state] of snapshot.cameras) {
    vp.position = [...state.position] as [number, number, number];
    vp.rotation = [...state.rotation] as [number, number, number, number];
    vp.focalLength = state.focalLength;
  }
}

/**
 * Get all WorldPoints referenced by a constraint.
 * Handles both `points` array (coplanar, collinear) and individual point properties (distance, angle).
 */
function getConstraintPoints(constraint: Constraint): WorldPoint[] {
  // Check for points array (coplanar, collinear)
  if (hasPointsField(constraint)) {
    return constraint.points;
  }
  // Check for individual point properties (distance: pointA/pointB, angle: pointA/vertex/pointC)
  const points: WorldPoint[] = [];
  const c = constraint as unknown as Record<string, unknown>;
  if (c.pointA && typeof c.pointA === 'object') points.push(c.pointA as WorldPoint);
  if (c.pointB && typeof c.pointB === 'object') points.push(c.pointB as WorldPoint);
  if (c.pointC && typeof c.pointC === 'object') points.push(c.pointC as WorldPoint);
  if (c.vertex && typeof c.vertex === 'object') points.push(c.vertex as WorldPoint);
  return points;
}

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
  // Only add enabled viewpoints
  const vpArray = (Array.from(project.viewpoints) as Viewpoint[]).filter(vp => vp.enabledInSolve);
  vpArray.forEach(v => freeSystem.addCamera(v));
  for (const ip of project.imagePoints) {
    const ipConcrete = ip as ImagePoint;
    if (ipConcrete.viewpoint.enabledInSolve) {
      freeSystem.addImagePoint(ipConcrete);
    }
  }
  for (const c of constraintArray) {
    freeSystem.addConstraint(c);
  }

  const freeResult = freeSystem.solve();
  logProgress('FreeSolve', freeResult.residual, `conv=${freeResult.converged} iter=${freeResult.iterations}`);

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
  // Only consider enabled viewpoints for late PnP
  const viewpointArray = Array.from(project.viewpoints).filter(vp => vp.enabledInSolve);
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
    // Force dense mode for preliminary optimization - needs reliability for triangulation
    const prelimSystem = new ConstraintSystem({
      tolerance,
      maxIterations: 500,
      damping,
      verbose: false,
      optimizeCameraIntrinsics: false,
    });

    const worldPointArray = Array.from(project.worldPoints) as WorldPoint[];
    const initializedCameraSet = new Set(camerasInitialized);
    const uninitializedCameraSet = new Set(camerasNeedingLatePnP.map(vp => vp.name));
    const prelimPoints = new Set<WorldPoint>();

    // For prelim, only include points that are visible in BOTH:
    // 1. At least one initialized camera (for triangulation)
    // 2. At least one uninitialized camera (will be used for late PnP)
    // This prevents unshared points from pulling shared points into wrong positions.
    for (const wp of worldPointArray) {
      const visibleInInitialized = Array.from(wp.imagePoints).some(ip =>
        initializedCameraSet.has((ip as ImagePoint).viewpoint.name)
      );
      const visibleInUninitialized = Array.from(wp.imagePoints).some(ip =>
        uninitializedCameraSet.has((ip as ImagePoint).viewpoint.name)
      );
      if (visibleInInitialized && visibleInUninitialized) {
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
      if (ipConcrete.viewpoint.enabledInSolve &&
          prelimPoints.has(ipConcrete.worldPoint as WorldPoint) &&
          initializedCameraSet.has(ipConcrete.viewpoint.name)) {
        prelimSystem.addImagePoint(ipConcrete);
      }
    }

    // Only add constraints whose points are all in prelimPoints
    for (const c of project.constraints) {
      const constraintPoints = getConstraintPoints(c as Constraint);
      const allPointsInPrelim = constraintPoints.length === 0 || constraintPoints.every(p => prelimPoints.has(p));
      if (allPointsInPrelim) {
        prelimSystem.addConstraint(c);
      }
    }

    const prelimResult = prelimSystem.solve();
    logProgress('Prelim', prelimResult.residual, `conv=${prelimResult.converged} iter=${prelimResult.iterations}`);
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
        initializedCameraSet.add(vpConcrete.name);  // Update set for subsequent PnP calls
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
): number {
  // Force dense mode for stage1 - needs reliability for multi-camera point optimization
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
    const vpConcrete = vp as Viewpoint;
    if (vpConcrete.enabledInSolve && initializedViewpointSet.has(vpConcrete)) {
      stage1System.addCamera(vpConcrete);
    }
  }

  let stage1ImagePoints = 0;
  project.imagePoints.forEach(ip => {
    const ipConcrete = ip as ImagePoint;
    if (ipConcrete.viewpoint.enabledInSolve &&
        multiCameraPoints.has(ipConcrete.worldPoint as WorldPoint) &&
        initializedViewpointSet.has(ipConcrete.viewpoint as Viewpoint)) {
      stage1System.addImagePoint(ipConcrete);
      stage1ImagePoints++;
    }
  });

  project.constraints.forEach(c => {
    const constraintPoints = getConstraintPoints(c as Constraint);
    if (constraintPoints.length === 0 || constraintPoints.every(p => multiCameraPoints.has(p))) {
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
  logProgress('Stage1', stage1Result.residual, `WP:${multiCameraPoints.size} L:${stage1Lines} IP:${stage1ImagePoints} conv=${stage1Result.converged} iter=${stage1Result.iterations}`);

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

  return stage1Result.residual;
}

export function handleOutliersAndRerun(
  project: Project,
  outliers: OutlierInfo[],
  rmsError: number,
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
): { result: SolverResult; outliers: OutlierInfo[]; rmsError: number; medianError: number } | null {
  // Mark outliers and show compact summary
  for (const outlier of outliers) {
    outlier.imagePoint.isOutlier = true;
  }

  // Show as range with worst 3
  const sorted = [...outliers].sort((a, b) => b.error - a.error);
  const worst3 = sorted.slice(0, 3).map(o => `${o.worldPointName}@${o.viewpointName.substring(0, 8)}:${o.error.toFixed(0)}px`).join(', ');
  const minErr = sorted[sorted.length - 1]?.error.toFixed(0) ?? '0';
  const maxErr = sorted[0]?.error.toFixed(0) ?? '0';
  log(`[Outliers] ${outliers.length} found (${minErr}-${maxErr}px, rms=${rmsError.toFixed(1)}px): ${worst3}${outliers.length > 3 ? '...' : ''}`);

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

  // CRITICAL: Do NOT automatically disable viewpoints when they fail!
  // That's cheating - it hides failure by removing the problematic data.
  // Instead, return a failure result so the solver can try a different approach.
  //
  // If late PnP failed, the solve failed. Period.
  log(`[ERROR] Late PnP cameras failed: ${camerasToExclude.map(c => c.name).join(', ')}`);
  log(`[ERROR] Solve cannot succeed - returning failure instead of cheating by disabling cameras`);

  // Return failure immediately - do not rerun with cameras excluded
  return {
    result: {
      converged: false,
      iterations: 0,
      residual: Infinity,
      error: `Late PnP failed for cameras: ${camerasToExclude.map(c => c.name).join(', ')}`,
    },
    outliers,
    rmsError,
    medianError: rmsError,
  };
}
