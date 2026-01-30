/**
 * Angle Residual Provider
 *
 * Constrains the angle between three points (vertex at middle point).
 */

import type { ResidualWithJacobian, Point3D } from '../types';
import { angle_residual_grad } from '../../residuals/gradients/angle-gradient';

/**
 * Create an angle residual provider.
 * Returns 1 residual (angle error in radians).
 *
 * @param id Unique identifier
 * @param pointAIndices Variable indices for first point [x, y, z]
 * @param vertexIndices Variable indices for vertex point [x, y, z]
 * @param pointCIndices Variable indices for third point [x, y, z]
 * @param targetRadians Target angle in radians
 */
export function createAngleProvider(
  id: string,
  pointAIndices: [number, number, number],
  vertexIndices: [number, number, number],
  pointCIndices: [number, number, number],
  targetRadians: number
): ResidualWithJacobian {
  // All 9 variable indices
  const variableIndices = [...pointAIndices, ...vertexIndices, ...pointCIndices];

  return {
    id,
    name: 'Angle',
    residualCount: 1,
    variableIndices,

    computeResiduals(variables: number[]): number[] {
      const pointA: Point3D = {
        x: variables[pointAIndices[0]],
        y: variables[pointAIndices[1]],
        z: variables[pointAIndices[2]],
      };
      const vertex: Point3D = {
        x: variables[vertexIndices[0]],
        y: variables[vertexIndices[1]],
        z: variables[vertexIndices[2]],
      };
      const pointC: Point3D = {
        x: variables[pointCIndices[0]],
        y: variables[pointCIndices[1]],
        z: variables[pointCIndices[2]],
      };

      const result = angle_residual_grad(pointA, vertex, pointC, targetRadians);
      return [result.value];
    },

    computeJacobian(variables: number[]): number[][] {
      const pointA: Point3D = {
        x: variables[pointAIndices[0]],
        y: variables[pointAIndices[1]],
        z: variables[pointAIndices[2]],
      };
      const vertex: Point3D = {
        x: variables[vertexIndices[0]],
        y: variables[vertexIndices[1]],
        z: variables[vertexIndices[2]],
      };
      const pointC: Point3D = {
        x: variables[pointCIndices[0]],
        y: variables[pointCIndices[1]],
        z: variables[pointCIndices[2]],
      };

      const result = angle_residual_grad(pointA, vertex, pointC, targetRadians);

      // Row: [dpointA.x, dpointA.y, dpointA.z, dvertex.x, dvertex.y, dvertex.z, dpointC.x, dpointC.y, dpointC.z]
      return [
        [
          result.dpointA.x,
          result.dpointA.y,
          result.dpointA.z,
          result.dvertex.x,
          result.dvertex.y,
          result.dvertex.z,
          result.dpointC.x,
          result.dpointC.y,
          result.dpointC.z,
        ],
      ];
    },
  };
}
