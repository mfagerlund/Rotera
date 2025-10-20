import { V, Value } from 'scalar-autograd';
import type { Vec4 } from 'scalar-autograd';

/**
 * Quaternion normalization residual.
 *
 * Enforces that a quaternion remains unit length: |q|² = 1
 * This is crucial for rotation quaternions during optimization.
 *
 * Residual: |q|² - 1 = 0
 *
 * Note: For efficiency, we use the squared magnitude to avoid sqrt.
 * The residual is: w² + x² + y² + z² - 1
 */
export function quaternionNormalizationResidual(q: Vec4): Value {
  // |q|² - 1
  return V.sub(q.sqrMagnitude, 1);
}

/**
 * Soft quaternion normalization residual with configurable strength.
 *
 * Useful when you want the quaternion to be approximately unit length
 * but allow some flexibility during optimization.
 *
 * @param q - The quaternion to normalize
 * @param weight - How strongly to enforce normalization (default: 1.0)
 * @returns Weighted residual: weight * (|q|² - 1)
 */
export function softQuaternionNormalizationResidual(
  q: Vec4,
  weight: number = 1.0
): Value {
  const residual = quaternionNormalizationResidual(q);
  return V.mul(residual, weight);
}

/**
 * Alternative: L2 normalization residual
 *
 * Instead of enforcing |q|² = 1, this encourages the quaternion
 * to stay near unit length by penalizing deviations.
 *
 * Residual: (|q|² - 1)²
 * This creates a softer constraint that's less sensitive to small deviations.
 */
export function quaternionNormalizationPenalty(q: Vec4): Value {
  const deviation = quaternionNormalizationResidual(q);
  return V.square(deviation);
}
