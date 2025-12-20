/**
 * Retry logic for ambiguous alignment cases.
 * When Essential Matrix alignment is ambiguous, tries the opposite sign to find the better solution.
 */

import { Project } from '../entities/project';
import { Viewpoint } from '../entities/viewpoint';
import { WorldPoint } from '../entities/world-point';
import { ImagePoint } from '../entities/imagePoint';
import { Line } from '../entities/line';
import { ConstraintSystem, SolverResult } from './constraint-system';

// Extended result type that may include medianReprojectionError
interface ExtendedSolverResult extends SolverResult {
  medianReprojectionError?: number;
}
import { initializeCamerasWithEssentialMatrix } from './essential-matrix';
import { initializeWorldPoints as unifiedInitialize } from './unified-initialization';
import { alignSceneToLineDirections } from './coordinate-alignment/index';
import { resetOptimizationState } from './state-reset';
import { log } from './optimization-logger';
import type { IOptimizableCamera } from './IOptimizable';

export interface RetryContext {
  project: Project;
  alignmentWasAmbiguous: boolean;
  usedEssentialMatrix: boolean;
  alignmentSignUsed: 'positive' | 'negative' | undefined;
  hasSingleAxisConstraint: boolean;
  excludedCameras: Set<Viewpoint>;
  tolerance: number;
  maxIterations: number;
  damping: number;
  verbose: boolean;
  shouldOptimizeIntrinsics: (vp: IOptimizableCamera) => boolean;
}

export interface RetryResult {
  result: ExtendedSolverResult;
  didRetry: boolean;
}

/**
 * Retry optimization with opposite alignment sign if the initial result is poor.
 *
 * @param initialResult The result from the first optimization attempt
 * @param ctx Context containing all necessary parameters and state
 * @returns The better result (either original or retry)
 */
export function retryWithOppositeAlignment(
  initialResult: ExtendedSolverResult,
  ctx: RetryContext
): RetryResult {
  const {
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
  } = ctx;

  // Check if retry is needed
  const AMBIGUOUS_RETRY_THRESHOLD = 20;
  const medianErrorThreshold = 3.0;
  const shouldRetry = alignmentWasAmbiguous && usedEssentialMatrix &&
    (initialResult.residual > AMBIGUOUS_RETRY_THRESHOLD ||
     (initialResult.medianReprojectionError ?? 0) > medianErrorThreshold);

  if (!shouldRetry) {
    return { result: initialResult, didRetry: false };
  }

  log(`[Retry] Ambiguous alignment with poor result (${initialResult.residual.toFixed(2)} > ${AMBIGUOUS_RETRY_THRESHOLD}), trying opposite sign`);

  // Save current result for comparison
  const firstResidual = initialResult.residual;

  // Save current state (we'll restore if retry is worse)
  const savedWorldPoints = new Map<WorldPoint, [number, number, number] | undefined>();
  const savedCameras = new Map<Viewpoint, { position: [number, number, number]; rotation: [number, number, number, number]; focalLength: number }>();

  for (const wp of project.worldPoints) {
    const wpConcrete = wp as WorldPoint;
    savedWorldPoints.set(wpConcrete, wpConcrete.optimizedXyz ? [...wpConcrete.optimizedXyz] as [number, number, number] : undefined);
  }
  for (const vp of project.viewpoints) {
    const vpConcrete = vp as Viewpoint;
    savedCameras.set(vpConcrete, {
      position: [...vpConcrete.position] as [number, number, number],
      rotation: [...vpConcrete.rotation] as [number, number, number, number],
      focalLength: vpConcrete.focalLength,
    });
  }

  // Reset state for retry
  resetOptimizationState(project);

  // Determine opposite sign
  const oppositeSign: 'positive' | 'negative' = alignmentSignUsed === 'positive' ? 'negative' : 'positive';
  log(`[Retry] Was ${alignmentSignUsed}, now trying ${oppositeSign}`);

  // Re-run camera initialization
  const viewpointArray = Array.from(project.viewpoints) as Viewpoint[];
  for (const vp of viewpointArray) {
    vp.position = [0, 0, 0];
    vp.rotation = [1, 0, 0, 0];
    vp.focalLength = Math.max(vp.imageWidth, vp.imageHeight);
    vp.principalPointX = vp.imageWidth / 2;
    vp.principalPointY = vp.imageHeight / 2;
  }

  // Clear world point optimizedXyz
  const wpArray = Array.from(project.worldPoints) as WorldPoint[];
  for (const wp of wpArray) {
    wp.optimizedXyz = undefined;
  }

  // Re-run Essential Matrix initialization (same as initial)
  const vp1 = viewpointArray[0];
  const vp2 = viewpointArray[1];
  const emResult = initializeCamerasWithEssentialMatrix(vp1, vp2, 10.0);
  if (!emResult.success) {
    log(`[Retry] Essential Matrix failed, keeping original result`);
    // Restore original state
    restoreState(savedWorldPoints, savedCameras);
    return { result: initialResult, didRetry: true };
  }

  // Re-run world point initialization
  const pointArray = Array.from(project.worldPoints) as WorldPoint[];
  const lineArray = Array.from(project.lines) as Line[];
  const constraintArray = Array.from(project.constraints);

  unifiedInitialize(pointArray, lineArray, constraintArray, {
    sceneScale: 10.0,
    verbose: false,
    initializedViewpoints: new Set<Viewpoint>([vp1, vp2]),
    skipLockedPoints: false,
  });

  // Re-run alignment with FORCED opposite sign
  const axisConstrainedLines = lineArray.filter(l => l.direction && ['x', 'y', 'z'].includes(l.direction));
  alignSceneToLineDirections(viewpointArray, pointArray, lineArray, true, undefined, oppositeSign);

  // Apply scale from line target lengths
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

  // Translate to anchor point
  const lockedPointsForRetry = wpArray.filter(wp => wp.isFullyConstrained());
  const anchorPoint = lockedPointsForRetry.find(wp => wp.optimizedXyz !== undefined);
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

  // Check for degenerate case: camera at same position as a LOCKED point
  for (const vp of viewpointArray) {
    for (const wp of lockedPointsForRetry) {
      const observes = Array.from(vp.imagePoints).some(ip => (ip as ImagePoint).worldPoint === wp);
      if (!observes) continue;

      const target = wp.getEffectiveXyz();
      const dx = vp.position[0] - target[0]!;
      const dy = vp.position[1] - target[1]!;
      const dz = vp.position[2] - target[2]!;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      if (dist < 0.5) {
        const q = vp.rotation;
        const viewDir = [
          2 * (q[1] * q[3] + q[0] * q[2]),
          2 * (q[2] * q[3] - q[0] * q[1]),
          q[0]*q[0] - q[1]*q[1] - q[2]*q[2] + q[3]*q[3],
        ];
        vp.position = [
          vp.position[0] - viewDir[0] * 10,
          vp.position[1] - viewDir[1] * 10,
          vp.position[2] - viewDir[2] * 10,
        ];
        log(`[Retry] Camera ${vp.name} at locked point ${wp.name} - moved back`);
      }
    }
  }

  // Run Stage1 multi-camera optimization (critical for EM refinement)
  const retryMultiCameraPoints = new Set<WorldPoint>();
  for (const wp of pointArray) {
    const visibleInCameras = Array.from(wp.imagePoints)
      .filter(ip => (ip as ImagePoint).viewpoint === vp1 || (ip as ImagePoint).viewpoint === vp2)
      .length;
    if (visibleInCameras >= 2) {
      retryMultiCameraPoints.add(wp);
    }
  }

  if (retryMultiCameraPoints.size >= 4) {
    const stage1System = new ConstraintSystem({
      tolerance,
      maxIterations,
      damping,
      verbose: false,
      optimizeCameraIntrinsics: false,
      regularizationWeight: 0.5,
    });

    retryMultiCameraPoints.forEach(p => stage1System.addPoint(p));
    lineArray.forEach(l => {
      if (retryMultiCameraPoints.has(l.pointA as WorldPoint) && retryMultiCameraPoints.has(l.pointB as WorldPoint)) {
        stage1System.addLine(l);
      }
    });
    stage1System.addCamera(vp1);
    stage1System.addCamera(vp2);
    project.imagePoints.forEach(ip => {
      const ipConcrete = ip as ImagePoint;
      if (retryMultiCameraPoints.has(ipConcrete.worldPoint as WorldPoint) &&
          (ipConcrete.viewpoint === vp1 || ipConcrete.viewpoint === vp2)) {
        stage1System.addImagePoint(ipConcrete);
      }
    });
    constraintArray.forEach(c => stage1System.addConstraint(c));

    const stage1Result = stage1System.solve();
    log(`[Retry] Stage1: conv=${stage1Result.converged}, iter=${stage1Result.iterations}, res=${stage1Result.residual.toFixed(3)}`);
  }

  // Run retry solve
  const retrySystem = new ConstraintSystem({
    tolerance,
    maxIterations,
    damping,
    verbose,
    optimizeCameraIntrinsics: shouldOptimizeIntrinsics,
    regularizationWeight: hasSingleAxisConstraint ? 0.1 : 0,
  });

  project.worldPoints.forEach(p => retrySystem.addPoint(p as WorldPoint));
  project.lines.forEach(l => retrySystem.addLine(l));
  project.viewpoints.forEach(v => {
    if (!excludedCameras.has(v as Viewpoint)) {
      retrySystem.addCamera(v as Viewpoint);
    }
  });
  project.imagePoints.forEach(ip => {
    if (!excludedCameras.has((ip as ImagePoint).viewpoint as Viewpoint)) {
      retrySystem.addImagePoint(ip as ImagePoint);
    }
  });
  project.constraints.forEach(c => retrySystem.addConstraint(c));

  const retryResult = retrySystem.solve();
  log(`[Retry] ${oppositeSign} result: conv=${retryResult.converged}, res=${retryResult.residual.toFixed(3)}`);

  // Compare and keep better result
  if (retryResult.residual < firstResidual) {
    log(`[Retry] ${oppositeSign} is BETTER (${retryResult.residual.toFixed(3)} < ${firstResidual.toFixed(3)}), keeping it`);
    return { result: retryResult, didRetry: true };
  } else {
    log(`[Retry] ${oppositeSign} is WORSE (${retryResult.residual.toFixed(3)} >= ${firstResidual.toFixed(3)}), restoring original`);
    // Restore original state
    restoreState(savedWorldPoints, savedCameras);
    return { result: initialResult, didRetry: true };
  }
}

function restoreState(
  savedWorldPoints: Map<WorldPoint, [number, number, number] | undefined>,
  savedCameras: Map<Viewpoint, { position: [number, number, number]; rotation: [number, number, number, number]; focalLength: number }>
): void {
  for (const [wp, xyz] of savedWorldPoints) {
    wp.optimizedXyz = xyz;
  }
  for (const [vp, state] of savedCameras) {
    vp.position = state.position;
    vp.rotation = state.rotation;
    vp.focalLength = state.focalLength;
  }
}
