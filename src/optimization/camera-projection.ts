/**
 * Camera projection mathematics using ScalarAutograd for bundle adjustment.
 *
 * Implements differentiable camera projection:
 * 1. World coordinates → Camera coordinates (rotation + translation)
 * 2. Camera coordinates → Normalized image plane
 * 3. Apply distortion
 * 4. Apply intrinsics → Pixel coordinates
 */

import { V, Value, Vec3 } from 'scalar-autograd';

/**
 * Convert Euler angles (rx, ry, rz) to rotation matrix.
 * Uses ZYX convention: R = Rz * Ry * Rx
 *
 * @param rx - Rotation around X axis (radians)
 * @param ry - Rotation around Y axis (radians)
 * @param rz - Rotation around Z axis (radians)
 * @returns 3x3 rotation matrix as Value[][]
 */
export function eulerToRotationMatrix(
  rx: Value,
  ry: Value,
  rz: Value
): Value[][] {
  // Compute sines and cosines
  const cx = V.cos(rx);
  const sx = V.sin(rx);
  const cy = V.cos(ry);
  const sy = V.sin(ry);
  const cz = V.cos(rz);
  const sz = V.sin(rz);

  // Rotation matrix R = Rz * Ry * Rx (ZYX convention)
  // https://en.wikipedia.org/wiki/Euler_angles#Rotation_matrix
  const r00 = V.mul(cy, cz);
  const r01 = V.sub(V.mul(V.mul(sx, sy), cz), V.mul(cx, sz));
  const r02 = V.add(V.mul(V.mul(cx, sy), cz), V.mul(sx, sz));

  const r10 = V.mul(cy, sz);
  const r11 = V.add(V.mul(V.mul(sx, sy), sz), V.mul(cx, cz));
  const r12 = V.sub(V.mul(V.mul(cx, sy), sz), V.mul(sx, cz));

  const r20 = V.neg(sy);
  const r21 = V.mul(sx, cy);
  const r22 = V.mul(cx, cy);

  return [
    [r00, r01, r02],
    [r10, r11, r12],
    [r20, r21, r22],
  ];
}

/**
 * Apply rotation matrix to a 3D vector.
 *
 * @param R - 3x3 rotation matrix
 * @param v - 3D vector (Vec3)
 * @returns Rotated vector (Vec3)
 */
export function rotateVector(R: Value[][], v: Vec3): Vec3 {
  const x = V.add(V.add(V.mul(R[0][0], v.x), V.mul(R[0][1], v.y)), V.mul(R[0][2], v.z));
  const y = V.add(V.add(V.mul(R[1][0], v.x), V.mul(R[1][1], v.y)), V.mul(R[1][2], v.z));
  const z = V.add(V.add(V.mul(R[2][0], v.x), V.mul(R[2][1], v.y)), V.mul(R[2][2], v.z));

  return new Vec3(x, y, z);
}

/**
 * Transform world point to camera coordinates.
 * P_camera = R * (P_world - C_world)
 *
 * @param worldPoint - Point in world coordinates (Vec3)
 * @param cameraPosition - Camera position in world coordinates (Vec3)
 * @param cameraRotation - Camera rotation as Euler angles (Vec3, in radians)
 * @returns Point in camera coordinates (Vec3)
 */
export function worldToCameraCoordinates(
  worldPoint: Vec3,
  cameraPosition: Vec3,
  cameraRotation: Vec3
): Vec3 {
  // Translate to camera origin
  const translated = worldPoint.sub(cameraPosition);

  // Rotate into camera frame
  const R = eulerToRotationMatrix(cameraRotation.x, cameraRotation.y, cameraRotation.z);
  return rotateVector(R, translated);
}

/**
 * Apply radial and tangential distortion to normalized image coordinates.
 * Uses Brown-Conrady distortion model.
 *
 * @param x - Normalized x coordinate
 * @param y - Normalized y coordinate
 * @param k1 - First radial distortion coefficient
 * @param k2 - Second radial distortion coefficient
 * @param k3 - Third radial distortion coefficient
 * @param p1 - First tangential distortion coefficient
 * @param p2 - Second tangential distortion coefficient
 * @returns Distorted coordinates [x', y']
 */
export function applyDistortion(
  x: Value,
  y: Value,
  k1: Value,
  k2: Value,
  k3: Value,
  p1: Value,
  p2: Value
): [Value, Value] {
  const r2 = V.add(V.square(x), V.square(y));
  const r4 = V.square(r2);
  const r6 = V.mul(r2, r4);

  // Radial distortion: (1 + k1*r^2 + k2*r^4 + k3*r^6)
  const radialDistortion = V.add(
    V.add(V.C(1), V.mul(k1, r2)),
    V.add(V.mul(k2, r4), V.mul(k3, r6))
  );

  // Tangential distortion
  const dx_tangential = V.add(
    V.mul(V.mul(V.C(2), p1), V.mul(x, y)),
    V.mul(p2, V.add(r2, V.mul(V.C(2), V.square(x))))
  );

  const dy_tangential = V.add(
    V.mul(p1, V.add(r2, V.mul(V.C(2), V.square(y)))),
    V.mul(V.mul(V.C(2), p2), V.mul(x, y))
  );

  // Apply distortions
  const x_distorted = V.add(V.mul(x, radialDistortion), dx_tangential);
  const y_distorted = V.add(V.mul(y, radialDistortion), dy_tangential);

  return [x_distorted, y_distorted];
}

/**
 * Project a 3D point in camera coordinates to pixel coordinates.
 * Applies perspective projection, distortion, and camera intrinsics.
 *
 * @param cameraPoint - Point in camera coordinates (Vec3)
 * @param focalLength - Focal length (pixels)
 * @param aspectRatio - Aspect ratio (fy/fx)
 * @param principalPointX - Principal point x coordinate (pixels)
 * @param principalPointY - Principal point y coordinate (pixels)
 * @param skew - Skew coefficient
 * @param k1 - First radial distortion coefficient
 * @param k2 - Second radial distortion coefficient
 * @param k3 - Third radial distortion coefficient
 * @param p1 - First tangential distortion coefficient
 * @param p2 - Second tangential distortion coefficient
 * @returns Pixel coordinates [u, v] or null if point is behind camera
 */
export function cameraToPixelCoordinates(
  cameraPoint: Vec3,
  focalLength: Value,
  aspectRatio: Value,
  principalPointX: Value,
  principalPointY: Value,
  skew: Value,
  k1: Value,
  k2: Value,
  k3: Value,
  p1: Value,
  p2: Value
): [Value, Value] | null {
  // Check if point is behind camera (z <= 0)
  const zThreshold = V.C(0.1);
  const isBehindCamera = V.sub(cameraPoint.z, zThreshold);

  // If z is too small, return null (point behind camera)
  if (cameraPoint.z.data < 0.1) {
    return null;
  }

  // Normalize by z (perspective projection)
  const x_normalized = V.div(cameraPoint.x, cameraPoint.z);
  const y_normalized = V.div(cameraPoint.y, cameraPoint.z);

  // Apply distortion
  const [x_distorted, y_distorted] = applyDistortion(
    x_normalized,
    y_normalized,
    k1,
    k2,
    k3,
    p1,
    p2
  );

  // Apply intrinsics
  // K = [[fx, s, cx], [0, fy, cy], [0, 0, 1]]
  const fx = focalLength;
  const fy = V.mul(focalLength, aspectRatio);

  const u = V.add(V.add(V.mul(fx, x_distorted), V.mul(skew, y_distorted)), principalPointX);
  const v = V.add(V.mul(fy, y_distorted), principalPointY);

  return [u, v];
}

/**
 * Transform world point to camera coordinates using quaternion rotation.
 * P_camera = q * (P_world - C_world) * q*
 *
 * @param worldPoint - Point in world coordinates (Vec3)
 * @param cameraPosition - Camera position in world coordinates (Vec3)
 * @param cameraRotation - Camera rotation as quaternion (Vec4, w,x,y,z)
 * @returns Point in camera coordinates (Vec3)
 */
export function worldToCameraCoordinatesQuaternion(
  worldPoint: Vec3,
  cameraPosition: Vec3,
  cameraRotation: any
): Vec3 {
  const { Quaternion } = require('./Quaternion');

  // Translate to camera origin
  const translated = worldPoint.sub(cameraPosition);

  // Rotate into camera frame using quaternion
  return Quaternion.rotateVector(cameraRotation, translated);
}

/**
 * Full camera projection pipeline using quaternion: World coordinates → Pixel coordinates.
 *
 * @param worldPoint - Point in world coordinates (Vec3)
 * @param cameraPosition - Camera position in world coordinates (Vec3)
 * @param cameraRotation - Camera rotation as quaternion (Vec4, w,x,y,z)
 * @param focalLength - Focal length (pixels)
 * @param aspectRatio - Aspect ratio (fy/fx)
 * @param principalPointX - Principal point x coordinate (pixels)
 * @param principalPointY - Principal point y coordinate (pixels)
 * @param skew - Skew coefficient
 * @param k1 - First radial distortion coefficient
 * @param k2 - Second radial distortion coefficient
 * @param k3 - Third radial distortion coefficient
 * @param p1 - First tangential distortion coefficient
 * @param p2 - Second tangential distortion coefficient
 * @returns Pixel coordinates [u, v]
 */
export function projectWorldPointToPixelQuaternion(
  worldPoint: Vec3,
  cameraPosition: Vec3,
  cameraRotation: any,
  focalLength: Value,
  aspectRatio: Value,
  principalPointX: Value,
  principalPointY: Value,
  skew: Value,
  k1: Value,
  k2: Value,
  k3: Value,
  p1: Value,
  p2: Value
): [Value, Value] | null {
  // Transform to camera coordinates using quaternion
  const cameraPoint = worldToCameraCoordinatesQuaternion(worldPoint, cameraPosition, cameraRotation);

  // Project to pixel coordinates
  return cameraToPixelCoordinates(
    cameraPoint,
    focalLength,
    aspectRatio,
    principalPointX,
    principalPointY,
    skew,
    k1,
    k2,
    k3,
    p1,
    p2
  );
}

/**
 * Full camera projection pipeline: World coordinates → Pixel coordinates.
 *
 * @param worldPoint - Point in world coordinates (Vec3)
 * @param cameraPosition - Camera position in world coordinates (Vec3)
 * @param cameraRotation - Camera rotation as Euler angles (Vec3, in radians)
 * @param focalLength - Focal length (pixels)
 * @param aspectRatio - Aspect ratio (fy/fx)
 * @param principalPointX - Principal point x coordinate (pixels)
 * @param principalPointY - Principal point y coordinate (pixels)
 * @param skew - Skew coefficient
 * @param k1 - First radial distortion coefficient
 * @param k2 - Second radial distortion coefficient
 * @param k3 - Third radial distortion coefficient
 * @param p1 - First tangential distortion coefficient
 * @param p2 - Second tangential distortion coefficient
 * @returns Pixel coordinates [u, v]
 */
export function projectWorldPointToPixel(
  worldPoint: Vec3,
  cameraPosition: Vec3,
  cameraRotation: Vec3,
  focalLength: Value,
  aspectRatio: Value,
  principalPointX: Value,
  principalPointY: Value,
  skew: Value,
  k1: Value,
  k2: Value,
  k3: Value,
  p1: Value,
  p2: Value
): [Value, Value] | null {
  // Transform to camera coordinates
  const cameraPoint = worldToCameraCoordinates(worldPoint, cameraPosition, cameraRotation);

  // Project to pixel coordinates
  return cameraToPixelCoordinates(
    cameraPoint,
    focalLength,
    aspectRatio,
    principalPointX,
    principalPointY,
    skew,
    k1,
    k2,
    k3,
    p1,
    p2
  );
}
