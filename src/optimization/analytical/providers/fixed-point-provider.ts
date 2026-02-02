/**
 * Fixed Point Provider
 *
 * Creates residual providers for fixed point constraints.
 * Each free coordinate (x, y, z) gets its own residual: coord - target.
 *
 * Gradient is trivial: d/d(coord) = 1
 */

import { AnalyticalResidualProvider } from '../types';
import { fixed_point_x_grad } from '../../residuals/gradients/fixed-point-x-gradient';
import { fixed_point_y_grad } from '../../residuals/gradients/fixed-point-y-gradient';
import { fixed_point_z_grad } from '../../residuals/gradients/fixed-point-z-gradient';

/**
 * Creates a provider for a fixed point X constraint.
 * Residual: x - targetX
 *
 * @param pointXIndex Index of point's X coordinate in variable array (-1 if locked)
 * @param targetX Target X value
 * @param getPointX Function to get current X value from variables (handles locked case)
 */
export function createFixedPointXProvider(
  pointXIndex: number,
  targetX: number,
  getPointX: (variables: Float64Array) => number
): AnalyticalResidualProvider | null {
  // If X is locked, no need for a constraint - it's already fixed
  if (pointXIndex < 0) return null;

  const variableIndices = [pointXIndex];

  return {
    variableIndices,

    computeResidual(variables: Float64Array): number {
      const x = getPointX(variables);
      const { value } = fixed_point_x_grad({ x, y: 0, z: 0 }, targetX);
      return value;
    },

    computeGradient(_variables: Float64Array): Float64Array {
      // d/dx (x - target) = 1
      // The gradient function returns dp.x = 1, which we already know
      return new Float64Array([1]);
    },
  };
}

/**
 * Creates a provider for a fixed point Y constraint.
 * Residual: y - targetY
 */
export function createFixedPointYProvider(
  pointYIndex: number,
  targetY: number,
  getPointY: (variables: Float64Array) => number
): AnalyticalResidualProvider | null {
  if (pointYIndex < 0) return null;

  const variableIndices = [pointYIndex];

  return {
    variableIndices,

    computeResidual(variables: Float64Array): number {
      const y = getPointY(variables);
      const { value } = fixed_point_y_grad({ x: 0, y, z: 0 }, targetY);
      return value;
    },

    computeGradient(_variables: Float64Array): Float64Array {
      return new Float64Array([1]);
    },
  };
}

/**
 * Creates a provider for a fixed point Z constraint.
 * Residual: z - targetZ
 */
export function createFixedPointZProvider(
  pointZIndex: number,
  targetZ: number,
  getPointZ: (variables: Float64Array) => number
): AnalyticalResidualProvider | null {
  if (pointZIndex < 0) return null;

  const variableIndices = [pointZIndex];

  return {
    variableIndices,

    computeResidual(variables: Float64Array): number {
      const z = getPointZ(variables);
      const { value } = fixed_point_z_grad({ x: 0, y: 0, z }, targetZ);
      return value;
    },

    computeGradient(_variables: Float64Array): Float64Array {
      return new Float64Array([1]);
    },
  };
}

/**
 * Creates providers for all free coordinates of a fixed point constraint.
 * Returns 0-3 providers depending on which coordinates are free.
 *
 * @param pointIndices [xIndex, yIndex, zIndex] - indices in variable array, -1 if locked
 * @param target Target position [x, y, z]
 * @param getPoint Function to get current point position from variables
 */
export function createFixedPointProviders(
  pointIndices: readonly [number, number, number],
  target: readonly [number, number, number],
  getPoint: (variables: Float64Array) => { x: number; y: number; z: number }
): AnalyticalResidualProvider[] {
  const providers: AnalyticalResidualProvider[] = [];

  const xProvider = createFixedPointXProvider(
    pointIndices[0],
    target[0],
    (vars) => getPoint(vars).x
  );
  if (xProvider) providers.push(xProvider);

  const yProvider = createFixedPointYProvider(
    pointIndices[1],
    target[1],
    (vars) => getPoint(vars).y
  );
  if (yProvider) providers.push(yProvider);

  const zProvider = createFixedPointZProvider(
    pointIndices[2],
    target[2],
    (vars) => getPoint(vars).z
  );
  if (zProvider) providers.push(zProvider);

  return providers;
}
