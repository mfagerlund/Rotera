/**
 * Quaternion Normalization Residual Provider
 *
 * Ensures quaternion stays normalized during optimization.
 * Uses hand-coded gradient from gradient-script.
 */

import type { ResidualWithJacobian } from '../types';
import { quat_norm_residual, quat_norm_residual_grad } from '../../residuals/gradients/quat-norm-gradient';

/**
 * Create a quaternion normalization residual provider.
 *
 * @param id Unique identifier
 * @param quatIndices Variable indices for quaternion [w, x, y, z]
 */
export function createQuatNormProvider(
  id: string,
  quatIndices: [number, number, number, number]
): ResidualWithJacobian {
  return {
    id,
    name: 'QuatNorm',
    residualCount: 1,
    variableIndices: [...quatIndices],

    computeResiduals(variables: number[]): number[] {
      const q = {
        w: variables[quatIndices[0]],
        x: variables[quatIndices[1]],
        y: variables[quatIndices[2]],
        z: variables[quatIndices[3]],
      };

      const residual = quat_norm_residual(q);
      return [residual];
    },

    computeJacobian(variables: number[]): number[][] {
      const q = {
        w: variables[quatIndices[0]],
        x: variables[quatIndices[1]],
        y: variables[quatIndices[2]],
        z: variables[quatIndices[3]],
      };

      const { dq } = quat_norm_residual_grad(q);

      // Jacobian row: [dq.w, dq.x, dq.y, dq.z]
      return [[dq.w, dq.x, dq.y, dq.z]];
    },
  };
}
