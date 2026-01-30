/**
 * Dense Levenberg-Marquardt Solver Tests
 */

// Jest test file
import { ExplicitJacobianSystemImpl } from '../ExplicitJacobianSystem';
import { solveDenseLM } from '../dense-lm';
import { ResidualWithJacobian } from '../types';

describe('Dense LM Solver', () => {
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

        computeJacobian(variables: number[]): number[][] {
          // dr0/dx = 1, dr0/dy = 0
          // dr1/dx = 0, dr1/dy = 1
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

      const result = solveDenseLM(system, { verbose: false });

      expect(result.converged).toBe(true);
      expect(result.variables[0]).toBeCloseTo(3, 6);
      expect(result.variables[1]).toBeCloseTo(4, 6);
      expect(result.finalCost).toBeCloseTo(0, 10);
    });

    it('converges from a distant starting point', () => {
      const system = new ExplicitJacobianSystemImpl([100, -50]);
      system.addResidualProvider(createQuadraticProvider(3, 4));

      const result = solveDenseLM(system);

      expect(result.converged).toBe(true);
      expect(result.variables[0]).toBeCloseTo(3, 6);
      expect(result.variables[1]).toBeCloseTo(4, 6);
    });
  });

  describe('Nonlinear problem: circle fitting', () => {
    // Find center (cx, cy) and radius r that minimizes
    // sum of (distance from point to circle)^2

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
          const [cx, cy, r] = variables;
          return points.map((p) => {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // d(dist - r)/dcx = -dx/dist
            // d(dist - r)/dcy = -dy/dist
            // d(dist - r)/dr = -1
            return [-dx / dist, -dy / dist, -1];
          });
        },
      };
    }

    it('finds circle from points on a known circle', () => {
      // Generate points on a circle: center (5, 5), radius 3
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

      const system = new ExplicitJacobianSystemImpl([0, 0, 1]); // Initial guess
      system.addResidualProvider(createCircleFitProvider(points));

      const result = solveDenseLM(system, { maxIterations: 100 });

      expect(result.converged).toBe(true);
      expect(result.variables[0]).toBeCloseTo(trueCenter.x, 4);
      expect(result.variables[1]).toBeCloseTo(trueCenter.y, 4);
      expect(result.variables[2]).toBeCloseTo(trueRadius, 4);
    });

    it('handles noisy data', () => {
      // Points roughly on a circle with noise
      const trueCenter = { x: 10, y: 10 };
      const trueRadius = 5;
      const noise = 0.1;
      const points: { x: number; y: number }[] = [];

      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI * 2) / 16;
        points.push({
          x: trueCenter.x + (trueRadius + (Math.random() - 0.5) * noise * 2) * Math.cos(angle),
          y: trueCenter.y + (trueRadius + (Math.random() - 0.5) * noise * 2) * Math.sin(angle),
        });
      }

      const system = new ExplicitJacobianSystemImpl([8, 12, 4]); // Rough guess
      system.addResidualProvider(createCircleFitProvider(points));

      const result = solveDenseLM(system);

      expect(result.converged).toBe(true);
      // Allow more tolerance for noisy data
      expect(result.variables[0]).toBeCloseTo(trueCenter.x, 0);
      expect(result.variables[1]).toBeCloseTo(trueCenter.y, 0);
      expect(result.variables[2]).toBeCloseTo(trueRadius, 0);
    });
  });

  describe('Rosenbrock function', () => {
    // Classic test function: f(x,y) = (1-x)^2 + 100(y-x^2)^2
    // Minimum at (1, 1)
    // Residuals: [1-x, 10(y-x^2)]

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
          const [x, y] = variables;
          return [
            [-1, 0],           // d(1-x)/dx, d(1-x)/dy
            [-20 * x, 10],     // d(10(y-x^2))/dx, d(10(y-x^2))/dy
          ];
        },
      };
    }

    it('converges to global minimum', () => {
      const system = new ExplicitJacobianSystemImpl([-1, 1]);
      system.addResidualProvider(createRosenbrockProvider());

      const result = solveDenseLM(system, { maxIterations: 1000 });

      expect(result.converged).toBe(true);
      expect(result.variables[0]).toBeCloseTo(1, 4);
      expect(result.variables[1]).toBeCloseTo(1, 4);
    });
  });

  describe('Distance constraint', () => {
    // Residual: (distance - target) / target
    // Two points in 3D, minimize distance error

    function createDistanceProvider(
      targetDistance: number
    ): ResidualWithJacobian {
      return {
        id: 'distance',
        name: 'Distance',
        residualCount: 1,
        variableIndices: [0, 1, 2, 3, 4, 5], // p1.x, p1.y, p1.z, p2.x, p2.y, p2.z

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

          // dr/dp1 = -diff * invDistTarget
          // dr/dp2 = +diff * invDistTarget
          return [[
            -dx * invDistTarget,
            -dy * invDistTarget,
            -dz * invDistTarget,
            dx * invDistTarget,
            dy * invDistTarget,
            dz * invDistTarget,
          ]];
        },
      };
    }

    it('adjusts points to match target distance', () => {
      // Start with points at distance 5, target is 10
      const system = new ExplicitJacobianSystemImpl([0, 0, 0, 5, 0, 0]);
      system.addResidualProvider(createDistanceProvider(10));

      const result = solveDenseLM(system);

      expect(result.converged).toBe(true);

      // Calculate final distance
      const [p1x, p1y, p1z, p2x, p2y, p2z] = result.variables;
      const finalDist = Math.sqrt(
        (p2x - p1x) ** 2 + (p2y - p1y) ** 2 + (p2z - p1z) ** 2
      );

      expect(finalDist).toBeCloseTo(10, 4);
    });
  });
});
