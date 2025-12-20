import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import { quaternionMultiply, quaternionRotateVector, quaternionInverse, computeRotationBetweenVectors } from './quaternion-utils';
import { log } from '../optimization-logger';

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
