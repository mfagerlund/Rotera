/**
 * Backend Comparison Benchmark
 *
 * Compares performance between:
 * - Autodiff (scalar-autograd ConstraintSystem)
 * - Explicit Dense LM (hand-coded Jacobians + dense matrix solver)
 * - Explicit Sparse LM (hand-coded Jacobians + sparse CG solver)
 *
 * Run with: npx ts-node src/optimization/__benchmarks__/backend-comparison.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { fineTuneProject } from '../fine-tune';
import { setSolverBackend, SolverBackend } from '../solver-config';
import type { Project } from '../../entities/project';
import type { WorldPoint } from '../../entities/world-point';
import type { Viewpoint } from '../../entities/viewpoint';
import type { ImagePoint } from '../../entities/imagePoint';

interface BenchmarkResult {
  backend: SolverBackend;
  converged: boolean;
  iterations: number;
  residual: number;
  timeMs: number;
}

interface ScenarioResult {
  name: string;
  worldPoints: number;
  imagePoints: number;
  cameras: number;
  results: BenchmarkResult[];
}

/**
 * Compute RMS reprojection error for a project.
 */
function computeRmsReprojectionError(project: Project): number {
  let totalSquaredError = 0;
  let count = 0;

  for (const ip of project.imagePoints) {
    const imagePoint = ip as ImagePoint;
    const wp = imagePoint.worldPoint as WorldPoint;
    const vp = imagePoint.viewpoint as Viewpoint;

    if (!wp.optimizedXyz) continue;

    const [wx, wy, wz] = wp.optimizedXyz;
    const [px, py, pz] = vp.position;
    const [qw, qx, qy, qz] = vp.rotation;

    // Transform to camera space
    const tx = wx - px;
    const ty = wy - py;
    const tz = wz - pz;

    // Quaternion rotation
    const cx = qy * tz - qz * ty;
    const cy = qz * tx - qx * tz;
    const cz = qx * ty - qy * tx;
    const dx = qy * cz - qz * cy;
    const dy = qz * cx - qx * cz;
    const dz = qx * cy - qy * cx;

    let camX = tx + 2 * qw * cx + 2 * dx;
    let camY = ty + 2 * qw * cy + 2 * dy;
    let camZ = tz + 2 * qw * cz + 2 * dz;

    if (vp.isZReflected) {
      camX = -camX;
      camY = -camY;
      camZ = -camZ;
    }

    if (camZ <= 0) continue;

    // Project
    const normX = camX / camZ;
    const normY = camY / camZ;

    const fx = vp.focalLength;
    const fy = vp.focalLength * vp.aspectRatio;
    const cx_ = vp.principalPointX;
    const cy_ = vp.principalPointY;

    const u = fx * normX + cx_;
    const v = fy * normY + cy_;

    const du = u - imagePoint.u;
    const dv = v - imagePoint.v;
    totalSquaredError += du * du + dv * dv;
    count++;
  }

  return count > 0 ? Math.sqrt(totalSquaredError / count) : 0;
}

/**
 * Run a benchmark scenario with all backends.
 */
function runScenario(
  name: string,
  projectJson: string,
  warmupIterations: number = 1,
  benchmarkIterations: number = 3
): ScenarioResult {
  const backends: SolverBackend[] = ['autodiff', 'explicit-dense', 'explicit-sparse'];
  const results: BenchmarkResult[] = [];

  // Load fresh project for counting
  const countProject = loadProjectFromJson(projectJson);
  const scenarioResult: ScenarioResult = {
    name,
    worldPoints: countProject.worldPoints.size,
    imagePoints: countProject.imagePoints.size,
    cameras: countProject.viewpoints.size,
    results: [],
  };

  for (const backend of backends) {
    setSolverBackend(backend);

    // Warmup runs
    for (let i = 0; i < warmupIterations; i++) {
      const project = loadProjectFromJson(projectJson);
      fineTuneProject(project, { maxIterations: 100, verbose: false });
    }

    // Benchmark runs
    const times: number[] = [];
    let lastResult: BenchmarkResult | null = null;

    for (let i = 0; i < benchmarkIterations; i++) {
      const project = loadProjectFromJson(projectJson);

      const start = performance.now();
      const result = fineTuneProject(project, {
        maxIterations: 500,
        tolerance: 1e-8,
        verbose: false,
      });
      const elapsed = performance.now() - start;

      times.push(elapsed);
      lastResult = {
        backend,
        converged: result.converged,
        iterations: result.iterations,
        residual: result.residual,
        timeMs: elapsed,
      };
    }

    // Use median time
    times.sort((a, b) => a - b);
    const medianTime = times[Math.floor(times.length / 2)];

    if (lastResult) {
      lastResult.timeMs = medianTime;
      results.push(lastResult);
    }
  }

  scenarioResult.results = results;
  return scenarioResult;
}

/**
 * Format results as a markdown table.
 */
function formatResults(scenarios: ScenarioResult[]): string {
  const lines: string[] = [];

  lines.push('# Solver Backend Comparison');
  lines.push('');
  lines.push('Comparing: autodiff (scalar-autograd) vs explicit-dense vs explicit-sparse');
  lines.push('');

  for (const scenario of scenarios) {
    lines.push(`## ${scenario.name}`);
    lines.push('');
    lines.push(`- World Points: ${scenario.worldPoints}`);
    lines.push(`- Image Points: ${scenario.imagePoints}`);
    lines.push(`- Cameras: ${scenario.cameras}`);
    lines.push('');
    lines.push('| Backend | Time (ms) | Iterations | Converged | Residual |');
    lines.push('|---------|-----------|------------|-----------|----------|');

    for (const result of scenario.results) {
      const time = result.timeMs.toFixed(1).padStart(9);
      const iters = result.iterations.toString().padStart(10);
      const conv = (result.converged ? 'Yes' : 'No').padStart(9);
      const residual = result.residual.toExponential(2).padStart(8);
      lines.push(`| ${result.backend.padEnd(7)} | ${time} | ${iters} | ${conv} | ${residual} |`);
    }

    // Speedup summary
    const autodiff = scenario.results.find(r => r.backend === 'autodiff');
    const dense = scenario.results.find(r => r.backend === 'explicit-dense');
    const sparse = scenario.results.find(r => r.backend === 'explicit-sparse');

    if (autodiff && dense && sparse) {
      lines.push('');
      lines.push(`**Speedup vs autodiff:** dense=${(autodiff.timeMs / dense.timeMs).toFixed(2)}x, sparse=${(autodiff.timeMs / sparse.timeMs).toFixed(2)}x`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

// Main benchmark
async function main() {
  console.log('=== Backend Comparison Benchmark ===\n');

  const scenarios: ScenarioResult[] = [];
  const fixturesDir = path.join(__dirname, '..', '__tests__', 'fixtures');
  const calibrationDir = path.join(fixturesDir, 'Calibration');

  // Scenario 1: Simple 2-image calibration
  const fixture1Path = path.join(calibrationDir, 'Fixture With 2 Image 2.json');
  if (fs.existsSync(fixture1Path)) {
    console.log('Running: Simple 2-image calibration...');
    const json = fs.readFileSync(fixture1Path, 'utf-8');
    scenarios.push(runScenario('Simple 2-Image', json, 1, 3));
  }

  // Scenario 2: 5-image calibration
  const fixture2Path = path.join(calibrationDir, 'Fixture With 5 Image.json');
  if (fs.existsSync(fixture2Path)) {
    console.log('Running: 5-image calibration...');
    const json = fs.readFileSync(fixture2Path, 'utf-8');
    scenarios.push(runScenario('5-Image Calibration', json, 1, 3));
  }

  // Scenario 3: Farnsworth House 5-camera
  const fixture3Path = path.join(fixturesDir, 'farnsworth-house-5.rotera');
  if (fs.existsSync(fixture3Path)) {
    console.log('Running: Farnsworth House (5 cameras)...');
    const json = fs.readFileSync(fixture3Path, 'utf-8');
    scenarios.push(runScenario('Farnsworth House 5-Cam', json, 1, 3));
  }

  // Scenario 4: Farnsworth House 2-camera
  const fixture4Path = path.join(fixturesDir, 'farnsworth-house-2cam.rotera');
  if (fs.existsSync(fixture4Path)) {
    console.log('Running: Farnsworth House (2 cameras)...');
    const json = fs.readFileSync(fixture4Path, 'utf-8');
    scenarios.push(runScenario('Farnsworth House 2-Cam', json, 1, 3));
  }

  console.log('\n=== Results ===\n');
  const report = formatResults(scenarios);
  console.log(report);

  // Save to file
  const outputPath = path.join(__dirname, 'BENCHMARK-RESULTS.md');
  fs.writeFileSync(outputPath, report);
  console.log(`\nResults saved to: ${outputPath}`);

  // Reset to autodiff
  setSolverBackend('autodiff');
}

main().catch(console.error);
