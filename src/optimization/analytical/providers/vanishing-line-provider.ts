/**
 * Vanishing Line Provider
 *
 * Creates a residual provider for vanishing line constraint.
 * Constrains camera orientation based on observed vanishing points.
 */

import { AnalyticalResidualProvider } from '../types';
import { vanishing_line_residual_grad } from '../../residuals/gradients/vanishing-line-gradient';

type Point3D = { x: number; y: number; z: number };
type Quaternion = { w: number; x: number; y: number; z: number };

/**
 * Creates a provider for vanishing line constraint (quaternion only, fixed focal).
 *
 * @param quatIndices [w, x, y, z] indices for quaternion
 * @param axis World axis direction (e.g., {x:1, y:0, z:0} for X axis)
 * @param obsU Observed vanishing point U in normalized image coords
 * @param obsV Observed vanishing point V in normalized image coords
 * @param weight Weight for this constraint
 * @param getQuat Function to get quaternion from variables
 */
export function createVanishingLineProvider(
  quatIndices: readonly [number, number, number, number],
  axis: Point3D,
  obsU: number,
  obsV: number,
  weight: number,
  getQuat: (variables: Float64Array) => Quaternion
): AnalyticalResidualProvider {
  // Build active indices
  const activeIndices: number[] = [];
  const quatMap: [number, number, number, number] = [-1, -1, -1, -1];

  for (let i = 0; i < 4; i++) {
    if (quatIndices[i] >= 0) {
      quatMap[i] = activeIndices.length;
      activeIndices.push(quatIndices[i]);
    }
  }

  return {
    variableIndices: activeIndices,

    computeResidual(variables: Float64Array): number {
      const q = getQuat(variables);
      const { value } = vanishing_line_residual_grad(q, axis, obsU, obsV, weight);
      return value;
    },

    computeGradient(variables: Float64Array): Float64Array {
      const q = getQuat(variables);
      const { dq } = vanishing_line_residual_grad(q, axis, obsU, obsV, weight);

      const grad = new Float64Array(activeIndices.length);

      if (quatMap[0] >= 0) grad[quatMap[0]] = dq.w;
      if (quatMap[1] >= 0) grad[quatMap[1]] = dq.x;
      if (quatMap[2] >= 0) grad[quatMap[2]] = dq.y;
      if (quatMap[3] >= 0) grad[quatMap[3]] = dq.z;

      return grad;
    },
  };
}
