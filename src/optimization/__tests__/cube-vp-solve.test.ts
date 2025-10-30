import { describe, it } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import * as fs from 'fs';
import * as path from 'path';

describe('Cube VP Solve', () => {
  it('should solve the EXAGGERATED cube fixture with VP initialization', () => {
    const jsonPath = path.join(__dirname, 'fixtures', 'cube-2vps-exaggerated.json');
    const jsonData = fs.readFileSync(jsonPath, 'utf8');
    const project = loadProjectFromJson(jsonData);

    console.log('\n=== CUBE FIXTURE WITH VP INITIALIZATION ===\n');

    console.log('Project info:');
    console.log(`  World Points: ${project.worldPoints.size}`);
    console.log(`  Lines: ${project.lines.size}`);
    console.log(`  Viewpoints: ${project.viewpoints.size}`);
    const totalImagePoints = Array.from(project.viewpoints).reduce((sum, vp) => sum + vp.imagePoints.size, 0);
    console.log(`  Image Points: ${totalImagePoints}`);
    console.log(`  Constraints: ${project.constraints.size}\n`);

    console.log('Running optimization with autoInitializeCameras=true (will use VP init)...\n');

    const result = optimizeProject(project, {
      maxIterations: 200,
      tolerance: 1e-6,
      damping: 10.0,
      verbose: true,
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true
    });

    console.log(`\nConverged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Final residual: ${result.residual.toFixed(2)}`);

    const viewpoint = Array.from(project.viewpoints)[0];
    console.log(`\nCamera pose after optimization:`);
    console.log(`  Position: [${viewpoint.position.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`  Rotation: [${viewpoint.rotation.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`  Focal length: ${viewpoint.focalLength.toFixed(1)}`);

    const imagePoints = Array.from(viewpoint.imagePoints);
    let totalError = 0;
    let maxError = 0;
    console.log('\nReprojection errors:');
    for (const ip of imagePoints) {
      const error = Math.sqrt(ip.residualU * ip.residualU + ip.residualV * ip.residualV);
      totalError += error;
      maxError = Math.max(maxError, error);
      console.log(`  ${ip.worldPoint.name}: ${error.toFixed(2)} px`);
    }
    const medianError = totalError / imagePoints.length;
    console.log(`\nMedian error: ${medianError.toFixed(2)} px`);
    console.log(`Max error: ${maxError.toFixed(2)} px`);

    if (medianError < 10) {
      console.log('\n SUCCESS - Solver produces good results with VP initialization');
    } else {
      console.log(`\n FAIL - Median reprojection error is ${medianError.toFixed(2)} px (should be < 10 px)`);
    }
  });
});
