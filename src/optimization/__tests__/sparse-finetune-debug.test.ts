/**
 * Debug test for sparse fineTuneProject.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { fineTuneProject } from '../fine-tune';
import { setSolverBackend, getSolverBackend, SolverBackend } from '../solver-config';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

let originalBackend: SolverBackend;

beforeEach(() => {
  originalBackend = getSolverBackend();
});

afterEach(() => {
  setSolverBackend(originalBackend);
});

describe('Sparse FineTune Debug', () => {
  it('should fine-tune 1-loose.rotera with sparse solver', () => {
    const fixturePath = path.join(FIXTURES_DIR, '1-loose.rotera');
    if (!fs.existsSync(fixturePath)) {
      console.log('Skipping: fixture not found');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');

    // Parse and modify the fixture to have a non-zero camera position
    const fixtureData = JSON.parse(fixtureJson);
    // Move camera to a reasonable position (behind points looking at them)
    fixtureData.viewpoints[0].position = [1.0, -5.0, 40.0];
    const modifiedFixture = JSON.stringify(fixtureData);

    // First test with autodiff to get baseline
    console.log('=== AUTODIFF ===');
    setSolverBackend('autodiff');
    const project1 = loadProjectFromJson(modifiedFixture);
    const result1 = fineTuneProject(project1, {
      maxIterations: 100,
      tolerance: 1e-6,
      verbose: true,
    });
    console.log('Autodiff result:', result1);

    // Now test with sparse
    console.log('\n=== SPARSE ===');
    setSolverBackend('explicit-sparse');
    const project2 = loadProjectFromJson(modifiedFixture);
    const result2 = fineTuneProject(project2, {
      maxIterations: 100,
      tolerance: 1e-6,
      verbose: true,
    });
    console.log('Sparse result:', result2);

    // Both should converge (or show diagnostic)
    if (!result1.converged || !result2.converged) {
      throw new Error(
        `Convergence failed!\n` +
        `Autodiff: converged=${result1.converged}, iter=${result1.iterations}, residual=${result1.residual.toFixed(4)}\n` +
        `Sparse: converged=${result2.converged}, iter=${result2.iterations}, residual=${result2.residual.toFixed(4)}`
      );
    }
    expect(result1.converged).toBe(true);
    expect(result2.converged).toBe(true);

    // Residuals should be similar
    console.log(`Autodiff residual: ${result1.residual.toFixed(4)}`);
    console.log(`Sparse residual: ${result2.residual.toFixed(4)}`);
  });
});
