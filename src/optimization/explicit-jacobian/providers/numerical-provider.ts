/**
 * Numerical Gradient Provider
 *
 * Creates a ResidualWithJacobian that computes gradients via finite differences.
 * This is used to validate the sparse solver infrastructure independently of
 * hand-coded analytical gradients.
 *
 * Usage:
 *   const provider = createNumericalProvider(
 *     'myResidual',
 *     'My Residual',
 *     [0, 1, 2],  // variable indices this residual depends on
 *     (variables) => [residual1, residual2]  // residual function
 *   );
 */

import type { ResidualWithJacobian } from '../types';

/** Epsilon for central difference computation */
const NUMERICAL_EPS = 1e-7;

/**
 * Create a residual provider that computes Jacobians via numerical differentiation.
 *
 * @param id Unique identifier
 * @param name Human-readable name
 * @param variableIndices Indices of variables this residual depends on
 * @param residualFn Function that computes residuals given the full variable array
 * @param residualCount Number of residuals returned by residualFn
 */
export function createNumericalProvider(
  id: string,
  name: string,
  variableIndices: number[],
  residualFn: (variables: number[]) => number[],
  residualCount: number
): ResidualWithJacobian {
  return {
    id,
    name,
    residualCount,
    variableIndices,

    computeResiduals(variables: number[]): number[] {
      return residualFn(variables);
    },

    computeJacobian(variables: number[]): number[][] {
      // Compute Jacobian via central differences
      // Each row is a residual, each column is a local variable index
      const jacobian: number[][] = [];

      for (let r = 0; r < residualCount; r++) {
        jacobian.push(new Array(variableIndices.length).fill(0));
      }

      // For each variable this residual depends on
      for (let localIdx = 0; localIdx < variableIndices.length; localIdx++) {
        const globalIdx = variableIndices[localIdx];

        // Perturb +epsilon
        const varsPlus = [...variables];
        varsPlus[globalIdx] += NUMERICAL_EPS;
        const residualsPlus = residualFn(varsPlus);

        // Perturb -epsilon
        const varsMinus = [...variables];
        varsMinus[globalIdx] -= NUMERICAL_EPS;
        const residualsMinus = residualFn(varsMinus);

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
