/**
 * Quaternion utilities for 3D rotations
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
