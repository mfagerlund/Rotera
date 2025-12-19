/**
 * Determinism Test
 *
 * Tests that optimization produces consistent results when run multiple times.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject, clearOptimizationLogs } from '../optimize-project';
import * as fs from 'fs';
import * as path from 'path';

beforeEach(() => {
  clearOptimizationLogs();
});

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  const json = fs.readFileSync(fixturePath, 'utf-8');
  return loadProjectFromJson(json);
}

describe.skip('Optimization Determinism', () => {
  it('should produce consistent results for two-camera-vl-non-vl-user.json over 10 runs', () => {
    const results: number[] = [];

    for (let i = 0; i < 10; i++) {
      // Load fresh project each time
      const project = loadFixture('two-camera-vl-non-vl-user.json');

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 400,
        tolerance: 1e-6,
        verbose: false,
      });

      const residual = result.residual ?? Infinity;
      results.push(residual);
    }

    // Check that all results are the same (or very close)
    const min = Math.min(...results);
    const max = Math.max(...results);
    const spread = max - min;

    // Put all results in error message so we can see them
    const summary = `Spread=${spread.toFixed(4)}, min=${min.toFixed(4)}, max=${max.toFixed(4)}, values=[${results.map(r => r.toFixed(2)).join(',')}]`;

    // If optimization is deterministic, spread should be 0 (or very small due to FP precision)
    if (spread >= 0.001) {
      throw new Error(summary);
    }
  });

  it('should produce consistent results for single-camera-vl-baseline.json over 10 runs', () => {
    const results: number[] = [];

    for (let i = 0; i < 10; i++) {
      const project = loadFixture('single-camera-vl-baseline.json');

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 400,
        tolerance: 1e-6,
        verbose: false,
      });

      const residual = result.residual ?? Infinity;
      results.push(residual);
    }

    const min = Math.min(...results);
    const max = Math.max(...results);
    const spread = max - min;

    const summary = `Spread=${spread.toFixed(4)}, min=${min.toFixed(4)}, max=${max.toFixed(4)}, values=[${results.map(r => r.toFixed(2)).join(',')}]`;

    if (spread >= 0.001) {
      throw new Error(summary);
    }
  });
});
