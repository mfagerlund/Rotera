/**
 * Direct accumulation of normal equations J^T J and J^T r.
 *
 * Key insight: We never materialize the full M×N Jacobian matrix.
 * Each provider knows its sparse dependency pattern (~10 variables),
 * so it contributes a ~10×10 block to J^T J directly.
 *
 * Complexity: O(M × k²) where k is max variables per residual (~10),
 * vs O(M × N²) for dense Jacobian approach.
 */

import { SparseMatrix, Triplet } from '../sparse/SparseMatrix';
import { AnalyticalResidualProvider } from './types';

/**
 * Result of accumulating normal equations from all providers.
 */
export interface NormalEquations {
  /** J^T J as sparse matrix (N×N where N = numVariables) */
  JtJ: SparseMatrix;

  /** -J^T r: negative gradient of cost function (descent direction) */
  negJtr: Float64Array;

  /** Sum of squared residuals: Σ r_i² */
  cost: number;

  /** Individual residual values (for debugging/validation) */
  residuals: Float64Array;
}

/**
 * Accumulates J^T J and J^T r directly from providers.
 * Never materializes the full Jacobian.
 *
 * For each provider with residual r and gradient g (length k):
 * - Contributes g[i] * g[j] to JtJ[vi, vj] for all i,j in variableIndices
 * - Contributes g[i] * r to Jtr[vi] for all i in variableIndices
 *
 * @param variables Current variable values
 * @param providers Residual providers (one per residual)
 * @param numVariables Total number of variables (for matrix dimensions)
 * @returns Normal equations ready for solving
 */
export function accumulateNormalEquations(
  variables: Float64Array,
  providers: readonly AnalyticalResidualProvider[],
  numVariables: number
): NormalEquations {
  const m = providers.length;

  const triplets: Triplet[] = [];
  const negJtr = new Float64Array(numVariables);
  const residuals = new Float64Array(m);
  let cost = 0;

  for (let p = 0; p < m; p++) {
    const provider = providers[p];
    const r = provider.computeResidual(variables);
    const grad = provider.computeGradient(variables);
    const idx = provider.variableIndices;

    residuals[p] = r;
    cost += r * r;

    // Accumulate into J^T J (symmetric, so store both (i,j) and (j,i))
    for (let i = 0; i < idx.length; i++) {
      const vi = idx[i];
      if (vi < 0) continue; // Locked variable

      for (let j = i; j < idx.length; j++) {
        const vj = idx[j];
        if (vj < 0) continue; // Locked variable

        const contrib = grad[i] * grad[j];
        triplets.push({ row: vi, col: vj, value: contrib });
        if (vi !== vj) {
          triplets.push({ row: vj, col: vi, value: contrib }); // Symmetric
        }
      }

      // Accumulate into -J^T r (negative for descent direction)
      negJtr[vi] -= grad[i] * r;
    }
  }

  const JtJ = SparseMatrix.fromTriplets(numVariables, numVariables, triplets);

  return { JtJ, negJtr, cost, residuals };
}
