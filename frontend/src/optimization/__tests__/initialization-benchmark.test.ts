/**
 * Benchmark tests comparing initialization strategies
 *
 * Compares random vs smart initialization on the same optimization problem.
 * Measures: initial residual, iterations to converge, final residual, time.
 */

import { WorldPoint as WorldPointEntity } from '../../entities/world-point/WorldPoint';
import { Line as LineEntity } from '../../entities/line/Line';
import { convertAllConstraints } from '../../utils/constraint-entity-converter';
import { ConstraintSystem } from '../constraint-system';
import { randomInitialization, smartInitialization, computeInitialResidual } from '../smart-initialization';
import * as fs from 'fs';
import * as path from 'path';

// Load the test project (without xyz coordinates)
const testDataPath = path.join(__dirname, '../../../../test-data/test-project.json');
const baseProject = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));
delete baseProject.images; // Remove images

interface BenchmarkResult {
  method: string;
  initialResidual: number;
  iterations: number;
  finalResidual: number;
  converged: boolean;
  timeMs: number;
}

function runOptimizationBenchmark(
  project: any,
  method: string
): BenchmarkResult {
  const startTime = performance.now();

  // Compute initial residual
  const initialResidual = computeInitialResidual(project);

  // Convert to entities
  const pointEntities: WorldPointEntity[] = [];
  const lineEntities: LineEntity[] = [];

  Object.values(project.worldPoints).forEach((wp: any) => {
    if (wp.xyz) {
      const entity = WorldPointEntity.create(wp.id, wp.name, {
        xyz: wp.xyz as [number, number, number],
        color: wp.color,
        isVisible: wp.isVisible,
        isLocked: wp.isLocked
      });
      pointEntities.push(entity);
    }
  });

  Object.values(project.lines || {}).forEach((line: any) => {
    const pointA = pointEntities.find(p => p.getId() === line.pointA);
    const pointB = pointEntities.find(p => p.getId() === line.pointB);

    if (pointA && pointB && line.constraints) {
      const entity = LineEntity.create(
        line.id,
        line.name || 'Line',
        pointA,
        pointB,
        {
          constraints: {
            direction: line.constraints.direction,
            targetLength: line.constraints.targetLength,
            tolerance: line.constraints.tolerance
          },
          color: line.color,
          isConstruction: line.isConstruction
        }
      );
      lineEntities.push(entity);
    }
  });

  // Fix constraint format
  const fixedConstraints = (project.constraints || []).map((c: any) => ({
    ...c,
    enabled: c.isEnabled ?? c.enabled
  }));

  const constraintEntities = convertAllConstraints(
    fixedConstraints,
    pointEntities,
    lineEntities
  );

  // Run optimization
  const solver = new ConstraintSystem({
    maxIterations: 100,
    tolerance: 1e-6,
    damping: 0.1,
    verbose: false
  });

  pointEntities.forEach(p => solver.addPoint(p));
  lineEntities.forEach(l => solver.addLine(l));
  constraintEntities.forEach(c => solver.addConstraint(c));

  const result = solver.solve();

  const endTime = performance.now();

  return {
    method,
    initialResidual,
    iterations: result.iterations,
    finalResidual: result.residual,
    converged: result.converged,
    timeMs: endTime - startTime
  };
}

describe('Initialization Benchmark', () => {
  it('should compare random vs smart initialization', () => {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║           INITIALIZATION METHOD COMPARISON                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const results: BenchmarkResult[] = [];

    // Test 1: Random initialization
    console.log('🎲 Testing RANDOM initialization...');
    const randomProject = JSON.parse(JSON.stringify(baseProject));
    randomInitialization(randomProject, 10);
    const randomResult = runOptimizationBenchmark(randomProject, 'Random');
    results.push(randomResult);

    console.log(`   Initial residual: ${randomResult.initialResidual.toFixed(4)}`);
    console.log(`   Iterations: ${randomResult.iterations}`);
    console.log(`   Final residual: ${randomResult.finalResidual.toExponential(3)}`);
    console.log(`   Time: ${randomResult.timeMs.toFixed(2)}ms`);
    console.log(`   Converged: ${randomResult.converged ? '✓' : '✗'}\n`);

    // Test 2: Smart initialization
    console.log('🧠 Testing SMART initialization...');
    const smartProject = JSON.parse(JSON.stringify(baseProject));
    smartInitialization(smartProject);
    const smartResult = runOptimizationBenchmark(smartProject, 'Smart');
    results.push(smartResult);

    console.log(`   Initial residual: ${smartResult.initialResidual.toFixed(4)}`);
    console.log(`   Iterations: ${smartResult.iterations}`);
    console.log(`   Final residual: ${smartResult.finalResidual.toExponential(3)}`);
    console.log(`   Time: ${smartResult.timeMs.toFixed(2)}ms`);
    console.log(`   Converged: ${smartResult.converged ? '✓' : '✗'}\n`);

    // Comparison
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                        IMPROVEMENTS                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const initialResidualImprovement =
      ((randomResult.initialResidual - smartResult.initialResidual) / randomResult.initialResidual * 100);
    const iterationReduction =
      ((randomResult.iterations - smartResult.iterations) / randomResult.iterations * 100);
    const timeImprovement =
      ((randomResult.timeMs - smartResult.timeMs) / randomResult.timeMs * 100);

    console.log(`📊 Initial Residual:  ${randomResult.initialResidual.toFixed(2)} → ${smartResult.initialResidual.toFixed(2)}`);
    console.log(`   ${initialResidualImprovement > 0 ? '✓' : '✗'} Improvement: ${Math.abs(initialResidualImprovement).toFixed(1)}% ${initialResidualImprovement > 0 ? 'better' : 'worse'}\n`);

    console.log(`🔄 Iterations:        ${randomResult.iterations} → ${smartResult.iterations}`);
    console.log(`   ${iterationReduction > 0 ? '✓' : '✗'} Reduction: ${Math.abs(iterationReduction).toFixed(1)}% ${iterationReduction > 0 ? 'fewer' : 'more'}\n`);

    console.log(`⏱️  Time:              ${randomResult.timeMs.toFixed(2)}ms → ${smartResult.timeMs.toFixed(2)}ms`);
    console.log(`   ${timeImprovement > 0 ? '✓' : '✗'} Speedup: ${Math.abs(timeImprovement).toFixed(1)}% ${timeImprovement > 0 ? 'faster' : 'slower'}\n`);

    console.log(`🎯 Final Residual:    ${randomResult.finalResidual.toExponential(3)} vs ${smartResult.finalResidual.toExponential(3)}\n`);

    // Verify both converged
    expect(randomResult.converged).toBe(true);
    expect(smartResult.converged).toBe(true);

    // Smart should be better or equal
    expect(smartResult.initialResidual).toBeLessThanOrEqual(randomResult.initialResidual * 1.1); // Allow 10% margin
  });

  it('should run multiple trials for statistical significance', () => {
    const numTrials = 5;
    console.log(`\n📊 Running ${numTrials} trials for statistical significance...\n`);

    const randomResults: BenchmarkResult[] = [];
    const smartResults: BenchmarkResult[] = [];

    for (let i = 0; i < numTrials; i++) {
      // Random
      const randomProject = JSON.parse(JSON.stringify(baseProject));
      randomInitialization(randomProject, 10);
      randomResults.push(runOptimizationBenchmark(randomProject, 'Random'));

      // Smart
      const smartProject = JSON.parse(JSON.stringify(baseProject));
      smartInitialization(smartProject);
      smartResults.push(runOptimizationBenchmark(smartProject, 'Smart'));
    }

    // Compute averages
    const avgRandom = {
      initialResidual: randomResults.reduce((sum, r) => sum + r.initialResidual, 0) / numTrials,
      iterations: randomResults.reduce((sum, r) => sum + r.iterations, 0) / numTrials,
      timeMs: randomResults.reduce((sum, r) => sum + r.timeMs, 0) / numTrials
    };

    const avgSmart = {
      initialResidual: smartResults.reduce((sum, r) => sum + r.initialResidual, 0) / numTrials,
      iterations: smartResults.reduce((sum, r) => sum + r.iterations, 0) / numTrials,
      timeMs: smartResults.reduce((sum, r) => sum + r.timeMs, 0) / numTrials
    };

    console.log('┌────────────────────────────────────────────────────────────┐');
    console.log('│                    AVERAGE RESULTS                         │');
    console.log('├────────────────────────────────────────────────────────────┤');
    console.log(`│ Random - Initial Residual: ${avgRandom.initialResidual.toFixed(4).padEnd(30)}│`);
    console.log(`│ Smart  - Initial Residual: ${avgSmart.initialResidual.toFixed(4).padEnd(30)}│`);
    console.log('├────────────────────────────────────────────────────────────┤');
    console.log(`│ Random - Iterations:       ${avgRandom.iterations.toFixed(1).padEnd(30)}│`);
    console.log(`│ Smart  - Iterations:       ${avgSmart.iterations.toFixed(1).padEnd(30)}│`);
    console.log('├────────────────────────────────────────────────────────────┤');
    console.log(`│ Random - Time:             ${avgRandom.timeMs.toFixed(2)}ms${(' '.repeat(26))}│`);
    console.log(`│ Smart  - Time:             ${avgSmart.timeMs.toFixed(2)}ms${(' '.repeat(26))}│`);
    console.log('└────────────────────────────────────────────────────────────┘\n');

    const avgIterationReduction = ((avgRandom.iterations - avgSmart.iterations) / avgRandom.iterations * 100);
    const avgTimeImprovement = ((avgRandom.timeMs - avgSmart.timeMs) / avgRandom.timeMs * 100);

    console.log(`📈 Average iteration reduction: ${avgIterationReduction.toFixed(1)}%`);
    console.log(`⚡ Average time improvement: ${avgTimeImprovement.toFixed(1)}%\n`);

    // All trials should converge
    expect(randomResults.every(r => r.converged)).toBe(true);
    expect(smartResults.every(r => r.converged)).toBe(true);

    // Smart should be competitive (within 20% of random)
    // The benefit depends on the problem structure - coplanar groups help most
    const iterationRatio = avgSmart.iterations / avgRandom.iterations;
    expect(iterationRatio).toBeLessThanOrEqual(1.2); // At most 20% more iterations
  });
});
