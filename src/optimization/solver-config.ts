/**
 * Solver Configuration
 *
 * Feature flag for switching between solver backends:
 * - 'autodiff': Uses scalar-autograd with automatic differentiation (current default)
 * - 'explicit-dense': Uses hand-coded Jacobians with dense LM solver
 * - 'explicit-sparse': Uses hand-coded Jacobians with sparse CG solver
 *
 * Phase 5 of the optimization migration plan.
 */

export type SolverBackend = 'autodiff' | 'explicit-dense' | 'explicit-sparse' | 'numerical-sparse';

/**
 * Current solver backend. Start with autodiff, switch after validation.
 *
 * To change: import this and modify, or set via environment variable.
 */
export let SOLVER_BACKEND: SolverBackend = 'autodiff';

/**
 * Comparison mode: when enabled, runs BOTH autodiff AND explicit-jacobian,
 * compares results, and logs differences. Use autodiff result but show comparison.
 * Helps debug explicit-jacobian issues by comparing with known-good autodiff.
 */
export let COMPARISON_MODE = false;

/**
 * Sparse solve mode: when enabled, the autodiff backend uses sparse CG
 * instead of dense Cholesky for solving the normal equations (J^T J + λI) x = -J^T r.
 * This is validated to produce identical results to dense Cholesky.
 *
 * Benefits:
 * - O(n * nnz) instead of O(n³) for linear solve
 * - Better scaling for large problems with sparse Jacobians
 *
 * This is STEP 3 of sparse validation: use sparse solve instead of just validating.
 */
export let USE_SPARSE_SOLVE = false;

/**
 * Set the solver backend programmatically.
 * Useful for A/B testing and benchmarks.
 */
export function setSolverBackend(backend: SolverBackend): void {
  SOLVER_BACKEND = backend;
}

/**
 * Get the current solver backend.
 */
export function getSolverBackend(): SolverBackend {
  return SOLVER_BACKEND;
}

/**
 * Enable or disable comparison mode.
 * When enabled, runs both autodiff and explicit solvers and compares.
 */
export function setComparisonMode(enabled: boolean): void {
  COMPARISON_MODE = enabled;
}

/**
 * Check if comparison mode is enabled.
 */
export function isComparisonMode(): boolean {
  return COMPARISON_MODE;
}

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
