/**
 * Plain-number quaternion utilities for geometric operations.
 * All quaternion operations in the codebase use plain numbers.
 * scalar-autograd has been completely removed from the project.
 */

/**
 * Rotate a 3D vector by a quaternion.
 * Uses the formula: v' = v + 2w(q × v) + 2(q × (q × v))
 *
 * @param q - Quaternion [w, x, y, z] where w is the scalar part
 * @param v - Vector [x, y, z] to rotate
 * @returns Rotated vector [x, y, z]
 */
export function quaternionRotateVector(
  q: number[] | readonly number[],
  v: number[] | readonly number[],
): [number, number, number] {
  const qw = q[0],
    qx = q[1],
    qy = q[2],
    qz = q[3];
  const vx = v[0],
    vy = v[1],
    vz = v[2];

  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

/**
 * Compute the inverse (conjugate) of a unit quaternion.
 *
 * @param q - Quaternion [w, x, y, z]
 * @returns Inverse quaternion [w, -x, -y, -z]
 */
export function quaternionInverse(
  q: number[] | readonly number[],
): [number, number, number, number] {
  return [q[0], -q[1], -q[2], -q[3]];
}

/**
 * Multiply two quaternions.
 *
 * @param q1 - First quaternion [w, x, y, z]
 * @param q2 - Second quaternion [w, x, y, z]
 * @returns Product quaternion [w, x, y, z]
 */
export function quaternionMultiply(
  q1: number[] | readonly number[],
  q2: number[] | readonly number[],
): [number, number, number, number] {
  const w1 = q1[0],
    x1 = q1[1],
    y1 = q1[2],
    z1 = q1[3];
  const w2 = q2[0],
    x2 = q2[1],
    y2 = q2[2],
    z2 = q2[3];

  return [
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
  ];
}

/**
 * Create quaternion from Euler angles (roll, pitch, yaw) in radians.
 * Using ZYX (yaw-pitch-roll) convention.
 *
 * @param roll - Rotation around X axis (radians)
 * @param pitch - Rotation around Y axis (radians)
 * @param yaw - Rotation around Z axis (radians)
 * @returns Quaternion [w, x, y, z]
 */
export function quaternionFromEuler(
  roll: number,
  pitch: number,
  yaw: number,
): [number, number, number, number] {
  const cr = Math.cos(roll / 2);
  const sr = Math.sin(roll / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);

  const w = cr * cp * cy + sr * sp * sy;
  const x = sr * cp * cy - cr * sp * sy;
  const y = cr * sp * cy + sr * cp * sy;
  const z = cr * cp * sy - sr * sp * cy;

  return [w, x, y, z];
}

/**
 * Convert quaternion to Euler angles (roll, pitch, yaw) in radians.
 * Using ZYX (yaw-pitch-roll) convention.
 *
 * @param q - Quaternion [w, x, y, z]
 * @returns [roll, pitch, yaw] in radians
 */
export function quaternionToEuler(
  q: number[] | readonly number[],
): [number, number, number] {
  const w = q[0];
  const x = q[1];
  const y = q[2];
  const z = q[3];

  // Roll (X-axis rotation)
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  // Pitch (Y-axis rotation)
  const sinp = 2 * (w * y - z * x);
  const pitch =
    Math.abs(sinp) >= 1
      ? Math.sign(sinp) * (Math.PI / 2) // Use 90 degrees if out of range
      : Math.asin(sinp);

  // Yaw (Z-axis rotation)
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  return [roll, pitch, yaw];
}
