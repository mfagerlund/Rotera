/**
 * Coplanar Points Residual Provider
 *
 * Constrains four points to lie on the same plane.
 * Uses normalized scalar triple product: v1 · (v2 × v3) / (|v1||v2||v3|)
 * where v1 = p1-p0, v2 = p2-p0, v3 = p3-p0.
 */

import type { ResidualWithJacobian, Point3D } from '../types';
import { coplanar_residual_grad } from '../../residuals/gradients/coplanar-gradient';

/**
 * Create a coplanar points residual provider.
 * Returns 1 residual (normalized scalar triple product).
 *
 * @param id Unique identifier
 * @param p0Indices Variable indices for reference point [x, y, z]
 * @param p1Indices Variable indices for first point [x, y, z]
 * @param p2Indices Variable indices for second point [x, y, z]
 * @param p3Indices Variable indices for third point [x, y, z]
 */
export function createCoplanarProvider(
  id: string,
  p0Indices: [number, number, number],
  p1Indices: [number, number, number],
  p2Indices: [number, number, number],
  p3Indices: [number, number, number]
): ResidualWithJacobian {
  // All 12 variable indices
  const variableIndices = [...p0Indices, ...p1Indices, ...p2Indices, ...p3Indices];

  return {
    id,
    name: 'Coplanar',
    residualCount: 1,
    variableIndices,

    computeResiduals(variables: number[]): number[] {
      const p0: Point3D = {
        x: variables[p0Indices[0]],
        y: variables[p0Indices[1]],
        z: variables[p0Indices[2]],
      };
      const p1: Point3D = {
        x: variables[p1Indices[0]],
        y: variables[p1Indices[1]],
        z: variables[p1Indices[2]],
      };
      const p2: Point3D = {
        x: variables[p2Indices[0]],
        y: variables[p2Indices[1]],
        z: variables[p2Indices[2]],
      };
      const p3: Point3D = {
        x: variables[p3Indices[0]],
        y: variables[p3Indices[1]],
        z: variables[p3Indices[2]],
      };

      const result = coplanar_residual_grad(p0, p1, p2, p3);
      return [result.value];
    },

    computeJacobian(variables: number[]): number[][] {
      const p0: Point3D = {
        x: variables[p0Indices[0]],
        y: variables[p0Indices[1]],
        z: variables[p0Indices[2]],
      };
      const p1: Point3D = {
        x: variables[p1Indices[0]],
        y: variables[p1Indices[1]],
        z: variables[p1Indices[2]],
      };
      const p2: Point3D = {
        x: variables[p2Indices[0]],
        y: variables[p2Indices[1]],
        z: variables[p2Indices[2]],
      };
      const p3: Point3D = {
        x: variables[p3Indices[0]],
        y: variables[p3Indices[1]],
        z: variables[p3Indices[2]],
      };

      const result = coplanar_residual_grad(p0, p1, p2, p3);

      // Row: [dp0.x, dp0.y, dp0.z, dp1.x, dp1.y, dp1.z, dp2.x, dp2.y, dp2.z, dp3.x, dp3.y, dp3.z]
      const row = [
        result.dp0.x,
        result.dp0.y,
        result.dp0.z,
        result.dp1.x,
        result.dp1.y,
        result.dp1.z,
        result.dp2.x,
        result.dp2.y,
        result.dp2.z,
        result.dp3.x,
        result.dp3.y,
        result.dp3.z,
      ];

      // Check for NaN/Infinity (can occur if points are coincident causing 0-length vectors)
      if (row.some(v => !isFinite(v))) {
        return [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
      }

      return [row];
    },
  };
}
