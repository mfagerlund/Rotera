/**
 * ConstraintSystem - 3D constraint solver using analytical gradients
 *
 * Solves geometric constraints by minimizing residuals using Levenberg-Marquardt
 * with analytically computed Jacobians.
 *
 * This system orchestrates entity-driven optimization:
 * - VariableLayoutBuilder collects entities and builds variable indices
 * - Analytical providers compute residuals and gradients
 * - Sparse CG solver handles the normal equations
 */

export { ConstraintSystem } from './ConstraintSystem';
export type { SolverResult, SolverOptions } from './types';
