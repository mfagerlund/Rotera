/**
 * Collinear Points Residual Provider
 *
 * Constrains three points to lie on the same line.
 * Uses cross product: if p0, p1, p2 are collinear, then (p1-p0) × (p2-p0) = 0.
 */

import type { ResidualWithJacobian, Point3D } from '../types';
import { collinear_x_grad } from '../../residuals/gradients/collinear-x-gradient';
import { collinear_y_grad } from '../../residuals/gradients/collinear-y-gradient';
import { collinear_z_grad } from '../../residuals/gradients/collinear-z-gradient';

/** Scale factor for collinear residuals */
const COLLINEAR_SCALE = 10;

/**
 * Create a collinear points residual provider.
 * Returns 3 residuals (x, y, z components of cross product).
 *
 * @param id Unique identifier
 * @param p0Indices Variable indices for reference point [x, y, z]
 * @param p1Indices Variable indices for first point [x, y, z]
 * @param p2Indices Variable indices for second point [x, y, z]
 */
export function createCollinearProvider(
  id: string,
  p0Indices: [number, number, number],
  p1Indices: [number, number, number],
  p2Indices: [number, number, number]
): ResidualWithJacobian {
  // All 9 variable indices
  const variableIndices = [...p0Indices, ...p1Indices, ...p2Indices];

  return {
    id,
    name: 'Collinear',
    residualCount: 3,
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

      // Gradients don't take scale, so apply scale to result
      const resX = collinear_x_grad(p0, p1, p2);
      const resY = collinear_y_grad(p0, p1, p2);
      const resZ = collinear_z_grad(p0, p1, p2);

      return [resX.value * COLLINEAR_SCALE, resY.value * COLLINEAR_SCALE, resZ.value * COLLINEAR_SCALE];
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

      const resX = collinear_x_grad(p0, p1, p2);
      const resY = collinear_y_grad(p0, p1, p2);
      const resZ = collinear_z_grad(p0, p1, p2);

      // Each row: [dp0.x, dp0.y, dp0.z, dp1.x, dp1.y, dp1.z, dp2.x, dp2.y, dp2.z]
      // Scale factor applied to gradients
      return [
        [
          resX.dp0.x * COLLINEAR_SCALE,
          resX.dp0.y * COLLINEAR_SCALE,
          resX.dp0.z * COLLINEAR_SCALE,
          resX.dp1.x * COLLINEAR_SCALE,
          resX.dp1.y * COLLINEAR_SCALE,
          resX.dp1.z * COLLINEAR_SCALE,
          resX.dp2.x * COLLINEAR_SCALE,
          resX.dp2.y * COLLINEAR_SCALE,
          resX.dp2.z * COLLINEAR_SCALE,
        ],
        [
          resY.dp0.x * COLLINEAR_SCALE,
          resY.dp0.y * COLLINEAR_SCALE,
          resY.dp0.z * COLLINEAR_SCALE,
          resY.dp1.x * COLLINEAR_SCALE,
          resY.dp1.y * COLLINEAR_SCALE,
          resY.dp1.z * COLLINEAR_SCALE,
          resY.dp2.x * COLLINEAR_SCALE,
          resY.dp2.y * COLLINEAR_SCALE,
          resY.dp2.z * COLLINEAR_SCALE,
        ],
        [
          resZ.dp0.x * COLLINEAR_SCALE,
          resZ.dp0.y * COLLINEAR_SCALE,
          resZ.dp0.z * COLLINEAR_SCALE,
          resZ.dp1.x * COLLINEAR_SCALE,
          resZ.dp1.y * COLLINEAR_SCALE,
          resZ.dp1.z * COLLINEAR_SCALE,
          resZ.dp2.x * COLLINEAR_SCALE,
          resZ.dp2.y * COLLINEAR_SCALE,
          resZ.dp2.z * COLLINEAR_SCALE,
        ],
      ];
    },
  };
}
