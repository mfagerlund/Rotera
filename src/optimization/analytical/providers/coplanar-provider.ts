/**
 * Coplanar Provider
 *
 * Creates residual providers for coplanar constraint using point-to-plane distance.
 * Uses rotating base triangles for better numerical stability.
 *
 * For N points [p0, p1, p2, p3, p4, p5, ...]:
 *   Residual 0: point_to_plane_distance(p0, p1, p2, p3)  // p3 vs plane(0,1,2)
 *   Residual 1: point_to_plane_distance(p1, p2, p3, p4)  // p4 vs plane(1,2,3)
 *   Residual 2: point_to_plane_distance(p2, p3, p4, p5)  // p5 vs plane(2,3,4)
 *   ...
 *
 * Each residual's gradient affects 4 points (3 plane-defining + 1 test point).
 */

import { AnalyticalResidualProvider } from '../types';
import { point_to_plane_distance_grad } from '../../residuals/gradients/point-to-plane-distance-gradient';

type Point3D = { x: number; y: number; z: number };

/**
 * Creates a single coplanar residual provider for one point-to-plane test.
 *
 * @param aIndices [x, y, z] indices for first plane point (-1 if locked)
 * @param bIndices [x, y, z] indices for second plane point (-1 if locked)
 * @param cIndices [x, y, z] indices for third plane point (-1 if locked)
 * @param pIndices [x, y, z] indices for test point (-1 if locked)
 * @param getA..getP Functions to get points from variables
 */
export function createCoplanarProvider(
  aIndices: readonly [number, number, number],
  bIndices: readonly [number, number, number],
  cIndices: readonly [number, number, number],
  pIndices: readonly [number, number, number],
  getA: (variables: Float64Array) => Point3D,
  getB: (variables: Float64Array) => Point3D,
  getC: (variables: Float64Array) => Point3D,
  getP: (variables: Float64Array) => Point3D
): AnalyticalResidualProvider {
  // Build active indices
  const activeIndices: number[] = [];
  const aMap: [number, number, number] = [-1, -1, -1];
  const bMap: [number, number, number] = [-1, -1, -1];
  const cMap: [number, number, number] = [-1, -1, -1];
  const pMap: [number, number, number] = [-1, -1, -1];

  const maps = [aMap, bMap, cMap, pMap];
  const indices = [aIndices, bIndices, cIndices, pIndices];

  for (let pt = 0; pt < 4; pt++) {
    for (let i = 0; i < 3; i++) {
      if (indices[pt][i] >= 0) {
        maps[pt][i] = activeIndices.length;
        activeIndices.push(indices[pt][i]);
      }
    }
  }

  return {
    variableIndices: activeIndices,

    computeResidual(variables: Float64Array): number {
      const { value } = point_to_plane_distance_grad(
        getA(variables),
        getB(variables),
        getC(variables),
        getP(variables)
      );
      return value;
    },

    computeGradient(variables: Float64Array): Float64Array {
      const { da, db, dc, dp } = point_to_plane_distance_grad(
        getA(variables),
        getB(variables),
        getC(variables),
        getP(variables)
      );

      const grad = new Float64Array(activeIndices.length);
      const grads = [da, db, dc, dp];

      for (let pt = 0; pt < 4; pt++) {
        if (maps[pt][0] >= 0) grad[maps[pt][0]] = grads[pt].x;
        if (maps[pt][1] >= 0) grad[maps[pt][1]] = grads[pt].y;
        if (maps[pt][2] >= 0) grad[maps[pt][2]] = grads[pt].z;
      }

      return grad;
    },
  };
}

/**
 * Creates providers for all coplanar residuals using rotating base triangles.
 *
 * For N points, creates (N-3) residuals.
 *
 * @param pointIndices Array of [x, y, z] indices for each point
 * @param getPoints Function that returns array of points from variables
 */
export function createCoplanarProviders(
  pointIndices: readonly (readonly [number, number, number])[],
  getPoints: (variables: Float64Array) => Point3D[]
): AnalyticalResidualProvider[] {
  const n = pointIndices.length;
  if (n < 4) return [];

  const providers: AnalyticalResidualProvider[] = [];

  for (let i = 0; i <= n - 4; i++) {
    // Residual i: plane(i, i+1, i+2), test point i+3
    const aIdx = pointIndices[i];
    const bIdx = pointIndices[i + 1];
    const cIdx = pointIndices[i + 2];
    const pIdx = pointIndices[i + 3];

    providers.push(
      createCoplanarProvider(
        aIdx,
        bIdx,
        cIdx,
        pIdx,
        (vars) => getPoints(vars)[i],
        (vars) => getPoints(vars)[i + 1],
        (vars) => getPoints(vars)[i + 2],
        (vars) => getPoints(vars)[i + 3]
      )
    );
  }

  return providers;
}
