/**
 * Numerical Jacobian Wrapper
 *
 * Wraps existing ResidualWithJacobian providers to compute Jacobians
 * via numerical differentiation instead of analytical gradients.
 *
 * This allows validating the sparse solver infrastructure independently
 * of hand-coded analytical gradients.
 */

import type { ResidualWithJacobian } from './types';

/** Epsilon for central difference computation */
const NUMERICAL_EPS = 1e-7;

/**
 * Wrap a provider to use numerical Jacobian computation.
 *
 * The residual computation is unchanged, but the Jacobian is computed
 * via central differences instead of the provider's analytical gradient.
 */
export function wrapWithNumericalJacobian(
  provider: ResidualWithJacobian
): ResidualWithJacobian {
  return {
    id: `num_${provider.id}`,
    name: `Numerical(${provider.name})`,
    residualCount: provider.residualCount,
    variableIndices: provider.variableIndices,

    computeResiduals(variables: number[]): number[] {
      return provider.computeResiduals(variables);
    },

    computeJacobian(variables: number[]): number[][] {
      // Compute Jacobian via central differences
      const residualCount = provider.residualCount;
      const jacobian: number[][] = [];

      for (let r = 0; r < residualCount; r++) {
        jacobian.push(new Array(provider.variableIndices.length).fill(0));
      }

      // For each variable this residual depends on
      for (let localIdx = 0; localIdx < provider.variableIndices.length; localIdx++) {
        const globalIdx = provider.variableIndices[localIdx];

        // Perturb +epsilon
        const varsPlus = [...variables];
        varsPlus[globalIdx] += NUMERICAL_EPS;
        const residualsPlus = provider.computeResiduals(varsPlus);

        // Perturb -epsilon
        const varsMinus = [...variables];
        varsMinus[globalIdx] -= NUMERICAL_EPS;
        const residualsMinus = provider.computeResiduals(varsMinus);

        // Central difference for each residual
        for (let r = 0; r < residualCount; r++) {
          const grad = (residualsPlus[r] - residualsMinus[r]) / (2 * NUMERICAL_EPS);
          jacobian[r][localIdx] = isFinite(grad) ? grad : 0;
        }
      }

      return jacobian;
    },
  };
}

/**
 * Wrap all providers to use numerical Jacobian computation.
 */
export function wrapAllWithNumericalJacobian(
  providers: ResidualWithJacobian[]
): ResidualWithJacobian[] {
  return providers.map(wrapWithNumericalJacobian);
}
