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

export type SolverBackend = 'autodiff' | 'explicit-dense' | 'explicit-sparse';

/**
 * Current solver backend. Start with autodiff, switch after validation.
 *
 * To change: import this and modify, or set via environment variable.
 */
export let SOLVER_BACKEND: SolverBackend = 'autodiff';

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
