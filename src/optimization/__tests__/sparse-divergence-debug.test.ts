/**
 * Debug test for sparse divergence issue
 *
 * Compares dense Cholesky vs sparse CG solvers to ensure they produce
 * equivalent results.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import { setUseSparseSolve, useSparseSolve } from '../solver-config';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

describe('Sparse divergence debug', () => {
  let originalSparseSolve: boolean;

  beforeEach(() => {
    originalSparseSolve = useSparseSolve();
  });

  afterEach(() => {
    setUseSparseSolve(originalSparseSolve);
  });

  it('compares dense vs sparse solvers on Minimal 2 Image 2 Axis', async () => {
    const fixturePath = path.join(FIXTURES_DIR, 'Minimal 2 Image 2 Axis.rotera');
    if (!fs.existsSync(fixturePath)) {
      console.log('Skipping: fixture not found at', fixturePath);
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');

    // Test with dense Cholesky
    console.log('\n=== Dense Cholesky ===');
    setUseSparseSolve(false);
    const projectDense = loadProjectFromJson(fixtureJson);
    const denseResult = await optimizeProject(projectDense, {
      maxIterations: 500,
      maxAttempts: 1,
      verbose: true
    });
    const denseError = denseResult.medianReprojectionError || 0;
    console.log(`Dense result: median=${denseError.toFixed(2)}px`);

    // Test with sparse CG
    console.log('\n=== Sparse CG ===');
    setUseSparseSolve(true);
    const projectSparse = loadProjectFromJson(fixtureJson);
    const sparseResult = await optimizeProject(projectSparse, {
      maxIterations: 500,
      maxAttempts: 1,
      verbose: true
    });
    const sparseError = sparseResult.medianReprojectionError || 0;
    console.log(`Sparse result: median=${sparseError.toFixed(2)}px`);

    const ratio = sparseError / Math.max(denseError, 0.01);

    console.log('\n=== COMPARISON ===');
    console.log(`Dense:  ${denseError.toFixed(4)}px`);
    console.log(`Sparse: ${sparseError.toFixed(4)}px`);
    console.log(`Ratio:  ${ratio.toFixed(2)}x`);

    // Results should be similar (within 50% or 1px absolute)
    const acceptable = Math.abs(sparseError - denseError) < Math.max(denseError * 0.5, 1);
    expect(acceptable).toBe(true);
  });
});
