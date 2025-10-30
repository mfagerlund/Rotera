/**
 * Analyze the "2 vps and 2 fixed points" cube example
 * to understand why solver error is large despite careful point placement
 */

import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import * as fs from 'fs';
import * as path from 'path';
import { optimizeProject } from '../optimize-project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';

describe('Cube Fixture Analysis', () => {
  it('should analyze the 2 vps and 2 fixed points example', () => {
    const jsonPath = path.join('C:', 'Slask', '2 vps and 2 fixed points.json');
    const jsonData = fs.readFileSync(jsonPath, 'utf8');

    const project = loadProjectFromJson(jsonData);

    console.log('\n=== INITIAL STATE ===');
    const worldPoints = Array.from(project.worldPoints) as WorldPoint[];
    for (const wp of worldPoints) {
      const locked = wp.lockedXyz;
      const inferred = wp.inferredXyz;
      const optimized = wp.optimizedXyz;
      console.log(`${wp.name}:`);
      console.log(`  Locked:    [${locked.map(v => v?.toFixed(3) ?? 'null').join(', ')}]`);
      console.log(`  Inferred:  [${inferred.map(v => v?.toFixed(3) ?? 'null').join(', ')}]`);
      console.log(`  Optimized: [${optimized?.map(v => v.toFixed(3)).join(', ') ?? 'null'}]`);
    }

    const viewpoint = Array.from(project.viewpoints)[0] as Viewpoint;
    console.log(`\nCamera ${viewpoint.name}:`);
    console.log(`  Position: [${viewpoint.position.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`  Focal length: ${viewpoint.focalLength.toFixed(1)}`);
    console.log(`  Vanishing lines: ${viewpoint.getVanishingLineCount()}`);

    console.log('\n=== EXPECTED GEOMETRY (cube with side 10, origin at 0,0,0) ===');
    console.log('WP1: (0, 0, 0) - LOCKED');
    console.log('WP2: (0, 0, 10) - LOCKED');
    console.log('WP3: should be (-10, 0, 10)');
    console.log('WP4: should be (-10, 0, 0)');

    console.log('\n=== ACTUAL OPTIMIZED GEOMETRY ===');
    const wp1 = worldPoints.find(p => p.name === 'WP1')!;
    const wp2 = worldPoints.find(p => p.name === 'WP2')!;
    const wp3 = worldPoints.find(p => p.name === 'WP3')!;
    const wp4 = worldPoints.find(p => p.name === 'WP4')!;

    console.log(`WP1: [${wp1.optimizedXyz?.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`WP2: [${wp2.optimizedXyz?.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`WP3: [${wp3.optimizedXyz?.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`WP4: [${wp4.optimizedXyz?.map(v => v.toFixed(3)).join(', ')}]`);

    // Compute errors
    const wp3Expected = [-10, 0, 10];
    const wp4Expected = [-10, 0, 0];
    const wp3Error = Math.sqrt(
      (wp3.optimizedXyz![0] - wp3Expected[0]) ** 2 +
      (wp3.optimizedXyz![1] - wp3Expected[1]) ** 2 +
      (wp3.optimizedXyz![2] - wp3Expected[2]) ** 2
    );
    const wp4Error = Math.sqrt(
      (wp4.optimizedXyz![0] - wp4Expected[0]) ** 2 +
      (wp4.optimizedXyz![1] - wp4Expected[1]) ** 2 +
      (wp4.optimizedXyz![2] - wp4Expected[2]) ** 2
    );

    console.log(`\nWP3 error: ${wp3Error.toFixed(3)} units (expected at [-10, 0, 10])`);
    console.log(`WP4 error: ${wp4Error.toFixed(3)} units (expected at [-10, 0, 0])`);

    console.log('\n=== RUNNING OPTIMIZATION ===');
    const result = optimizeProject(project, {
      autoInitializeCameras: false,  // Already initialized
      autoInitializeWorldPoints: false,  // Already initialized
      tolerance: 1e-6,
      maxIterations: 100,
      verbose: false,
    });

    console.log('\n=== OPTIMIZATION RESULT ===');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Residual: ${result.residual.toFixed(6)}`);
    console.log(`Median reprojection error: ${result.medianReprojectionError?.toFixed(2)} px`);

    console.log('\n=== GEOMETRY AFTER OPTIMIZATION ===');
    for (const wp of worldPoints) {
      const optimized = wp.optimizedXyz;
      console.log(`${wp.name}: [${optimized?.map(v => v.toFixed(3)).join(', ')}]`);
    }

    console.log(`\nCamera ${viewpoint.name} after optimization:`);
    console.log(`  Position: [${viewpoint.position.map(v => v.toFixed(3)).join(', ')}]`);

    // Recompute errors after optimization
    const wp3ErrorAfter = Math.sqrt(
      (wp3.optimizedXyz![0] - wp3Expected[0]) ** 2 +
      (wp3.optimizedXyz![1] - wp3Expected[1]) ** 2 +
      (wp3.optimizedXyz![2] - wp3Expected[2]) ** 2
    );
    const wp4ErrorAfter = Math.sqrt(
      (wp4.optimizedXyz![0] - wp4Expected[0]) ** 2 +
      (wp4.optimizedXyz![1] - wp4Expected[1]) ** 2 +
      (wp4.optimizedXyz![2] - wp4Expected[2]) ** 2
    );

    console.log(`\nWP3 error after: ${wp3ErrorAfter.toFixed(3)} units`);
    console.log(`WP4 error after: ${wp4ErrorAfter.toFixed(3)} units`);

    console.log('\n=== REPROJECTION ERRORS ===');
    for (const ip of Array.from(project.imagePoints) as ImagePoint[]) {
      const residuals = ip.lastResiduals;
      if (residuals) {
        const error = Math.sqrt(residuals[0] ** 2 + residuals[1] ** 2);
        console.log(`${ip.worldPoint.name} @ ${ip.viewpoint.name}: ${error.toFixed(2)} px`);
      }
    }

    console.log('\n=== ANALYSIS ===');
    console.log('Issue: Reprojection weight is 0.0001 when geometric constraints exist');
    console.log('This causes camera to drift and points to move to satisfy geometric constraints');
    console.log('Vanishing point constraints are NOT maintained during optimization (only used for init)');
    console.log('\nRecommendation: Add vanishing point residuals to the solver to maintain camera orientation');
  });
});
