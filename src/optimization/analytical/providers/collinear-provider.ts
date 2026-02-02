/**
 * Collinear Provider
 *
 * Creates residual providers for collinear constraint (3 points on a line).
 * Uses cross product: (p1 - p0) × (p2 - p0) = 0
 * Three residuals: X, Y, Z components of the cross product.
 */

import { AnalyticalResidualProvider } from '../types';
import { collinear_x_grad } from '../../residuals/gradients/collinear-x-gradient';
import { collinear_y_grad } from '../../residuals/gradients/collinear-y-gradient';
import { collinear_z_grad } from '../../residuals/gradients/collinear-z-gradient';

type Point3D = { x: number; y: number; z: number };
type Point3DGrad = { x: number; y: number; z: number };

interface CollinearGradResult {
  value: number;
  dp0: Point3DGrad;
  dp1: Point3DGrad;
  dp2: Point3DGrad;
}

/**
 * Creates a single collinear residual provider for one component.
 */
function createCollinearComponentProvider(
  p0Indices: readonly [number, number, number],
  p1Indices: readonly [number, number, number],
  p2Indices: readonly [number, number, number],
  getP0: (variables: Float64Array) => Point3D,
  getP1: (variables: Float64Array) => Point3D,
  getP2: (variables: Float64Array) => Point3D,
  gradFn: (p0: Point3D, p1: Point3D, p2: Point3D) => CollinearGradResult
): AnalyticalResidualProvider {
  // Build active indices
  const activeIndices: number[] = [];
  const p0Map: [number, number, number] = [-1, -1, -1];
  const p1Map: [number, number, number] = [-1, -1, -1];
  const p2Map: [number, number, number] = [-1, -1, -1];

  for (let i = 0; i < 3; i++) {
    if (p0Indices[i] >= 0) {
      p0Map[i] = activeIndices.length;
      activeIndices.push(p0Indices[i]);
    }
  }
  for (let i = 0; i < 3; i++) {
    if (p1Indices[i] >= 0) {
      p1Map[i] = activeIndices.length;
      activeIndices.push(p1Indices[i]);
    }
  }
  for (let i = 0; i < 3; i++) {
    if (p2Indices[i] >= 0) {
      p2Map[i] = activeIndices.length;
      activeIndices.push(p2Indices[i]);
    }
  }

  return {
    variableIndices: activeIndices,

    computeResidual(variables: Float64Array): number {
      const { value } = gradFn(getP0(variables), getP1(variables), getP2(variables));
      return value;
    },

    computeGradient(variables: Float64Array): Float64Array {
      const { dp0, dp1, dp2 } = gradFn(getP0(variables), getP1(variables), getP2(variables));

      const grad = new Float64Array(activeIndices.length);

      if (p0Map[0] >= 0) grad[p0Map[0]] = dp0.x;
      if (p0Map[1] >= 0) grad[p0Map[1]] = dp0.y;
      if (p0Map[2] >= 0) grad[p0Map[2]] = dp0.z;

      if (p1Map[0] >= 0) grad[p1Map[0]] = dp1.x;
      if (p1Map[1] >= 0) grad[p1Map[1]] = dp1.y;
      if (p1Map[2] >= 0) grad[p1Map[2]] = dp1.z;

      if (p2Map[0] >= 0) grad[p2Map[0]] = dp2.x;
      if (p2Map[1] >= 0) grad[p2Map[1]] = dp2.y;
      if (p2Map[2] >= 0) grad[p2Map[2]] = dp2.z;

      return grad;
    },
  };
}

/**
 * Creates providers for collinear constraint (3 points on a line).
 * Returns 3 providers for X, Y, Z components of the cross product.
 */
export function createCollinearProviders(
  p0Indices: readonly [number, number, number],
  p1Indices: readonly [number, number, number],
  p2Indices: readonly [number, number, number],
  getP0: (variables: Float64Array) => Point3D,
  getP1: (variables: Float64Array) => Point3D,
  getP2: (variables: Float64Array) => Point3D
): AnalyticalResidualProvider[] {
  return [
    createCollinearComponentProvider(p0Indices, p1Indices, p2Indices, getP0, getP1, getP2, collinear_x_grad),
    createCollinearComponentProvider(p0Indices, p1Indices, p2Indices, getP0, getP1, getP2, collinear_y_grad),
    createCollinearComponentProvider(p0Indices, p1Indices, p2Indices, getP0, getP1, getP2, collinear_z_grad),
  ];
}

export { createCollinearComponentProvider };
