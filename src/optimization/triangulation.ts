import type { IViewpoint, IImagePoint, IWorldPoint } from '../entities/interfaces';

export interface TriangulationResult {
  worldPoint: [number, number, number];
  depth1: number;
  depth2: number;
  reprojectionError?: number;
}

export function triangulateRayRay(
  ip1: IImagePoint,
  ip2: IImagePoint,
  vp1: IViewpoint,
  vp2: IViewpoint,
  fallbackDepth: number = 10.0
): TriangulationResult | null {
  const ray1_x = (ip1.u - vp1.principalPointX) / vp1.focalLength;
  const ray1_y = (ip1.v - vp1.principalPointY) / vp1.focalLength;
  const ray1_z = 1.0;
  const ray1_norm = Math.sqrt(ray1_x * ray1_x + ray1_y * ray1_y + ray1_z * ray1_z);
  const d1_x = ray1_x / ray1_norm;
  const d1_y = ray1_y / ray1_norm;
  const d1_z = ray1_z / ray1_norm;

  const ray2_x = (ip2.u - vp2.principalPointX) / vp2.focalLength;
  const ray2_y = (ip2.v - vp2.principalPointY) / vp2.focalLength;
  const ray2_z = 1.0;
  const ray2_norm = Math.sqrt(ray2_x * ray2_x + ray2_y * ray2_y + ray2_z * ray2_z);
  const d2_x = ray2_x / ray2_norm;
  const d2_y = ray2_y / ray2_norm;
  const d2_z = ray2_z / ray2_norm;

  const o1_x = vp1.position[0];
  const o1_y = vp1.position[1];
  const o1_z = vp1.position[2];

  const o2_x = vp2.position[0];
  const o2_y = vp2.position[1];
  const o2_z = vp2.position[2];

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

  if (Math.abs(denom) < 1e-10) {
    t1 = fallbackDepth;
    t2 = fallbackDepth;
  } else {
    t1 = (b * e - c * d) / denom;
    t2 = (a * e - b * d) / denom;

    if (t1 < 0) t1 = fallbackDepth;
    if (t2 < 0) t2 = fallbackDepth;
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
  if (wp.isFullyLocked()) {
    wp.optimizedXyz = [wp.lockedXyz[0]!, wp.lockedXyz[1]!, wp.lockedXyz[2]!];
    return true;
  }

  const ip1 = Array.from(vp1.imagePoints).find(ip => ip.worldPoint === wp);
  const ip2 = Array.from(vp2.imagePoints).find(ip => ip.worldPoint === wp);

  if (!ip1 || !ip2) {
    return false;
  }

  const result = triangulateRayRay(ip1, ip2, vp1, vp2, fallbackDepth);

  if (!result) {
    return false;
  }

  wp.optimizedXyz = result.worldPoint;
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
