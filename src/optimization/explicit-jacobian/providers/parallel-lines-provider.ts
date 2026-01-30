/**
 * Parallel Lines Residual Provider
 *
 * Constrains two lines to be parallel using cross product = 0.
 * For lines L1 = (A1, B1) and L2 = (A2, B2), the directions are:
 *   dir1 = B1 - A1
 *   dir2 = B2 - A2
 * Parallel means cross(dir1, dir2) = [0, 0, 0]
 */

import type { ResidualWithJacobian } from '../types';

type Idx3 = [number, number, number];

/**
 * Create a parallel lines residual provider.
 * Returns 3 residuals (cross product x, y, z components).
 *
 * @param id Unique identifier
 * @param line1AIndices Variable indices for line 1 point A [x, y, z]
 * @param line1BIndices Variable indices for line 1 point B [x, y, z]
 * @param line2AIndices Variable indices for line 2 point A [x, y, z]
 * @param line2BIndices Variable indices for line 2 point B [x, y, z]
 */
export function createParallelLinesProvider(
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
    name: 'ParallelLines',
    residualCount: 3,
    variableIndices,

    computeResiduals(variables: number[]): number[] {
      // Direction vectors
      const d1x = variables[line1BIndices[0]] - variables[line1AIndices[0]];
      const d1y = variables[line1BIndices[1]] - variables[line1AIndices[1]];
      const d1z = variables[line1BIndices[2]] - variables[line1AIndices[2]];

      const d2x = variables[line2BIndices[0]] - variables[line2AIndices[0]];
      const d2y = variables[line2BIndices[1]] - variables[line2AIndices[1]];
      const d2z = variables[line2BIndices[2]] - variables[line2AIndices[2]];

      // Cross product: d1 x d2
      const cx = d1y * d2z - d1z * d2y;
      const cy = d1z * d2x - d1x * d2z;
      const cz = d1x * d2y - d1y * d2x;

      // Normalize by line lengths to avoid scale issues
      const len1 = Math.sqrt(d1x * d1x + d1y * d1y + d1z * d1z);
      const len2 = Math.sqrt(d2x * d2x + d2y * d2y + d2z * d2z);
      const scale = len1 * len2;

      if (scale < 1e-10) return [0, 0, 0];

      return [cx / scale, cy / scale, cz / scale];
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
        return [
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ];
      }

      // Cross product components
      const cx = d1y * d2z - d1z * d2y;
      const cy = d1z * d2x - d1x * d2z;
      const cz = d1x * d2y - d1y * d2x;

      const invScale = 1 / scale;
      const invLen1Sq = 1 / len1Sq;
      const invLen2Sq = 1 / len2Sq;

      // For rx = cx / scale where cx = d1y*d2z - d1z*d2y:
      // drx/dd1x = (0 - cx * d1x/len1^2) / scale = -cx * d1x / (len1^2 * scale)
      // drx/dd1y = (d2z - cx * d1y/len1^2) / scale
      // drx/dd1z = (-d2y - cx * d1z/len1^2) / scale
      // drx/dd2x = (0 - cx * d2x/len2^2) / scale = -cx * d2x / (len2^2 * scale)
      // drx/dd2y = (-d1z - cx * d2y/len2^2) / scale
      // drx/dd2z = (d1y - cx * d2z/len2^2) / scale

      // Row for rx = cx / scale:
      const drxdd1x = -cx * d1x * invLen1Sq * invScale;
      const drxdd1y = (d2z - cx * d1y * invLen1Sq) * invScale;
      const drxdd1z = (-d2y - cx * d1z * invLen1Sq) * invScale;
      const drxdd2x = -cx * d2x * invLen2Sq * invScale;
      const drxdd2y = (-d1z - cx * d2y * invLen2Sq) * invScale;
      const drxdd2z = (d1y - cx * d2z * invLen2Sq) * invScale;

      // Row for ry = cy / scale where cy = d1z*d2x - d1x*d2z:
      // dry/dd1x = (-d2z - cy * d1x/len1^2) / scale
      // dry/dd1y = (0 - cy * d1y/len1^2) / scale
      // dry/dd1z = (d2x - cy * d1z/len1^2) / scale
      // dry/dd2x = (d1z - cy * d2x/len2^2) / scale
      // dry/dd2y = (0 - cy * d2y/len2^2) / scale
      // dry/dd2z = (-d1x - cy * d2z/len2^2) / scale
      const drydd1x = (-d2z - cy * d1x * invLen1Sq) * invScale;
      const drydd1y = -cy * d1y * invLen1Sq * invScale;
      const drydd1z = (d2x - cy * d1z * invLen1Sq) * invScale;
      const drydd2x = (d1z - cy * d2x * invLen2Sq) * invScale;
      const drydd2y = -cy * d2y * invLen2Sq * invScale;
      const drydd2z = (-d1x - cy * d2z * invLen2Sq) * invScale;

      // Row for rz = cz / scale where cz = d1x*d2y - d1y*d2x:
      // drz/dd1x = (d2y - cz * d1x/len1^2) / scale
      // drz/dd1y = (-d2x - cz * d1y/len1^2) / scale
      // drz/dd1z = (0 - cz * d1z/len1^2) / scale
      // drz/dd2x = (-d1y - cz * d2x/len2^2) / scale
      // drz/dd2y = (d1x - cz * d2y/len2^2) / scale
      // drz/dd2z = (0 - cz * d2z/len2^2) / scale
      const drzdd1x = (d2y - cz * d1x * invLen1Sq) * invScale;
      const drzdd1y = (-d2x - cz * d1y * invLen1Sq) * invScale;
      const drzdd1z = -cz * d1z * invLen1Sq * invScale;
      const drzdd2x = (-d1y - cz * d2x * invLen2Sq) * invScale;
      const drzdd2y = (d1x - cz * d2y * invLen2Sq) * invScale;
      const drzdd2z = -cz * d2z * invLen2Sq * invScale;

      // Since d1 = B1 - A1: dA1 = -dr/dd1, dB1 = +dr/dd1
      // Since d2 = B2 - A2: dA2 = -dr/dd2, dB2 = +dr/dd2
      // Jacobian columns: [A1x, A1y, A1z, B1x, B1y, B1z, A2x, A2y, A2z, B2x, B2y, B2z]

      const rowX = [
        -drxdd1x, -drxdd1y, -drxdd1z, // dA1
        drxdd1x, drxdd1y, drxdd1z,     // dB1
        -drxdd2x, -drxdd2y, -drxdd2z, // dA2
        drxdd2x, drxdd2y, drxdd2z,     // dB2
      ];

      const rowY = [
        -drydd1x, -drydd1y, -drydd1z,
        drydd1x, drydd1y, drydd1z,
        -drydd2x, -drydd2y, -drydd2z,
        drydd2x, drydd2y, drydd2z,
      ];

      const rowZ = [
        -drzdd1x, -drzdd1y, -drzdd1z,
        drzdd1x, drzdd1y, drzdd1z,
        -drzdd2x, -drzdd2y, -drzdd2z,
        drzdd2x, drzdd2y, drzdd2z,
      ];

      return [rowX, rowY, rowZ];
    },
  };
}
