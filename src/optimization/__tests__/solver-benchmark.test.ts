/**
 * Solver Benchmark Tests
 *
 * Compares performance between:
 * - Explicit Dense LM (hand-coded Jacobians)
 * - Explicit Sparse LM (hand-coded Jacobians + sparse CG)
 *
 * Run with: npm test -- --watchAll=false --testPathPattern="solver-benchmark"
 */

import { ExplicitJacobianSystemImpl, solveDenseLM } from '../explicit-jacobian';
import { solveSparseLM } from '../sparse';
import {
  createDistanceProvider,
  createFixedPointProvider,
  createLineLengthProvider,
  createCoincidentPointProvider,
} from '../explicit-jacobian/providers';
import type { ResidualWithJacobian } from '../explicit-jacobian/types';

// Timing utilities
function measureTime(fn: () => void, iterations: number = 1): { avgMs: number; totalMs: number } {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const totalMs = performance.now() - start;
  return { avgMs: totalMs / iterations, totalMs };
}

/**
 * Create a benchmark scenario with random 3D point cloud and distance constraints.
 */
function createDistanceConstraintScenario(
  numPoints: number,
  numConstraints: number
): { variables: number[]; providers: ResidualWithJacobian[] } {
  const variables: number[] = [];
  const providers: ResidualWithJacobian[] = [];

  // Generate random initial positions
  for (let i = 0; i < numPoints; i++) {
    variables.push(Math.random() * 10, Math.random() * 10, Math.random() * 10);
  }

  // Fix first point
  providers.push(createFixedPointProvider('fixed-0', [0, 1, 2], [0, 0, 0]));

  // Create random distance constraints
  for (let c = 0; c < numConstraints; c++) {
    const p1 = Math.floor(Math.random() * numPoints);
    let p2 = Math.floor(Math.random() * numPoints);
    while (p2 === p1) {
      p2 = Math.floor(Math.random() * numPoints);
    }

    const p1Indices: [number, number, number] = [p1 * 3, p1 * 3 + 1, p1 * 3 + 2];
    const p2Indices: [number, number, number] = [p2 * 3, p2 * 3 + 1, p2 * 3 + 2];

    // Target distance is the initial distance
    const dx = variables[p2 * 3] - variables[p1 * 3];
    const dy = variables[p2 * 3 + 1] - variables[p1 * 3 + 1];
    const dz = variables[p2 * 3 + 2] - variables[p1 * 3 + 2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    providers.push(createDistanceProvider(`dist-${c}`, p1Indices, p2Indices, dist));
  }

  return { variables, providers };
}

/**
 * Create a benchmark scenario with lines and coincident points.
 */
function createLineScenario(
  numLines: number,
  pointsPerLine: number
): { variables: number[]; providers: ResidualWithJacobian[] } {
  const variables: number[] = [];
  const providers: ResidualWithJacobian[] = [];
  let varIndex = 0;

  // Fix origin
  variables.push(0, 0, 0);
  providers.push(createFixedPointProvider('origin', [0, 1, 2], [0, 0, 0]));
  varIndex = 3;

  for (let l = 0; l < numLines; l++) {
    // Line endpoints
    const startIdx = varIndex;
    const startX = Math.random() * 10;
    const startY = Math.random() * 10;
    const startZ = Math.random() * 10;
    variables.push(startX, startY, startZ);
    varIndex += 3;

    const endIdx = varIndex;
    const endX = startX + Math.random() * 5;
    const endY = startY + Math.random() * 5;
    const endZ = startZ + Math.random() * 5;
    variables.push(endX, endY, endZ);
    varIndex += 3;

    // Line length constraint
    const dx = endX - startX;
    const dy = endY - startY;
    const dz = endZ - startZ;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    providers.push(
      createLineLengthProvider(
        `line-${l}`,
        [startIdx, startIdx + 1, startIdx + 2],
        [endIdx, endIdx + 1, endIdx + 2],
        length
      )
    );

    // Coincident points on line
    for (let p = 0; p < pointsPerLine; p++) {
      const t = (p + 1) / (pointsPerLine + 1);
      const px = startX + t * dx;
      const py = startY + t * dy;
      const pz = startZ + t * dz;

      const pointIdx = varIndex;
      variables.push(
        px + (Math.random() - 0.5) * 0.1,
        py + (Math.random() - 0.5) * 0.1,
        pz + (Math.random() - 0.5) * 0.1
      );
      varIndex += 3;

      providers.push(
        createCoincidentPointProvider(
          `coincident-${l}-${p}`,
          [startIdx, startIdx + 1, startIdx + 2],
          [endIdx, endIdx + 1, endIdx + 2],
          [pointIdx, pointIdx + 1, pointIdx + 2]
        )
      );
    }
  }

  return { variables, providers };
}

describe('Solver Benchmark', () => {
  describe('Correctness (both solvers produce same results)', () => {
    it('small distance constraint problem', () => {
      const { variables, providers } = createDistanceConstraintScenario(10, 15);

      const denseSystem = new ExplicitJacobianSystemImpl([...variables]);
      providers.forEach((p) => denseSystem.addResidualProvider(p));
      const denseResult = solveDenseLM(denseSystem, { maxIterations: 500, verbose: false });

      const sparseSystem = new ExplicitJacobianSystemImpl([...variables]);
      providers.forEach((p) => sparseSystem.addResidualProvider(p));
      const sparseResult = solveSparseLM(sparseSystem, { maxIterations: 500, verbose: false });

      expect(denseResult.converged).toBe(true);
      expect(sparseResult.converged).toBe(true);
      expect(sparseResult.finalCost).toBeCloseTo(denseResult.finalCost, 3);
    });

    it('line scenario with coincident points', () => {
      const { variables, providers } = createLineScenario(5, 3);

      const denseSystem = new ExplicitJacobianSystemImpl([...variables]);
      providers.forEach((p) => denseSystem.addResidualProvider(p));
      const denseResult = solveDenseLM(denseSystem, { maxIterations: 500, verbose: false });

      const sparseSystem = new ExplicitJacobianSystemImpl([...variables]);
      providers.forEach((p) => sparseSystem.addResidualProvider(p));
      const sparseResult = solveSparseLM(sparseSystem, { maxIterations: 500, verbose: false });

      expect(denseResult.converged).toBe(true);
      expect(sparseResult.converged).toBe(true);
      expect(sparseResult.finalCost).toBeCloseTo(denseResult.finalCost, 2);
    });
  });

  describe('Performance comparison', () => {
    it('small problem (10 points, 15 constraints)', () => {
      const { variables, providers } = createDistanceConstraintScenario(10, 15);

      const { avgMs: denseMs } = measureTime(() => {
        const sys = new ExplicitJacobianSystemImpl([...variables]);
        providers.forEach((p) => sys.addResidualProvider(p));
        solveDenseLM(sys, { maxIterations: 500, verbose: false });
      }, 5);

      const { avgMs: sparseMs } = measureTime(() => {
        const sys = new ExplicitJacobianSystemImpl([...variables]);
        providers.forEach((p) => sys.addResidualProvider(p));
        solveSparseLM(sys, { maxIterations: 500, verbose: false });
      }, 5);

      console.log(`Small: Dense=${denseMs.toFixed(2)}ms, Sparse=${sparseMs.toFixed(2)}ms`);
      // Just verify both complete in reasonable time
      expect(denseMs).toBeLessThan(1000);
      expect(sparseMs).toBeLessThan(1000);
    });

    it('medium problem (30 points, 50 constraints)', () => {
      const { variables, providers } = createDistanceConstraintScenario(30, 50);

      const { avgMs: denseMs } = measureTime(() => {
        const sys = new ExplicitJacobianSystemImpl([...variables]);
        providers.forEach((p) => sys.addResidualProvider(p));
        solveDenseLM(sys, { maxIterations: 500, verbose: false });
      }, 3);

      const { avgMs: sparseMs } = measureTime(() => {
        const sys = new ExplicitJacobianSystemImpl([...variables]);
        providers.forEach((p) => sys.addResidualProvider(p));
        solveSparseLM(sys, { maxIterations: 500, verbose: false });
      }, 3);

      console.log(`Medium: Dense=${denseMs.toFixed(2)}ms, Sparse=${sparseMs.toFixed(2)}ms`);
      // Just verify both complete in reasonable time
      expect(denseMs).toBeLessThan(5000);
      expect(sparseMs).toBeLessThan(5000);
    });

    it('large problem (100 points, 200 constraints)', () => {
      const { variables, providers } = createDistanceConstraintScenario(100, 200);

      const { avgMs: denseMs } = measureTime(() => {
        const sys = new ExplicitJacobianSystemImpl([...variables]);
        providers.forEach((p) => sys.addResidualProvider(p));
        solveDenseLM(sys, { maxIterations: 500, verbose: false });
      }, 1);

      const { avgMs: sparseMs } = measureTime(() => {
        const sys = new ExplicitJacobianSystemImpl([...variables]);
        providers.forEach((p) => sys.addResidualProvider(p));
        solveSparseLM(sys, { maxIterations: 500, verbose: false });
      }, 1);

      console.log(`Large: Dense=${denseMs.toFixed(2)}ms, Sparse=${sparseMs.toFixed(2)}ms`);
      // For large problems, sparse should be competitive or faster
      expect(denseMs).toBeLessThan(30000);
      expect(sparseMs).toBeLessThan(30000);
    });
  });
});
