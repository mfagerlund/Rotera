import { describe, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { initializeCameraWithVanishingPoints } from '../vanishing-points';
import { optimizeProject } from '../optimize-project';

describe('Reggea Fixture Debug', () => {
  it('outputs optimization result for manual inspection', () => {
    const winPath = 'C:/Slask/one more reggea for the road.json';
    const wslPath = '/mnt/c/Slask/one more reggea for the road.json';
    const fixturePath = fs.existsSync(winPath) ? winPath : wslPath;

    if (!fs.existsSync(fixturePath)) {
      console.warn('Reggea fixture missing, skipping debug run');
      return;
    }

    const json = fs.readFileSync(fixturePath, 'utf8');
    const project = loadProjectFromJson(json);
    const viewpoint = Array.from(project.viewpoints)[0];

    initializeCameraWithVanishingPoints(viewpoint, new Set(project.worldPoints));
    const rot = viewpoint.rotation;
    console.log('Rotation quaternion:', rot);
    const result = optimizeProject(project, {
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false,
      maxIterations: 200,
      tolerance: 1e-9,
      verbose: false
    });

    console.log('Reggea fixture converged:', result.converged, 'residual:', result.residual);
    for (const wp of project.worldPoints) {
      console.log('WP', wp.name, '=>', wp.optimizedXyz);
    }

    console.log('\nLine residuals after optimization:');
    for (const line of project.lines) {
      console.log(line.name ?? line.id, line.lastResiduals);
    }
  });
});
