/**
 * Object-type quaternion rotation for analytical providers.
 *
 * Uses the GENERAL formula (works for non-unit quaternions):
 * v' = 2*(q_vec . v)*q_vec + (w^2 - |q_vec|^2)*v + 2*w*(q_vec x v)
 *
 * This differs from the number[] version in src/utils/quaternion.ts which
 * uses the unit-quaternion-only formula.
 */

type Point3D = { x: number; y: number; z: number };
type Quaternion = { w: number; x: number; y: number; z: number };

/**
 * Rotate a vector by a quaternion: v' = q * v * q*
 * Uses the general formula (works for non-unit quaternions).
 */
export function quatRotate(q: Quaternion, v: Point3D): Point3D {
  const { w, x: qx, y: qy, z: qz } = q;

  // q_vec . v (dot product)
  const dot = qx * v.x + qy * v.y + qz * v.z;

  // |q_vec|^2 (squared magnitude of vector part)
  const qVecSq = qx * qx + qy * qy + qz * qz;

  // w^2 - |q_vec|^2
  const wSqMinusQVecSq = w * w - qVecSq;

  // q_vec x v (cross product)
  const cx = qy * v.z - qz * v.y;
  const cy = qz * v.x - qx * v.z;
  const cz = qx * v.y - qy * v.x;

  // v' = 2*(q_vec . v)*q_vec + (w^2 - |q_vec|^2)*v + 2*w*(q_vec x v)
  return {
    x: 2 * dot * qx + wSqMinusQVecSq * v.x + 2 * w * cx,
    y: 2 * dot * qy + wSqMinusQVecSq * v.y + 2 * w * cy,
    z: 2 * dot * qz + wSqMinusQVecSq * v.z + 2 * w * cz,
  };
}
