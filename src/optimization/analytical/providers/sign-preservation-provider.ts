/**
 * Sign Preservation Provider
 *
 * Penalizes points that flip their sign on a specific axis from their initial value.
 * This prevents convergence to reflected local minima (e.g., Y flipping from +25 to -25).
 *
 * Uses a smooth penalty function: residual = weight * (current / abs(initial)) when signs differ
 * This creates a soft barrier that increases as the point moves further into the "wrong" half-space.
 */

import { AnalyticalResidualProvider } from '../types';

/** Point getter type - returns {x, y, z} from variables array */
type PointGetter = (variables: Float64Array) => { x: number; y: number; z: number };

/**
 * Creates a sign preservation provider for a single axis of a world point.
 *
 * The residual is:
 * - 0 if current value has the same sign as initial
 * - weight * |current| if signs differ (penalizes crossing zero)
 *
 * This creates a smooth penalty that:
 * - Is zero when the point stays on the same side
 * - Increases linearly as the point moves further into the wrong half-space
 * - Allows small excursions near zero (doesn't create hard barriers)
 *
 * @param pointIndices Variable indices for the point [x, y, z] (-1 if locked)
 * @param axis Which axis (0=x, 1=y, 2=z)
 * @param initialValue Initial position of this axis (used to determine expected sign)
 * @param weight Regularization weight (should be small, ~0.01-0.1)
 * @param getPoint Function to get current point coordinates
 * @param minAbsInitial Minimum absolute initial value to consider (avoids division issues near zero)
 */
export function createSignPreservationProvider(
  pointIndices: readonly [number, number, number],
  axis: 0 | 1 | 2,
  initialValue: number,
  weight: number,
  getPoint: PointGetter,
  minAbsInitial: number = 1.0
): AnalyticalResidualProvider {
  const varIdx = pointIndices[axis];

  // If this axis is locked or initial value is near zero (no clear sign), skip
  if (varIdx < 0 || Math.abs(initialValue) < minAbsInitial) {
    return {
      variableIndices: [],
      computeResidual: () => 0,
      computeGradient: () => new Float64Array(0),
    };
  }

  const initialSign = initialValue > 0 ? 1 : -1;

  return {
    variableIndices: [varIdx],

    computeResidual(variables: Float64Array): number {
      const point = getPoint(variables);
      const values = [point.x, point.y, point.z];
      const current = values[axis];
      const currentSign = current > 0 ? 1 : -1;

      // If signs match, no penalty
      if (currentSign === initialSign) {
        return 0;
      }

      // Signs differ - penalize proportionally to how far we've gone
      return weight * Math.abs(current);
    },

    computeGradient(variables: Float64Array): Float64Array {
      const point = getPoint(variables);
      const values = [point.x, point.y, point.z];
      const current = values[axis];
      const currentSign = current > 0 ? 1 : -1;

      // If signs match, gradient is 0
      if (currentSign === initialSign) {
        return new Float64Array([0]);
      }

      // d/d(axis) of weight * |axis| = weight * sign(axis)
      // Since we only get here when current has wrong sign:
      // If initialSign > 0 and current < 0: d/d(current) of weight*|current| = -weight
      // If initialSign < 0 and current > 0: d/d(current) of weight*|current| = +weight
      return new Float64Array([weight * currentSign]);
    },
  };
}

/**
 * Creates sign preservation providers for the Y axis of all world points.
 * Y-axis is most prone to sign flips due to up/down ambiguity in photogrammetry.
 *
 * @param pointIndices Array of [name, indices, initialPosition] for each point
 * @param weight Regularization weight
 * @param getPointFn Function factory that returns a point getter given indices and locked values
 */
export function createYSignPreservationProviders(
  points: Array<{
    indices: readonly [number, number, number];
    locked: readonly [number | null, number | null, number | null];
    initialY: number;
    getPoint: PointGetter;
  }>,
  weight: number
): AnalyticalResidualProvider[] {
  const providers: AnalyticalResidualProvider[] = [];

  for (const { indices, initialY, getPoint } of points) {
    const provider = createSignPreservationProvider(
      indices,
      1, // Y axis
      initialY,
      weight,
      getPoint
    );
    if (provider.variableIndices.length > 0) {
      providers.push(provider);
    }
  }

  return providers;
}
