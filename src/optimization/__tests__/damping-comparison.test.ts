import { describe, it } from '@jest/globals';
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

describe('Damping Factor Comparison', () => {
  const dampingValues = [0.001, 0.01, 0.1, 0.2, 0.5];
  const fixtures = [
    'no-axis-no-lines-one-coplanar-one-free-point.json',
    'no-axis-no-lines-8-8.json',
    'balcony-house.json',
  ];

  it('should compare damping values across fixtures', () => {
    console.log('\n=== DAMPING COMPARISON ===\n');
    console.log('Format: iterations | median error (px) | converged | time (ms)\n');

    for (const fixture of fixtures) {
      console.log(`\n--- ${fixture} ---`);
      console.log('Damping  | Iters  | Error (px) | Conv | Time (ms)');
      console.log('---------|--------|------------|------|----------');

      for (const damping of dampingValues) {
        const project = loadFixture(fixture);
        resetProject(project);

        const startTime = Date.now();
        const result = optimizeProject(project, {
          autoInitializeCameras: true,
          autoInitializeWorldPoints: true,
          detectOutliers: true,
          maxIterations: 10000,
          tolerance: 1e-8,
          damping,
          verbose: false
        });
        const elapsed = Date.now() - startTime;

        const error = result.medianReprojectionError?.toFixed(4) ?? 'N/A';
        const conv = result.converged ? 'Yes' : 'No';
        console.log(`${damping.toString().padEnd(8)} | ${result.iterations.toString().padStart(6)} | ${error.padStart(10)} | ${conv.padStart(4)} | ${elapsed.toString().padStart(9)}`);
      }
    }

    console.log('\n=== END COMPARISON ===\n');
  });
});
