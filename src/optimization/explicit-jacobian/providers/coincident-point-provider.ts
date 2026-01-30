/**
 * Coincident Point Residual Provider
 *
 * Constrains a point to lie on a line defined by two other points.
 * Uses cross product: if P is on line AB, then AP × AB = 0.
 */

import type { ResidualWithJacobian, Point3D } from '../types';
import { coincident_point_x_grad } from '../../residuals/gradients/coincident-point-x-gradient';
import { coincident_point_y_grad } from '../../residuals/gradients/coincident-point-y-gradient';
import { coincident_point_z_grad } from '../../residuals/gradients/coincident-point-z-gradient';

/** Scale factor for coincident point residuals */
const COINCIDENT_SCALE = 10;

/**
 * Create a coincident point residual provider.
 * Returns 3 residuals (x, y, z components of cross product).
 *
 * @param id Unique identifier
 * @param pointAIndices Variable indices for line point A [x, y, z]
 * @param pointBIndices Variable indices for line point B [x, y, z]
 * @param pointPIndices Variable indices for the coincident point [x, y, z]
 */
export function createCoincidentPointProvider(
  id: string,
  pointAIndices: [number, number, number],
  pointBIndices: [number, number, number],
  pointPIndices: [number, number, number]
): ResidualWithJacobian {
  // All 9 variable indices
  const variableIndices = [...pointAIndices, ...pointBIndices, ...pointPIndices];

  return {
    id,
    name: 'CoincidentPoint',
    residualCount: 3,
    variableIndices,

    computeResiduals(variables: number[]): number[] {
      const pA: Point3D = {
        x: variables[pointAIndices[0]],
        y: variables[pointAIndices[1]],
        z: variables[pointAIndices[2]],
      };
      const pB: Point3D = {
        x: variables[pointBIndices[0]],
        y: variables[pointBIndices[1]],
        z: variables[pointBIndices[2]],
      };
      const pP: Point3D = {
        x: variables[pointPIndices[0]],
        y: variables[pointPIndices[1]],
        z: variables[pointPIndices[2]],
      };

      // Compute cross product components
      const resX = coincident_point_x_grad(pA, pB, pP, COINCIDENT_SCALE);
      const resY = coincident_point_y_grad(pA, pB, pP, COINCIDENT_SCALE);
      const resZ = coincident_point_z_grad(pA, pB, pP, COINCIDENT_SCALE);

      return [resX.value, resY.value, resZ.value];
    },

    computeJacobian(variables: number[]): number[][] {
      const pA: Point3D = {
        x: variables[pointAIndices[0]],
        y: variables[pointAIndices[1]],
        z: variables[pointAIndices[2]],
      };
      const pB: Point3D = {
        x: variables[pointBIndices[0]],
        y: variables[pointBIndices[1]],
        z: variables[pointBIndices[2]],
      };
      const pP: Point3D = {
        x: variables[pointPIndices[0]],
        y: variables[pointPIndices[1]],
        z: variables[pointPIndices[2]],
      };

      const resX = coincident_point_x_grad(pA, pB, pP, COINCIDENT_SCALE);
      const resY = coincident_point_y_grad(pA, pB, pP, COINCIDENT_SCALE);
      const resZ = coincident_point_z_grad(pA, pB, pP, COINCIDENT_SCALE);

      // Each row: [dpA.x, dpA.y, dpA.z, dpB.x, dpB.y, dpB.z, dpP.x, dpP.y, dpP.z]
      return [
        [resX.dpA.x, resX.dpA.y, resX.dpA.z, resX.dpB.x, resX.dpB.y, resX.dpB.z, resX.dpP.x, resX.dpP.y, resX.dpP.z],
        [resY.dpA.x, resY.dpA.y, resY.dpA.z, resY.dpB.x, resY.dpB.y, resY.dpB.z, resY.dpP.x, resY.dpP.y, resY.dpP.z],
        [resZ.dpA.x, resZ.dpA.y, resZ.dpA.z, resZ.dpB.x, resZ.dpB.y, resZ.dpB.z, resZ.dpP.x, resZ.dpP.y, resZ.dpP.z],
      ];
    },
  };
}
