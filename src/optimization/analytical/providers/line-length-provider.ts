/**
 * Line Length Provider
 *
 * Creates a residual provider for line length constraint.
 * Residual: scale * (||pB - pA|| - targetLength)
 */

import { AnalyticalResidualProvider } from '../types';
import { line_length_grad } from '../../residuals/gradients/line-length-gradient';

/**
 * Creates a provider for line length constraint.
 *
 * @param pAIndices [x, y, z] indices for point A (-1 if locked)
 * @param pBIndices [x, y, z] indices for point B (-1 if locked)
 * @param targetLength Target length of the line
 * @param scale Scale factor for the residual (typically 1/targetLength for normalization)
 * @param getPA Function to get point A from variables
 * @param getPB Function to get point B from variables
 */
export function createLineLengthProvider(
  pAIndices: readonly [number, number, number],
  pBIndices: readonly [number, number, number],
  targetLength: number,
  scale: number,
  getPA: (variables: Float64Array) => { x: number; y: number; z: number },
  getPB: (variables: Float64Array) => { x: number; y: number; z: number }
): AnalyticalResidualProvider {
  // Build active indices and mapping
  const activeIndices: number[] = [];
  const pAMap: [number, number, number] = [-1, -1, -1];
  const pBMap: [number, number, number] = [-1, -1, -1];

  for (let i = 0; i < 3; i++) {
    if (pAIndices[i] >= 0) {
      pAMap[i] = activeIndices.length;
      activeIndices.push(pAIndices[i]);
    }
  }
  for (let i = 0; i < 3; i++) {
    if (pBIndices[i] >= 0) {
      pBMap[i] = activeIndices.length;
      activeIndices.push(pBIndices[i]);
    }
  }

  return {
    variableIndices: activeIndices,

    computeResidual(variables: Float64Array): number {
      const pA = getPA(variables);
      const pB = getPB(variables);
      const { value } = line_length_grad(pA, pB, targetLength, scale);
      return value;
    },

    computeGradient(variables: Float64Array): Float64Array {
      const pA = getPA(variables);
      const pB = getPB(variables);
      const { dpA, dpB } = line_length_grad(pA, pB, targetLength, scale);

      const grad = new Float64Array(activeIndices.length);

      if (pAMap[0] >= 0) grad[pAMap[0]] = dpA.x;
      if (pAMap[1] >= 0) grad[pAMap[1]] = dpA.y;
      if (pAMap[2] >= 0) grad[pAMap[2]] = dpA.z;

      if (pBMap[0] >= 0) grad[pBMap[0]] = dpB.x;
      if (pBMap[1] >= 0) grad[pBMap[1]] = dpB.y;
      if (pBMap[2] >= 0) grad[pBMap[2]] = dpB.z;

      return grad;
    },
  };
}
