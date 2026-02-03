/**
 * Numerical Gradient Wrapper
 *
 * Wraps analytical providers to use finite-difference gradients instead.
 * Used for debugging to isolate gradient bugs.
 */

import { AnalyticalResidualProvider } from './types';

/**
 * Wraps a provider to use numerical (finite difference) gradients.
 * The residual computation stays the same, only gradients are computed numerically.
 */
export function wrapWithNumericalGradient(
  provider: AnalyticalResidualProvider,
  h: number = 1e-6
): AnalyticalResidualProvider {
  return {
    variableIndices: provider.variableIndices,

    computeResidual(variables: Float64Array): number {
      return provider.computeResidual(variables);
    },

    computeGradient(variables: Float64Array): Float64Array {
      const grad = new Float64Array(provider.variableIndices.length);

      for (let i = 0; i < provider.variableIndices.length; i++) {
        const varIdx = provider.variableIndices[i];

        // Create perturbed variable arrays
        const varsPlus = new Float64Array(variables);
        const varsMinus = new Float64Array(variables);
        varsPlus[varIdx] += h;
        varsMinus[varIdx] -= h;

        // Central difference
        const resPlus = provider.computeResidual(varsPlus);
        const resMinus = provider.computeResidual(varsMinus);
        grad[i] = (resPlus - resMinus) / (2 * h);
      }

      return grad;
    },
  };
}

/**
 * Wraps all providers to use numerical gradients.
 */
export function wrapAllWithNumericalGradients(
  providers: AnalyticalResidualProvider[],
  h: number = 1e-6
): AnalyticalResidualProvider[] {
  return providers.map(p => wrapWithNumericalGradient(p, h));
}
