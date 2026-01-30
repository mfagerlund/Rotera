/**
 * Equal Distances Residual Provider
 *
 * Constrains multiple point pairs to have equal distances.
 * Residual: dist1 - dist2 = 0 (for each pair after the first)
 */

import type { ResidualWithJacobian } from '../types';

type Idx3 = [number, number, number];

/**
 * Create an equal distances residual provider.
 * For n distance pairs, returns n-1 residuals.
 *
 * @param id Unique identifier
 * @param pairs Array of point pair indices [[p1A, p1B], [p2A, p2B], ...]
 */
export function createEqualDistancesProvider(
  id: string,
  pairs: Array<[Idx3, Idx3]>
): ResidualWithJacobian | null {
  if (pairs.length < 2) return null;

  // Collect all unique variable indices
  const allIndices: number[] = [];
  for (const [pA, pB] of pairs) {
    allIndices.push(...pA, ...pB);
  }

  const residualCount = pairs.length - 1;

  return {
    id,
    name: 'EqualDistances',
    residualCount,
    variableIndices: allIndices,

    computeResiduals(variables: number[]): number[] {
      const distances: number[] = [];

      for (const [pA, pB] of pairs) {
        const dx = variables[pB[0]] - variables[pA[0]];
        const dy = variables[pB[1]] - variables[pA[1]];
        const dz = variables[pB[2]] - variables[pA[2]];
        distances.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
      }

      // Each residual is dist[i+1] - dist[0]
      // (compare all to the first distance)
      const residuals: number[] = [];
      const refDist = distances[0];

      for (let i = 1; i < distances.length; i++) {
        residuals.push(distances[i] - refDist);
      }

      return residuals;
    },

    computeJacobian(variables: number[]): number[][] {
      const jacobian: number[][] = [];

      // Compute distances and their gradients
      const distances: number[] = [];
      const gradients: Array<{ dpA: { x: number; y: number; z: number }; dpB: { x: number; y: number; z: number } }> = [];

      for (const [pA, pB] of pairs) {
        const dx = variables[pB[0]] - variables[pA[0]];
        const dy = variables[pB[1]] - variables[pA[1]];
        const dz = variables[pB[2]] - variables[pA[2]];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        distances.push(dist);

        if (dist < 1e-10) {
          gradients.push({
            dpA: { x: 0, y: 0, z: 0 },
            dpB: { x: 0, y: 0, z: 0 },
          });
        } else {
          const invDist = 1 / dist;
          gradients.push({
            dpA: { x: -dx * invDist, y: -dy * invDist, z: -dz * invDist },
            dpB: { x: dx * invDist, y: dy * invDist, z: dz * invDist },
          });
        }
      }

      // Build jacobian for each residual r_i = dist[i+1] - dist[0]
      for (let i = 1; i < pairs.length; i++) {
        const row = new Array(allIndices.length).fill(0);

        // Gradient from dist[0] (reference)
        const refGrad = gradients[0];
        const refPair = pairs[0];
        const refAOffset = 0;
        const refBOffset = 3;
        row[refAOffset + 0] = -refGrad.dpA.x;
        row[refAOffset + 1] = -refGrad.dpA.y;
        row[refAOffset + 2] = -refGrad.dpA.z;
        row[refBOffset + 0] = -refGrad.dpB.x;
        row[refBOffset + 1] = -refGrad.dpB.y;
        row[refBOffset + 2] = -refGrad.dpB.z;

        // Gradient from dist[i]
        const curGrad = gradients[i];
        const curOffset = i * 6; // Each pair adds 6 indices
        row[curOffset + 0] = curGrad.dpA.x;
        row[curOffset + 1] = curGrad.dpA.y;
        row[curOffset + 2] = curGrad.dpA.z;
        row[curOffset + 3] = curGrad.dpB.x;
        row[curOffset + 4] = curGrad.dpB.y;
        row[curOffset + 5] = curGrad.dpB.z;

        jacobian.push(row);
      }

      return jacobian;
    },
  };
}
