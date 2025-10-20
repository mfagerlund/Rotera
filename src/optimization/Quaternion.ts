import { V, Vec3 } from 'scalar-autograd';
import { Value } from 'scalar-autograd';
import { Vec4 } from './Vec4';

/**
 * Quaternion operations for 3D rotations.
 *
 * Quaternion representation: q = (w, x, y, z) where w is the scalar part.
 * For rotations, quaternions must be unit quaternions (|q| = 1).
 *
 * Advantages over Euler angles:
 * - No gimbal lock
 * - Smooth interpolation
 * - Better numerical stability for optimization
 */
export class Quaternion {
  /**
   * Multiply two quaternions (compose rotations).
   * q1 * q2 applies q2 first, then q1.
   *
   * Formula:
   * w = w1*w2 - x1*x2 - y1*y2 - z1*z2
   * x = w1*x2 + x1*w2 + y1*z2 - z1*y2
   * y = w1*y2 - x1*z2 + y1*w2 + z1*x2
   * z = w1*z2 + x1*y2 - y1*x2 + z1*w2
   */
  static multiply(q1: Vec4, q2: Vec4): Vec4 {
    const w = V.sub(
      V.sub(
        V.sub(V.mul(q1.w, q2.w), V.mul(q1.x, q2.x)),
        V.mul(q1.y, q2.y)
      ),
      V.mul(q1.z, q2.z)
    );

    const x = V.sub(
      V.add(
        V.add(V.mul(q1.w, q2.x), V.mul(q1.x, q2.w)),
        V.mul(q1.y, q2.z)
      ),
      V.mul(q1.z, q2.y)
    );

    const y = V.add(
      V.sub(
        V.add(V.mul(q1.w, q2.y), V.mul(q1.y, q2.w)),
        V.mul(q1.x, q2.z)
      ),
      V.mul(q1.z, q2.x)
    );

    const z = V.sub(
      V.add(
        V.add(V.mul(q1.w, q2.z), V.mul(q1.z, q2.w)),
        V.mul(q1.x, q2.y)
      ),
      V.mul(q1.y, q2.x)
    );

    return new Vec4(w, x, y, z);
  }

  /**
   * Quaternion conjugate (inverse for unit quaternions).
   * q* = (w, -x, -y, -z)
   */
  static conjugate(q: Vec4): Vec4 {
    return new Vec4(q.w, V.neg(q.x), V.neg(q.y), V.neg(q.z));
  }

  /**
   * Rotate a 3D vector by a quaternion.
   * v' = q * v * q*
   *
   * This is the fundamental operation for camera projection.
   * Rotates vector v by the rotation represented by quaternion q.
   */
  static rotateVector(q: Vec4, v: Vec3): Vec3 {
    // Convert vector to quaternion (w=0, x=v.x, y=v.y, z=v.z)
    const vQuat = new Vec4(V.C(0), v.x, v.y, v.z);

    // q * v * q*
    const qConj = Quaternion.conjugate(q);
    const temp = Quaternion.multiply(q, vQuat);
    const result = Quaternion.multiply(temp, qConj);

    // Extract vector part (ignore w, which should be ~0)
    return new Vec3(result.x, result.y, result.z);
  }

  /**
   * Create quaternion from Euler angles (roll, pitch, yaw) in radians.
   * Using ZYX (yaw-pitch-roll) convention.
   *
   * @param roll - Rotation around X axis (radians)
   * @param pitch - Rotation around Y axis (radians)
   * @param yaw - Rotation around Z axis (radians)
   */
  static fromEuler(roll: number, pitch: number, yaw: number): Vec4 {
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

    return Vec4.C(w, x, y, z);
  }

  /**
   * Convert quaternion to Euler angles (roll, pitch, yaw) in radians.
   * Using ZYX (yaw-pitch-roll) convention.
   *
   * @returns [roll, pitch, yaw] in radians
   */
  static toEuler(q: Vec4): [number, number, number] {
    const w = q.w.data;
    const x = q.x.data;
    const y = q.y.data;
    const z = q.z.data;

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

  /**
   * Create quaternion from axis-angle representation.
   *
   * @param axis - Rotation axis (should be normalized)
   * @param angle - Rotation angle in radians
   */
  static fromAxisAngle(axis: Vec3, angle: Value | number): Vec4 {
    const halfAngle = V.div(angle, 2);
    const sinHalf = V.sin(halfAngle);
    const cosHalf = V.cos(halfAngle);

    return new Vec4(
      cosHalf,
      V.mul(axis.x, sinHalf),
      V.mul(axis.y, sinHalf),
      V.mul(axis.z, sinHalf)
    );
  }

  /**
   * Spherical linear interpolation between two quaternions.
   * Provides smooth rotation interpolation.
   *
   * Note: This implementation always uses spherical interpolation.
   * For production use, consider adding linear interpolation fallback
   * when quaternions are very close (dot > 0.9995).
   */
  static slerp(q1: Vec4, q2: Vec4, t: Value | number): Vec4 {
    // Compute cosine of angle between quaternions
    let dot = Vec4.dot(q1, q2);

    // If dot < 0, negate q2 to take shorter path
    // We do this check at data level since we don't have conditional ops in autodiff
    const dotData = dot.data;
    const flipSign = dotData < 0 ? -1 : 1;

    const q2Adjusted = new Vec4(
      V.mul(q2.w, flipSign),
      V.mul(q2.x, flipSign),
      V.mul(q2.y, flipSign),
      V.mul(q2.z, flipSign)
    );

    dot = Vec4.dot(q1, q2Adjusted);

    // Spherical interpolation
    const angle = V.acos(V.clamp(dot, -1, 1));
    const sinAngle = V.sin(angle);
    const ratio1 = V.div(V.sin(V.mul(V.sub(1, t), angle)), sinAngle);
    const ratio2 = V.div(V.sin(V.mul(t, angle)), sinAngle);
    const slerpResult = q1.mul(ratio1).add(q2Adjusted.mul(ratio2));

    return slerpResult.normalized;
  }

  /**
   * Create identity quaternion (no rotation).
   */
  static identity(): Vec4 {
    return Vec4.identity();
  }

  /**
   * Inverse of a quaternion (same as conjugate for unit quaternions).
   */
  static inverse(q: Vec4): Vec4 {
    const magSq = q.sqrMagnitude;
    const conj = Quaternion.conjugate(q);
    return conj.div(magSq);
  }
}
