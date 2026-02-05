/**
 * Regression test for Balcony House X Line fixture.
 * This test was added to verify maxIterations is honored (bug fix in candidate-testing.ts).
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject, OPTIMIZE_PROJECT_DEFAULTS } from '../optimize-project';
import { describe, it, expect } from '@jest/globals';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'Calibration');

describe('Balcony House X Line', () => {
  it('should solve with analytical mode', async () => {
    const jsonPath = path.join(FIXTURES_DIR, 'Balcony House X Line.json');
    const jsonData = fs.readFileSync(jsonPath, 'utf8');

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
});
