import type { Viewpoint } from '../entities/viewpoint';
import type { WorldPoint } from '../entities/world-point';
import type { Line } from '../entities/line';
import type { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint';
import type { Constraint } from '../entities/constraints/base-constraint';
import { triangulateRayRay } from './triangulation';
import { log } from './optimization-logger';

function quaternionMultiply(q1: number[], q2: number[]): number[] {
  const w1 = q1[0], x1 = q1[1], y1 = q1[2], z1 = q1[3];
  const w2 = q2[0], x2 = q2[1], y2 = q2[2], z2 = q2[3];

  return [
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2
  ];
}

function quaternionRotateVector(q: number[], v: number[]): number[] {
  const qw = q[0], qx = q[1], qy = q[2], qz = q[3];
  const vx = v[0], vy = v[1], vz = v[2];

  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx)
  ];
}

function quaternionInverse(q: number[]): number[] {
  return [q[0], -q[1], -q[2], -q[3]];
}

function computeRotationBetweenVectors(from: number[], to: number[]): number[] {
  const fromNorm = Math.sqrt(from[0] * from[0] + from[1] * from[1] + from[2] * from[2]);
  const toNorm = Math.sqrt(to[0] * to[0] + to[1] * to[1] + to[2] * to[2]);

  if (fromNorm < 1e-10 || toNorm < 1e-10) {
    return [1, 0, 0, 0];
  }

  const f = [from[0] / fromNorm, from[1] / fromNorm, from[2] / fromNorm];
  const t = [to[0] / toNorm, to[1] / toNorm, to[2] / toNorm];

  const dot = f[0] * t[0] + f[1] * t[1] + f[2] * t[2];

  if (dot > 0.99999) {
    return [1, 0, 0, 0];
  }

  if (dot < -0.99999) {
    let orthogonal = [1, 0, 0];
    if (Math.abs(f[0]) > 0.9) {
      orthogonal = [0, 1, 0];
    }
    const cross = [
      orthogonal[1] * f[2] - orthogonal[2] * f[1],
      orthogonal[2] * f[0] - orthogonal[0] * f[2],
      orthogonal[0] * f[1] - orthogonal[1] * f[0]
    ];
    const crossNorm = Math.sqrt(cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);
    return [0, cross[0] / crossNorm, cross[1] / crossNorm, cross[2] / crossNorm];
  }

  const cross = [
    f[1] * t[2] - f[2] * t[1],
    f[2] * t[0] - f[0] * t[2],
    f[0] * t[1] - f[1] * t[0]
  ];

  const w = 1 + dot;
  const norm = Math.sqrt(w * w + cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);

  return [w / norm, cross[0] / norm, cross[1] / norm, cross[2] / norm];
}

export function alignCamerasToLockedPoints(
  cameras: Viewpoint[],
  lockedPoints: WorldPoint[],
  allPoints: WorldPoint[]
): boolean {
  if (cameras.length < 2 || lockedPoints.length < 2) {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      console.warn('[alignCamerasToLockedPoints] Need at least 2 cameras and 2 locked points');
    }
    return false;
  }

  const vp1 = cameras[0];
  const vp2 = cameras[1];

  const shared = lockedPoints.filter(wp => {
    const ip1 = Array.from(vp1.imagePoints).find(ip => ip.worldPoint === wp);
    const ip2 = Array.from(vp2.imagePoints).find(ip => ip.worldPoint === wp);
    return ip1 && ip2;
  });

  if (shared.length < 2) {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      console.warn('[alignCamerasToLockedPoints] Need at least 2 shared locked points between cameras');
    }
    return false;
  }

  const wp0 = shared[0];
  const wp1 = shared[1];

  const ip0_cam1 = Array.from(vp1.imagePoints).find(ip => ip.worldPoint === wp0);
  const ip0_cam2 = Array.from(vp2.imagePoints).find(ip => ip.worldPoint === wp0);
  const ip1_cam1 = Array.from(vp1.imagePoints).find(ip => ip.worldPoint === wp1);
  const ip1_cam2 = Array.from(vp2.imagePoints).find(ip => ip.worldPoint === wp1);

  if (!ip0_cam1 || !ip0_cam2 || !ip1_cam1 || !ip1_cam2) {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      console.warn('[alignCamerasToLockedPoints] Missing image points');
    }
    return false;
  }

  const result0 = triangulateRayRay(ip0_cam1, ip0_cam2, vp1, vp2, 10.0);
  const result1 = triangulateRayRay(ip1_cam1, ip1_cam2, vp1, vp2, 10.0);

  if (!result0 || !result1) {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      console.warn('[alignCamerasToLockedPoints] Triangulation failed');
    }
    return false;
  }

  const triangulated0 = result0.worldPoint;
  const triangulated1 = result1.worldPoint;

  const effective0 = wp0.getEffectiveXyz();
  const target0 = [effective0[0]!, effective0[1]!, effective0[2]!];
  const effective1 = wp1.getEffectiveXyz();
  const target1 = [effective1[0]!, effective1[1]!, effective1[2]!];

  const vec_triangulated = [
    triangulated1[0] - triangulated0[0],
    triangulated1[1] - triangulated0[1],
    triangulated1[2] - triangulated0[2]
  ];

  const vec_target = [
    target1[0] - target0[0],
    target1[1] - target0[1],
    target1[2] - target0[2]
  ];

  const dist_triangulated = Math.sqrt(
    vec_triangulated[0] * vec_triangulated[0] +
    vec_triangulated[1] * vec_triangulated[1] +
    vec_triangulated[2] * vec_triangulated[2]
  );

  const dist_target = Math.sqrt(
    vec_target[0] * vec_target[0] +
    vec_target[1] * vec_target[1] +
    vec_target[2] * vec_target[2]
  );

  if (dist_triangulated < 1e-6) {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      console.warn('[alignCamerasToLockedPoints] Triangulated points are too close together');
    }
    return false;
  }

  const scale = dist_target / dist_triangulated;

  const rotation = computeRotationBetweenVectors(vec_triangulated, vec_target);

  const scaled_tri0 = [
    triangulated0[0] * scale,
    triangulated0[1] * scale,
    triangulated0[2] * scale
  ];

  const rotated_scaled_tri0 = quaternionRotateVector(rotation, scaled_tri0);

  const translation = [
    target0[0] - rotated_scaled_tri0[0],
    target0[1] - rotated_scaled_tri0[1],
    target0[2] - rotated_scaled_tri0[2]
  ];

  for (const cam of cameras) {
    const oldPos = cam.position;
    const oldRot = cam.rotation;

    const scaledPos = [oldPos[0] * scale, oldPos[1] * scale, oldPos[2] * scale];
    const rotatedPos = quaternionRotateVector(rotation, scaledPos);
    const newPos = [
      rotatedPos[0] + translation[0],
      rotatedPos[1] + translation[1],
      rotatedPos[2] + translation[2]
    ];

    const rotInverse = quaternionInverse(rotation);
    const newRot = quaternionMultiply(oldRot, rotInverse);

    cam.position = [newPos[0], newPos[1], newPos[2]];
    cam.rotation = [newRot[0], newRot[1], newRot[2], newRot[3]];
  }

  for (const wp of allPoints) {
    if (wp.optimizedXyz) {
      const oldXyz = wp.optimizedXyz;
      const scaledXyz = [oldXyz[0] * scale, oldXyz[1] * scale, oldXyz[2] * scale];
      const rotatedXyz = quaternionRotateVector(rotation, scaledXyz);
      const newXyz: [number, number, number] = [
        rotatedXyz[0] + translation[0],
        rotatedXyz[1] + translation[1],
        rotatedXyz[2] + translation[2]
      ];

      if (!wp.isFullyConstrained()) {
        wp.optimizedXyz = newXyz;
      }
    }
  }

  for (const wp of lockedPoints) {
    const wpEffective = wp.getEffectiveXyz();
    wp.optimizedXyz = [wpEffective[0]!, wpEffective[1]!, wpEffective[2]!];
  }

  const scaled_tri1 = [triangulated1[0] * scale, triangulated1[1] * scale, triangulated1[2] * scale];
  const rotated_scaled_tri1 = quaternionRotateVector(rotation, scaled_tri1);
  const transformed_tri1 = [
    rotated_scaled_tri1[0] + translation[0],
    rotated_scaled_tri1[1] + translation[1],
    rotated_scaled_tri1[2] + translation[2]
  ];

  const error0_direct = Math.sqrt(
    (rotated_scaled_tri0[0] + translation[0] - target0[0]) ** 2 +
    (rotated_scaled_tri0[1] + translation[1] - target0[1]) ** 2 +
    (rotated_scaled_tri0[2] + translation[2] - target0[2]) ** 2
  );

  const error1_direct = Math.sqrt(
    (transformed_tri1[0] - target1[0]) ** 2 +
    (transformed_tri1[1] - target1[1]) ** 2 +
    (transformed_tri1[2] - target1[2]) ** 2
  );

  if (error0_direct > 0.01 || error1_direct > 0.01) {
    return false;
  }

  return true;
}

/**
 * Callback to test alignment quality by running a preliminary solve.
 * Takes maxIterations parameter and returns the residual (error) of the solve.
 */
export type AlignmentQualityCallback = (maxIterations: number) => number;

/**
 * Result of alignment that indicates whether the orientation is ambiguous.
 */
export interface AlignmentResult {
  success: boolean;
  /** If true, the alignment couldn't determine the correct orientation and both should be tried */
  ambiguous: boolean;
  /** Which sign was used for the first axis alignment (positive = original direction, negative = flipped) */
  signUsed: 'positive' | 'negative' | undefined;
}

/**
 * Align the scene to match line direction constraints.
 *
 * After Essential Matrix initialization, the scene is in an arbitrary coordinate frame.
 * If there are lines with direction constraints (x, y, z axis-aligned), we should rotate
 * the entire scene so those lines actually align with the specified axes.
 *
 * Algorithm:
 * 1. If one axis: align that axis line to its target
 * 2. If two axes: align the first, then rotate around it to best align the second
 * 3. If three axes: fully constrained (handle like two axes, third is automatic)
 *
 * The sign ambiguity (e.g., +Y vs -Y) is resolved by trying both and picking
 * the one with lower reprojection error.
 *
 * @param forceFirstAxisSign - If provided, forces the first axis alignment to use
 *   this sign ('positive' or 'negative') instead of auto-detecting. Used for retry
 *   when the initial alignment was ambiguous.
 */
export function alignSceneToLineDirections(
  cameras: Viewpoint[],
  allPoints: WorldPoint[],
  lines: Line[],
  usedEssentialMatrix: boolean = false,
  qualityCallback?: AlignmentQualityCallback,
  forceFirstAxisSign?: 'positive' | 'negative'
): AlignmentResult {
  // Helper to apply a rotation to the entire scene
  const applyRotation = (rotation: number[]) => {
    for (const cam of cameras) {
      const newPos = quaternionRotateVector(rotation, cam.position);
      const rotInverse = quaternionInverse(rotation);
      const newRot = quaternionMultiply(cam.rotation, rotInverse);
      cam.position = [newPos[0], newPos[1], newPos[2]];
      cam.rotation = [newRot[0], newRot[1], newRot[2], newRot[3]];
    }
    for (const wp of allPoints) {
      if (wp.optimizedXyz) {
        const newXyz = quaternionRotateVector(rotation, wp.optimizedXyz);
        wp.optimizedXyz = [newXyz[0], newXyz[1], newXyz[2]];
      }
    }
  };

  // Helper to compute current direction of an axis line (after rotations applied)
  const computeLineDirection = (line: Line): [number, number, number] | null => {
    const posA = line.pointA.optimizedXyz;
    const posB = line.pointB.optimizedXyz;
    if (!posA || !posB) return null;

    const direction: [number, number, number] = [
      posB[0] - posA[0],
      posB[1] - posA[1],
      posB[2] - posA[2]
    ];
    const length = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
    if (length < 1e-6) return null;

    direction[0] /= length;
    direction[1] /= length;
    direction[2] /= length;
    return direction;
  };

  // Group axis lines by their target direction
  const axisLinesByDirection = new Map<string, { line: Line; targetAxis: [number, number, number] }[]>();

  for (const line of lines) {
    if (!line.direction || line.direction === 'free') continue;

    let targetAxis: [number, number, number] | null = null;
    switch (line.direction) {
      case 'x': targetAxis = [1, 0, 0]; break;
      case 'y': targetAxis = [0, 1, 0]; break;
      case 'z': targetAxis = [0, 0, 1]; break;
      default: continue; // Skip plane constraints for now
    }

    const posA = line.pointA.optimizedXyz;
    const posB = line.pointB.optimizedXyz;
    if (!posA || !posB) continue;

    const direction = computeLineDirection(line);
    if (!direction) continue;

    const existing = axisLinesByDirection.get(line.direction) || [];
    existing.push({ line, targetAxis });
    axisLinesByDirection.set(line.direction, existing);
  }

  if (axisLinesByDirection.size === 0) {
    return { success: false, ambiguous: false, signUsed: undefined };
  }

  // Track if we couldn't determine the correct orientation
  let isAmbiguous = false;

  // Get unique axes in the order they first appear in lines (preserves iteration order
  // for backwards compatibility - old tests depend on this order)
  const presentAxes: string[] = [];
  for (const line of lines) {
    if (line.direction && ['x', 'y', 'z'].includes(line.direction) && !presentAxes.includes(line.direction)) {
      presentAxes.push(line.direction);
    }
  }

  // STEP 1: Align the first axis - try both sign options and pick the one with lower error
  const firstAxisKey = presentAxes[0];
  const firstAxisLines = axisLinesByDirection.get(firstAxisKey)!;
  const firstLine = firstAxisLines[0];
  const firstDirection = computeLineDirection(firstLine.line);

  if (!firstDirection) {
    return { success: false, ambiguous: false, signUsed: undefined };
  }

  // Define positive and negative directions for alignment options
  const positiveDir: [number, number, number] = firstDirection;
  const negativeDir: [number, number, number] = [-firstDirection[0], -firstDirection[1], -firstDirection[2]];

  // Determine sign using dot-product as default
  const dotWithTarget =
    firstDirection[0] * firstLine.targetAxis[0] + firstDirection[1] * firstLine.targetAxis[1] + firstDirection[2] * firstLine.targetAxis[2];
  const dotPreferPositive = dotWithTarget >= 0;

  // For Essential Matrix cases, try both signs and pick based on locked point alignment
  let usePositive: boolean = dotPreferPositive;

  // If forced sign is specified, skip all auto-detection and use the forced value
  if (forceFirstAxisSign) {
    usePositive = forceFirstAxisSign === 'positive';
    log(`[Align] ${firstAxisKey}-axis: FORCED to ${forceFirstAxisSign}`);
  } else if (usedEssentialMatrix && presentAxes.length >= 2) {
    // For Essential Matrix with 2+ axis constraints, use the second axis to disambiguate the first.
    // After aligning the first axis, the second axis line should point in a consistent direction.
    // Try both signs and pick the one that gives better second-axis alignment.

    const secondAxisKey = presentAxes[1];
    const secondAxisLines = axisLinesByDirection.get(secondAxisKey)!;
    const secondLine = secondAxisLines[0];

    // Helper to compute how well the second axis aligns after first axis alignment
    const computeSecondAxisAlignment = (positive: boolean): number => {
      const savedCameras = cameras.map(c => ({ pos: [...c.position], rot: [...c.rotation] }));
      const savedPoints = allPoints.map(p => ({ xyz: p.optimizedXyz ? [...p.optimizedXyz] : undefined }));

      // Apply first axis alignment
      const dir = positive ? positiveDir : negativeDir;
      const rotation = computeRotationBetweenVectors(dir, firstLine.targetAxis);
      applyRotation(rotation);

      // Compute second axis direction after first alignment
      const secondDir = computeLineDirection(secondLine.line);
      let dotWithSecondTarget = 0;
      if (secondDir) {
        dotWithSecondTarget = secondDir[0] * secondLine.targetAxis[0] +
                              secondDir[1] * secondLine.targetAxis[1] +
                              secondDir[2] * secondLine.targetAxis[2];
      }

      // Restore
      cameras.forEach((c, i) => {
        c.position = savedCameras[i].pos as [number, number, number];
        c.rotation = savedCameras[i].rot as [number, number, number, number];
      });
      allPoints.forEach((p, i) => {
        p.optimizedXyz = savedPoints[i].xyz as [number, number, number] | undefined;
      });

      return dotWithSecondTarget;
    };

    const dotPosAlign = computeSecondAxisAlignment(true);
    const dotNegAlign = computeSecondAxisAlignment(false);

    // Check if the second-axis test is reliable:
    // If both dot products are near zero, the second axis line is nearly perpendicular
    // to its target axis, meaning triangulation is degenerate and we can't trust this heuristic.
    const bothDotsNearZero = Math.abs(dotPosAlign) < 0.5 && Math.abs(dotNegAlign) < 0.5;

    if (bothDotsNearZero && qualityCallback) {
      // Second axis is degenerate - triangulated direction is nearly perpendicular to target.
      // Try both orientations with actual solves and pick the better one.
      log(`[Align] ${firstAxisKey}-axis: EM second-axis degenerate (+dot=${dotPosAlign.toFixed(2)}, -dot=${dotNegAlign.toFixed(2)}), trying both with solves`);

      // Helper to save/restore state
      const saveState = () => ({
        cameras: cameras.map(c => ({ pos: [...c.position], rot: [...c.rotation] })),
        points: allPoints.map(p => ({ xyz: p.optimizedXyz ? [...p.optimizedXyz] : undefined }))
      });
      const restoreState = (state: ReturnType<typeof saveState>) => {
        cameras.forEach((c, i) => {
          c.position = state.cameras[i].pos as [number, number, number];
          c.rotation = state.cameras[i].rot as [number, number, number, number];
        });
        allPoints.forEach((p, i) => {
          p.optimizedXyz = state.points[i].xyz as [number, number, number] | undefined;
        });
      };

      // Helper to test an alignment
      const testAlignment = (positive: boolean, iterations: number): number => {
        const state = saveState();
        const dir = positive ? positiveDir : negativeDir;
        const rotation = computeRotationBetweenVectors(dir, firstLine.targetAxis);
        applyRotation(rotation);
        const error = qualityCallback(iterations);
        restoreState(state);
        return error;
      };

      // First pass: quick solve (30 iterations)
      let errorPositive = testAlignment(true, 30);
      let errorNegative = testAlignment(false, 30);
      log(`[Align] ${firstAxisKey}-axis: quick test: +err=${errorPositive.toFixed(2)}, -err=${errorNegative.toFixed(2)}`);

      // If errors are very similar (within 10%), run longer solves to differentiate
      const errorRatio = Math.min(errorPositive, errorNegative) / Math.max(errorPositive, errorNegative);
      if (errorRatio > 0.9) {
        log(`[Align] ${firstAxisKey}-axis: errors similar, running longer solves`);
        errorPositive = testAlignment(true, 300);
        errorNegative = testAlignment(false, 300);
        log(`[Align] ${firstAxisKey}-axis: long test: +err=${errorPositive.toFixed(2)}, -err=${errorNegative.toFixed(2)}`);

        // If still equal, try even longer (essentially full solves)
        const newRatio = Math.min(errorPositive, errorNegative) / Math.max(errorPositive, errorNegative);
        if (newRatio > 0.99) {
          log(`[Align] ${firstAxisKey}-axis: still equal, running full solves`);
          errorPositive = testAlignment(true, 500);
          errorNegative = testAlignment(false, 500);
          log(`[Align] ${firstAxisKey}-axis: full test: +err=${errorPositive.toFixed(2)}, -err=${errorNegative.toFixed(2)}`);
        }
      }

      // When errors are equal (or very close), the solver converges to the same state
      // for both orientations due to line direction constraints.
      const finalRatio = Math.min(errorPositive, errorNegative) / Math.max(errorPositive, errorNegative);
      if (finalRatio > 0.99) {
        // Errors are essentially equal - we can't determine the correct orientation.
        // Mark as ambiguous so the caller can try both full optimizations.
        isAmbiguous = true;
        // For now, just pick positive (will be overridden by caller if needed)
        usePositive = dotPreferPositive;
        log(`[Align] ${firstAxisKey}-axis: errors equal, AMBIGUOUS - caller should try both`);
      } else {
        usePositive = errorPositive < errorNegative;
        log(`[Align] ${firstAxisKey}-axis: chose ${usePositive ? '+' : '-'}${firstAxisKey.toUpperCase()} based on error (${errorPositive.toFixed(2)} vs ${errorNegative.toFixed(2)})`);
      }
    } else if (Math.abs(dotPosAlign - dotNegAlign) > 0.1 && !bothDotsNearZero) {
      // Pick the alignment where second axis has positive dot (doesn't need flip)
      usePositive = dotPosAlign > dotNegAlign;
      log(`[Align] ${firstAxisKey}-axis: EM second-axis test (${secondAxisKey}): +dot=${dotPosAlign.toFixed(2)}, -dot=${dotNegAlign.toFixed(2)} -> ${usePositive ? '+' : '-'}`);
    } else if (qualityCallback) {
      // Second axis doesn't help - use qualityCallback to test both options
      log(`[Align] ${firstAxisKey}-axis: EM second-axis inconclusive, testing both with solves`);

      const saveState = () => ({
        cameras: cameras.map(c => ({ pos: [...c.position], rot: [...c.rotation] })),
        points: allPoints.map(p => ({ xyz: p.optimizedXyz ? [...p.optimizedXyz] : undefined }))
      });
      const restoreState = (state: ReturnType<typeof saveState>) => {
        cameras.forEach((c, i) => {
          c.position = state.cameras[i].pos as [number, number, number];
          c.rotation = state.cameras[i].rot as [number, number, number, number];
        });
        allPoints.forEach((p, i) => {
          p.optimizedXyz = state.points[i].xyz as [number, number, number] | undefined;
        });
      };

      const testAlignment = (positive: boolean, iterations: number): number => {
        const state = saveState();
        const dir = positive ? positiveDir : negativeDir;
        const rotation = computeRotationBetweenVectors(dir, firstLine.targetAxis);
        applyRotation(rotation);
        const error = qualityCallback(iterations);
        restoreState(state);
        return error;
      };

      // Quick test first
      let errorPositive = testAlignment(true, 50);
      let errorNegative = testAlignment(false, 50);
      log(`[Align] ${firstAxisKey}-axis: quick test: +err=${errorPositive.toFixed(2)}, -err=${errorNegative.toFixed(2)}`);

      // If errors are similar, run longer tests
      const errorRatio = Math.min(errorPositive, errorNegative) / Math.max(errorPositive, errorNegative);
      if (errorRatio > 0.8) {
        errorPositive = testAlignment(true, 300);
        errorNegative = testAlignment(false, 300);
        log(`[Align] ${firstAxisKey}-axis: long test: +err=${errorPositive.toFixed(2)}, -err=${errorNegative.toFixed(2)}`);
      }

      const finalRatio = Math.min(errorPositive, errorNegative) / Math.max(errorPositive, errorNegative);
      if (finalRatio > 0.95) {
        isAmbiguous = true;
        usePositive = dotPreferPositive;
        log(`[Align] ${firstAxisKey}-axis: errors similar, AMBIGUOUS`);
      } else {
        usePositive = errorPositive < errorNegative;
        log(`[Align] ${firstAxisKey}-axis: chose ${usePositive ? '+' : '-'}${firstAxisKey.toUpperCase()} (${errorPositive.toFixed(2)} vs ${errorNegative.toFixed(2)})`);
      }
    } else {
      // Second axis doesn't help and no qualityCallback - fall back to dot-product
      usePositive = dotPreferPositive;
      isAmbiguous = true; // Mark as ambiguous since we can't verify
      log(`[Align] ${firstAxisKey}-axis: EM second-axis inconclusive, dot=${dotWithTarget.toFixed(2)} -> ${usePositive ? '+' : '-'} (AMBIGUOUS)`);
    }
  } else if (usedEssentialMatrix && qualityCallback) {
    // Single axis EM case with quality callback - test both orientations
    // This is needed because when an endpoint is set from inference (not triangulation),
    // the dot product will be 1.0 (already aligned) even though other points may be
    // in a completely different coordinate frame. Testing both signs with actual solves
    // lets us pick the better orientation.
    log(`[Align] ${firstAxisKey}-axis: EM single-axis (dot=${dotWithTarget.toFixed(2)}), testing both orientations`);

    const saveState = () => ({
      cameras: cameras.map(c => ({ pos: [...c.position], rot: [...c.rotation] })),
      points: allPoints.map(p => ({ xyz: p.optimizedXyz ? [...p.optimizedXyz] : undefined }))
    });
    const restoreState = (state: ReturnType<typeof saveState>) => {
      cameras.forEach((c, i) => {
        c.position = state.cameras[i].pos as [number, number, number];
        c.rotation = state.cameras[i].rot as [number, number, number, number];
      });
      allPoints.forEach((p, i) => {
        p.optimizedXyz = state.points[i].xyz as [number, number, number] | undefined;
      });
    };

    const testAlignment = (positive: boolean, iterations: number): number => {
      const state = saveState();
      const dir = positive ? positiveDir : negativeDir;
      const rotation = computeRotationBetweenVectors(dir, firstLine.targetAxis);
      applyRotation(rotation);
      const error = qualityCallback(iterations);
      restoreState(state);
      return error;
    };

    // Quick test first
    let errorPositive = testAlignment(true, 50);
    let errorNegative = testAlignment(false, 50);
    log(`[Align] ${firstAxisKey}-axis: quick test: +err=${errorPositive.toFixed(2)}, -err=${errorNegative.toFixed(2)}`);

    // If errors are similar, run longer tests
    const errorRatio = Math.min(errorPositive, errorNegative) / Math.max(errorPositive, errorNegative);
    if (errorRatio > 0.8) {
      errorPositive = testAlignment(true, 300);
      errorNegative = testAlignment(false, 300);
      log(`[Align] ${firstAxisKey}-axis: long test: +err=${errorPositive.toFixed(2)}, -err=${errorNegative.toFixed(2)}`);
    }

    const finalRatio = Math.min(errorPositive, errorNegative) / Math.max(errorPositive, errorNegative);
    if (finalRatio > 0.95) {
      isAmbiguous = true;
      usePositive = dotPreferPositive;
      log(`[Align] ${firstAxisKey}-axis: errors similar, AMBIGUOUS`);
    } else {
      usePositive = errorPositive < errorNegative;
      log(`[Align] ${firstAxisKey}-axis: chose ${usePositive ? '+' : '-'}${firstAxisKey.toUpperCase()} (${errorPositive.toFixed(2)} vs ${errorNegative.toFixed(2)})`);
    }
  } else if (usedEssentialMatrix) {
    // Single axis case without quality callback - use dot-product
    log(`[Align] ${firstAxisKey}-axis: EM single-axis, dot=${dotWithTarget.toFixed(2)} -> ${usePositive ? '+' : '-'}`);
  } else {
    // Non-EM case: use dot-product (standard case, works for VP initialization)
    log(`[Align] ${firstAxisKey}-axis: dot=${dotWithTarget.toFixed(2)} -> ${usePositive ? '+' : '-'}`);
  }

  // Apply the chosen alignment
  if (usePositive) {
    const rotationPositive = computeRotationBetweenVectors(positiveDir, firstLine.targetAxis);
    applyRotation(rotationPositive);
    log(`[Align] ${firstAxisKey}-axis: chose +${firstAxisKey.toUpperCase()}`);
  } else {
    const rotationNegative = computeRotationBetweenVectors(negativeDir, firstLine.targetAxis);
    applyRotation(rotationNegative);
    log(`[Align] ${firstAxisKey}-axis: chose -${firstAxisKey.toUpperCase()}`);
  }

  // NOTE: Second axis alignment was attempted but produced worse results for some fixtures.
  // For now, we only align the first axis and use camera baseline heuristic for the remaining DoF.
  // TODO: Investigate why second axis alignment fails and fix before re-enabling.
  // See the git history for the removed second axis alignment code.

  // Use camera baseline heuristic to resolve the remaining rotational DoF
  if (cameras.length >= 2) {
    const cam0Pos = cameras[0].position;
    const cam1Pos = cameras[1].position;
    const baseline = [cam1Pos[0] - cam0Pos[0], cam1Pos[1] - cam0Pos[1], cam1Pos[2] - cam0Pos[2]];
    const baselineLen = Math.sqrt(baseline[0] ** 2 + baseline[1] ** 2 + baseline[2] ** 2);

    if (baselineLen > 1e-6) {
      // Compute the component of baseline along the target axis
      const targetAxis = firstLine.targetAxis;
      const axialComponent = baseline[0] * targetAxis[0] + baseline[1] * targetAxis[1] + baseline[2] * targetAxis[2];

      // Compute the perpendicular component (in the plane perpendicular to the axis)
      const perpendicular = [
        baseline[0] - axialComponent * targetAxis[0],
        baseline[1] - axialComponent * targetAxis[1],
        baseline[2] - axialComponent * targetAxis[2]
      ];
      const perpLen = Math.sqrt(perpendicular[0] ** 2 + perpendicular[1] ** 2 + perpendicular[2] ** 2);

      // If there's significant perpendicular component, rotate around the axis to align it
      // with a "canonical" direction in that plane
      if (perpLen > baselineLen * 0.1) {
        // Choose canonical direction based on axis:
        // Y-axis: align perpendicular to X direction
        // Z-axis: align perpendicular to X direction
        // X-axis: align perpendicular to Y direction
        let canonicalDir: [number, number, number];
        if (targetAxis[1] > 0.9) {
          // Y-axis: canonical perpendicular is X
          canonicalDir = [1, 0, 0];
        } else if (targetAxis[2] > 0.9) {
          // Z-axis: canonical perpendicular is X
          canonicalDir = [1, 0, 0];
        } else {
          // X-axis: canonical perpendicular is Y
          canonicalDir = [0, 1, 0];
        }

        // Compute rotation around the target axis to align perpendicular with canonical
        const perpNorm = [perpendicular[0] / perpLen, perpendicular[1] / perpLen, perpendicular[2] / perpLen];

        // Project canonical onto the plane perpendicular to target axis
        const canonicalAxial = canonicalDir[0] * targetAxis[0] + canonicalDir[1] * targetAxis[1] + canonicalDir[2] * targetAxis[2];
        const canonicalPerp = [
          canonicalDir[0] - canonicalAxial * targetAxis[0],
          canonicalDir[1] - canonicalAxial * targetAxis[1],
          canonicalDir[2] - canonicalAxial * targetAxis[2]
        ];
        const canonicalPerpLen = Math.sqrt(canonicalPerp[0] ** 2 + canonicalPerp[1] ** 2 + canonicalPerp[2] ** 2);

        if (canonicalPerpLen > 0.1) {
          const canonicalPerpNorm = [canonicalPerp[0] / canonicalPerpLen, canonicalPerp[1] / canonicalPerpLen, canonicalPerp[2] / canonicalPerpLen];

          // Compute angle between perpNorm and canonicalPerpNorm
          const dot = perpNorm[0] * canonicalPerpNorm[0] + perpNorm[1] * canonicalPerpNorm[1] + perpNorm[2] * canonicalPerpNorm[2];
          const cross = [
            perpNorm[1] * canonicalPerpNorm[2] - perpNorm[2] * canonicalPerpNorm[1],
            perpNorm[2] * canonicalPerpNorm[0] - perpNorm[0] * canonicalPerpNorm[2],
            perpNorm[0] * canonicalPerpNorm[1] - perpNorm[1] * canonicalPerpNorm[0]
          ];

          // Check if cross product is aligned with target axis (determines rotation direction)
          const crossDotAxis = cross[0] * targetAxis[0] + cross[1] * targetAxis[1] + cross[2] * targetAxis[2];

          // Compute rotation angle
          let angle = Math.acos(Math.max(-1, Math.min(1, dot)));
          if (crossDotAxis < 0) {
            angle = -angle;
          }

          // Create rotation quaternion around target axis
          const halfAngle = angle / 2;
          const axisRotation: number[] = [
            Math.cos(halfAngle),
            Math.sin(halfAngle) * targetAxis[0],
            Math.sin(halfAngle) * targetAxis[1],
            Math.sin(halfAngle) * targetAxis[2]
          ];

          // Apply this additional rotation
          applyRotation(axisRotation);
        }
      }
    }
  }

  return { success: true, ambiguous: isAmbiguous, signUsed: usePositive ? 'positive' : 'negative' };
}

/**
 * Align the scene to satisfy coplanar constraints that involve locked points.
 *
 * When we have a coplanar constraint like (A, B, C, O) where O is locked at origin,
 * the constraint says these 4 points lie on a plane. After Essential Matrix initialization,
 * points A, B, C are coplanar (by construction), but the plane may not pass through origin.
 *
 * This function finds a rotation that makes the reconstructed plane pass through the
 * locked point(s), helping the optimizer converge.
 *
 * The approach:
 * 1. Find the plane normal from the triangulated points
 * 2. Compute where the locked point projects onto this plane
 * 3. Find a rotation that moves the plane to include the locked point
 */
/**
 * Align a freely-solved scene to match locked point constraints.
 *
 * After Essential Matrix initialization and optimization with all points free,
 * this function computes and applies a similarity transform (scale, rotation, translation)
 * to align the optimized positions with the locked point targets.
 *
 * This is a post-hoc alignment that preserves the relative geometry of the solution
 * while placing it in the correct world coordinate frame.
 *
 * @param cameras - All viewpoints to transform
 * @param allPoints - All world points (will transform optimizedXyz)
 * @param lockedPoints - Points with known target positions
 * @returns true if alignment was successful
 */
export function alignSceneToLockedPoints(
  cameras: Viewpoint[],
  allPoints: WorldPoint[],
  lockedPoints: WorldPoint[]
): boolean {
  // Need at least 1 locked point to set translation (origin)
  // Need at least 2 locked points to set scale
  // Need at least 3 non-collinear locked points to fully constrain rotation

  if (lockedPoints.length === 0) {
    return false;
  }

  const alignablePoints = lockedPoints.filter(wp => wp.optimizedXyz !== undefined);
  if (alignablePoints.length === 0) {
    return false;
  }

  // Case 1: Single locked point - just translate
  if (alignablePoints.length === 1) {
    const wp = alignablePoints[0];
    const optimized = wp.optimizedXyz!;
    const target = wp.getEffectiveXyz();
    const targetXyz = [target[0]!, target[1]!, target[2]!];

    const translation = [
      targetXyz[0] - optimized[0],
      targetXyz[1] - optimized[1],
      targetXyz[2] - optimized[2]
    ];

    // Apply translation to all cameras
    for (const cam of cameras) {
      cam.position = [
        cam.position[0] + translation[0],
        cam.position[1] + translation[1],
        cam.position[2] + translation[2]
      ];
    }

    // Apply translation to all world points
    for (const wp of allPoints) {
      if (wp.optimizedXyz) {
        wp.optimizedXyz = [
          wp.optimizedXyz[0] + translation[0],
          wp.optimizedXyz[1] + translation[1],
          wp.optimizedXyz[2] + translation[2]
        ];
      }
    }

    return true;
  }

  // Case 2: Two or more locked points - compute full similarity transform
  // Use Procrustes analysis (rigid alignment)

  // Compute centroids
  let srcCentroid = [0, 0, 0];
  let dstCentroid = [0, 0, 0];

  for (const wp of alignablePoints) {
    const src = wp.optimizedXyz!;
    const dst = wp.getEffectiveXyz();

    srcCentroid[0] += src[0];
    srcCentroid[1] += src[1];
    srcCentroid[2] += src[2];

    dstCentroid[0] += dst[0]!;
    dstCentroid[1] += dst[1]!;
    dstCentroid[2] += dst[2]!;
  }

  const n = alignablePoints.length;
  srcCentroid[0] /= n;
  srcCentroid[1] /= n;
  srcCentroid[2] /= n;
  dstCentroid[0] /= n;
  dstCentroid[1] /= n;
  dstCentroid[2] /= n;


  // Compute scale from average distances to centroid
  let srcScale = 0;
  let dstScale = 0;

  for (const wp of alignablePoints) {
    const src = wp.optimizedXyz!;
    const dst = wp.getEffectiveXyz();

    srcScale += Math.sqrt(
      (src[0] - srcCentroid[0]) ** 2 +
      (src[1] - srcCentroid[1]) ** 2 +
      (src[2] - srcCentroid[2]) ** 2
    );

    dstScale += Math.sqrt(
      (dst[0]! - dstCentroid[0]) ** 2 +
      (dst[1]! - dstCentroid[1]) ** 2 +
      (dst[2]! - dstCentroid[2]) ** 2
    );
  }

  const scale = srcScale > 1e-10 ? dstScale / srcScale : 1.0;

  // For rotation, we need at least 2 points with non-zero distance from centroid
  // Use the direction from first to second point to get one rotation constraint
  let rotation = [1, 0, 0, 0]; // Identity quaternion

  // Find two points that are far from each other (for stable direction computation)
  let bestPairDist = 0;
  let bestI = 0, bestJ = 1;

  for (let i = 0; i < alignablePoints.length; i++) {
    for (let j = i + 1; j < alignablePoints.length; j++) {
      const src1 = alignablePoints[i].optimizedXyz!;
      const src2 = alignablePoints[j].optimizedXyz!;
      const dist = Math.sqrt(
        (src2[0] - src1[0]) ** 2 +
        (src2[1] - src1[1]) ** 2 +
        (src2[2] - src1[2]) ** 2
      );
      if (dist > bestPairDist) {
        bestPairDist = dist;
        bestI = i;
        bestJ = j;
      }
    }
  }

  if (bestPairDist > 1e-6) {
    const wp1 = alignablePoints[bestI];
    const wp2 = alignablePoints[bestJ];

    const src1 = wp1.optimizedXyz!;
    const src2 = wp2.optimizedXyz!;
    const dst1 = wp1.getEffectiveXyz();
    const dst2 = wp2.getEffectiveXyz();

    const srcDir = [
      src2[0] - src1[0],
      src2[1] - src1[1],
      src2[2] - src1[2]
    ];

    const dstDir = [
      dst2[0]! - dst1[0]!,
      dst2[1]! - dst1[1]!,
      dst2[2]! - dst1[2]!
    ];

    rotation = computeRotationBetweenVectors(srcDir, dstDir);
  }

  // Apply transformation: new = R * scale * (old - srcCentroid) + dstCentroid

  // Transform cameras
  for (const cam of cameras) {
    const oldPos = cam.position;
    const oldRot = cam.rotation;

    // Translate to origin, scale, rotate, translate to target
    const centered = [
      oldPos[0] - srcCentroid[0],
      oldPos[1] - srcCentroid[1],
      oldPos[2] - srcCentroid[2]
    ];
    const scaled = [
      centered[0] * scale,
      centered[1] * scale,
      centered[2] * scale
    ];
    const rotated = quaternionRotateVector(rotation, scaled);
    const newPos = [
      rotated[0] + dstCentroid[0],
      rotated[1] + dstCentroid[1],
      rotated[2] + dstCentroid[2]
    ];

    // Rotate camera orientation
    const rotInverse = quaternionInverse(rotation);
    const newRot = quaternionMultiply(oldRot, rotInverse);

    cam.position = [newPos[0], newPos[1], newPos[2]];
    cam.rotation = [newRot[0], newRot[1], newRot[2], newRot[3]];
  }

  // Transform world points
  for (const wp of allPoints) {
    if (wp.optimizedXyz) {
      const oldXyz = wp.optimizedXyz;

      const centered = [
        oldXyz[0] - srcCentroid[0],
        oldXyz[1] - srcCentroid[1],
        oldXyz[2] - srcCentroid[2]
      ];
      const scaled = [
        centered[0] * scale,
        centered[1] * scale,
        centered[2] * scale
      ];
      const rotated = quaternionRotateVector(rotation, scaled);
      const newXyz: [number, number, number] = [
        rotated[0] + dstCentroid[0],
        rotated[1] + dstCentroid[1],
        rotated[2] + dstCentroid[2]
      ];

      wp.optimizedXyz = newXyz;
    }
  }

  // Force locked points to their exact target positions
  for (const wp of lockedPoints) {
    const target = wp.getEffectiveXyz();
    wp.optimizedXyz = [target[0]!, target[1]!, target[2]!];
  }

  log(`[Align] ${alignablePoints.length} locked pts, scale=${scale.toFixed(3)}`);
  return true;
}
