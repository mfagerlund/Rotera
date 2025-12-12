/**
 * Debug test for the failing "No Vanisining Lines Now With VL" fixture.
 * This test outputs verbose logging to diagnose the initialization flow.
 */

import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject, optimizationLogs, clearOptimizationLogs } from '../optimize-project';
import * as fs from 'fs';
import * as path from 'path';

describe('Debug VL Fixture', () => {
  it('should debug the No Vanisining Lines Now With VL fixture', () => {
    clearOptimizationLogs();

    const json = fs.readFileSync(
      path.join(__dirname, 'fixtures', "Doesn't work with VL and non VL.json"),
      'utf-8'
    );
    const project = loadProjectFromJson(json);

    const lines: string[] = [];
    lines.push('=== PROJECT STRUCTURE ===');
    lines.push('WorldPoints: ' + project.worldPoints.size);
    lines.push('Viewpoints: ' + project.viewpoints.size);
    for (const vp of project.viewpoints) {
      const vlCount = vp.vanishingLines?.size ?? 0;
      lines.push(`  ${vp.name}: ${vp.imagePoints.size} image points, ${vlCount} vanishing lines`);
    }

    lines.push('\n=== OPTIMIZATION ===');
    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      detectOutliers: true,
      maxIterations: 400,
      tolerance: 1e-6,
      verbose: true,
    });

    lines.push('\n=== RESULT ===');
    lines.push('Converged: ' + result.converged);
    lines.push('Iterations: ' + result.iterations);
    lines.push('Residual: ' + result.residual);
    lines.push('Median reproj: ' + result.medianReprojectionError);
    lines.push('Cameras initialized: ' + (result.camerasInitialized?.join(', ') ?? 'none'));
    lines.push('Cameras excluded: ' + (result.camerasExcluded?.join(', ') ?? 'none'));

    lines.push('\n=== OPTIMIZATION LOGS ===');
    lines.push(...optimizationLogs);

    // Show final camera positions
    lines.push('\n=== FINAL CAMERA POSITIONS ===');
    for (const vp of project.viewpoints) {
      lines.push(`${vp.name}: pos=[${vp.position.map(x => x.toFixed(1)).join(', ')}] f=${vp.focalLength.toFixed(0)}`);
    }

    // Show world point positions
    lines.push('\n=== WORLD POINT POSITIONS ===');
    for (const wp of project.worldPoints) {
      if (wp.optimizedXyz) {
        const dist = Math.sqrt(wp.optimizedXyz[0]**2 + wp.optimizedXyz[1]**2 + wp.optimizedXyz[2]**2);
        if (dist > 100) {
          lines.push(`${wp.name}: [${wp.optimizedXyz.map(x => x.toFixed(1)).join(', ')}] DIST=${dist.toFixed(1)} !!!`);
        }
      }
    }

    // Write to file
    fs.writeFileSync(path.join(__dirname, 'debug-vl-output.txt'), lines.join('\n'));

    // Force test to fail so we see output
    expect(result.residual).toBeLessThan(3);
  });
});
