/**
 * Line Direction Provider
 *
 * Creates residual providers for line direction constraints.
 * Constrains a line to point in a specific axis direction.
 */

import { AnalyticalResidualProvider } from '../types';
import { line_direction_x_y_grad } from '../../residuals/gradients/line-direction-x-gradient';
import { line_direction_x_z_grad } from '../../residuals/gradients/line-direction-x-z-gradient';
import { line_direction_y_x_grad } from '../../residuals/gradients/line-direction-y-x-gradient';
import { line_direction_y_z_grad } from '../../residuals/gradients/line-direction-y-z-gradient';
import { line_direction_z_x_grad } from '../../residuals/gradients/line-direction-z-x-gradient';
import { line_direction_z_y_grad } from '../../residuals/gradients/line-direction-z-y-gradient';
import { line_direction_xy_grad } from '../../residuals/gradients/line-direction-xy-gradient';
import { line_direction_xz_grad } from '../../residuals/gradients/line-direction-xz-gradient';
import { line_direction_yz_grad } from '../../residuals/gradients/line-direction-yz-gradient';

type Point3D = { x: number; y: number; z: number };
type Point3DGrad = { x: number; y: number; z: number };

type LineDirectionGradFn = (
  pA: Point3D,
  pB: Point3D,
  scale: number
) => { value: number; dpA: Point3DGrad; dpB: Point3DGrad };

/**
 * Creates a single line direction residual provider.
 */
function createLineDirectionComponentProvider(
  pAIndices: readonly [number, number, number],
  pBIndices: readonly [number, number, number],
  scale: number,
  getPA: (variables: Float64Array) => Point3D,
  getPB: (variables: Float64Array) => Point3D,
  gradFn: LineDirectionGradFn
): AnalyticalResidualProvider {
  const activeIndices: number[] = [];
  const pAMap: [number, number, number] = [-1, -1, -1];
  const pBMap: [number, number, number] = [-1, -1, -1];

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

  return {
    variableIndices: activeIndices,

    computeResidual(variables: Float64Array): number {
      const { value } = gradFn(getPA(variables), getPB(variables), scale);
      return value;
    },

    computeGradient(variables: Float64Array): Float64Array {
      const { dpA, dpB } = gradFn(getPA(variables), getPB(variables), scale);

      const grad = new Float64Array(activeIndices.length);

      if (pAMap[0] >= 0) grad[pAMap[0]] = dpA.x;
      if (pAMap[1] >= 0) grad[pAMap[1]] = dpA.y;
      if (pAMap[2] >= 0) grad[pAMap[2]] = dpA.z;

      if (pBMap[0] >= 0) grad[pBMap[0]] = dpB.x;
      if (pBMap[1] >= 0) grad[pBMap[1]] = dpB.y;
      if (pBMap[2] >= 0) grad[pBMap[2]] = dpB.z;

      return grad;
    },
  };
}

export type LineDirection = 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz';

/**
 * Creates providers for line direction constraint.
 *
 * @param direction The axis direction the line should point in:
 *   - 'x': line points in X direction (dy=0, dz=0)
 *   - 'y': line points in Y direction (dx=0, dz=0)
 *   - 'z': line points in Z direction (dx=0, dy=0)
 *   - 'xy': line lies in XY plane (dz=0)
 *   - 'xz': line lies in XZ plane (dy=0)
 *   - 'yz': line lies in YZ plane (dx=0)
 */
export function createLineDirectionProviders(
  pAIndices: readonly [number, number, number],
  pBIndices: readonly [number, number, number],
  direction: LineDirection,
  scale: number,
  getPA: (variables: Float64Array) => Point3D,
  getPB: (variables: Float64Array) => Point3D
): AnalyticalResidualProvider[] {
  const providers: AnalyticalResidualProvider[] = [];

  switch (direction) {
    case 'x':
      // X direction: constrain dy=0 and dz=0
      providers.push(createLineDirectionComponentProvider(pAIndices, pBIndices, scale, getPA, getPB, line_direction_x_y_grad));
      providers.push(createLineDirectionComponentProvider(pAIndices, pBIndices, scale, getPA, getPB, line_direction_x_z_grad));
      break;
    case 'y':
      // Y direction: constrain dx=0 and dz=0
      providers.push(createLineDirectionComponentProvider(pAIndices, pBIndices, scale, getPA, getPB, line_direction_y_x_grad));
      providers.push(createLineDirectionComponentProvider(pAIndices, pBIndices, scale, getPA, getPB, line_direction_y_z_grad));
      break;
    case 'z':
      // Z direction: constrain dx=0 and dy=0
      providers.push(createLineDirectionComponentProvider(pAIndices, pBIndices, scale, getPA, getPB, line_direction_z_x_grad));
      providers.push(createLineDirectionComponentProvider(pAIndices, pBIndices, scale, getPA, getPB, line_direction_z_y_grad));
      break;
    case 'xy':
      // XY plane: constrain dz=0
      providers.push(createLineDirectionComponentProvider(pAIndices, pBIndices, scale, getPA, getPB, line_direction_xy_grad));
      break;
    case 'xz':
      // XZ plane: constrain dy=0
      providers.push(createLineDirectionComponentProvider(pAIndices, pBIndices, scale, getPA, getPB, line_direction_xz_grad));
      break;
    case 'yz':
      // YZ plane: constrain dx=0
      providers.push(createLineDirectionComponentProvider(pAIndices, pBIndices, scale, getPA, getPB, line_direction_yz_grad));
      break;
  }

  return providers;
}

export { createLineDirectionComponentProvider };
