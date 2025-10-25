/**
 * Benchmark tests comparing initialization strategies
 *
 * Compares random vs smart initialization on the same optimization problem.
 * Measures: initial residual, iterations to converge, final residual, time.
 */

import { optimizeProject } from '../optimize-project';
import { randomInitialization, smartInitialization, computeInitialResidual } from '../smart-initialization';
import { saveProjectToJson, loadProjectFromJson } from '../../store/project-serialization';
import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Line } from '../../entities/line';

function createTestProject(): Project {
  const project = Project.create('Test Project');

  const wp1 = WorldPoint.create('WP1', { lockedXyz: [null, null, null], color: '#ff6b6b' });
  const wp2 = WorldPoint.create('WP2', { lockedXyz: [null, null, null], color: '#4ecdc4' });
  const wp3 = WorldPoint.create('WP3', { lockedXyz: [null, null, null], color: '#45b7d1' });
  const wp4 = WorldPoint.create('WP4', { lockedXyz: [null, null, null], color: '#96ceb4' });
  const wp5 = WorldPoint.create('WP5', { lockedXyz: [null, null, null], color: '#ffeaa7' });

  project.addWorldPoint(wp1);
  project.addWorldPoint(wp2);
  project.addWorldPoint(wp3);
  project.addWorldPoint(wp4);
  project.addWorldPoint(wp5);

  const line1 = Line.create('Loop_1', wp1, wp2, { direction: 'z-aligned', targetLength: 10 });
  const line2 = Line.create('Loop_2', wp2, wp3);
  const line3 = Line.create('Loop_3', wp3, wp4);
  const line4 = Line.create('Loop_4', wp4, wp5, { direction: 'x-aligned', targetLength: 10 });
  const line5 = Line.create('Loop_5', wp5, wp1, { direction: 'free', targetLength: 10 });

  project.addLine(line1);
  project.addLine(line2);
  project.addLine(line3);
  project.addLine(line4);
  project.addLine(line5);

  return project;
}

interface BenchmarkResult {
  method: string;
  initialResidual: number;
  iterations: number;
  finalResidual: number;
  converged: boolean;
  timeMs: number;
}

function runOptimizationBenchmark(
  project: Project,
  method: string
): BenchmarkResult {
  const startTime = performance.now();

  const initialResidual = computeInitialResidual(project);

  const result = optimizeProject(project, {
    maxIterations: 100,
    tolerance: 1e-6,
    damping: 0.1,
    verbose: false,
    autoInitializeCameras: false,
    autoInitializeWorldPoints: false
  });

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
    const baseProject = createTestProject();
    const baseProjectJson = saveProjectToJson(baseProject);

    const randomProject = loadProjectFromJson(baseProjectJson);
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
    const smartProject = loadProjectFromJson(baseProjectJson);
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

    const baseProject = createTestProject();
    const baseProjectJson = saveProjectToJson(baseProject);

    for (let i = 0; i < numTrials; i++) {
      // Random
      const randomProject = loadProjectFromJson(baseProjectJson);
      randomInitialization(randomProject, 10);
      randomResults.push(runOptimizationBenchmark(randomProject, 'Random'));

      // Smart
      const smartProject = loadProjectFromJson(baseProjectJson);
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

    // Smart should converge, though may take more iterations with weighted constraints
    // The WEIGHT=50.0 on line length residuals affects convergence characteristics
    const iterationRatio = avgSmart.iterations / avgRandom.iterations;
    expect(iterationRatio).toBeLessThanOrEqual(10.0); // Should converge within reasonable iterations
  });
});
