/**
 * Equal Distances Provider
 *
 * Creates residual providers for equal distance constraint.
 * For N point pairs, creates N-1 residuals: dist[i] - dist[i+1]
 */

import { AnalyticalResidualProvider } from '../types';

type Point3D = { x: number; y: number; z: number };

/**
 * Compute distance and its gradient with respect to both points.
 * Returns raw distance (not normalized by target).
 */
function computeDistanceAndGradient(
  p1: Point3D,
  p2: Point3D
): {
  dist: number;
  dp1: Point3D;
  dp2: Point3D;
} {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Gradient of sqrt(dx^2 + dy^2 + dz^2) w.r.t. p1 and p2
  // d(dist)/d(p1.x) = -dx / dist
  // d(dist)/d(p2.x) = dx / dist
  const invDist = dist > 1e-10 ? 1 / dist : 0;

  return {
    dist,
    dp1: { x: -dx * invDist, y: -dy * invDist, z: -dz * invDist },
    dp2: { x: dx * invDist, y: dy * invDist, z: dz * invDist },
  };
}

interface PointPairInfo {
  p1Indices: readonly [number, number, number];
  p2Indices: readonly [number, number, number];
  getP1: (variables: Float64Array) => Point3D;
  getP2: (variables: Float64Array) => Point3D;
}

/**
 * Creates providers for equal distances constraint.
 * For N point pairs, creates N-1 residuals representing dist[i] - dist[i+1].
 *
 * @param pairs Array of point pair info (indices and getters)
 * @returns Array of providers (one for each consecutive pair difference)
 */
export function createEqualDistancesProviders(
  pairs: PointPairInfo[]
): AnalyticalResidualProvider[] {
  if (pairs.length < 2) {
    return [];
  }

  const providers: AnalyticalResidualProvider[] = [];

  // Create a residual for each consecutive pair: dist[i] - dist[i+1]
  for (let i = 0; i < pairs.length - 1; i++) {
    const pair1 = pairs[i];
    const pair2 = pairs[i + 1];

    // Build active indices for both pairs
    const activeIndices: number[] = [];
    const indexMap = new Map<number, number>(); // global index -> local index

    const addIndex = (idx: number) => {
      if (idx >= 0 && !indexMap.has(idx)) {
        indexMap.set(idx, activeIndices.length);
        activeIndices.push(idx);
      }
    };

    // Add indices from pair 1
    for (let j = 0; j < 3; j++) {
      addIndex(pair1.p1Indices[j]);
      addIndex(pair1.p2Indices[j]);
    }
    // Add indices from pair 2
    for (let j = 0; j < 3; j++) {
      addIndex(pair2.p1Indices[j]);
      addIndex(pair2.p2Indices[j]);
    }

    // Create maps for gradient assignment
    const p1_1Map = pair1.p1Indices.map(idx => idx >= 0 ? indexMap.get(idx)! : -1);
    const p2_1Map = pair1.p2Indices.map(idx => idx >= 0 ? indexMap.get(idx)! : -1);
    const p1_2Map = pair2.p1Indices.map(idx => idx >= 0 ? indexMap.get(idx)! : -1);
    const p2_2Map = pair2.p2Indices.map(idx => idx >= 0 ? indexMap.get(idx)! : -1);

    providers.push({
      variableIndices: activeIndices,

      computeResidual(variables: Float64Array): number {
        const p1_1 = pair1.getP1(variables);
        const p2_1 = pair1.getP2(variables);
        const p1_2 = pair2.getP1(variables);
        const p2_2 = pair2.getP2(variables);

        const { dist: dist1 } = computeDistanceAndGradient(p1_1, p2_1);
        const { dist: dist2 } = computeDistanceAndGradient(p1_2, p2_2);

        return dist1 - dist2;
      },

      computeGradient(variables: Float64Array): Float64Array {
        const p1_1 = pair1.getP1(variables);
        const p2_1 = pair1.getP2(variables);
        const p1_2 = pair2.getP1(variables);
        const p2_2 = pair2.getP2(variables);

        const { dp1: dp1_1, dp2: dp2_1 } = computeDistanceAndGradient(p1_1, p2_1);
        const { dp1: dp1_2, dp2: dp2_2 } = computeDistanceAndGradient(p1_2, p2_2);

        const grad = new Float64Array(activeIndices.length);

        // Gradient of dist1 (positive contribution)
        if (p1_1Map[0] >= 0) grad[p1_1Map[0]] += dp1_1.x;
        if (p1_1Map[1] >= 0) grad[p1_1Map[1]] += dp1_1.y;
        if (p1_1Map[2] >= 0) grad[p1_1Map[2]] += dp1_1.z;
        if (p2_1Map[0] >= 0) grad[p2_1Map[0]] += dp2_1.x;
        if (p2_1Map[1] >= 0) grad[p2_1Map[1]] += dp2_1.y;
        if (p2_1Map[2] >= 0) grad[p2_1Map[2]] += dp2_1.z;

        // Gradient of -dist2 (negative contribution)
        if (p1_2Map[0] >= 0) grad[p1_2Map[0]] -= dp1_2.x;
        if (p1_2Map[1] >= 0) grad[p1_2Map[1]] -= dp1_2.y;
        if (p1_2Map[2] >= 0) grad[p1_2Map[2]] -= dp1_2.z;
        if (p2_2Map[0] >= 0) grad[p2_2Map[0]] -= dp2_2.x;
        if (p2_2Map[1] >= 0) grad[p2_2Map[1]] -= dp2_2.y;
        if (p2_2Map[2] >= 0) grad[p2_2Map[2]] -= dp2_2.z;

        return grad;
      },
    });
  }

  return providers;
}
