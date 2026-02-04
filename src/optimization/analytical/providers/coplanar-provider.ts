/**
 * Coplanar Provider
 *
 * Creates residual providers for coplanar constraint using point-to-plane distance.
 * Uses rotating base triangles for better numerical stability with N > 4 points.
 *
 * Residual = (v · n) / |n|
 * where n = (p1-p0) × (p2-p0) is the plane normal, v = p3-p0 is the test vector
 *
 * This matches the autodiff formula in CoplanarPointsConstraint.computeResiduals.
 *
 * For N points [p0, p1, p2, p3, p4, ...]:
 *   Residual 0: distance(p3 to plane(p0, p1, p2))
 *   Residual 1: distance(p4 to plane(p1, p2, p3))
 *   ...
 */

import { AnalyticalResidualProvider } from '../types';
import { point_to_plane_distance_grad } from '../../residuals/gradients/point-to-plane-distance-gradient';

type Point3D = { x: number; y: number; z: number };

/**
 * Creates a single coplanar residual provider using point-to-plane distance.
 *
 * @param p0Indices [x, y, z] indices for first point (plane point a)
 * @param p1Indices [x, y, z] indices for second point (plane point b)
 * @param p2Indices [x, y, z] indices for third point (plane point c)
 * @param p3Indices [x, y, z] indices for fourth point (test point p)
 * @param getP0..getP3 Functions to get points from variables
 */
export function createCoplanarProvider(
  p0Indices: readonly [number, number, number],
  p1Indices: readonly [number, number, number],
  p2Indices: readonly [number, number, number],
  p3Indices: readonly [number, number, number],
  getP0: (variables: Float64Array) => Point3D,
  getP1: (variables: Float64Array) => Point3D,
  getP2: (variables: Float64Array) => Point3D,
  getP3: (variables: Float64Array) => Point3D
): AnalyticalResidualProvider {
  // Build active indices
  const activeIndices: number[] = [];
  const p0Map: [number, number, number] = [-1, -1, -1];
  const p1Map: [number, number, number] = [-1, -1, -1];
  const p2Map: [number, number, number] = [-1, -1, -1];
  const p3Map: [number, number, number] = [-1, -1, -1];

  const maps = [p0Map, p1Map, p2Map, p3Map];
  const indices = [p0Indices, p1Indices, p2Indices, p3Indices];

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
      // point_to_plane_distance_grad(a, b, c, p) where a,b,c define plane, p is test point
      const { value } = point_to_plane_distance_grad(
        getP0(variables),  // a - first plane point
        getP1(variables),  // b - second plane point
        getP2(variables),  // c - third plane point
        getP3(variables)   // p - test point
      );
      return value;
    },

    computeGradient(variables: Float64Array): Float64Array {
      // da, db, dc are gradients for plane points, dp is gradient for test point
      const { da, db, dc, dp } = point_to_plane_distance_grad(
        getP0(variables),
        getP1(variables),
        getP2(variables),
        getP3(variables)
      );

      const grad = new Float64Array(activeIndices.length);
      // Map gradients: da→p0, db→p1, dc→p2, dp→p3
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
 * Creates providers for coplanar residuals using rotating base triangles.
 *
 * For N points, creates (N-3) residuals:
 *   Residual 0: distance(p3 to plane(p0, p1, p2))
 *   Residual 1: distance(p4 to plane(p1, p2, p3))
 *   ...
 *
 * This matches the autodiff formula in CoplanarPointsConstraint.computeResiduals
 * which uses rotating base triangles for better conditioning.
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
    // Residual i: scalar triple product of (p_i, p_{i+1}, p_{i+2}, p_{i+3})
    providers.push(
      createCoplanarProvider(
        pointIndices[i],
        pointIndices[i + 1],
        pointIndices[i + 2],
        pointIndices[i + 3],
        (vars) => getPoints(vars)[i],
        (vars) => getPoints(vars)[i + 1],
        (vars) => getPoints(vars)[i + 2],
        (vars) => getPoints(vars)[i + 3]
      )
    );
  }

  return providers;
}
