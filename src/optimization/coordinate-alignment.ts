import type { Viewpoint } from '../entities/viewpoint';
import type { WorldPoint } from '../entities/world-point';
import { triangulateRayRay } from './triangulation';

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
    console.warn('[alignCamerasToLockedPoints] Need at least 2 cameras and 2 locked points');
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
    console.warn('[alignCamerasToLockedPoints] Need at least 2 shared locked points between cameras');
    return false;
  }

  const wp0 = shared[0];
  const wp1 = shared[1];

  const ip0_cam1 = Array.from(vp1.imagePoints).find(ip => ip.worldPoint === wp0);
  const ip0_cam2 = Array.from(vp2.imagePoints).find(ip => ip.worldPoint === wp0);
  const ip1_cam1 = Array.from(vp1.imagePoints).find(ip => ip.worldPoint === wp1);
  const ip1_cam2 = Array.from(vp2.imagePoints).find(ip => ip.worldPoint === wp1);

  if (!ip0_cam1 || !ip0_cam2 || !ip1_cam1 || !ip1_cam2) {
    console.warn('[alignCamerasToLockedPoints] Missing image points');
    return false;
  }

  console.log('[alignCamerasToLockedPoints] Triangulating locked points in Essential Matrix coordinate system...');
  const result0 = triangulateRayRay(ip0_cam1, ip0_cam2, vp1, vp2, 10.0);
  const result1 = triangulateRayRay(ip1_cam1, ip1_cam2, vp1, vp2, 10.0);

  if (!result0 || !result1) {
    console.warn('[alignCamerasToLockedPoints] Triangulation failed');
    return false;
  }

  const triangulated0 = result0.worldPoint;
  const triangulated1 = result1.worldPoint;

  console.log(`  Triangulated ${wp0.name}: [${triangulated0.map(x => x.toFixed(3)).join(', ')}]`);
  console.log(`  Triangulated ${wp1.name}: [${triangulated1.map(x => x.toFixed(3)).join(', ')}]`);

  const target0 = [wp0.lockedXyz[0]!, wp0.lockedXyz[1]!, wp0.lockedXyz[2]!];
  const target1 = [wp1.lockedXyz[0]!, wp1.lockedXyz[1]!, wp1.lockedXyz[2]!];

  console.log(`  Target ${wp0.name}: [${target0.map(x => x.toFixed(3)).join(', ')}]`);
  console.log(`  Target ${wp1.name}: [${target1.map(x => x.toFixed(3)).join(', ')}]`);

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
    console.warn('[alignCamerasToLockedPoints] Triangulated points are too close together');
    return false;
  }

  const scale = dist_target / dist_triangulated;
  console.log(`  Scale factor: ${scale.toFixed(6)}`);

  const rotation = computeRotationBetweenVectors(vec_triangulated, vec_target);
  console.log(`  Rotation quaternion: [${rotation.map(x => x.toFixed(6)).join(', ')}]`);

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

  console.log(`  Translation: [${translation.map(x => x.toFixed(6)).join(', ')}]`);

  console.log('[alignCamerasToLockedPoints] Applying transformation to cameras...');

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

    console.log(`  ${cam.name}: pos [${oldPos.map(x => x.toFixed(3)).join(', ')}] -> [${newPos.map(x => x.toFixed(3)).join(', ')}]`);
  }

  console.log('[alignCamerasToLockedPoints] Transforming all triangulated world points...');
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

      if (!wp.isFullyLocked()) {
        wp.optimizedXyz = newXyz;
      }
    }
  }

  console.log('[alignCamerasToLockedPoints] Setting locked points to their target positions...');
  for (const wp of lockedPoints) {
    wp.optimizedXyz = [wp.lockedXyz[0]!, wp.lockedXyz[1]!, wp.lockedXyz[2]!];
    console.log(`  ${wp.name}: [${wp.optimizedXyz.join(', ')}]`);
  }

  console.log('[alignCamerasToLockedPoints] Verification (direct transform check):');

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

  console.log(`  ${wp0.name} (direct transform) error: ${error0_direct.toFixed(6)} units`);
  console.log(`  ${wp1.name} (direct transform) error: ${error1_direct.toFixed(6)} units`);

  if (error0_direct > 0.01 || error1_direct > 0.01) {
    console.error('[alignCamerasToLockedPoints] ERROR: Transform is not correct! Debugging:');
    console.log(`    Triangulated ${wp0.name}: [${triangulated0.map(x => x.toFixed(6)).join(', ')}]`);
    console.log(`    Scaled: [${scaled_tri0.map(x => x.toFixed(6)).join(', ')}]`);
    console.log(`    Rotated+scaled: [${rotated_scaled_tri0.map(x => x.toFixed(6)).join(', ')}]`);
    console.log(`    After translation: [${(rotated_scaled_tri0[0] + translation[0]).toFixed(6)}, ${(rotated_scaled_tri0[1] + translation[1]).toFixed(6)}, ${(rotated_scaled_tri0[2] + translation[2]).toFixed(6)}]`);
    console.log(`    Target: [${target0.map(x => x.toFixed(6)).join(', ')}]`);
    return false;
  }

  return true;
}
