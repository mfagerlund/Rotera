import type { IViewpoint, IImagePoint, IWorldPoint } from '../entities/interfaces';
import type { Viewpoint } from '../entities/viewpoint';
import type { WorldPoint } from '../entities/world-point';
import { log } from './optimization-logger';

export interface TriangulationResult {
  worldPoint: [number, number, number];
  depth1: number;
  depth2: number;
  reprojectionError?: number;
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

export function triangulateRayRay(
  ip1: IImagePoint,
  ip2: IImagePoint,
  vp1: IViewpoint,
  vp2: IViewpoint,
  fallbackDepth: number = 10.0
): TriangulationResult | null {
  const vp1Concrete = vp1 as Viewpoint;
  const vp2Concrete = vp2 as Viewpoint;

  const ray1_cam_x = (ip1.u - vp1Concrete.principalPointX) / vp1Concrete.focalLength;
  const ray1_cam_y = (vp1Concrete.principalPointY - ip1.v) / vp1Concrete.focalLength;
  const ray1_cam_z = 1.0;
  const ray1_cam_norm = Math.sqrt(ray1_cam_x * ray1_cam_x + ray1_cam_y * ray1_cam_y + ray1_cam_z * ray1_cam_z);
  const ray1_cam = [ray1_cam_x / ray1_cam_norm, ray1_cam_y / ray1_cam_norm, ray1_cam_z / ray1_cam_norm];

  const q1_inv = quaternionInverse(vp1Concrete.rotation);
  const ray1_world = quaternionRotateVector(q1_inv, ray1_cam);
  const d1_x = ray1_world[0];
  const d1_y = ray1_world[1];
  const d1_z = ray1_world[2];

  const ray2_cam_x = (ip2.u - vp2Concrete.principalPointX) / vp2Concrete.focalLength;
  const ray2_cam_y = (vp2Concrete.principalPointY - ip2.v) / vp2Concrete.focalLength;
  const ray2_cam_z = 1.0;
  const ray2_cam_norm = Math.sqrt(ray2_cam_x * ray2_cam_x + ray2_cam_y * ray2_cam_y + ray2_cam_z * ray2_cam_z);
  const ray2_cam = [ray2_cam_x / ray2_cam_norm, ray2_cam_y / ray2_cam_norm, ray2_cam_z / ray2_cam_norm];

  const q2_inv = quaternionInverse(vp2Concrete.rotation);
  const ray2_world = quaternionRotateVector(q2_inv, ray2_cam);
  const d2_x = ray2_world[0];
  const d2_y = ray2_world[1];
  const d2_z = ray2_world[2];

  const o1_x = vp1Concrete.position[0];
  const o1_y = vp1Concrete.position[1];
  const o1_z = vp1Concrete.position[2];

  const o2_x = vp2Concrete.position[0];
  const o2_y = vp2Concrete.position[1];
  const o2_z = vp2Concrete.position[2];

  const w_x = o1_x - o2_x;
  const w_y = o1_y - o2_y;
  const w_z = o1_z - o2_z;

  const a = d1_x * d1_x + d1_y * d1_y + d1_z * d1_z;
  const b = d1_x * d2_x + d1_y * d2_y + d1_z * d2_z;
  const c = d2_x * d2_x + d2_y * d2_y + d2_z * d2_z;
  const d = d1_x * w_x + d1_y * w_y + d1_z * w_z;
  const e = d2_x * w_x + d2_y * w_y + d2_z * w_z;

  const denom = a * c - b * b;
  let t1, t2;

  // Compute baseline distance for depth sanity check
  const baselineLength = Math.sqrt(w_x * w_x + w_y * w_y + w_z * w_z);
  // Maximum reasonable depth is 100x baseline (arbitrary but prevents infinity)
  const maxReasonableDepth = Math.max(baselineLength * 100, fallbackDepth * 10);


  if (Math.abs(denom) < 1e-10) {
    // Rays are nearly parallel - use fallback
    t1 = fallbackDepth;
    t2 = fallbackDepth;
  } else {
    t1 = (b * e - c * d) / denom;
    t2 = (a * e - b * d) / denom;

    const originalT1 = t1;
    const originalT2 = t2;

    // Log if depths are large (potential issue)
    if (Math.abs(t1) > 100 || Math.abs(t2) > 100) {
      log(`[Tri] LARGE DEPTH: t1=${t1.toFixed(0)}, t2=${t2.toFixed(0)}, maxDepth=${maxReasonableDepth.toFixed(0)}`);
    }

    if (t1 < 0) t1 = fallbackDepth;
    if (t2 < 0) t2 = fallbackDepth;

    // Clamp depths to prevent near-parallel rays producing points at infinity
    if (t1 > maxReasonableDepth) {
      log(`[Triangulation] Clamping t1 from ${originalT1.toFixed(1)} to ${maxReasonableDepth.toFixed(1)} (baseline=${baselineLength.toFixed(1)})`);
      t1 = maxReasonableDepth;
    }
    if (t2 > maxReasonableDepth) {
      log(`[Triangulation] Clamping t2 from ${originalT2.toFixed(1)} to ${maxReasonableDepth.toFixed(1)} (baseline=${baselineLength.toFixed(1)})`);
      t2 = maxReasonableDepth;
    }
  }

  const p1_x = o1_x + d1_x * t1;
  const p1_y = o1_y + d1_y * t1;
  const p1_z = o1_z + d1_z * t1;

  const p2_x = o2_x + d2_x * t2;
  const p2_y = o2_y + d2_y * t2;
  const p2_z = o2_z + d2_z * t2;

  const mid_x = (p1_x + p2_x) / 2;
  const mid_y = (p1_y + p2_y) / 2;
  const mid_z = (p1_z + p2_z) / 2;

  return {
    worldPoint: [mid_x, mid_y, mid_z],
    depth1: t1,
    depth2: t2
  };
}

export function triangulateWorldPoint(
  wp: IWorldPoint,
  vp1: IViewpoint,
  vp2: IViewpoint,
  fallbackDepth: number = 10.0
): boolean {
  const wpConcrete = wp as WorldPoint;
  const vp1Concrete = vp1 as Viewpoint;
  const vp2Concrete = vp2 as Viewpoint;

  if (wpConcrete.isFullyConstrained()) {
    const effective = wpConcrete.getEffectiveXyz();
    wpConcrete.optimizedXyz = [effective[0]!, effective[1]!, effective[2]!];
    return true;
  }

  const ip1 = Array.from(vp1Concrete.imagePoints).find(ip => ip.worldPoint === wp);
  const ip2 = Array.from(vp2Concrete.imagePoints).find(ip => ip.worldPoint === wp);

  if (!ip1 || !ip2) {
    return false;
  }

  const result = triangulateRayRay(ip1, ip2, vp1Concrete, vp2Concrete, fallbackDepth);

  if (!result) {
    return false;
  }

  wpConcrete.optimizedXyz = result.worldPoint;
  return true;
}

export function triangulateSharedPoints(
  sharedPoints: IWorldPoint[],
  vp1: IViewpoint,
  vp2: IViewpoint,
  fallbackDepth: number = 10.0
): { success: number; failed: number } {
  let success = 0;
  let failed = 0;

  for (const wp of sharedPoints) {
    if (triangulateWorldPoint(wp, vp1, vp2, fallbackDepth)) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed };
}
