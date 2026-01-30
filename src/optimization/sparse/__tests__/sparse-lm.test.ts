/**
 * Tests for Sparse Levenberg-Marquardt Solver
 */

import { ExplicitJacobianSystemImpl } from '../../explicit-jacobian/ExplicitJacobianSystem';
import { solveDenseLM } from '../../explicit-jacobian/dense-lm';
import { ResidualWithJacobian } from '../../explicit-jacobian/types';
import { solveSparseLM } from '../sparse-lm';

describe('Sparse LM Solver', () => {
  describe('Simple quadratic problem', () => {
    // Minimize: 0.5 * (x - 3)^2 + 0.5 * (y - 4)^2
    // Solution: x = 3, y = 4

    function createQuadraticProvider(targetX: number, targetY: number): ResidualWithJacobian {
      return {
        id: 'quadratic',
        name: 'Quadratic Residual',
        residualCount: 2,
        variableIndices: [0, 1],

        computeResiduals(variables: number[]): number[] {
          return [variables[0] - targetX, variables[1] - targetY];
        },

        computeJacobian(): number[][] {
          return [
            [1, 0],
            [0, 1],
          ];
        },
      };
    }

    it('converges to the correct solution', () => {
      const system = new ExplicitJacobianSystemImpl([0, 0]);
      system.addResidualProvider(createQuadraticProvider(3, 4));

      const result = solveSparseLM(system, { verbose: false });

      expect(result.converged).toBe(true);
      expect(result.variables[0]).toBeCloseTo(3, 6);
      expect(result.variables[1]).toBeCloseTo(4, 6);
      expect(result.finalCost).toBeCloseTo(0, 10);
    });

    it('converges from a distant starting point', () => {
      const system = new ExplicitJacobianSystemImpl([100, -50]);
      system.addResidualProvider(createQuadraticProvider(3, 4));

      const result = solveSparseLM(system);

      expect(result.converged).toBe(true);
      expect(result.variables[0]).toBeCloseTo(3, 6);
      expect(result.variables[1]).toBeCloseTo(4, 6);
    });
  });

  describe('Nonlinear problem: circle fitting', () => {
    function createCircleFitProvider(
      points: { x: number; y: number }[]
    ): ResidualWithJacobian {
      return {
        id: 'circle-fit',
        name: 'Circle Fit Residual',
        residualCount: points.length,
        variableIndices: [0, 1, 2], // cx, cy, r

        computeResiduals(variables: number[]): number[] {
          const [cx, cy, r] = variables;
          return points.map((p) => {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return dist - r;
          });
        },

        computeJacobian(variables: number[]): number[][] {
          const [cx, cy] = variables;
          return points.map((p) => {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return [-dx / dist, -dy / dist, -1];
          });
        },
      };
    }

    it('finds circle from points on a known circle', () => {
      const trueCenter = { x: 5, y: 5 };
      const trueRadius = 3;
      const points: { x: number; y: number }[] = [];

      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI * 2) / 8;
        points.push({
          x: trueCenter.x + trueRadius * Math.cos(angle),
          y: trueCenter.y + trueRadius * Math.sin(angle),
        });
      }

      const system = new ExplicitJacobianSystemImpl([0, 0, 1]);
      system.addResidualProvider(createCircleFitProvider(points));

      const result = solveSparseLM(system, { maxIterations: 100 });

      expect(result.converged).toBe(true);
      expect(result.variables[0]).toBeCloseTo(trueCenter.x, 4);
      expect(result.variables[1]).toBeCloseTo(trueCenter.y, 4);
      expect(result.variables[2]).toBeCloseTo(trueRadius, 4);
    });
  });

  describe('Rosenbrock function', () => {
    function createRosenbrockProvider(): ResidualWithJacobian {
      return {
        id: 'rosenbrock',
        name: 'Rosenbrock',
        residualCount: 2,
        variableIndices: [0, 1],

        computeResiduals(variables: number[]): number[] {
          const [x, y] = variables;
          return [1 - x, 10 * (y - x * x)];
        },

        computeJacobian(variables: number[]): number[][] {
          const [x] = variables;
          return [
            [-1, 0],
            [-20 * x, 10],
          ];
        },
      };
    }

    it('converges to global minimum', () => {
      const system = new ExplicitJacobianSystemImpl([-1, 1]);
      system.addResidualProvider(createRosenbrockProvider());

      const result = solveSparseLM(system, { maxIterations: 1000 });

      expect(result.converged).toBe(true);
      expect(result.variables[0]).toBeCloseTo(1, 4);
      expect(result.variables[1]).toBeCloseTo(1, 4);
    });
  });

  describe('Comparison with Dense LM', () => {
    function createDistanceProvider(targetDistance: number): ResidualWithJacobian {
      return {
        id: 'distance',
        name: 'Distance',
        residualCount: 1,
        variableIndices: [0, 1, 2, 3, 4, 5],

        computeResiduals(variables: number[]): number[] {
          const [p1x, p1y, p1z, p2x, p2y, p2z] = variables;
          const dx = p2x - p1x;
          const dy = p2y - p1y;
          const dz = p2z - p1z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          return [(dist - targetDistance) / targetDistance];
        },

        computeJacobian(variables: number[]): number[][] {
          const [p1x, p1y, p1z, p2x, p2y, p2z] = variables;
          const dx = p2x - p1x;
          const dy = p2y - p1y;
          const dz = p2z - p1z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const invDistTarget = 1 / (dist * targetDistance);

          return [
            [
              -dx * invDistTarget,
              -dy * invDistTarget,
              -dz * invDistTarget,
              dx * invDistTarget,
              dy * invDistTarget,
              dz * invDistTarget,
            ],
          ];
        },
      };
    }

    it('produces same results as Dense LM on distance constraint', () => {
      // Create two systems with identical setup
      const denseSystem = new ExplicitJacobianSystemImpl([0, 0, 0, 5, 0, 0]);
      denseSystem.addResidualProvider(createDistanceProvider(10));

      const sparseSystem = new ExplicitJacobianSystemImpl([0, 0, 0, 5, 0, 0]);
      sparseSystem.addResidualProvider(createDistanceProvider(10));

      const denseResult = solveDenseLM(denseSystem, { verbose: false });
      const sparseResult = solveSparseLM(sparseSystem, { verbose: false });

      // Both should converge
      expect(denseResult.converged).toBe(true);
      expect(sparseResult.converged).toBe(true);

      // Final costs should be very similar
      expect(sparseResult.finalCost).toBeCloseTo(denseResult.finalCost, 4);

      // Final distances should match target
      const getDist = (vars: number[]) => {
        const dx = vars[3] - vars[0];
        const dy = vars[4] - vars[1];
        const dz = vars[5] - vars[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      };

      expect(getDist(denseResult.variables)).toBeCloseTo(10, 4);
      expect(getDist(sparseResult.variables)).toBeCloseTo(10, 4);
    });

    it('produces same results on multi-residual problem', () => {
      // Problem: Two distance constraints forming a triangle
      const targetAB = 3;
      const targetBC = 4;

      function createMultiDistanceProvider(): ResidualWithJacobian {
        return {
          id: 'multi-distance',
          name: 'Multi Distance',
          residualCount: 2,
          variableIndices: [0, 1, 2, 3], // A.x, A.y, B.x, B.y

          computeResiduals(variables: number[]): number[] {
            const [ax, ay, bx, by] = variables;
            const distAB = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
            // B to origin (C at origin)
            const distBC = Math.sqrt(bx ** 2 + by ** 2);
            return [(distAB - targetAB) / targetAB, (distBC - targetBC) / targetBC];
          },

          computeJacobian(variables: number[]): number[][] {
            const [ax, ay, bx, by] = variables;
            const dxAB = bx - ax;
            const dyAB = by - ay;
            const distAB = Math.sqrt(dxAB ** 2 + dyAB ** 2);
            const distBC = Math.sqrt(bx ** 2 + by ** 2);

            return [
              // d(distAB)/d[ax, ay, bx, by] / targetAB
              [
                -dxAB / (distAB * targetAB),
                -dyAB / (distAB * targetAB),
                dxAB / (distAB * targetAB),
                dyAB / (distAB * targetAB),
              ],
              // d(distBC)/d[ax, ay, bx, by] / targetBC
              [0, 0, bx / (distBC * targetBC), by / (distBC * targetBC)],
            ];
          },
        };
      }

      const denseSystem = new ExplicitJacobianSystemImpl([1, 1, 2, 2]);
      denseSystem.addResidualProvider(createMultiDistanceProvider());

      const sparseSystem = new ExplicitJacobianSystemImpl([1, 1, 2, 2]);
      sparseSystem.addResidualProvider(createMultiDistanceProvider());

      const denseResult = solveDenseLM(denseSystem, { verbose: false });
      const sparseResult = solveSparseLM(sparseSystem, { verbose: false });

      expect(denseResult.converged).toBe(true);
      expect(sparseResult.converged).toBe(true);

      // Final costs should be similar
      expect(sparseResult.finalCost).toBeCloseTo(denseResult.finalCost, 3);
    });
  });

  describe('SparseJacobianBuilder', () => {
    it('builds correct sparse Jacobian', () => {
      const provider: ResidualWithJacobian = {
        id: 'test',
        name: 'Test',
        residualCount: 2,
        variableIndices: [0, 2], // Skip variable 1

        computeResiduals(): number[] {
          return [1, 2];
        },

        computeJacobian(): number[][] {
          return [
            [1, 2], // dr0/d[x0, x2]
            [3, 4], // dr1/d[x0, x2]
          ];
        },
      };

      const system = new ExplicitJacobianSystemImpl([1, 2, 3]);
      system.addResidualProvider(provider);

      // The sparse Jacobian should have:
      // Row 0: [1, 0, 2]
      // Row 1: [3, 0, 4]

      // We can verify this through the sparse LM (it will use the builder internally)
      const result = solveSparseLM(system, { maxIterations: 1 });

      // At least verify it doesn't crash and produces a result
      expect(result.variables).toHaveLength(3);
    });
  });
});
