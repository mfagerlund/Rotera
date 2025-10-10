/**
 * Camera math utilities for photogrammetry optimization.
 * Uses ScalarAutograd for automatic differentiation through all operations.
 */

import { Value, Vec3, Vec2, V } from 'scalar-autograd';
import type { Quaternion, Camera } from '../../../tasks/typescript-optimization-migration-types';

/**
 * Convert quaternion to 3x3 rotation matrix.
 * Uses Value types for automatic differentiation.
 *
 * Quaternion: w + xi + yj + zk
 * Must be normalized: w² + x² + y² + z² = 1
 *
 * @param q - Quaternion {w, x, y, z} all Value objects
 * @returns 3x3 rotation matrix as Vec3 of Vec3
 */
export function quaternionToRotationMatrix(q: Quaternion): Vec3[] {
  const { w, x, y, z } = q;

  // Precompute squared values
  const w2 = V.square(w);
  const x2 = V.square(x);
  const y2 = V.square(y);
  const z2 = V.square(z);

  // Precompute products
  const wx = V.mul(w, x);
  const wy = V.mul(w, y);
  const wz = V.mul(w, z);
  const xy = V.mul(x, y);
  const xz = V.mul(x, z);
  const yz = V.mul(y, z);

  // Build rotation matrix rows
  // R = [
  //   [w²+x²-y²-z²,  2(xy-wz),     2(xz+wy)    ],
  //   [2(xy+wz),     w²-x²+y²-z²,  2(yz-wx)    ],
  //   [2(xz-wy),     2(yz+wx),     w²-x²-y²+z²]
  // ]

  const row0 = new Vec3(
    V.sub(V.add(w2, x2), V.add(y2, z2)), // w²+x²-y²-z²
    V.sub(V.mul(2, xy), V.mul(2, wz)),   // 2(xy-wz)
    V.add(V.mul(2, xz), V.mul(2, wy))    // 2(xz+wy)
  );

  const row1 = new Vec3(
    V.add(V.mul(2, xy), V.mul(2, wz)),   // 2(xy+wz)
    V.sub(V.add(w2, y2), V.add(x2, z2)), // w²-x²+y²-z²
    V.sub(V.mul(2, yz), V.mul(2, wx))    // 2(yz-wx)
  );

  const row2 = new Vec3(
    V.sub(V.mul(2, xz), V.mul(2, wy)),   // 2(xz-wy)
    V.add(V.mul(2, yz), V.mul(2, wx)),   // 2(yz+wx)
    V.sub(V.add(w2, z2), V.add(x2, y2))  // w²-x²-y²+z²
  );

  return [row0, row1, row2];
}

/**
 * Multiply 3x3 rotation matrix by 3D vector.
 *
 * @param R - 3x3 rotation matrix (array of 3 Vec3 rows)
 * @param v - 3D vector
 * @returns Transformed vector
 */
function matMul3x3(R: Vec3[], v: Vec3): Vec3 {
  // R[0] · v, R[1] · v, R[2] · v
  return new Vec3(
    R[0].dot(v),
    R[1].dot(v),
    R[2].dot(v)
  );
}

/**
 * Apply Brown-Conrady radial distortion model.
 *
 * Distortion formula:
 *   r² = x² + y²
 *   distortion = 1 + k1*r² + k2*r⁴ + k3*r⁶
 *   xd = x * distortion + 2*p1*xy + p2*(r² + 2x²)
 *   yd = y * distortion + p1*(r² + 2y²) + 2*p2*xy
 *
 * @param xn - Normalized x coordinate
 * @param yn - Normalized y coordinate
 * @param distortion - [k1, k2, p1, p2, k3] distortion coefficients
 * @returns {xd, yd} distorted coordinates
 */
function applyDistortion(
  xn: Value,
  yn: Value,
  distortion: number[]
): { xd: Value; yd: Value } {
  const [k1, k2, p1, p2, k3] = distortion;

  // Early exit if no distortion
  if (k1 === 0 && k2 === 0 && p1 === 0 && p2 === 0 && k3 === 0) {
    return { xd: xn, yd: yn };
  }

  const r2 = V.add(V.square(xn), V.square(yn));
  const r4 = V.square(r2);
  const r6 = V.mul(r2, r4);

  // Radial distortion: 1 + k1*r² + k2*r⁴ + k3*r⁶
  let radialDistortion = V.C(1);
  if (k1 !== 0) radialDistortion = V.add(radialDistortion, V.mul(k1, r2));
  if (k2 !== 0) radialDistortion = V.add(radialDistortion, V.mul(k2, r4));
  if (k3 !== 0) radialDistortion = V.add(radialDistortion, V.mul(k3, r6));

  // Tangential distortion
  let xd = V.mul(xn, radialDistortion);
  let yd = V.mul(yn, radialDistortion);

  if (p1 !== 0 || p2 !== 0) {
    const xy = V.mul(xn, yn);
    const x2 = V.square(xn);
    const y2 = V.square(yn);

    if (p1 !== 0) {
      // xd += 2*p1*xy
      xd = V.add(xd, V.mul(2 * p1, xy));
      // yd += p1*(r² + 2y²)
      yd = V.add(yd, V.mul(p1, V.add(r2, V.mul(2, y2))));
    }

    if (p2 !== 0) {
      // xd += p2*(r² + 2x²)
      xd = V.add(xd, V.mul(p2, V.add(r2, V.mul(2, x2))));
      // yd += 2*p2*xy
      yd = V.add(yd, V.mul(2 * p2, xy));
    }
  }

  return { xd, yd };
}

/**
 * Project 3D world point to 2D image coordinates.
 *
 * Pipeline:
 * 1. Transform to camera coordinates: X_cam = R * (X_world - t)
 * 2. Perspective division: (xn, yn) = (xc/zc, yc/zc)
 * 3. Apply distortion: (xd, yd) = distort(xn, yn)
 * 4. Apply intrinsics: (u, v) = (fx*xd + cx, fy*yd + cy)
 *
 * @param worldPoint - 3D point in world coordinates (Vec3 of Values)
 * @param camera - Camera parameters (intrinsics, extrinsics, distortion)
 * @returns Vec2 of image coordinates [u, v]
 */
export function projectPoint(worldPoint: Vec3, camera: Camera): Vec2 {
  // 1. Transform to camera coordinates
  const worldMinusT = worldPoint.sub(camera.position);
  const R = quaternionToRotationMatrix(camera.rotation);
  const camCoords = matMul3x3(R, worldMinusT);

  // 2. Perspective division with epsilon for stability
  const zc = camCoords.z;
  const zcSafe = V.add(V.abs(zc), V.C(1e-10)); // Prevent division by zero

  const xn = V.div(camCoords.x, zcSafe);
  const yn = V.div(camCoords.y, zcSafe);

  // 3. Apply distortion
  const { xd, yd } = applyDistortion(xn, yn, camera.distortion);

  // 4. Apply intrinsics
  const u = V.add(V.mul(camera.fx, xd), V.C(camera.cx));
  const v = V.add(V.mul(camera.fy, yd), V.C(camera.cy));

  return new Vec2(u, v);
}

/**
 * Compute reprojection error residual.
 * Returns [u_error, v_error] for use in optimization.
 *
 * @param worldPoint - 3D point in world coordinates (Vec3 of Values)
 * @param observed - Observed 2D image coordinates (Vec2 of Constants)
 * @param camera - Camera parameters
 * @returns Vec2 of residuals [u_error, v_error]
 */
export function reprojectionResidual(
  worldPoint: Vec3,
  observed: Vec2,
  camera: Camera
): Vec2 {
  const projected = projectPoint(worldPoint, camera);

  return new Vec2(
    V.sub(projected.x, observed.x),
    V.sub(projected.y, observed.y)
  );
}

/**
 * Normalize a quaternion to unit length.
 * Essential for maintaining valid rotations.
 *
 * @param q - Unnormalized quaternion
 * @returns Normalized quaternion
 */
export function normalizeQuaternion(q: Quaternion): Quaternion {
  const norm = V.sqrt(
    V.add(
      V.add(V.square(q.w), V.square(q.x)),
      V.add(V.square(q.y), V.square(q.z))
    )
  );

  // Add epsilon for numerical stability
  const normSafe = V.add(norm, V.C(1e-12));

  return {
    w: V.div(q.w, normSafe),
    x: V.div(q.x, normSafe),
    y: V.div(q.y, normSafe),
    z: V.div(q.z, normSafe)
  };
}

/**
 * Create an identity quaternion (no rotation).
 *
 * @returns Quaternion representing identity rotation
 */
export function identityQuaternion(): Quaternion {
  return {
    w: V.C(1),
    x: V.C(0),
    y: V.C(0),
    z: V.C(0)
  };
}

/**
 * Convert axis-angle to quaternion.
 * Useful for initialization from Euler angles or rotation vectors.
 *
 * @param axis - Rotation axis [x, y, z] (should be unit vector)
 * @param angle - Rotation angle in radians
 * @returns Quaternion
 */
export function axisAngleToQuaternion(
  axis: [number, number, number],
  angle: number
): Quaternion {
  const halfAngle = angle / 2;
  const s = Math.sin(halfAngle);
  const c = Math.cos(halfAngle);

  return {
    w: V.C(c),
    x: V.C(axis[0] * s),
    y: V.C(axis[1] * s),
    z: V.C(axis[2] * s)
  };
}
