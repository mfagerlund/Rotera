import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject, OPTIMIZE_PROJECT_DEFAULTS } from '../optimize-project';
import { fineTuneProject } from '../fine-tune';
import { detectOutliers } from '../outlier-detection';
import { setLogCallback } from '../optimization-logger';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'Calibration', 'Tower 2 - O-Y Distance.json');
const log = (msg: string) => process.stderr.write(msg + '\n');

describe('Tower 2 O-Y Debug', () => {
  afterEach(() => setLogCallback(null));

  it('should solve and fine-tune', async () => {
    setLogCallback((msg: string) => process.stderr.write(msg + '\n'));
    const jsonData = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const project = loadProjectFromJson(jsonData);

    const result = await optimizeProject(project, { ...OPTIMIZE_PROJECT_DEFAULTS, verbose: true });
    log(`\nOptimize: median=${result.medianReprojectionError?.toFixed(2)}px, rms=${result.rmsReprojectionError?.toFixed(2)}px`);
    log(`Cameras: ${result.camerasInitialized?.join(', ')}`);

    const errorBefore = result.medianReprojectionError!;
    fineTuneProject(project, { verbose: false, lockCameraPoses: true });
    const { medianError } = detectOutliers(project, 3.0);
    log(`Fine-tune: before=${errorBefore.toFixed(2)}px, after=${medianError.toFixed(2)}px`);

    expect(medianError).toBeLessThanOrEqual(errorBefore + 0.5);
  });
});
