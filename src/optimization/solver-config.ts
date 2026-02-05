/**
 * Solver Configuration
 *
 * The solver now uses analytical mode exclusively.
 * Dense and sparse autodiff modes have been removed.
 */

/**
 * Solver mode - now only 'analytical' is supported.
 */
export type SolverMode = 'analytical';

/**
 * Set the solver mode.
 * @deprecated No-op - analytical mode is always used.
 */
export function setSolverMode(_mode: SolverMode): void {
  // No-op - analytical mode is always used
}

/**
 * Get the current solver mode.
 * @returns Always 'analytical'
 */
export function getSolverMode(): SolverMode {
  return 'analytical';
}

/**
 * Check if sparse linear solve is enabled.
 * @returns Always true - analytical mode uses sparse CG
 */
export function useSparseSolve(): boolean {
  return true;
}

/**
 * Check if analytical gradients are enabled.
 * @returns Always true
 */
export function useAnalyticalSolve(): boolean {
  return true;
}

/**
 * Legacy function for backwards compatibility.
 * @deprecated No-op - analytical mode is always used
 */
export function setUseSparseSolve(_enabled: boolean): void {
  // No-op - analytical mode is always used
}
