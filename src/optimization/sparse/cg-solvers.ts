/**
 * Sparse Linear Solvers for Symmetric Positive Definite Systems.
 *
 * Ported from Colonel.Core.Optimization.SparseLinearSolver.
 */

import { SparseMatrix } from './SparseMatrix';

export interface CGResult {
  /** Solution vector x */
  x: number[];
  /** Number of iterations performed */
  iterations: number;
  /** Final residual norm */
  residualNorm: number;
  /** Whether convergence was achieved */
  converged: boolean;
}

/**
 * Solves Ax = b using Conjugate Gradient method.
 * A must be symmetric positive definite (like J^T J).
 *
 * @param A Sparse SPD matrix
 * @param b Right-hand side vector
 * @param x0 Initial guess (defaults to zero vector)
 * @param maxIterations Maximum iterations (default: 2 * dimension)
 * @param tolerance Convergence tolerance on residual norm (default: 1e-10)
 */
export function conjugateGradient(
  A: SparseMatrix,
  b: number[],
  x0?: number[],
  maxIterations = 0,
  tolerance = 1e-10
): CGResult {
  const n = b.length;
  if (maxIterations <= 0) maxIterations = 2 * n;

  const x = x0 ? [...x0] : new Array<number>(n).fill(0);
  const r = subtract(b, A.multiply(x)); // r = b - Ax
  const p = [...r]; // p = r
  let rsOld = dot(r, r);

  if (Math.sqrt(rsOld) < tolerance) {
    return { x, iterations: 0, residualNorm: Math.sqrt(rsOld), converged: true };
  }

  let iter = 0;
  for (iter = 0; iter < maxIterations; iter++) {
    const Ap = A.multiply(p);
    const pAp = dot(p, Ap);

    if (Math.abs(pAp) < 1e-30) {
      // Breakdown
      break;
    }

    const alpha = rsOld / pAp;

    // x = x + alpha * p
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
    }

    // r = r - alpha * Ap
    for (let i = 0; i < n; i++) {
      r[i] -= alpha * Ap[i];
    }

    const rsNew = dot(r, r);

    if (Math.sqrt(rsNew) < tolerance) {
      return { x, iterations: iter + 1, residualNorm: Math.sqrt(rsNew), converged: true };
    }

    const beta = rsNew / rsOld;

    // p = r + beta * p
    for (let i = 0; i < n; i++) {
      p[i] = r[i] + beta * p[i];
    }

    rsOld = rsNew;
  }

  return { x, iterations: iter, residualNorm: Math.sqrt(rsOld), converged: false };
}

/**
 * Solves Ax = b using Preconditioned Conjugate Gradient with Jacobi (diagonal) preconditioner.
 * Better convergence for ill-conditioned systems.
 *
 * @param A Sparse SPD matrix
 * @param b Right-hand side vector
 * @param x0 Initial guess (defaults to zero vector)
 * @param maxIterations Maximum iterations (default: 2 * dimension)
 * @param tolerance Convergence tolerance on residual norm (default: 1e-10)
 */
export function preconditionedConjugateGradient(
  A: SparseMatrix,
  b: number[],
  x0?: number[],
  maxIterations = 0,
  tolerance = 1e-10
): CGResult {
  const n = b.length;
  if (maxIterations <= 0) maxIterations = 2 * n;

  // Jacobi preconditioner: M = diag(A)
  const invDiag = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const diag = A.get(i, i);
    invDiag[i] = Math.abs(diag) > 1e-15 ? 1.0 / diag : 1.0;
  }

  const x = x0 ? [...x0] : new Array<number>(n).fill(0);
  const r = subtract(b, A.multiply(x)); // r = b - Ax

  // z = M^{-1} r (apply preconditioner)
  const z = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    z[i] = invDiag[i] * r[i];
  }

  const p = [...z];
  let rzOld = dot(r, z);

  let rNorm = Math.sqrt(dot(r, r));
  if (rNorm < tolerance) {
    return { x, iterations: 0, residualNorm: rNorm, converged: true };
  }

  let iter = 0;
  for (iter = 0; iter < maxIterations; iter++) {
    const Ap = A.multiply(p);
    const pAp = dot(p, Ap);

    if (Math.abs(pAp) < 1e-30) {
      break;
    }

    const alpha = rzOld / pAp;

    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * Ap[i];
    }

    rNorm = Math.sqrt(dot(r, r));
    if (rNorm < tolerance) {
      return { x, iterations: iter + 1, residualNorm: rNorm, converged: true };
    }

    // z = M^{-1} r
    for (let i = 0; i < n; i++) {
      z[i] = invDiag[i] * r[i];
    }

    const rzNew = dot(r, z);
    const beta = rzNew / rzOld;

    for (let i = 0; i < n; i++) {
      p[i] = z[i] + beta * p[i];
    }

    rzOld = rzNew;
  }

  return { x, iterations: iter, residualNorm: rNorm, converged: false };
}

/**
 * Solves (A + lambda * I) * x = b using CG.
 * This is the form needed for Levenberg-Marquardt: (J^T J + lambda * I) * step = -J^T r
 *
 * @param A Sparse SPD matrix (J^T J)
 * @param b Right-hand side vector (-J^T r)
 * @param lambda Damping factor
 * @param x0 Initial guess
 * @param maxIterations Maximum iterations
 * @param tolerance Convergence tolerance
 */
export function conjugateGradientDamped(
  A: SparseMatrix,
  b: number[],
  lambda: number,
  x0?: number[],
  maxIterations = 0,
  tolerance = 1e-10
): CGResult {
  // Add lambda to diagonal
  const dampedA = A.addDiagonal(lambda);
  return preconditionedConjugateGradient(dampedA, b, x0, maxIterations, tolerance);
}

// Helper functions

function subtract(a: number[], b: number[]): number[] {
  const result = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] - b[i];
  }
  return result;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}
