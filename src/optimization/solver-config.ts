/**
 * Solver Configuration
 *
 * Configuration for the autodiff-based Levenberg-Marquardt solver.
 */

/**
 * Sparse solve mode: uses sparse CG instead of dense Cholesky for solving
 * the normal equations (J^T J + λI) x = -J^T r.
 *
 * Benefits:
 * - O(n * nnz) instead of O(n³) for linear solve
 * - Better scaling for large problems with sparse Jacobians
 */
export let USE_SPARSE_SOLVE = true;

/**
 * Enable or disable sparse solve mode.
 * When enabled, uses CG instead of Cholesky for normal equations.
 */
export function setUseSparseSolve(enabled: boolean): void {
  USE_SPARSE_SOLVE = enabled;
}

/**
 * Check if sparse solve is enabled.
 */
export function useSparseSolve(): boolean {
  return USE_SPARSE_SOLVE;
}
