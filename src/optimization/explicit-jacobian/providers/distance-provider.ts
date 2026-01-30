/**
 * Distance Constraint Residual Provider
 *
 * Uses hand-coded gradient from gradient-script.
 */

import type { ResidualWithJacobian } from '../types';
import { distance_residual, distance_residual_grad } from '../../residuals/gradients/distance-gradient';

/**
 * Create a distance constraint residual provider.
 *
 * @param id Unique identifier
 * @param p1Indices Variable indices for point 1 [x, y, z]
 * @param p2Indices Variable indices for point 2 [x, y, z]
 * @param targetDistance Target distance between points
 */
export function createDistanceProvider(
  id: string,
  p1Indices: [number, number, number],
  p2Indices: [number, number, number],
  targetDistance: number
): ResidualWithJacobian {
  // All 6 variable indices
  const variableIndices = [...p1Indices, ...p2Indices];

  return {
    id,
    name: `Distance(${targetDistance.toFixed(2)})`,
    residualCount: 1,
    variableIndices,

    computeResiduals(variables: number[]): number[] {
      const p1 = {
        x: variables[p1Indices[0]],
        y: variables[p1Indices[1]],
        z: variables[p1Indices[2]],
      };
      const p2 = {
        x: variables[p2Indices[0]],
        y: variables[p2Indices[1]],
        z: variables[p2Indices[2]],
      };

      const residual = distance_residual(p1, p2, targetDistance);
      return [residual];
    },

    computeJacobian(variables: number[]): number[][] {
      const p1 = {
        x: variables[p1Indices[0]],
        y: variables[p1Indices[1]],
        z: variables[p1Indices[2]],
      };
      const p2 = {
        x: variables[p2Indices[0]],
        y: variables[p2Indices[1]],
        z: variables[p2Indices[2]],
      };

      const { dp1, dp2 } = distance_residual_grad(p1, p2, targetDistance);

      // Jacobian row: [dp1.x, dp1.y, dp1.z, dp2.x, dp2.y, dp2.z]
      return [[dp1.x, dp1.y, dp1.z, dp2.x, dp2.y, dp2.z]];
    },
  };
}
