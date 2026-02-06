import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject, OPTIMIZE_PROJECT_DEFAULTS } from '../optimize-project';
import { setLogCallback } from '../optimization-logger';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'Calibration', 'Balcony House Z Line.json');
const log = (msg: string) => process.stderr.write(msg + '\n');

describe('Balcony Z Line Debug', () => {
  afterEach(() => setLogCallback(null));

  it('should solve', async () => {
    setLogCallback((msg: string) => process.stderr.write(msg + '\n'));
    const jsonData = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const project = loadProjectFromJson(jsonData);
    const result = await optimizeProject(project, { ...OPTIMIZE_PROJECT_DEFAULTS, verbose: true });
    log(`\nMedian: ${result.medianReprojectionError?.toFixed(2)}px, RMS: ${result.rmsReprojectionError?.toFixed(2)}px`);
    log(`Cameras: ${result.camerasInitialized?.join(', ')}`);
    expect(result.medianReprojectionError!).toBeLessThan(10);
  });
});
