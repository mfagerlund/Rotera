/**
 * Coincident Point Provider
 *
 * Creates residual providers for coincident point constraint (point P on line AB).
 * Uses cross product: (P - A) × (B - A) = 0
 * Three residuals: X, Y, Z components of the cross product.
 */

import { AnalyticalResidualProvider } from '../types';
import { coincident_point_x_grad } from '../../residuals/gradients/coincident-point-x-gradient';
import { coincident_point_y_grad } from '../../residuals/gradients/coincident-point-y-gradient';
import { coincident_point_z_grad } from '../../residuals/gradients/coincident-point-z-gradient';

type Point3D = { x: number; y: number; z: number };
type Point3DGrad = { x: number; y: number; z: number };

interface CoincidentGradResult {
  value: number;
  dpA: Point3DGrad;
  dpB: Point3DGrad;
  dpP: Point3DGrad;
}

/**
 * Creates a single coincident point residual provider for one component.
 */
function createCoincidentPointComponentProvider(
  pAIndices: readonly [number, number, number],
  pBIndices: readonly [number, number, number],
  pPIndices: readonly [number, number, number],
  scale: number,
  getPA: (variables: Float64Array) => Point3D,
  getPB: (variables: Float64Array) => Point3D,
  getPP: (variables: Float64Array) => Point3D,
  gradFn: (pA: Point3D, pB: Point3D, pP: Point3D, scale: number) => CoincidentGradResult
): AnalyticalResidualProvider {
  // Build active indices
  const activeIndices: number[] = [];
  const pAMap: [number, number, number] = [-1, -1, -1];
  const pBMap: [number, number, number] = [-1, -1, -1];
  const pPMap: [number, number, number] = [-1, -1, -1];

  for (let i = 0; i < 3; i++) {
    if (pAIndices[i] >= 0) {
      pAMap[i] = activeIndices.length;
      activeIndices.push(pAIndices[i]);
    }
  }
  for (let i = 0; i < 3; i++) {
    if (pBIndices[i] >= 0) {
      pBMap[i] = activeIndices.length;
      activeIndices.push(pBIndices[i]);
    }
  }
  for (let i = 0; i < 3; i++) {
    if (pPIndices[i] >= 0) {
      pPMap[i] = activeIndices.length;
      activeIndices.push(pPIndices[i]);
    }
  }

  return {
    variableIndices: activeIndices,

    computeResidual(variables: Float64Array): number {
      const { value } = gradFn(getPA(variables), getPB(variables), getPP(variables), scale);
      return value;
    },

    computeGradient(variables: Float64Array): Float64Array {
      const { dpA, dpB, dpP } = gradFn(getPA(variables), getPB(variables), getPP(variables), scale);

      const grad = new Float64Array(activeIndices.length);

      if (pAMap[0] >= 0) grad[pAMap[0]] = dpA.x;
      if (pAMap[1] >= 0) grad[pAMap[1]] = dpA.y;
      if (pAMap[2] >= 0) grad[pAMap[2]] = dpA.z;

      if (pBMap[0] >= 0) grad[pBMap[0]] = dpB.x;
      if (pBMap[1] >= 0) grad[pBMap[1]] = dpB.y;
      if (pBMap[2] >= 0) grad[pBMap[2]] = dpB.z;

      if (pPMap[0] >= 0) grad[pPMap[0]] = dpP.x;
      if (pPMap[1] >= 0) grad[pPMap[1]] = dpP.y;
      if (pPMap[2] >= 0) grad[pPMap[2]] = dpP.z;

      return grad;
    },
  };
}

/**
 * Creates providers for coincident point constraint (point P on line AB).
 * Returns 3 providers for X, Y, Z components of the cross product.
 */
export function createCoincidentPointProviders(
  pAIndices: readonly [number, number, number],
  pBIndices: readonly [number, number, number],
  pPIndices: readonly [number, number, number],
  scale: number,
  getPA: (variables: Float64Array) => Point3D,
  getPB: (variables: Float64Array) => Point3D,
  getPP: (variables: Float64Array) => Point3D
): AnalyticalResidualProvider[] {
  return [
    createCoincidentPointComponentProvider(pAIndices, pBIndices, pPIndices, scale, getPA, getPB, getPP, coincident_point_x_grad),
    createCoincidentPointComponentProvider(pAIndices, pBIndices, pPIndices, scale, getPA, getPB, getPP, coincident_point_y_grad),
    createCoincidentPointComponentProvider(pAIndices, pBIndices, pPIndices, scale, getPA, getPB, getPP, coincident_point_z_grad),
  ];
}
