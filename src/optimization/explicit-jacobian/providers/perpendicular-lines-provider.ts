/**
 * Perpendicular Lines Residual Provider
 *
 * Constrains two lines to be perpendicular using dot product = 0.
 * For lines L1 = (A1, B1) and L2 = (A2, B2), the directions are:
 *   dir1 = B1 - A1
 *   dir2 = B2 - A2
 * Perpendicular means dot(dir1, dir2) = 0
 */

import type { ResidualWithJacobian } from '../types';

type Idx3 = [number, number, number];

/**
 * Create a perpendicular lines residual provider.
 * Returns 1 residual (normalized dot product).
 *
 * @param id Unique identifier
 * @param line1AIndices Variable indices for line 1 point A [x, y, z]
 * @param line1BIndices Variable indices for line 1 point B [x, y, z]
 * @param line2AIndices Variable indices for line 2 point A [x, y, z]
 * @param line2BIndices Variable indices for line 2 point B [x, y, z]
 */
export function createPerpendicularLinesProvider(
  id: string,
  line1AIndices: Idx3,
  line1BIndices: Idx3,
  line2AIndices: Idx3,
  line2BIndices: Idx3
): ResidualWithJacobian {
  const variableIndices = [
    ...line1AIndices,
    ...line1BIndices,
    ...line2AIndices,
    ...line2BIndices,
  ];

  return {
    id,
    name: 'PerpendicularLines',
    residualCount: 1,
    variableIndices,

    computeResiduals(variables: number[]): number[] {
      // Direction vectors
      const d1x = variables[line1BIndices[0]] - variables[line1AIndices[0]];
      const d1y = variables[line1BIndices[1]] - variables[line1AIndices[1]];
      const d1z = variables[line1BIndices[2]] - variables[line1AIndices[2]];

      const d2x = variables[line2BIndices[0]] - variables[line2AIndices[0]];
      const d2y = variables[line2BIndices[1]] - variables[line2AIndices[1]];
      const d2z = variables[line2BIndices[2]] - variables[line2AIndices[2]];

      // Dot product
      const dot = d1x * d2x + d1y * d2y + d1z * d2z;

      // Normalize by line lengths to avoid scale issues
      const len1 = Math.sqrt(d1x * d1x + d1y * d1y + d1z * d1z);
      const len2 = Math.sqrt(d2x * d2x + d2y * d2y + d2z * d2z);
      const scale = len1 * len2;

      if (scale < 1e-10) return [0];

      return [dot / scale];
    },

    computeJacobian(variables: number[]): number[][] {
      // Direction vectors
      const d1x = variables[line1BIndices[0]] - variables[line1AIndices[0]];
      const d1y = variables[line1BIndices[1]] - variables[line1AIndices[1]];
      const d1z = variables[line1BIndices[2]] - variables[line1AIndices[2]];

      const d2x = variables[line2BIndices[0]] - variables[line2AIndices[0]];
      const d2y = variables[line2BIndices[1]] - variables[line2AIndices[1]];
      const d2z = variables[line2BIndices[2]] - variables[line2AIndices[2]];

      const len1Sq = d1x * d1x + d1y * d1y + d1z * d1z;
      const len2Sq = d2x * d2x + d2y * d2y + d2z * d2z;
      const len1 = Math.sqrt(len1Sq);
      const len2 = Math.sqrt(len2Sq);
      const scale = len1 * len2;

      if (scale < 1e-10) {
        return [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
      }

      const dot = d1x * d2x + d1y * d2y + d1z * d2z;
      const invScale = 1 / scale;

      // r = dot / (len1 * len2)
      // dr/dd1x = (d2x - dot * d1x / len1^2) / (len1 * len2)
      // dr/dd2x = (d1x - dot * d2x / len2^2) / (len1 * len2)
      const dotOverLen1Sq = dot / len1Sq;
      const dotOverLen2Sq = dot / len2Sq;

      // Derivatives w.r.t. d1 components
      const drdd1x = (d2x - dotOverLen1Sq * d1x) * invScale;
      const drdd1y = (d2y - dotOverLen1Sq * d1y) * invScale;
      const drdd1z = (d2z - dotOverLen1Sq * d1z) * invScale;

      // Derivatives w.r.t. d2 components
      const drdd2x = (d1x - dotOverLen2Sq * d2x) * invScale;
      const drdd2y = (d1y - dotOverLen2Sq * d2y) * invScale;
      const drdd2z = (d1z - dotOverLen2Sq * d2z) * invScale;

      // Since d1 = B1 - A1: dA1 = -dr/dd1, dB1 = +dr/dd1
      // Since d2 = B2 - A2: dA2 = -dr/dd2, dB2 = +dr/dd2
      // Jacobian columns: [A1x, A1y, A1z, B1x, B1y, B1z, A2x, A2y, A2z, B2x, B2y, B2z]
      const row = [
        -drdd1x, // dA1x
        -drdd1y, // dA1y
        -drdd1z, // dA1z
        drdd1x, // dB1x
        drdd1y, // dB1y
        drdd1z, // dB1z
        -drdd2x, // dA2x
        -drdd2y, // dA2y
        -drdd2z, // dA2z
        drdd2x, // dB2x
        drdd2y, // dB2y
        drdd2z, // dB2z
      ];

      return [row];
    },
  };
}
