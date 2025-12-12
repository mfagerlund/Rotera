/**
 * Regression Test: Second Solve Bug
 *
 * This test reproduces a bug where a two-camera project with vanishing lines
 * works perfectly on the first solve, but fails catastrophically on the second solve.
 *
 * The bug suggests that state is not being properly cleared between solves.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject, clearOptimizationLogs } from '../optimize-project';
import * as fs from 'fs';

// Clear any global state before each test
beforeEach(() => {
  clearOptimizationLogs();
});

describe('Second Solve Regression', () => {
  it('should produce same result on second solve', () => {
    // Load the fixture BEFORE first solve
    const project = loadProjectFromJson(
      fs.readFileSync('C:\\Slask\\TwoBeforeSolve.json', 'utf-8')
    );

    // First solve
    console.log('\n=== FIRST SOLVE ===');
    const result1 = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      verbose: true,
    });
    const median1 = result1.medianReprojectionError;

    console.log(`First solve: median=${median1?.toFixed(2)}px, converged=${result1.converged}`);

    // Second solve (should work identically)
    console.log('\n=== SECOND SOLVE ===');
    const result2 = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      verbose: true,
    });
    const median2 = result2.medianReprojectionError;

    console.log(`Second solve: median=${median2?.toFixed(2)}px, converged=${result2.converged}`);

    // Assertions
    expect(median1).toBeLessThan(1); // First solve works
    expect(median2).toBeLessThan(1); // Second solve should also work! THIS WILL FAIL!
  });
});
