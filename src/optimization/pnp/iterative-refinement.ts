/**
 * Iterative camera initialization using PnP with bundle adjustment refinement.
 *
 * Provides initializeCameraWithPnP for robust camera pose estimation from
 * known 3D-2D correspondences with multi-directional initialization.
 */

import type { IViewpoint, IWorldPoint } from '../../entities/interfaces';
import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import { ConstraintSystem } from '../constraint-system';
import { projectPointToPixel, PlainCameraIntrinsics } from '../analytical/project-point-plain';
import { log, logOnce } from '../optimization-logger';
import { quaternionToMatrix } from './math-utils';

export interface PnPInitializationResult {
  success: boolean;
  reliable: boolean;
  finalReprojectionError?: number;
  reason?: string;
}

export interface PnPOptions {
  /**
   * If true, use any point with optimizedXyz for PnP, not just fully constrained ones.
   * Use this for "late PnP" cases where points have been triangulated from other cameras.
   * Default: false (only use fully constrained points)
   */
  useTriangulatedPoints?: boolean;

  /**
   * Set of initialized camera names. When provided along with useTriangulatedPoints,
   * only use points visible in 2+ of these cameras (truly triangulated) rather than
   * any point with optimizedXyz (which may include single-camera positions).
   */
  initializedCameraNames?: Set<string>;
}

/**
 * Initialize an additional camera using iterative PnP optimization.
 *
 * Algorithm:
 * 1. Use geometric heuristic for initial guess
 * 2. Refine camera pose using bundle adjustment (world points fixed)
 * 3. Return reprojection error for diagnostics
 *
 * This approach is robust and leverages our existing optimization infrastructure.
 *
 * Returns:
 * - success: true if pose was computed
 * - reliable: true if the result appears reasonable (not a degenerate solution)
 * - finalReprojectionError: the final reprojection error in pixels
 */
export function initializeCameraWithPnP(
  viewpoint: IViewpoint,
  allWorldPoints: Set<IWorldPoint>,
  options: PnPOptions = {}
): PnPInitializationResult {
  const { useTriangulatedPoints = false, initializedCameraNames } = options;
  const vpConcrete = viewpoint as Viewpoint;

  // Helper to check if point is visible in 2+ initialized cameras (truly triangulated)
  const isTrulyTriangulated = (wp: WorldPoint): boolean => {
    if (!initializedCameraNames || initializedCameraNames.size < 2) {
      return true; // No filter if not enough cameras to triangulate
    }
    let visibleCount = 0;
    for (const ip of wp.imagePoints) {
      if (initializedCameraNames.has(ip.viewpoint.name)) {
        visibleCount++;
        if (visibleCount >= 2) return true;
      }
    }
    return false;
  };

  // For centroid/geometry calculation:
  // - Default mode (useTriangulatedPoints=false): Only use constrained points (locked or inferred coordinates)
  //   Unconstrained points may have garbage optimizedXyz from previous failed optimizations.
  // - Late PnP mode (useTriangulatedPoints=true): Use points with optimizedXyz.
  //   If initializedCameraNames provided, only use truly triangulated points (visible in 2+ initialized cameras).
  const constrainedPoints: [number, number, number][] = [];

  for (const ip of vpConcrete.imagePoints) {
    const wp = ip.worldPoint as WorldPoint;

    let canUsePoint: boolean;
    if (useTriangulatedPoints) {
      canUsePoint = wp.optimizedXyz !== undefined && wp.optimizedXyz !== null;
      // If we have initialized camera info, only use truly triangulated points
      if (canUsePoint && initializedCameraNames) {
        canUsePoint = isTrulyTriangulated(wp);
      }
    } else {
      canUsePoint = wp.optimizedXyz !== undefined && wp.isFullyConstrained();
    }

    if (canUsePoint && wp.optimizedXyz) {
      constrainedPoints.push(wp.optimizedXyz);
    }
  }

  // Need at least 3 points for reliable centroid
  if (constrainedPoints.length < 3) {
    const pointType = useTriangulatedPoints ? 'triangulated' : 'constrained';
    logOnce(`PnP: Camera ${vpConcrete.name} has only ${constrainedPoints.length} ${pointType} points (need 3)`);
    return { success: false, reliable: false, reason: `Not enough ${pointType} points (have ${constrainedPoints.length}, need 3)` };
  }

  // Use constrained points for centroid (reliable positions)
  const centroid: [number, number, number] = [0, 0, 0];
  for (const pt of constrainedPoints) {
    centroid[0] += pt[0];
    centroid[1] += pt[1];
    centroid[2] += pt[2];
  }
  centroid[0] /= constrainedPoints.length;
  centroid[1] /= constrainedPoints.length;
  centroid[2] /= constrainedPoints.length;

  let maxDist = 0;
  for (const pt of constrainedPoints) {
    const dx = pt[0] - centroid[0];
    const dy = pt[1] - centroid[1];
    const dz = pt[2] - centroid[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    maxDist = Math.max(maxDist, dist);
  }

  const cameraDistance = Math.max(maxDist * 2.5, 10);
  // Compact: centroid, maxDist, camDist on one line
  log(`  ${constrainedPoints.length} pts, centroid=[${centroid.map(x => x.toFixed(2)).join(',')}], maxD=${maxDist.toFixed(2)}, camD=${cameraDistance.toFixed(2)}`);

  // Helper to run PnP optimization with given initial position/rotation
  function runPnPFromDirection(
    position: [number, number, number],
    rotation: [number, number, number, number]
  ): { error: number; position: [number, number, number]; rotation: [number, number, number, number]; iterations: number } {
    vpConcrete.position = position;
    vpConcrete.rotation = rotation;

    const system = new ConstraintSystem({
      maxIterations: 100,
      tolerance: 1e-6,
      damping: 10.0,
      verbose: false,
    });

    for (const ip of vpConcrete.imagePoints) {
      const wp = ip.worldPoint as WorldPoint;
      if (wp.optimizedXyz) {
        system.addPoint(wp);
      }
    }
    system.addCamera(vpConcrete);

    for (const ip of vpConcrete.imagePoints) {
      system.addImagePoint(ip);
    }

    const result = system.solve();

    // Renormalize quaternion to prevent drift during optimization
    const [w, x, y, z] = vpConcrete.rotation;
    const mag = Math.sqrt(w * w + x * x + y * y + z * z);
    if (mag > 1e-6) {
      const invMag = 1.0 / mag;
      vpConcrete.rotation = [w * invMag, x * invMag, y * invMag, z * invMag];
    }

    const error = computeReprojectionError(vpConcrete);

    return {
      error,
      position: [...vpConcrete.position] as [number, number, number],
      rotation: [...vpConcrete.rotation] as [number, number, number, number],
      iterations: result.iterations
    };
  }

  // First try the standard direction: negative Z from centroid
  const initialPosition: [number, number, number] = [centroid[0], centroid[1], centroid[2] - cameraDistance];

  const initialError = computeReprojectionError(vpConcrete);
  let result = runPnPFromDirection(initialPosition, [1, 0, 0, 0]);
  let finalError = result.error;
  let bestIterations = result.iterations;

  // Helper to count points in front of camera
  function countPointsInFrontForPose(position: [number, number, number], rotation: [number, number, number, number]): number {
    const R = quaternionToMatrix(rotation);
    let count = 0;
    for (const pt of constrainedPoints) {
      const rel = [pt[0] - position[0], pt[1] - position[1], pt[2] - position[2]];
      const camZ = R[2][0] * rel[0] + R[2][1] * rel[1] + R[2][2] * rel[2];
      if (camZ > 0) count++;
    }
    return count;
  }

  // Check if first direction has valid solution (low error AND points in front)
  let pointsInFrontForBest = countPointsInFrontForPose(result.position, result.rotation);
  const isFirstDirectionValid = finalError < 50 && pointsInFrontForBest >= constrainedPoints.length * 0.5;

  // If first direction gave poor results (high error OR points behind), try other directions
  if (!isFirstDirectionValid) {

    const otherDirections: { name: string; offset: [number, number, number]; rotation: [number, number, number, number] }[] = [
      { name: '+Z', offset: [0, 0, cameraDistance], rotation: [0, 0, 1, 0] },
      { name: '-X', offset: [-cameraDistance, 0, 0], rotation: [0.707, 0, 0.707, 0] },
      { name: '+X', offset: [cameraDistance, 0, 0], rotation: [0.707, 0, -0.707, 0] },
      { name: '-Y', offset: [0, -cameraDistance, 0], rotation: [0.707, -0.707, 0, 0] },
      { name: '+Y', offset: [0, cameraDistance, 0], rotation: [0.707, 0.707, 0, 0] },
    ];

    for (const dir of otherDirections) {
      const pos: [number, number, number] = [
        centroid[0] + dir.offset[0],
        centroid[1] + dir.offset[1],
        centroid[2] + dir.offset[2]
      ];

      const dirResult = runPnPFromDirection(pos, dir.rotation);
      const dirPointsInFront = countPointsInFrontForPose(dirResult.position, dirResult.rotation);

      // A solution is better if: (1) more points in front, or (2) same points in front but lower error
      const isBetter = dirPointsInFront > pointsInFrontForBest ||
        (dirPointsInFront === pointsInFrontForBest && dirResult.error < finalError);

      if (isBetter) {
        finalError = dirResult.error;
        result = dirResult;
        bestIterations = dirResult.iterations;
        pointsInFrontForBest = dirPointsInFront;
      }

      // Early exit if we found a good solution (low error AND points in front)
      if (finalError < 10 && pointsInFrontForBest >= constrainedPoints.length * 0.5) break;
    }
  }

  // Use the best result
  vpConcrete.position = result.position;
  vpConcrete.rotation = result.rotation;

  log(`PnP: ${vpConcrete.name} (${constrainedPoints.length} pts): err ${initialError.toFixed(0)}→${finalError.toFixed(1)}px, ${bestIterations} iters, pos=[${vpConcrete.position.map(x => x.toFixed(1)).join(',')}]`);

  // Validate the result to detect degenerate solutions
  // A degenerate solution typically has:
  // 1. Camera drifted far from initial estimate (placed very far away)
  // 2. Final error that's still too high to be useful
  // 3. Points behind the camera
  // 4. Degenerate quaternion (magnitude far from 1)

  let reliable = true;
  let reason: string | undefined;

  // Check 0: Verify quaternion is well-normalized (detect degenerate solutions)
  // A degenerate quaternion has |q| far from 1, which produces invalid rotations
  const [qw, qx, qy, qz] = vpConcrete.rotation;
  const quatMag = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz);
  if (quatMag < 0.5 || quatMag > 2.0) {
    reliable = false;
    reason = `Degenerate quat |q|=${quatMag.toFixed(2)}`;
    vpConcrete.rotation = [1, 0, 0, 0];
  } else if (Math.abs(quatMag - 1.0) > 0.01) {
    const invMag = 1.0 / quatMag;
    vpConcrete.rotation = [qw * invMag, qx * invMag, qy * invMag, qz * invMag];
  }

  // Check 1: Verify camera didn't drift too far from initial position estimate
  // A degenerate solution often places the camera very far away where all points
  // project to nearly the same location, achieving low reprojection error incorrectly.
  const finalDx = vpConcrete.position[0] - centroid[0];
  const finalDy = vpConcrete.position[1] - centroid[1];
  const finalDz = vpConcrete.position[2] - centroid[2];
  const finalDistFromCentroid = Math.sqrt(finalDx * finalDx + finalDy * finalDy + finalDz * finalDz);
  const distanceRatio = finalDistFromCentroid / cameraDistance;

  const maxDistanceRatio = 15.0; // Allow up to 15x the initial estimate (generous because heuristic is rough)
  if (distanceRatio > maxDistanceRatio) {
    reliable = false;
    reason = `Camera drifted ${distanceRatio.toFixed(0)}x (${finalDistFromCentroid.toFixed(0)} vs expected ${cameraDistance.toFixed(0)})`;
    log(`  WARN: ${reason} - resetting to initial`);

    // Reset to initial position since the optimization diverged
    vpConcrete.position = [centroid[0], centroid[1], centroid[2] - cameraDistance];
    vpConcrete.rotation = [1, 0, 0, 0];
  }

  // Check 2: If final error is still very high, the result is unreliable
  const maxAcceptableError = 80; // pixels
  if (finalError > maxAcceptableError && reliable) {
    reliable = false;
    reason = `Final error ${finalError.toFixed(0)}px > ${maxAcceptableError}px`;
  }

  // Check 3: Verify that most constrained points are in front of the camera
  function countPointsInFront(rotation: [number, number, number, number]): number {
    const R = quaternionToMatrix(rotation);
    let count = 0;
    for (const pt of constrainedPoints) {
      const rel = [
        pt[0] - vpConcrete.position[0],
        pt[1] - vpConcrete.position[1],
        pt[2] - vpConcrete.position[2]
      ];
      const camZ = R[2][0] * rel[0] + R[2][1] * rel[1] + R[2][2] * rel[2];
      if (camZ > 0) count++;
    }
    return count;
  }

  let pointsInFront = countPointsInFront(vpConcrete.rotation);

  // If most/all points are behind the camera, PnP found the "flipped" solution
  // Try rotating 180° around X axis to flip the view direction
  if (pointsInFront < constrainedPoints.length * 0.5) {

    // 180° rotation around X axis: quaternion [0, 1, 0, 0]
    // q_new = q_old * q_flip (right multiply for local rotation)
    const [w, x, y, z] = vpConcrete.rotation;
    const flippedRotation: [number, number, number, number] = [
      -x,  // w' = w*0 - x*1 - y*0 - z*0 = -x
      w,   // x' = w*1 + x*0 + y*0 - z*0 = w
      z,   // y' = w*0 - x*0 + y*0 + z*1 = z
      -y   // z' = w*0 + x*0 - y*1 + z*0 = -y
    ];

    const flippedPointsInFront = countPointsInFront(flippedRotation);
    log(`  After flip: ${flippedPointsInFront}/${constrainedPoints.length} points in front`);

    if (flippedPointsInFront > pointsInFront) {
      // Mirror the position through the centroid
      // If camera was at P and centroid at C, new position is 2C - P
      const mirroredPosition: [number, number, number] = [
        2 * centroid[0] - vpConcrete.position[0],
        2 * centroid[1] - vpConcrete.position[1],
        2 * centroid[2] - vpConcrete.position[2]
      ];
      log(`  Mirrored position through centroid: [${mirroredPosition.map(x => x.toFixed(3)).join(', ')}]`);

      // Apply flip and mirror WITHOUT re-optimization
      // Bundle adjustment will refine the pose later
      vpConcrete.position = mirroredPosition;
      vpConcrete.rotation = flippedRotation;
      pointsInFront = flippedPointsInFront;

      // Recompute error with flipped orientation
      finalError = computeReprojectionError(vpConcrete);
      log(`  Applied flip - now ${pointsInFront}/${constrainedPoints.length} points in front, error=${finalError.toFixed(2)} px`);
    }
  }

  if (pointsInFront < constrainedPoints.length * 0.5 && reliable) {
    reliable = false;
    reason = `Only ${pointsInFront}/${constrainedPoints.length} points in front of camera`;
    log(`  WARNING: ${reason}`);
  }

  return {
    success: true,
    reliable,
    finalReprojectionError: finalError,
    reason
  };
}

function computeReprojectionError(vp: Viewpoint): number {
  let totalError = 0;
  let count = 0;

  const intrinsics: PlainCameraIntrinsics = {
    fx: vp.focalLength ?? 1000,
    fy: (vp.focalLength ?? 1000) * (vp.aspectRatio ?? 1.0),
    cx: vp.principalPointX ?? 500,
    cy: vp.principalPointY ?? 500,
    k1: vp.radialDistortion[0] ?? 0,
    k2: vp.radialDistortion[1] ?? 0,
    k3: vp.radialDistortion[2] ?? 0,
    p1: vp.tangentialDistortion[0] ?? 0,
    p2: vp.tangentialDistortion[1] ?? 0
  };

  for (const ip of vp.imagePoints) {
    const wp = ip.worldPoint as WorldPoint;
    if (!wp.optimizedXyz) continue;

    try {
      const projected = projectPointToPixel(
        wp.optimizedXyz,
        vp.position,
        vp.rotation,
        intrinsics,
        vp.isZReflected
      );

      if (projected) {
        const dx = projected[0] - ip.u;
        const dy = projected[1] - ip.v;
        totalError += Math.sqrt(dx * dx + dy * dy);
        count++;
      }
    } catch (e) {
      log(`Error computing reprojection for ${wp.name} @ ${vp.name}: ${e}`);
    }
  }

  return count > 0 ? totalError / count : 0;
}
