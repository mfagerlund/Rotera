/**
 * Angle Provider
 *
 * Creates a residual provider for angle constraint.
 * Residual: angle(pointA, vertex, pointC) - targetRadians
 * Where angle is computed using atan2(cross magnitude, dot product).
 */

import { AnalyticalResidualProvider } from '../types';
import { angle_residual_grad } from '../../residuals/gradients/angle-gradient';

type Point3D = { x: number; y: number; z: number };

/**
 * Creates a provider for angle constraint.
 *
 * @param pointAIndices [x, y, z] indices for point A (-1 if locked)
 * @param vertexIndices [x, y, z] indices for vertex (-1 if locked)
 * @param pointCIndices [x, y, z] indices for point C (-1 if locked)
 * @param targetRadians Target angle in radians
 * @param getPointA Function to get point A from variables
 * @param getVertex Function to get vertex from variables
 * @param getPointC Function to get point C from variables
 */
export function createAngleProvider(
  pointAIndices: readonly [number, number, number],
  vertexIndices: readonly [number, number, number],
  pointCIndices: readonly [number, number, number],
  targetRadians: number,
  getPointA: (variables: Float64Array) => Point3D,
  getVertex: (variables: Float64Array) => Point3D,
  getPointC: (variables: Float64Array) => Point3D
): AnalyticalResidualProvider {
  // Build active indices
  const activeIndices: number[] = [];
  const pointAMap: [number, number, number] = [-1, -1, -1];
  const vertexMap: [number, number, number] = [-1, -1, -1];
  const pointCMap: [number, number, number] = [-1, -1, -1];

  for (let i = 0; i < 3; i++) {
    if (pointAIndices[i] >= 0) {
      pointAMap[i] = activeIndices.length;
      activeIndices.push(pointAIndices[i]);
    }
  }
  for (let i = 0; i < 3; i++) {
    if (vertexIndices[i] >= 0) {
      vertexMap[i] = activeIndices.length;
      activeIndices.push(vertexIndices[i]);
    }
  }
  for (let i = 0; i < 3; i++) {
    if (pointCIndices[i] >= 0) {
      pointCMap[i] = activeIndices.length;
      activeIndices.push(pointCIndices[i]);
    }
  }

  return {
    variableIndices: activeIndices,

    computeResidual(variables: Float64Array): number {
      const { value } = angle_residual_grad(
        getPointA(variables),
        getVertex(variables),
        getPointC(variables),
        targetRadians
      );
      return value;
    },

    computeGradient(variables: Float64Array): Float64Array {
      const { dpointA, dvertex, dpointC } = angle_residual_grad(
        getPointA(variables),
        getVertex(variables),
        getPointC(variables),
        targetRadians
      );

      const grad = new Float64Array(activeIndices.length);

      if (pointAMap[0] >= 0) grad[pointAMap[0]] = dpointA.x;
      if (pointAMap[1] >= 0) grad[pointAMap[1]] = dpointA.y;
      if (pointAMap[2] >= 0) grad[pointAMap[2]] = dpointA.z;

      if (vertexMap[0] >= 0) grad[vertexMap[0]] = dvertex.x;
      if (vertexMap[1] >= 0) grad[vertexMap[1]] = dvertex.y;
      if (vertexMap[2] >= 0) grad[vertexMap[2]] = dvertex.z;

      if (pointCMap[0] >= 0) grad[pointCMap[0]] = dpointC.x;
      if (pointCMap[1] >= 0) grad[pointCMap[1]] = dpointC.y;
      if (pointCMap[2] >= 0) grad[pointCMap[2]] = dpointC.z;

      return grad;
    },
  };
}
