/**
 * Solver Benchmark Suite
 *
 * Compares performance between:
 * - Explicit Dense LM (hand-coded Jacobians)
 * - Explicit Sparse LM (hand-coded Jacobians + sparse CG)
 *
 * Run with: npx ts-node src/optimization/__benchmarks__/solver-benchmark.ts
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

interface BenchmarkResult {
  name: string;
  denseMs: number;
  sparseMs: number;
  speedup: number;
  converged: { dense: boolean; sparse: boolean };
  finalCost: { dense: number; sparse: number };
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
      variables.push(px + (Math.random() - 0.5) * 0.1, py + (Math.random() - 0.5) * 0.1, pz + (Math.random() - 0.5) * 0.1);
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

/**
 * Run a benchmark comparing dense and sparse solvers.
 */
function runBenchmark(
  name: string,
  variables: number[],
  providers: ResidualWithJacobian[],
  iterations: number = 1
): BenchmarkResult {
  // Dense solver
  const denseSystem = new ExplicitJacobianSystemImpl([...variables]);
  providers.forEach((p) => denseSystem.addResidualProvider(p));

  let denseResult: ReturnType<typeof solveDenseLM>;
  const { avgMs: denseMs } = measureTime(() => {
    const sys = new ExplicitJacobianSystemImpl([...variables]);
    providers.forEach((p) => sys.addResidualProvider(p));
    denseResult = solveDenseLM(sys, { maxIterations: 500, verbose: false });
  }, iterations);

  // Sparse solver
  let sparseResult: ReturnType<typeof solveSparseLM>;
  const { avgMs: sparseMs } = measureTime(() => {
    const sys = new ExplicitJacobianSystemImpl([...variables]);
    providers.forEach((p) => sys.addResidualProvider(p));
    sparseResult = solveSparseLM(sys, { maxIterations: 500, verbose: false });
  }, iterations);

  return {
    name,
    denseMs,
    sparseMs,
    speedup: denseMs / sparseMs,
    converged: {
      dense: denseResult!.converged,
      sparse: sparseResult!.converged,
    },
    finalCost: {
      dense: denseResult!.finalCost,
      sparse: sparseResult!.finalCost,
    },
  };
}

/**
 * Format benchmark results as a table.
 */
function formatResults(results: BenchmarkResult[]): string {
  const header = '| Scenario | Dense (ms) | Sparse (ms) | Speedup | Dense Conv | Sparse Conv |';
  const separator = '|----------|------------|-------------|---------|------------|-------------|';

  const rows = results.map((r) => {
    const denseCost = r.finalCost.dense.toExponential(2);
    const sparseCost = r.finalCost.sparse.toExponential(2);
    return `| ${r.name.padEnd(8)} | ${r.denseMs.toFixed(2).padStart(10)} | ${r.sparseMs.toFixed(2).padStart(11)} | ${r.speedup.toFixed(2).padStart(7)}x | ${(r.converged.dense ? 'Y' : 'N').padStart(10)} | ${(r.converged.sparse ? 'Y' : 'N').padStart(11)} |`;
  });

  return [header, separator, ...rows].join('\n');
}

// Main benchmark
async function main() {
  console.log('=== Solver Benchmark ===\n');

  const results: BenchmarkResult[] = [];

  // Scenario 1: Small distance constraints
  console.log('Running: Small distance constraints (10 points, 15 constraints)...');
  const small = createDistanceConstraintScenario(10, 15);
  results.push(runBenchmark('Small', small.variables, small.providers, 10));

  // Scenario 2: Medium distance constraints
  console.log('Running: Medium distance constraints (30 points, 50 constraints)...');
  const medium = createDistanceConstraintScenario(30, 50);
  results.push(runBenchmark('Medium', medium.variables, medium.providers, 5));

  // Scenario 3: Large distance constraints
  console.log('Running: Large distance constraints (100 points, 200 constraints)...');
  const large = createDistanceConstraintScenario(100, 200);
  results.push(runBenchmark('Large', large.variables, large.providers, 3));

  // Scenario 4: Small line scenario
  console.log('Running: Small line scenario (5 lines, 3 points/line)...');
  const smallLine = createLineScenario(5, 3);
  results.push(runBenchmark('SmallLn', smallLine.variables, smallLine.providers, 10));

  // Scenario 5: Medium line scenario
  console.log('Running: Medium line scenario (15 lines, 5 points/line)...');
  const medLine = createLineScenario(15, 5);
  results.push(runBenchmark('MedLine', medLine.variables, medLine.providers, 5));

  console.log('\n=== Results ===\n');
  console.log(formatResults(results));

  console.log('\nNote: Speedup > 1 means sparse is faster than dense.');
  console.log('Sparse solver benefits more from larger, sparser problems.');
}

main().catch(console.error);
