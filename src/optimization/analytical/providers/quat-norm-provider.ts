/**
 * Quaternion Norm Provider
 *
 * Creates a residual provider for quaternion normalization constraint.
 * Residual: ||q||² - 1 = w² + x² + y² + z² - 1
 * Gradient: [2w, 2x, 2y, 2z]
 */

import { AnalyticalResidualProvider } from '../types';
import { quat_norm_residual_grad } from '../../residuals/gradients/quat-norm-gradient';

/**
 * Creates a provider for quaternion normalization constraint.
 * Ensures the quaternion stays unit-length during optimization.
 *
 * @param quatIndices [wIndex, xIndex, yIndex, zIndex] in variable array
 * @param getQuat Function to get current quaternion from variables
 */
export function createQuatNormProvider(
  quatIndices: readonly [number, number, number, number],
  getQuat: (variables: Float64Array) => { w: number; x: number; y: number; z: number }
): AnalyticalResidualProvider {
  // Filter out any locked indices (though quaternions are typically all-or-nothing)
  const activeIndices: number[] = [];
  const indexMap: number[] = []; // Maps gradient index to activeIndices position

  for (let i = 0; i < 4; i++) {
    if (quatIndices[i] >= 0) {
      indexMap[i] = activeIndices.length;
      activeIndices.push(quatIndices[i]);
    } else {
      indexMap[i] = -1;
    }
  }

  return {
    variableIndices: activeIndices,

    computeResidual(variables: Float64Array): number {
      const q = getQuat(variables);
      const { value } = quat_norm_residual_grad(q);
      return value;
    },

    computeGradient(variables: Float64Array): Float64Array {
      const q = getQuat(variables);
      const { dq } = quat_norm_residual_grad(q);

      // Map gradients to active indices only
      const grad = new Float64Array(activeIndices.length);
      if (indexMap[0] >= 0) grad[indexMap[0]] = dq.w;
      if (indexMap[1] >= 0) grad[indexMap[1]] = dq.x;
      if (indexMap[2] >= 0) grad[indexMap[2]] = dq.y;
      if (indexMap[3] >= 0) grad[indexMap[3]] = dq.z;

      return grad;
    },
  };
}
