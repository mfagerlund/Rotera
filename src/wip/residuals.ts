/**
 * Residual functions for photogrammetry optimization constraints.
 */

/**
 * WorldPoint axis lock residual.
 * Returns error for each locked axis.
 *
 * @param worldPoint - [x, y, z] current 3D position
 * @param locked - [lock_x, lock_y, lock_z] boolean mask
 * @param target - [target_x, target_y, target_z] target values for locked axes
 * @param tolerance - constraint tolerance (weight = 1/tolerance)
 * @returns residual vector (variable length based on number of locked axes)
 */
export function worldPointLockResidual(
  worldPoint: [number, number, number],
  locked: [boolean, boolean, boolean],
  target: [number, number, number],
  tolerance: number = 0.001
): number[] {
  const residuals: number[] = [];
  const weight = 1.0 / tolerance;

  for (let i = 0; i < 3; i++) {
    if (locked[i]) {
      residuals.push((worldPoint[i] - target[i]) * weight);
    }
  }

  return residuals;
}

/**
 * Line constraint residual (3 points collinear).
 * Given three world points A, B, C, enforces that C lies on the line through A and B.
 * Uses the cross-product formulation: ||(C - A) × (B - A)|| = 0
 *
 * @param pointA - [x, y, z] first point on line
 * @param pointB - [x, y, z] second point on line
 * @param pointC - [x, y, z] point that should lie on the line
 * @param sigma - measurement uncertainty (weight = 1/sigma)
 * @returns residual vector [rx, ry, rz] from cross product
 */
export function lineConstraintResidual(
  pointA: [number, number, number],
  pointB: [number, number, number],
  pointC: [number, number, number],
  sigma: number = 1.0
): [number, number, number] {
  // Vector from A to C
  const AC: [number, number, number] = [
    pointC[0] - pointA[0],
    pointC[1] - pointA[1],
    pointC[2] - pointA[2]
  ];

  // Vector from A to B (line direction)
  const AB: [number, number, number] = [
    pointB[0] - pointA[0],
    pointB[1] - pointA[1],
    pointB[2] - pointA[2]
  ];

  // Cross product AC × AB
  // If C is on the line, this should be zero
  const cross: [number, number, number] = [
    AC[1] * AB[2] - AC[2] * AB[1],
    AC[2] * AB[0] - AC[0] * AB[2],
    AC[0] * AB[1] - AC[1] * AB[0]
  ];

  const weight = 1.0 / sigma;

  return [
    cross[0] * weight,
    cross[1] * weight,
    cross[2] * weight
  ];
}

/**
 * Image point reprojection residual.
 * Measures the error between observed image point and projection of 3D world point.
 *
 * @param worldPoint - [x, y, z] 3D point in world coordinates
 * @param observedUV - [u, v] observed image coordinates
 * @param cameraK - Camera intrinsics [fx, fy, cx, cy] or with distortion [fx, fy, cx, cy, k1, k2]
 * @param cameraR - 3x3 rotation matrix (world to camera)
 * @param cameraT - [tx, ty, tz] camera translation
 * @param sigma - measurement uncertainty (weight = 1/sigma)
 * @returns [u_error, v_error] weighted residual
 */
export function imagePointResidual(
  worldPoint: [number, number, number],
  observedUV: [number, number],
  cameraK: number[],
  cameraR: number[][],
  cameraT: [number, number, number],
  sigma: number = 1.0
): [number, number] {
  // Transform to camera coordinates
  const X_cam = [
    cameraR[0][0] * (worldPoint[0] - cameraT[0]) +
      cameraR[0][1] * (worldPoint[1] - cameraT[1]) +
      cameraR[0][2] * (worldPoint[2] - cameraT[2]),
    cameraR[1][0] * (worldPoint[0] - cameraT[0]) +
      cameraR[1][1] * (worldPoint[1] - cameraT[1]) +
      cameraR[1][2] * (worldPoint[2] - cameraT[2]),
    cameraR[2][0] * (worldPoint[0] - cameraT[0]) +
      cameraR[2][1] * (worldPoint[1] - cameraT[1]) +
      cameraR[2][2] * (worldPoint[2] - cameraT[2])
  ];

  const [xc, yc, zc] = X_cam;

  // Handle points behind camera or at center
  if (Math.abs(zc) < 1e-10 || zc < 0) {
    return [1e6, 1e6]; // Large error
  }

  // Perspective division
  const xn = xc / zc;
  const yn = yc / zc;

  // Apply radial distortion if present
  const fx = cameraK[0];
  const fy = cameraK[1];
  const cx = cameraK[2];
  const cy = cameraK[3];
  const k1 = cameraK.length > 4 ? cameraK[4] : 0;
  const k2 = cameraK.length > 5 ? cameraK[5] : 0;

  let xd = xn;
  let yd = yn;

  if (k1 !== 0 || k2 !== 0) {
    const r2 = xn * xn + yn * yn;
    const distortion = 1 + k1 * r2 + k2 * r2 * r2;
    xd = xn * distortion;
    yd = yn * distortion;
  }

  // Project to image coordinates
  const u = fx * xd + cx;
  const v = fy * yd + cy;

  // Weighted residual
  const weight = 1.0 / sigma;
  return [
    (u - observedUV[0]) * weight,
    (v - observedUV[1]) * weight
  ];
}
