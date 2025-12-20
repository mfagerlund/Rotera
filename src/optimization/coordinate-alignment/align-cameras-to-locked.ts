import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import { triangulateRayRay } from '../triangulation';
import { quaternionMultiply, quaternionRotateVector, quaternionInverse, computeRotationBetweenVectors } from './quaternion-utils';

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
