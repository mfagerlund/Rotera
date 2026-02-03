/**
 * Regularization Provider
 *
 * Penalizes points moving far from their initial positions.
 * This prevents unconstrained points from diverging to infinity.
 *
 * Residual: weight * (current - initial) for each axis (x, y, z)
 */

import { AnalyticalResidualProvider } from '../types';

/** Point getter type - returns {x, y, z} from variables array */
type PointGetter = (variables: Float64Array) => { x: number; y: number; z: number };

/**
 * Creates a regularization provider for a single axis of a world point.
 *
 * @param pointIndices Variable indices for the point [x, y, z] (-1 if locked)
 * @param axis Which axis (0=x, 1=y, 2=z)
 * @param initialValue Initial position of this axis
 * @param weight Regularization weight
 * @param getPoint Function to get current point coordinates
 */
export function createRegularizationProvider(
  pointIndices: readonly [number, number, number],
  axis: 0 | 1 | 2,
  initialValue: number,
  weight: number,
  getPoint: PointGetter
): AnalyticalResidualProvider {
  const varIdx = pointIndices[axis];

  // If this axis is locked, the residual is always 0
  if (varIdx < 0) {
    return {
      variableIndices: [],
      computeResidual: () => 0,
      computeGradient: () => new Float64Array(0),
    };
  }

  return {
    variableIndices: [varIdx],

    computeResidual(variables: Float64Array): number {
      const point = getPoint(variables);
      const values = [point.x, point.y, point.z];
      return weight * (values[axis] - initialValue);
    },

    computeGradient(variables: Float64Array): Float64Array {
      // d/d(point[axis]) of weight * (point[axis] - initial) = weight
      return new Float64Array([weight]);
    },
  };
}

/**
 * Creates all regularization providers for a world point (3 providers for x, y, z).
 *
 * @param pointIndices Variable indices for the point [x, y, z] (-1 if locked)
 * @param initialPosition Initial position [x, y, z]
 * @param weight Regularization weight
 * @param getPoint Function to get current point coordinates
 */
export function createRegularizationProviders(
  pointIndices: readonly [number, number, number],
  initialPosition: [number, number, number],
  weight: number,
  getPoint: PointGetter
): AnalyticalResidualProvider[] {
  const providers: AnalyticalResidualProvider[] = [];

  for (let axis = 0; axis < 3; axis++) {
    const provider = createRegularizationProvider(
      pointIndices,
      axis as 0 | 1 | 2,
      initialPosition[axis],
      weight,
      getPoint
    );
    // Only add if there's actually a variable to optimize
    if (provider.variableIndices.length > 0) {
      providers.push(provider);
    }
  }

  return providers;
}
