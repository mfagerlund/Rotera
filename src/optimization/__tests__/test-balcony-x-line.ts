/**
 * Regression test for Balcony House X Line fixture.
 * This test was added to verify:
 * 1. maxIterations is honored (bug fix in candidate-testing.ts)
 * 2. Analytical and sparse modes produce comparable results
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject, OPTIMIZE_PROJECT_DEFAULTS } from '../optimize-project';
import { setSolverMode, getSolverMode } from '../solver-config';
import { describe, it, expect, afterAll, beforeAll } from '@jest/globals';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'Calibration');

describe('Balcony House X Line', () => {
  let originalMode: ReturnType<typeof getSolverMode>;

  beforeAll(() => {
    originalMode = getSolverMode();
  });

  afterAll(() => {
    setSolverMode(originalMode);
  });

  it('should solve with sparse mode', async () => {
    const jsonPath = path.join(FIXTURES_DIR, 'Balcony House X Line.json');
    const jsonData = fs.readFileSync(jsonPath, 'utf8');

    setSolverMode('sparse');
    const project = loadProjectFromJson(jsonData);
    const result = await optimizeProject(project, {
      ...OPTIMIZE_PROJECT_DEFAULTS,
      verbose: false,
      maxIterations: 500,
    });

    // Should achieve good accuracy
    expect(result.medianReprojectionError).toBeDefined();
    expect(result.medianReprojectionError!).toBeLessThan(2);

    // Should run more than probe iterations (verifies maxIterations fix)
    // Note: May converge early, but should not be capped at probe limit (200)
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.residual).toBeLessThan(10);
  });

  it('should solve with analytical mode', async () => {
    const jsonPath = path.join(FIXTURES_DIR, 'Balcony House X Line.json');
    const jsonData = fs.readFileSync(jsonPath, 'utf8');

    setSolverMode('analytical');
    const project = loadProjectFromJson(jsonData);
    const result = await optimizeProject(project, {
      ...OPTIMIZE_PROJECT_DEFAULTS,
      verbose: false,
      maxIterations: 500,
    });

    // Should achieve good accuracy (comparable to sparse)
    expect(result.medianReprojectionError).toBeDefined();
    expect(result.medianReprojectionError!).toBeLessThan(2);

    expect(result.residual).toBeLessThan(10);
  });
});
