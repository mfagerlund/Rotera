/**
 * Sparse Jacobian Builder
 *
 * Builds a sparse Jacobian matrix from ResidualWithJacobian providers.
 */

import type { ResidualWithJacobian } from '../explicit-jacobian/types';
import { SparseMatrix, Triplet } from './SparseMatrix';

/**
 * Builds a sparse Jacobian matrix from residual providers.
 *
 * The Jacobian has shape [totalResiduals x totalVariables] where:
 * - Each row corresponds to a residual
 * - Each column corresponds to a variable
 * - Entry J[i,j] = d(residual_i) / d(variable_j)
 */
export class SparseJacobianBuilder {
  /**
   * Build sparse Jacobian from residual providers.
   *
   * @param providers Array of residual providers
   * @param variables Current variable values
   * @param variableCount Total number of variables
   * @returns Sparse Jacobian matrix
   */
  build(
    providers: ResidualWithJacobian[],
    variables: number[],
    variableCount: number
  ): SparseMatrix {
    const triplets: Triplet[] = [];
    let residualOffset = 0;

    for (const provider of providers) {
      // Get the local Jacobian from this provider
      const localJacobian = provider.computeJacobian(variables);
      const variableIndices = provider.variableIndices;

      // Map local Jacobian entries to global positions
      for (let localRow = 0; localRow < localJacobian.length; localRow++) {
        const globalRow = residualOffset + localRow;
        const row = localJacobian[localRow];

        for (let localCol = 0; localCol < variableIndices.length; localCol++) {
          const globalCol = variableIndices[localCol];
          const value = row[localCol];

          // Only add non-zero entries
          if (Math.abs(value) > 1e-15) {
            triplets.push({ row: globalRow, col: globalCol, value });
          }
        }
      }

      residualOffset += provider.residualCount;
    }

    return SparseMatrix.fromTriplets(residualOffset, variableCount, triplets);
  }

  /**
   * Compute total residual count from providers.
   */
  getTotalResiduals(providers: ResidualWithJacobian[]): number {
    return providers.reduce((sum, p) => sum + p.residualCount, 0);
  }
}
