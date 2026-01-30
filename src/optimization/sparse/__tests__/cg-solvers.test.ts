/**
 * Tests for Conjugate Gradient solvers.
 */

import { SparseMatrix } from '../SparseMatrix';
import {
  conjugateGradient,
  preconditionedConjugateGradient,
  conjugateGradientDamped,
} from '../cg-solvers';

describe('Conjugate Gradient Solvers', () => {
  describe('conjugateGradient', () => {
    it('solves simple 2x2 SPD system', () => {
      // A = [4, 1]  (symmetric positive definite)
      //     [1, 3]
      const A = SparseMatrix.fromDense([
        [4, 1],
        [1, 3],
      ]);
      const b = [1, 2];

      const { x, converged } = conjugateGradient(A, b);

      expect(converged).toBe(true);

      // Verify: A * x = b
      const Ax = A.multiply(x);
      expect(Ax[0]).toBeCloseTo(b[0], 6);
      expect(Ax[1]).toBeCloseTo(b[1], 6);
    });

    it('solves tridiagonal system', () => {
      // Classic tridiagonal: [2, -1, 0, ...]
      //                      [-1, 2, -1, ...]
      const n = 10;
      const dense: number[][] = [];
      for (let i = 0; i < n; i++) {
        const row = new Array<number>(n).fill(0);
        row[i] = 2;
        if (i > 0) row[i - 1] = -1;
        if (i < n - 1) row[i + 1] = -1;
        dense.push(row);
      }
      const A = SparseMatrix.fromDense(dense);

      // Right-hand side: all ones
      const b = new Array<number>(n).fill(1);

      const { x, converged, iterations } = conjugateGradient(A, b);

      expect(converged).toBe(true);
      expect(iterations).toBeLessThanOrEqual(n); // CG converges in at most n iterations for SPD

      // Verify: A * x = b
      const Ax = A.multiply(x);
      for (let i = 0; i < n; i++) {
        expect(Ax[i]).toBeCloseTo(b[i], 5);
      }
    });

    it('handles diagonal system', () => {
      const A = SparseMatrix.fromDense([
        [2, 0, 0],
        [0, 3, 0],
        [0, 0, 4],
      ]);
      const b = [2, 6, 8];

      const { x, converged } = conjugateGradient(A, b);

      expect(converged).toBe(true);
      expect(x[0]).toBeCloseTo(1, 6);
      expect(x[1]).toBeCloseTo(2, 6);
      expect(x[2]).toBeCloseTo(2, 6);
    });

    it('uses initial guess', () => {
      const A = SparseMatrix.fromDense([
        [4, 1],
        [1, 3],
      ]);
      const b = [1, 2];

      // Good initial guess should converge faster
      const x0 = [0.1, 0.6]; // Close to solution

      const { x, converged, iterations } = conjugateGradient(A, b, x0);

      expect(converged).toBe(true);
      expect(iterations).toBeLessThanOrEqual(2);

      const Ax = A.multiply(x);
      expect(Ax[0]).toBeCloseTo(b[0], 6);
      expect(Ax[1]).toBeCloseTo(b[1], 6);
    });

    it('returns early if initial residual is small', () => {
      const A = SparseMatrix.fromDense([
        [1, 0],
        [0, 1],
      ]);
      const b = [1, 2];
      const x0 = [1, 2]; // Exact solution

      const { x, converged, iterations } = conjugateGradient(A, b, x0);

      expect(converged).toBe(true);
      expect(iterations).toBe(0);
      expect(x).toEqual(x0);
    });
  });

  describe('preconditionedConjugateGradient', () => {
    it('solves same system as basic CG', () => {
      const A = SparseMatrix.fromDense([
        [4, 1],
        [1, 3],
      ]);
      const b = [1, 2];

      const { x, converged } = preconditionedConjugateGradient(A, b);

      expect(converged).toBe(true);

      const Ax = A.multiply(x);
      expect(Ax[0]).toBeCloseTo(b[0], 6);
      expect(Ax[1]).toBeCloseTo(b[1], 6);
    });

    it('converges for ill-conditioned system', () => {
      // Diagonal with varying scale - ill-conditioned
      const A = SparseMatrix.fromDense([
        [1000, 0, 0],
        [0, 1, 0],
        [0, 0, 0.001],
      ]);
      const b = [1000, 1, 0.001];

      const { x, converged } = preconditionedConjugateGradient(A, b);

      expect(converged).toBe(true);
      expect(x[0]).toBeCloseTo(1, 4);
      expect(x[1]).toBeCloseTo(1, 4);
      expect(x[2]).toBeCloseTo(1, 4);
    });

    it('should generally converge faster than basic CG for ill-conditioned systems', () => {
      // Create an ill-conditioned system
      const n = 20;
      const dense: number[][] = [];
      for (let i = 0; i < n; i++) {
        const row = new Array<number>(n).fill(0);
        // Diagonal with condition number ~ 1000
        row[i] = 1 + (999 * i) / (n - 1);
        dense.push(row);
      }
      const A = SparseMatrix.fromDense(dense);
      const b = new Array<number>(n).fill(1);

      const basicResult = conjugateGradient(A, b, undefined, 100);
      const preconResult = preconditionedConjugateGradient(A, b, undefined, 100);

      // Both should converge
      expect(basicResult.converged).toBe(true);
      expect(preconResult.converged).toBe(true);

      // Preconditioned should have lower residual or fewer iterations
      // (For diagonal matrix, Jacobi preconditioning is optimal)
      expect(preconResult.iterations).toBeLessThanOrEqual(basicResult.iterations);
    });
  });

  describe('conjugateGradientDamped', () => {
    it('solves (A + lambda*I) x = b', () => {
      const A = SparseMatrix.fromDense([
        [4, 1],
        [1, 3],
      ]);
      const b = [1, 2];
      const lambda = 2;

      const { x, converged } = conjugateGradientDamped(A, b, lambda);

      expect(converged).toBe(true);

      // Verify: (A + lambda*I) * x = b
      const dampedA = A.addDiagonal(lambda);
      const Ax = dampedA.multiply(x);
      expect(Ax[0]).toBeCloseTo(b[0], 6);
      expect(Ax[1]).toBeCloseTo(b[1], 6);
    });

    it('handles zero lambda (same as basic CG)', () => {
      const A = SparseMatrix.fromDense([
        [4, 1],
        [1, 3],
      ]);
      const b = [1, 2];

      const dampedResult = conjugateGradientDamped(A, b, 0);
      const basicResult = conjugateGradient(A, b);

      expect(dampedResult.converged).toBe(true);
      expect(dampedResult.x[0]).toBeCloseTo(basicResult.x[0], 6);
      expect(dampedResult.x[1]).toBeCloseTo(basicResult.x[1], 6);
    });

    it('improves conditioning with large lambda', () => {
      // Near-singular matrix
      const A = SparseMatrix.fromDense([
        [1, 0.999],
        [0.999, 1],
      ]);
      const b = [1, 1];

      // With damping, should converge more reliably
      const { x, converged } = conjugateGradientDamped(A, b, 1);

      expect(converged).toBe(true);
      // (A + I) * x = b
      const dampedA = A.addDiagonal(1);
      const Ax = dampedA.multiply(x);
      expect(Ax[0]).toBeCloseTo(b[0], 5);
      expect(Ax[1]).toBeCloseTo(b[1], 5);
    });
  });

  describe('Levenberg-Marquardt style usage', () => {
    it('solves J^T J x = J^T r form', () => {
      // Jacobian J (m x n where m > n)
      const J = SparseMatrix.fromDense([
        [1, 0],
        [0, 1],
        [1, 1],
      ]);

      // Residuals
      const r = [0.1, 0.2, 0.3];

      // Compute normal equations
      const JtJ = J.computeJtJ();
      const Jtr = J.computeJtr(r);

      // Solve J^T J x = J^T r (least squares)
      const { x, converged } = conjugateGradient(JtJ, Jtr);

      expect(converged).toBe(true);

      // The solution minimizes ||Jx - r||^2
      // For this simple case, we can verify
      const Jx = J.multiply(x);
      const residual = Jx.map((v, i) => v - r[i]);
      const cost = residual.reduce((sum, v) => sum + v * v, 0);

      // Should be a least-squares solution
      expect(cost).toBeLessThan(0.15);
    });

    it('solves with LM damping', () => {
      const J = SparseMatrix.fromDense([
        [1, 2],
        [3, 4],
      ]);
      const r = [0.5, 1.0];
      const lambda = 0.01;

      const JtJ = J.computeJtJ();
      const Jtr = J.computeJtr(r);

      // Solve (J^T J + lambda*I) step = J^T r
      const { x: step, converged } = conjugateGradientDamped(JtJ, Jtr, lambda);

      expect(converged).toBe(true);

      // Verify solution
      const dampedJtJ = JtJ.addDiagonal(lambda);
      const check = dampedJtJ.multiply(step);
      expect(check[0]).toBeCloseTo(Jtr[0], 5);
      expect(check[1]).toBeCloseTo(Jtr[1], 5);
    });
  });
});
