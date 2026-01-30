/**
 * Fixed Point Residual Provider
 *
 * Constrains a point to a fixed position.
 * Uses hand-coded gradient from gradient-script.
 */

import type { ResidualWithJacobian } from '../types';

/**
 * Create a fixed point residual provider.
 * Returns 3 residuals (x, y, z components).
 *
 * @param id Unique identifier
 * @param pointIndices Variable indices for point [x, y, z]
 * @param targetXyz Target position [x, y, z]
 */
export function createFixedPointProvider(
  id: string,
  pointIndices: [number, number, number],
  targetXyz: [number, number, number]
): ResidualWithJacobian {
  return {
    id,
    name: `FixedPoint(${targetXyz.map(v => v.toFixed(2)).join(', ')})`,
    residualCount: 3,
    variableIndices: [...pointIndices],

    computeResiduals(variables: number[]): number[] {
      // Simple residual: p - target
      return [
        variables[pointIndices[0]] - targetXyz[0],
        variables[pointIndices[1]] - targetXyz[1],
        variables[pointIndices[2]] - targetXyz[2],
      ];
    },

    computeJacobian(_variables: number[]): number[][] {
      // Jacobian is identity matrix (3x3)
      // Each residual depends on one variable with derivative 1
      return [
        [1, 0, 0], // d(px - tx)/d[px, py, pz]
        [0, 1, 0], // d(py - ty)/d[px, py, pz]
        [0, 0, 1], // d(pz - tz)/d[px, py, pz]
      ];
    },
  };
}
