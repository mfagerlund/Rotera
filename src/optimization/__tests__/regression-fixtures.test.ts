/**
 * Regression Tests for Project Fixtures
 *
 * These tests load project JSON files and verify the optimizer can solve them
 * with a Total Error (residual) below a specified threshold. The goal is to
 * prevent regressions - as long as the error is below the threshold, the test passes.
 *
 * Convergence is NOT required - some projects may not fully converge but still
 * produce acceptable results.
 */

import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import * as fs from 'fs';
import * as path from 'path';

interface RegressionFixture {
  filename: string;
  maxTotalError: number;
}

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  const json = fs.readFileSync(fixturePath, 'utf-8');
  return loadProjectFromJson(json);
}

function runRegressionTest(fixture: RegressionFixture) {
  const project = loadFixture(fixture.filename);

  const result = optimizeProject(project, {
    autoInitializeCameras: true,
    autoInitializeWorldPoints: true,
    detectOutliers: true,
    maxIterations: 400,
    tolerance: 1e-6,
    verbose: false,
  });

  const totalError = result.residual ?? Infinity;

  console.log(`${fixture.filename}:`);
  console.log(`  Converged: ${result.converged}`);
  console.log(`  Iterations: ${result.iterations}`);
  console.log(`  Total Error: ${totalError.toFixed(4)}`);
  console.log(`  Max Allowed: ${fixture.maxTotalError}`);

  expect(totalError).toBeLessThan(fixture.maxTotalError);
}

describe('Regression Fixtures - Balcony Houses', () => {
  const balconyFixtures: RegressionFixture[] = [
    { filename: 'Balcony House.json', maxTotalError: 2.2 },
    { filename: 'Balcony House Lines.json', maxTotalError: 2 },
    { filename: 'Balcony House No Lines.json', maxTotalError: 2 },
    { filename: 'Balcony House X,Y and Z Lines.json', maxTotalError: 2 },
    { filename: 'Balcony House Y and Z Line.json', maxTotalError: 2 },
    { filename: 'Balcony House Y Line.json', maxTotalError: 2 },
    { filename: 'Balcony House Z Line.json', maxTotalError: 2 },
    { filename: 'Balcony House 2 With Balcony Points.json', maxTotalError: 2 },
  ];

  it.each(balconyFixtures)('$filename should have total error < $maxTotalError', (fixture) => {
    runRegressionTest(fixture);
  });
});

describe('Regression Fixtures - Calibration', () => {
  const calibrationFixtures: RegressionFixture[] = [
    { filename: 'Fixture With 2 Images.json', maxTotalError: 3 },
    { filename: 'Fixture With 2 Image 2.json', maxTotalError: 2 },
    { filename: 'Fixture With 2-1 Image 2.json', maxTotalError: 2 },
    { filename: 'Full Solve.json', maxTotalError: 2 },
    { filename: 'No Vanisining Lines.json', maxTotalError: 2.1 },
    { filename: 'No Vanisining Lines Now With VL.json', maxTotalError: 2 },
  ];

  it.each(calibrationFixtures)('$filename should have total error < $maxTotalError', (fixture) => {
    runRegressionTest(fixture);
  });
});

describe('Regression Fixtures - Minimal', () => {
  const minimalFixtures: RegressionFixture[] = [
    { filename: 'Minimal VL.json', maxTotalError: 2 },
  ];

  it.each(minimalFixtures)('$filename should have total error < $maxTotalError', (fixture) => {
    runRegressionTest(fixture);
  });
});
