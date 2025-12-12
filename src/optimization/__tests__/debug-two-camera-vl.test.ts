/**
 * Debug test for the two-camera VL+non-VL case
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject, clearOptimizationLogs, optimizationLogs } from '../optimize-project';
import * as fs from 'fs';
import * as path from 'path';
import { Viewpoint } from '../../entities/viewpoint';

beforeEach(() => {
  clearOptimizationLogs();
});

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  const json = fs.readFileSync(fixturePath, 'utf-8');
  return loadProjectFromJson(json);
}

describe('Debug Two-Camera VL+non-VL', () => {
  it('should analyze why it fails', () => {
    const project = loadFixture('two-camera-vl-non-vl-user.json');

    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: true,
      maxIterations: 400,
      tolerance: 1e-6,
      verbose: true,
    });

    // Print relevant logs
    const relevantLogs = optimizationLogs.filter(log =>
      log.includes('[Init]') ||
      log.includes('[VP]') ||
      log.includes('PnP') ||
      log.includes('C1') ||
      log.includes('C3') ||
      log.includes('Stage') ||
      log.includes('residual')
    );

    console.log('\n=== RELEVANT LOGS ===');
    relevantLogs.forEach(log => console.log(log));

    // Print camera positions
    const c1 = Array.from(project.viewpoints).find(v => v.name === 'C1') as Viewpoint;
    const c3 = Array.from(project.viewpoints).find(v => v.name === 'C3') as Viewpoint;

    console.log('\n=== CAMERA POSITIONS ===');
    if (c1) {
      console.log(`C1: pos=[${c1.position.map(p => p.toFixed(2)).join(', ')}], rot=[${c1.rotation.map(r => r.toFixed(3)).join(', ')}], f=${c1.focalLength.toFixed(0)}`);
    }
    if (c3) {
      console.log(`C3: pos=[${c3.position.map(p => p.toFixed(2)).join(', ')}], rot=[${c3.rotation.map(r => r.toFixed(3)).join(', ')}], f=${c3.focalLength.toFixed(0)}`);
    }

    console.log(`\nFinal residual: ${result.residual?.toFixed(4)}`);
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);

    // The test passes regardless - we just want to see the output
    expect(result.residual).toBeDefined();
  });
});
