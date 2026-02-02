/**
 * Solver Configuration
 *
 * Configuration for the Levenberg-Marquardt solver.
 */

/**
 * Solver mode options:
 * - 'dense': Dense Cholesky with autodiff (O(n³) linear solve)
 * - 'sparse': Sparse CG with autodiff (O(n·nnz) linear solve)
 * - 'analytical': Sparse CG with analytical gradients (bypasses autodiff entirely)
 */
export type SolverMode = 'dense' | 'sparse' | 'analytical';

/**
 * Current solver mode. Default is 'analytical' (Phase 7 complete).
 */
let SOLVER_MODE: SolverMode = 'analytical';

/**
 * Set the solver mode.
 */
export function setSolverMode(mode: SolverMode): void {
  SOLVER_MODE = mode;
}

/**
 * Get the current solver mode.
 */
export function getSolverMode(): SolverMode {
  return SOLVER_MODE;
}

/**
 * Check if sparse linear solve is enabled (true for 'sparse' and 'analytical' modes).
 */
export function useSparseSolve(): boolean {
  return SOLVER_MODE === 'sparse' || SOLVER_MODE === 'analytical';
}

/**
 * Check if analytical gradients are enabled (true for 'analytical' mode).
 */
export function useAnalyticalSolve(): boolean {
  return SOLVER_MODE === 'analytical';
}

/**
 * Legacy function for backwards compatibility.
 * @deprecated Use setSolverMode() instead
 */
export function setUseSparseSolve(enabled: boolean): void {
  // Preserve analytical mode if currently set, otherwise toggle between dense/sparse
  if (SOLVER_MODE === 'analytical') {
    // If disabling sparse, switch to dense
    if (!enabled) {
      SOLVER_MODE = 'dense';
    }
    // If enabling sparse, stay on analytical (it's already sparse)
  } else {
    SOLVER_MODE = enabled ? 'sparse' : 'dense';
  }
}
