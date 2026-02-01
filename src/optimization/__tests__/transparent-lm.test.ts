/**
 * Tests for Transparent LM Solver
 *
 * Verifies that transparentLM produces equivalent results to
 * scalar-autograd's nonlinearLeastSquares.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Value, V, nonlinearLeastSquares } from 'scalar-autograd';
import { transparentLM, computeJacobian } from '../autodiff-dense-lm';
import { setUseSparseSolve, useSparseSolve } from '../solver-config';

describe('Transparent LM Solver', () => {
  describe('computeJacobian', () => {
    it('computes correct Jacobian for simple quadratic', () => {
      // f(x) = x^2 - 4, solution is x = 2
      const x = new Value(3, 'x', true);

      const residualFn = (vars: Value[]) => {
        return [V.sub(V.square(vars[0]), V.C(4))];
      };

      const { jacobian, residuals } = computeJacobian([x], residualFn);

      // residual = x^2 - 4 = 9 - 4 = 5
      expect(residuals[0]).toBeCloseTo(5, 6);

      // Jacobian: d(x^2 - 4)/dx = 2x = 6
      expect(jacobian[0][0]).toBeCloseTo(6, 6);
    });

    it('computes correct Jacobian for 2D Rosenbrock', () => {
      // Rosenbrock: r1 = 10(y - x^2), r2 = 1 - x
      const x = new Value(0, 'x', true);
      const y = new Value(0, 'y', true);

      const residualFn = (vars: Value[]) => {
        const vx = vars[0];
        const vy = vars[1];
        return [
          V.mul(V.C(10), V.sub(vy, V.square(vx))), // 10(y - x^2)
          V.sub(V.C(1), vx), // 1 - x
        ];
      };

      const { jacobian, residuals } = computeJacobian([x, y], residualFn);

      // At (0, 0):
      // r1 = 10(0 - 0) = 0
      // r2 = 1 - 0 = 1
      expect(residuals[0]).toBeCloseTo(0, 6);
      expect(residuals[1]).toBeCloseTo(1, 6);

      // dr1/dx = -20x = 0, dr1/dy = 10
      expect(jacobian[0][0]).toBeCloseTo(0, 6);
      expect(jacobian[0][1]).toBeCloseTo(10, 6);

      // dr2/dx = -1, dr2/dy = 0
      expect(jacobian[1][0]).toBeCloseTo(-1, 6);
      expect(jacobian[1][1]).toBeCloseTo(0, 6);
    });
  });

  describe('transparentLM', () => {
    it('solves simple quadratic', () => {
      // f(x) = x^2 - 4, solution is x = 2
      const x = new Value(3, 'x', true);

      const residualFn = (vars: Value[]) => {
        return [V.sub(V.square(vars[0]), V.C(4))];
      };

      const result = transparentLM([x], residualFn, {
        maxIterations: 100,
        costTolerance: 1e-10,
      });

      expect(result.success).toBe(true);
      expect(x.data).toBeCloseTo(2, 4);
    });

    it('solves 2D Rosenbrock', () => {
      // Rosenbrock minimum is at (1, 1)
      const x = new Value(0, 'x', true);
      const y = new Value(0, 'y', true);

      const residualFn = (vars: Value[]) => {
        const vx = vars[0];
        const vy = vars[1];
        return [
          V.mul(V.C(10), V.sub(vy, V.square(vx))),
          V.sub(V.C(1), vx),
        ];
      };

      const result = transparentLM([x, y], residualFn, {
        maxIterations: 500,
        costTolerance: 1e-10,
      });

      expect(result.success).toBe(true);
      expect(x.data).toBeCloseTo(1, 3);
      expect(y.data).toBeCloseTo(1, 3);
    });

    it('matches nonlinearLeastSquares on distance problem', () => {
      // Simple distance constraint: point (x, y) should be at distance 5 from origin
      // Residual: sqrt(x^2 + y^2) - 5
      // Start at (3, 0), should converge to (5, 0) or similar

      // Test with original solver
      const x1 = new Value(3, 'x', true);
      const y1 = new Value(0, 'y', true);

      const residualFn = (vars: Value[]) => {
        const dist = V.sqrt(V.add(V.square(vars[0]), V.square(vars[1])));
        return [V.sub(dist, V.C(5))];
      };

      const origResult = nonlinearLeastSquares([x1, y1], residualFn, {
        maxIterations: 100,
        costTolerance: 1e-10,
      });

      // Test with transparent solver
      const x2 = new Value(3, 'x', true);
      const y2 = new Value(0, 'y', true);

      const transResult = transparentLM([x2, y2], residualFn, {
        maxIterations: 100,
        costTolerance: 1e-10,
      });

      // Both should converge
      expect(origResult.success).toBe(true);
      expect(transResult.success).toBe(true);

      // Final costs should be similar (both near 0)
      expect(origResult.finalCost).toBeLessThan(1e-8);
      expect(transResult.finalCost).toBeLessThan(1e-8);

      // Distance from origin should be 5 for both
      const dist1 = Math.sqrt(x1.data ** 2 + y1.data ** 2);
      const dist2 = Math.sqrt(x2.data ** 2 + y2.data ** 2);
      expect(dist1).toBeCloseTo(5, 4);
      expect(dist2).toBeCloseTo(5, 4);
    });

    it('matches nonlinearLeastSquares on multi-residual problem', () => {
      // Two points should be at distance 3 apart
      // Point A at (0, 0), Point B at (x, y)
      // Residual: distance(A, B) - 3
      // Also: B should be on line y = x
      // Residuals: [dist - 3, y - x]

      const x1 = new Value(1, 'x', true);
      const y1 = new Value(2, 'y', true);

      const residualFn = (vars: Value[]) => {
        const vx = vars[0];
        const vy = vars[1];
        const dist = V.sqrt(V.add(V.square(vx), V.square(vy)));
        return [
          V.sub(dist, V.C(3)),
          V.sub(vy, vx),
        ];
      };

      const origResult = nonlinearLeastSquares([x1, y1], residualFn, {
        maxIterations: 100,
        costTolerance: 1e-10,
      });

      const x2 = new Value(1, 'x', true);
      const y2 = new Value(2, 'y', true);

      const transResult = transparentLM([x2, y2], residualFn, {
        maxIterations: 100,
        costTolerance: 1e-10,
      });

      // Both should converge
      expect(origResult.success).toBe(true);
      expect(transResult.success).toBe(true);

      // Solutions should match
      // x = y (on line y = x)
      expect(x1.data).toBeCloseTo(y1.data, 4);
      expect(x2.data).toBeCloseTo(y2.data, 4);

      // Distance should be 3
      const dist1 = Math.sqrt(x1.data ** 2 + y1.data ** 2);
      const dist2 = Math.sqrt(x2.data ** 2 + y2.data ** 2);
      expect(dist1).toBeCloseTo(3, 4);
      expect(dist2).toBeCloseTo(3, 4);
    });

    it('exposes Jacobian in result', () => {
      const x = new Value(3, 'x', true);

      const residualFn = (vars: Value[]) => {
        return [V.sub(V.square(vars[0]), V.C(4))];
      };

      const result = transparentLM([x], residualFn, {
        maxIterations: 100,
        costTolerance: 1e-10,
      });

      // Should have Jacobian
      expect(result.jacobian).toBeDefined();
      expect(result.jacobian.length).toBe(1);
      expect(result.jacobian[0].length).toBe(1);

      // Final Jacobian should be 2x = 4 (at x = 2)
      expect(result.jacobian[0][0]).toBeCloseTo(4, 4);
    });
  });

  describe('sparse solve mode (Step 3)', () => {
    it('solves simple quadratic with sparse CG', () => {
      const x = new Value(3, 'x', true);

      const residualFn = (vars: Value[]) => {
        return [V.sub(V.square(vars[0]), V.C(4))];
      };

      const result = transparentLM([x], residualFn, {
        maxIterations: 100,
        costTolerance: 1e-10,
        useSparseLinearSolve: true,
      });

      expect(result.success).toBe(true);
      expect(x.data).toBeCloseTo(2, 4);
    });

    it('solves Rosenbrock with sparse CG', () => {
      const x = new Value(0, 'x', true);
      const y = new Value(0, 'y', true);

      const residualFn = (vars: Value[]) => {
        const vx = vars[0];
        const vy = vars[1];
        return [
          V.mul(V.C(10), V.sub(vy, V.square(vx))),
          V.sub(V.C(1), vx),
        ];
      };

      const result = transparentLM([x, y], residualFn, {
        maxIterations: 500,
        costTolerance: 1e-10,
        useSparseLinearSolve: true,
      });

      expect(result.success).toBe(true);
      expect(x.data).toBeCloseTo(1, 3);
      expect(y.data).toBeCloseTo(1, 3);
    });

    it('produces same results as dense Cholesky', () => {
      // Test that sparse CG produces identical results to dense Cholesky
      const residualFn = (vars: Value[]) => {
        const vx = vars[0];
        const vy = vars[1];
        const dist = V.sqrt(V.add(V.square(vx), V.square(vy)));
        return [
          V.sub(dist, V.C(3)),
          V.sub(vy, vx),
        ];
      };

      // Dense Cholesky solve
      const x1 = new Value(1, 'x', true);
      const y1 = new Value(2, 'y', true);
      const denseResult = transparentLM([x1, y1], residualFn, {
        maxIterations: 100,
        costTolerance: 1e-10,
        useSparseLinearSolve: false,
      });

      // Sparse CG solve
      const x2 = new Value(1, 'x', true);
      const y2 = new Value(2, 'y', true);
      const sparseResult = transparentLM([x2, y2], residualFn, {
        maxIterations: 100,
        costTolerance: 1e-10,
        useSparseLinearSolve: true,
      });

      // Both should converge
      expect(denseResult.success).toBe(true);
      expect(sparseResult.success).toBe(true);

      // Final costs should be identical
      expect(sparseResult.finalCost).toBeCloseTo(denseResult.finalCost, 6);

      // Solutions should be identical
      expect(x2.data).toBeCloseTo(x1.data, 4);
      expect(y2.data).toBeCloseTo(y1.data, 4);
    });
  });
});
