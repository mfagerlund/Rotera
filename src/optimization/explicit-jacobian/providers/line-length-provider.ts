/**
 * Line Length Residual Provider
 *
 * Constrains the length of a line (distance between two points).
 * Uses hand-coded gradient from gradient-script.
 */

import type { ResidualWithJacobian } from '../types';
import { distance_residual, distance_residual_grad } from '../../residuals/gradients/distance-gradient';

/** Scale factor for line length residuals to match pixel-scale errors */
const LINE_LENGTH_SCALE = 100;

/**
 * Create a line length residual provider.
 *
 * @param id Unique identifier
 * @param pointAIndices Variable indices for point A [x, y, z]
 * @param pointBIndices Variable indices for point B [x, y, z]
 * @param targetLength Target length of the line
 */
export function createLineLengthProvider(
  id: string,
  pointAIndices: [number, number, number],
  pointBIndices: [number, number, number],
  targetLength: number
): ResidualWithJacobian {
  const variableIndices = [...pointAIndices, ...pointBIndices];

  return {
    id,
    name: `LineLength(${targetLength.toFixed(2)})`,
    residualCount: 1,
    variableIndices,

    computeResiduals(variables: number[]): number[] {
      const pA = {
        x: variables[pointAIndices[0]],
        y: variables[pointAIndices[1]],
        z: variables[pointAIndices[2]],
      };
      const pB = {
        x: variables[pointBIndices[0]],
        y: variables[pointBIndices[1]],
        z: variables[pointBIndices[2]],
      };

      const residual = distance_residual(pA, pB, targetLength);
      return [residual * LINE_LENGTH_SCALE];
    },

    computeJacobian(variables: number[]): number[][] {
      const pA = {
        x: variables[pointAIndices[0]],
        y: variables[pointAIndices[1]],
        z: variables[pointAIndices[2]],
      };
      const pB = {
        x: variables[pointBIndices[0]],
        y: variables[pointBIndices[1]],
        z: variables[pointBIndices[2]],
      };

      const { dp1, dp2 } = distance_residual_grad(pA, pB, targetLength);

      // Scale the Jacobian to match scaled residual
      return [[
        dp1.x * LINE_LENGTH_SCALE,
        dp1.y * LINE_LENGTH_SCALE,
        dp1.z * LINE_LENGTH_SCALE,
        dp2.x * LINE_LENGTH_SCALE,
        dp2.y * LINE_LENGTH_SCALE,
        dp2.z * LINE_LENGTH_SCALE,
      ]];
    },
  };
}
