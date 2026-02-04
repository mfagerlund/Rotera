/**
 * Focal Length Regularization Provider
 *
 * Penalizes focal length going outside reasonable bounds.
 * This prevents focal length from going negative or exploding during under-constrained solves.
 *
 * Matches the autodiff behavior in Viewpoint.computeResiduals:
 * - minF = maxDim * 0.3 (very wide angle, allows some fisheye)
 * - maxF = maxDim * 5.0 (very telephoto)
 * - weight = 500 (strong enough to prevent runaway focal length)
 *
 * Two residuals:
 * - belowMin: weight * max(0, (minF - f) / maxDim)
 * - aboveMax: weight * max(0, (f - maxF) / maxDim)
 */

import { AnalyticalResidualProvider } from '../types';

/**
 * Creates a provider that penalizes focal length below minimum.
 *
 * Residual: weight * max(0, (minF - f) / maxDim)
 * Gradient: -weight / maxDim when f < minF, else 0
 *
 * @param focalLengthIdx Variable index for focal length (-1 if locked)
 * @param minF Minimum focal length
 * @param maxDim Maximum image dimension (for normalization)
 * @param weight Penalty weight (default 500)
 */
export function createFocalLengthBelowMinProvider(
  focalLengthIdx: number,
  minF: number,
  maxDim: number,
  weight: number = 500
): AnalyticalResidualProvider {
  // If focal length is not optimized, the residual is always 0
  if (focalLengthIdx < 0) {
    return {
      variableIndices: [],
      computeResidual: () => 0,
      computeGradient: () => new Float64Array(0),
    };
  }

  return {
    variableIndices: [focalLengthIdx],

    computeResidual(variables: Float64Array): number {
      const f = variables[focalLengthIdx];
      const belowMin = Math.max(0, minF - f);
      return weight * belowMin / maxDim;
    },

    computeGradient(variables: Float64Array): Float64Array {
      const f = variables[focalLengthIdx];
      // d/df of weight * max(0, (minF - f)) / maxDim
      // = -weight / maxDim when f < minF
      // = 0 otherwise
      const grad = f < minF ? -weight / maxDim : 0;
      return new Float64Array([grad]);
    },
  };
}

/**
 * Creates a provider that penalizes focal length above maximum.
 *
 * Residual: weight * max(0, (f - maxF) / maxDim)
 * Gradient: weight / maxDim when f > maxF, else 0
 *
 * @param focalLengthIdx Variable index for focal length (-1 if locked)
 * @param maxF Maximum focal length
 * @param maxDim Maximum image dimension (for normalization)
 * @param weight Penalty weight (default 500)
 */
export function createFocalLengthAboveMaxProvider(
  focalLengthIdx: number,
  maxF: number,
  maxDim: number,
  weight: number = 500
): AnalyticalResidualProvider {
  // If focal length is not optimized, the residual is always 0
  if (focalLengthIdx < 0) {
    return {
      variableIndices: [],
      computeResidual: () => 0,
      computeGradient: () => new Float64Array(0),
    };
  }

  return {
    variableIndices: [focalLengthIdx],

    computeResidual(variables: Float64Array): number {
      const f = variables[focalLengthIdx];
      const aboveMax = Math.max(0, f - maxF);
      return weight * aboveMax / maxDim;
    },

    computeGradient(variables: Float64Array): Float64Array {
      const f = variables[focalLengthIdx];
      // d/df of weight * max(0, (f - maxF)) / maxDim
      // = weight / maxDim when f > maxF
      // = 0 otherwise
      const grad = f > maxF ? weight / maxDim : 0;
      return new Float64Array([grad]);
    },
  };
}

/**
 * Creates both focal length regularization providers (below-min and above-max).
 *
 * @param focalLengthIdx Variable index for focal length (-1 if locked)
 * @param imageWidth Image width in pixels
 * @param imageHeight Image height in pixels
 * @param weight Penalty weight (default 500)
 */
export function createFocalLengthRegularizationProviders(
  focalLengthIdx: number,
  imageWidth: number,
  imageHeight: number,
  weight: number = 500
): AnalyticalResidualProvider[] {
  const maxDim = Math.max(imageWidth, imageHeight);
  const minF = maxDim * 0.3;  // Very wide angle (allows some fisheye)
  const maxF = maxDim * 5.0;  // Very telephoto

  const providers: AnalyticalResidualProvider[] = [];

  const belowMin = createFocalLengthBelowMinProvider(focalLengthIdx, minF, maxDim, weight);
  if (belowMin.variableIndices.length > 0) {
    providers.push(belowMin);
  }

  const aboveMax = createFocalLengthAboveMaxProvider(focalLengthIdx, maxF, maxDim, weight);
  if (aboveMax.variableIndices.length > 0) {
    providers.push(aboveMax);
  }

  return providers;
}
