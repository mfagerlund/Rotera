/**
 * Distance Provider
 *
 * Creates a residual provider for distance constraint between two points.
 * Residual: (||p2 - p1|| - target) / target
 */

import { AnalyticalResidualProvider } from '../types';
import { distance_residual_grad } from '../../residuals/gradients/distance-gradient';

/**
 * Creates a provider for distance constraint between two points.
 *
 * @param p1Indices [x, y, z] indices for first point (-1 if locked)
 * @param p2Indices [x, y, z] indices for second point (-1 if locked)
 * @param targetDistance Target distance between points
 * @param getP1 Function to get first point from variables
 * @param getP2 Function to get second point from variables
 */
export function createDistanceProvider(
  p1Indices: readonly [number, number, number],
  p2Indices: readonly [number, number, number],
  targetDistance: number,
  getP1: (variables: Float64Array) => { x: number; y: number; z: number },
  getP2: (variables: Float64Array) => { x: number; y: number; z: number }
): AnalyticalResidualProvider {
  // Build active indices and mapping
  // Order: p1.x, p1.y, p1.z, p2.x, p2.y, p2.z
  const activeIndices: number[] = [];
  const p1Map: [number, number, number] = [-1, -1, -1];
  const p2Map: [number, number, number] = [-1, -1, -1];

  for (let i = 0; i < 3; i++) {
    if (p1Indices[i] >= 0) {
      p1Map[i] = activeIndices.length;
      activeIndices.push(p1Indices[i]);
    }
  }
  for (let i = 0; i < 3; i++) {
    if (p2Indices[i] >= 0) {
      p2Map[i] = activeIndices.length;
      activeIndices.push(p2Indices[i]);
    }
  }

  return {
    variableIndices: activeIndices,

    computeResidual(variables: Float64Array): number {
      const p1 = getP1(variables);
      const p2 = getP2(variables);
      const { value } = distance_residual_grad(p1, p2, targetDistance);
      return value;
    },

    computeGradient(variables: Float64Array): Float64Array {
      const p1 = getP1(variables);
      const p2 = getP2(variables);
      const { dp1, dp2 } = distance_residual_grad(p1, p2, targetDistance);

      const grad = new Float64Array(activeIndices.length);

      // Map p1 gradients
      if (p1Map[0] >= 0) grad[p1Map[0]] = dp1.x;
      if (p1Map[1] >= 0) grad[p1Map[1]] = dp1.y;
      if (p1Map[2] >= 0) grad[p1Map[2]] = dp1.z;

      // Map p2 gradients
      if (p2Map[0] >= 0) grad[p2Map[0]] = dp2.x;
      if (p2Map[1] >= 0) grad[p2Map[1]] = dp2.y;
      if (p2Map[2] >= 0) grad[p2Map[2]] = dp2.z;

      return grad;
    },
  };
}
