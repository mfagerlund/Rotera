import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject, OPTIMIZE_PROJECT_DEFAULTS } from '../optimize-project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { setLogCallback } from '../optimization-logger';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'Calibration');
const log = (msg: string) => process.stderr.write(msg + '\n');

describe('Crossing & NVL Debug', () => {
  afterEach(() => setLogCallback(null));

  it('should solve Crossing project', async () => {
    setLogCallback((msg: string) => process.stderr.write(msg + '\n'));
    const fixtureJson = fs.readFileSync(path.join(FIXTURES_DIR, 'Crossing.rotera'), 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    log(`\n=== CROSSING ===`);
    const result = await optimizeProject(project, { ...OPTIMIZE_PROJECT_DEFAULTS, verbose: true });
    log(`Converged: ${result.converged}, RMS: ${result.rmsReprojectionError?.toFixed(2)}px`);
    log(`Cameras: ${result.camerasInitialized?.join(', ')}`);

    expect(result.rmsReprojectionError).toBeLessThan(5);
  });

  it('should solve NVL multi-camera', async () => {
    setLogCallback((msg: string) => process.stderr.write(msg + '\n'));
    const fixtureJson = fs.readFileSync(path.join(FIXTURES_DIR, 'No Vanisining Lines.rotera'), 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    log(`\n=== NVL ===`);
    for (const wp of project.worldPoints) {
      const w = wp as WorldPoint;
      const vpNames = Array.from(w.imagePoints).map(ip => ip.viewpoint.name).join(', ');
      log(`  WP ${w.name}: fullyConstrained=${w.isFullyConstrained()}, visibleIn=[${vpNames}]`);
    }

    const result = await optimizeProject(project, { ...OPTIMIZE_PROJECT_DEFAULTS, verbose: true });
    log(`Converged: ${result.converged}, RMS: ${result.rmsReprojectionError?.toFixed(2)}px`);
    log(`Cameras: ${result.camerasInitialized?.join(', ')}`);

    expect(result.rmsReprojectionError).toBeLessThan(100);
  });
});
