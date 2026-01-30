/**
 * Sparse Matrix Module
 *
 * Provides sparse matrix operations and conjugate gradient solvers
 * for efficient large-scale optimization.
 */

export { SparseMatrix, SparseMatrixBuilder, type Triplet } from './SparseMatrix';
export {
  conjugateGradient,
  preconditionedConjugateGradient,
  conjugateGradientDamped,
  type CGResult,
} from './cg-solvers';
export { SparseJacobianBuilder } from './sparse-jacobian-builder';
export { solveSparseLM } from './sparse-lm';
