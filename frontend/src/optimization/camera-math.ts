/**
 * Camera math utilities for photogrammetry optimization.
 * Based on pictorigo/core/math/camera.py and se3.py
 */

/**
 * Convert axis-angle rotation to 3x3 rotation matrix.
 * Uses quaternion intermediate representation for numerical stability.
 *
 * @param axisAngle - [rx, ry, rz] axis-angle rotation vector
 * @returns 3x3 rotation matrix
 */
export function axisAngleToMatrix(axisAngle: [number, number, number]): number[][] {
  const [rx, ry, rz] = axisAngle;
  const theta = Math.sqrt(rx * rx + ry * ry + rz * rz);

  // Identity rotation for zero angle
  if (theta < 1e-10) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ];
  }

  // Normalize axis
  const ax = rx / theta;
  const ay = ry / theta;
  const az = rz / theta;

  // Convert to quaternion
  const half_theta = theta / 2;
  const s = Math.sin(half_theta);
  const qw = Math.cos(half_theta);
  const qx = ax * s;
  const qy = ay * s;
  const qz = az * s;

  // Convert quaternion to rotation matrix
  const qw2 = qw * qw;
  const qx2 = qx * qx;
  const qy2 = qy * qy;
  const qz2 = qz * qz;

  return [
    [
      qw2 + qx2 - qy2 - qz2,
      2 * (qx * qy - qw * qz),
      2 * (qx * qz + qw * qy)
    ],
    [
      2 * (qx * qy + qw * qz),
      qw2 - qx2 + qy2 - qz2,
      2 * (qy * qz - qw * qx)
    ],
    [
      2 * (qx * qz - qw * qy),
      2 * (qy * qz + qw * qx),
      qw2 - qx2 - qy2 + qz2
    ]
  ];
}

/**
 * Multiply 3x3 matrix by 3D vector.
 */
function matMul3x3(R: number[][], v: [number, number, number]): [number, number, number] {
  return [
    R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
    R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
    R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]
  ];
}

/**
 * Project 3D world point to 2D image coordinates.
 *
 * @param worldPoint - [x, y, z] 3D point in world coordinates
 * @param K - Camera intrinsics [fx, fy, cx, cy] or [fx, fy, cx, cy, k1, k2]
 * @param R - 3x3 rotation matrix (world to camera)
 * @param t - [tx, ty, tz] translation vector (camera position in world)
 * @returns [u, v] image coordinates in pixels
 */
export function project(
  worldPoint: [number, number, number],
  K: number[],
  R: number[][],
  t: [number, number, number]
): [number, number] {
  // Extract intrinsics
  const fx = K[0];
  const fy = K[1];
  const cx = K[2];
  const cy = K[3];
  const k1 = K.length > 4 ? K[4] : 0;
  const k2 = K.length > 5 ? K[5] : 0;

  // Transform to camera coordinates: X_cam = R * (X_world - t)
  const X_world_minus_t: [number, number, number] = [
    worldPoint[0] - t[0],
    worldPoint[1] - t[1],
    worldPoint[2] - t[2]
  ];

  const X_cam = matMul3x3(R, X_world_minus_t);
  const [xc, yc, zc] = X_cam;

  // Perspective division
  if (Math.abs(zc) < 1e-10 || zc < 0) {
    // Point at camera center or behind camera
    return [NaN, NaN];
  }

  const xn = xc / zc;
  const yn = yc / zc;

  // Apply radial distortion if coefficients provided
  let xd = xn;
  let yd = yn;

  if (k1 !== 0 || k2 !== 0) {
    const r2 = xn * xn + yn * yn;
    const distortion = 1 + k1 * r2 + k2 * r2 * r2;
    xd = xn * distortion;
    yd = yn * distortion;
  }

  // Apply intrinsics
  const u = fx * xd + cx;
  const v = fy * yd + cy;

  return [u, v];
}

/**
 * Compute reprojection error residual.
 * Returns [u_error, v_error] for use in optimization.
 *
 * @param worldPoint - [x, y, z] 3D point in world coordinates
 * @param observed - [u_obs, v_obs] observed image coordinates
 * @param K - Camera intrinsics
 * @param R - Rotation matrix
 * @param t - Translation vector
 * @returns [u_error, v_error] residual vector
 */
export function reprojectionResidual(
  worldPoint: [number, number, number],
  observed: [number, number],
  K: number[],
  R: number[][],
  t: [number, number, number]
): [number, number] {
  const projected = project(worldPoint, K, R, t);

  // Handle projection failures (point behind camera, etc.)
  if (isNaN(projected[0]) || isNaN(projected[1])) {
    return [1e6, 1e6]; // Large error
  }

  return [
    projected[0] - observed[0],
    projected[1] - observed[1]
  ];
}
