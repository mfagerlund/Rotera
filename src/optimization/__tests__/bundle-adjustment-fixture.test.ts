import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import * as fs from 'fs';

describe('Bundle Adjustment with Real Fixture', () => {
  it('should optimize the real fixture data', () => {
    const fixturePath = 'C:\\Users\\matti\\Downloads\\Untitled Project-optimization-2025-10-21(1).json';

    if (!fs.existsSync(fixturePath)) {
      console.log('Fixture file not found, skipping test');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    console.log(`Points: ${project.worldPoints.size}`);
    console.log(`Viewpoints: ${project.viewpoints.size}`);
    console.log(`Constraints: ${project.constraints.size}`);

    let i = 0;
    for (const point of project.worldPoints) {
      if (!point.optimizedXyz) {
        point.optimizedXyz = [i * 1.0, 0, 0];
        i++;
      }
    }

    const result = optimizeProject(project, {
      maxIterations: 200,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: true,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });

    console.log('Optimization result:', result);

    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(100);
  });
});
