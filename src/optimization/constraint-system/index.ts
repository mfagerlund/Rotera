/**
 * ConstraintSystem - 3D constraint solver using ScalarAutograd
 *
 * Inspired by ScalarAutograd's SketchSolver but adapted for 3D photogrammetry.
 * Solves geometric constraints by minimizing residuals using Levenberg-Marquardt.
 *
 * This system orchestrates entity-driven optimization:
 * - WorldPoints add themselves to the ValueMap (deciding locked vs free axes)
 * - Lines compute their own intrinsic residuals (direction, length)
 * - Constraints compute their own residuals
 */

export { ConstraintSystem } from './ConstraintSystem';
export type { SolverResult, SolverOptions } from './types';
export { rotateDirectionByQuaternion } from './utils';
