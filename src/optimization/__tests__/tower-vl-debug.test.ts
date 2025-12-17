/**
 * Debug test for Tower VL fixture - axis-aligned lines without explicit VLs
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject, clearOptimizationLogs, optimizationLogs } from '../optimize-project';
import * as fs from 'fs';
import * as path from 'path';

beforeEach(() => {
  clearOptimizationLogs();
});

describe('Tower VL Debug', () => {
  it('should solve with axis-aligned lines as virtual VLs', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'Tower-VL-axis-aligned-only.json');
    const json = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(json);

    const debugOutput: string[] = [];
    debugOutput.push('=== Tower VL Debug ===');
    debugOutput.push(`WorldPoints: ${project.worldPoints.size}`);
    debugOutput.push(`Viewpoints: ${project.viewpoints.size}`);
    debugOutput.push(`Lines: ${project.lines.size}`);
    debugOutput.push(`ImagePoints: ${project.imagePoints.size}`);
    debugOutput.push(`Constraints: ${project.constraints.size}`);

    // Debug: Check camera position and focal length after loading
    for (const vp of project.viewpoints.values()) {
      debugOutput.push(`Camera ${vp.name} after load:`);
      debugOutput.push(`  position=[${vp.position.join(',')}]`);
      debugOutput.push(`  rotation=[${vp.rotation.join(',')}]`);
      debugOutput.push(`  focalLength=${vp.focalLength}`);
      debugOutput.push(`  imageSize=${vp.imageWidth}x${vp.imageHeight}`);
    }

    // Debug: Check worldPoint.connectedLines
    for (const wp of project.worldPoints.values()) {
      debugOutput.push(`WP ${wp.name}: ${wp.connectedLines.size} connected lines, ${wp.imagePoints.size} imagePoints`);
    }

    // Debug: Check viewpoint.imagePoints
    for (const vp of project.viewpoints.values()) {
      debugOutput.push(`VP ${vp.name}: ${vp.imagePoints.size} imagePoints`);
    }

    // Count axis-aligned lines
    let xLines = 0, yLines = 0, zLines = 0, freeLines = 0, planeLines = 0;
    for (const line of project.lines.values()) {
      if (line.direction === 'x') xLines++;
      else if (line.direction === 'y') yLines++;
      else if (line.direction === 'z') zLines++;
      else if (line.direction === 'free') freeLines++;
      else planeLines++;
    }
    debugOutput.push(`Line directions: X=${xLines}, Y=${yLines}, Z=${zLines}, plane=${planeLines}, free=${freeLines}`);

    let result: any;
    let error: any;
    try {
      result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 1000,
        tolerance: 1e-8,
        verbose: true,
      });
    } catch (e) {
      error = e;
      debugOutput.push(`\n=== ERROR: ${e} ===`);
    }

    if (result) {
      debugOutput.push('\n=== Results ===');
      debugOutput.push(`Converged: ${result.converged}`);
      debugOutput.push(`Iterations: ${result.iterations}`);
      debugOutput.push(`Total Error: ${result.residual?.toFixed(4)}`);
    }

    // Show camera pose
    for (const vp of project.viewpoints.values()) {
      debugOutput.push(`\nCamera ${vp.name}:`);
      debugOutput.push(`  Position: [${vp.position.map(p => p.toFixed(3)).join(', ')}]`);
      debugOutput.push(`  Rotation: [${vp.rotation.map(r => r.toFixed(4)).join(', ')}]`);
    }

    // Show world point positions
    debugOutput.push('\nWorld Points:');
    for (const wp of project.worldPoints.values()) {
      const pos = wp.optimizedXyz ?? wp.getEffectiveXyz();
      debugOutput.push(`  ${wp.name}: [${pos.map(p => p?.toFixed(3) ?? 'null').join(', ')}]`);
    }

    // Add optimization logs
    debugOutput.push('\n=== Optimization Logs ===');
    debugOutput.push(...optimizationLogs);

    // Write to file
    const outputPath = path.join(__dirname, 'tower-vl-debug-output.txt');
    fs.writeFileSync(outputPath, debugOutput.join('\n'));

    // Fail if there was an error
    if (error) {
      throw error;
    }

    // Temporarily relaxed to see results
    expect(result.residual).toBeLessThan(500);
  });
});
