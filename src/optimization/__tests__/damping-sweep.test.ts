import { describe, it, afterAll } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  const json = fs.readFileSync(fixturePath, 'utf-8');
  return loadProjectFromJson(json);
}

function resetProject(project: ReturnType<typeof loadProjectFromJson>) {
  for (const wp of project.worldPoints) {
    if (!wp.isFullyConstrained()) {
      (wp as WorldPoint).optimizedXyz = undefined;
    }
  }
  for (const vp of project.viewpoints) {
    (vp as Viewpoint).position = [0, 0, 0];
    (vp as Viewpoint).rotation = [1, 0, 0, 0];
    (vp as Viewpoint).focalLength = Math.max((vp as Viewpoint).imageWidth, (vp as Viewpoint).imageHeight);
  }
}

interface SweepResult {
  fixture: string;
  damping: number;
  iterations: number;
  medianError: number | null;
  converged: boolean;
  elapsedMs: number;
}

const allResults: SweepResult[] = [];

// Get all fixture files, excluding those with too few points for Essential Matrix
const fixturesDir = path.join(__dirname, 'fixtures');
const excludedFixtures = [
  'two-images-four-points.json', // Only 4 correspondences, needs 7+ for Essential Matrix
];
const allFixtures = fs.readdirSync(fixturesDir)
  .filter(f => f.endsWith('.json'))
  .filter(f => !excludedFixtures.includes(f));

const dampingValues = [0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17, 0.18, 0.19, 0.2];

describe('Damping Sweep - All Fixtures', () => {
  afterAll(() => {
    // Write results to file
    const outputPath = path.join(__dirname, 'damping-sweep-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
    console.log(`\nResults written to: ${outputPath}`);

    // Also print summary table
    console.log('\n=== DAMPING SWEEP SUMMARY ===\n');

    // Group by fixture
    const byFixture = new Map<string, SweepResult[]>();
    for (const r of allResults) {
      if (!byFixture.has(r.fixture)) byFixture.set(r.fixture, []);
      byFixture.get(r.fixture)!.push(r);
    }

    for (const [fixture, results] of byFixture) {
      console.log(`\n--- ${fixture} ---`);
      console.log('Damping | Iters  | Error (px) | Conv | Time (ms)');
      console.log('--------|--------|------------|------|----------');
      for (const r of results) {
        const error = r.medianError?.toFixed(4) ?? 'N/A';
        const conv = r.converged ? 'Yes' : 'No';
        console.log(`${r.damping.toString().padEnd(7)} | ${r.iterations.toString().padStart(6)} | ${error.padStart(10)} | ${conv.padStart(4)} | ${r.elapsedMs.toString().padStart(9)}`);
      }

      // Find best damping for this fixture (lowest iterations that converged with good error)
      const goodResults = results.filter(r => r.converged && (r.medianError === null || r.medianError < 1));
      if (goodResults.length > 0) {
        const best = goodResults.reduce((a, b) => a.iterations < b.iterations ? a : b);
        console.log(`Best: damping=${best.damping} (${best.iterations} iters, ${best.medianError?.toFixed(4) ?? 'N/A'} px)`);
      }
    }
  });

  // Run sweep for each fixture
  for (const fixture of allFixtures) {
    describe(fixture, () => {
      for (const damping of dampingValues) {
        it(`damping=${damping}`, () => {
          const project = loadFixture(fixture);
          resetProject(project);

          const startTime = Date.now();
          const result = optimizeProject(project, {
            autoInitializeCameras: true,
            autoInitializeWorldPoints: true,
            detectOutliers: true,
            maxIterations: 500,
            tolerance: 1e-8,
            damping,
            verbose: false
          });
          const elapsed = Date.now() - startTime;

          allResults.push({
            fixture,
            damping,
            iterations: result.iterations,
            medianError: result.medianReprojectionError ?? null,
            converged: result.converged,
            elapsedMs: elapsed
          });

          // Don't fail the test - we just want to collect data
          console.log(`${fixture} @ ${damping}: ${result.iterations} iters, ${result.medianReprojectionError?.toFixed(4) ?? 'N/A'} px, ${result.converged ? 'converged' : 'NOT converged'}`);
        });
      }
    });
  }
});
