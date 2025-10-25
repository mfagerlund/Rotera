/**
 * Test camera optimization with real 3-camera project data
 * Shows actual convergence metrics
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Real Camera Data Optimization', () => {
  it('should load and validate 3-camera test data', () => {
    const testDataPath = path.join(__dirname, '../../../test-data/test-project-3-cameras.json');
    const project = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));

    console.log('\n=== Real Camera Test Data ===');
    console.log('Cameras:', Object.keys(project.images || {}).length);

    let totalObservations = 0;
    Object.values(project.images || {}).forEach((img: any) => {
      const obsCount = Object.keys(img.imagePoints || {}).length;
      totalObservations += obsCount;
      console.log(`  - ${img.name}: ${obsCount} observations`);
    });

    console.log('\nWorld Points:', Object.keys(project.worldPoints || {}).length);
    console.log('Constraints:', (project.constraints || []).length);
    console.log('\nTotal observations:', totalObservations);

    // Verify structure
    expect(Object.keys(project.images).length).toBe(3);
    expect(totalObservations).toBe(23); // 5 + 9 + 9
    expect(Object.keys(project.worldPoints).length).toBe(9);

    // Check that observations have correct structure
    const firstImage: any = Object.values(project.images)[0];
    const firstObs: any = Object.values(firstImage.imagePoints)[0];

    expect(firstObs).toHaveProperty('worldPointId');
    expect(firstObs).toHaveProperty('u');
    expect(firstObs).toHaveProperty('v');

    console.log('\nSample observation:');
    console.log(`  World Point: ${firstObs.worldPointId}`);
    console.log(`  Pixel (u,v): (${firstObs.u.toFixed(1)}, ${firstObs.v.toFixed(1)})`);
    console.log('\n✓ Data structure validated - ready for camera optimization!');
  });

  it.skip('should optimize camera poses using real 3-camera data', () => {
    // SKIPPED: Test fixture uses old Camera/Image format, needs migration to Viewpoint format
    const testDataPath = path.join(__dirname, '../../../test-data/test-project-3-cameras.json');
    const fixtureData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));

    console.log('\n=== Real 3-Camera Bundle Adjustment ===');

    // Import required modules
    const { dtoToProject } = require('../../store/project-serialization');
    const { optimizeProject } = require('../optimize-project');

    // Deserialize to entities
    const project = dtoToProject(fixtureData);

    console.log(`Points: ${project.worldPoints.size}`);
    console.log(`Viewpoints: ${project.viewpoints.size}`);
    console.log(`Constraints: ${project.constraints.length}`);

    // Run optimization
    const result = optimizeProject(project, {
      maxIterations: 200,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: false,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });

    console.log('\n=== Results ===');
    console.log(`Converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Final residual: ${result.residual.toFixed(6)}`);

    // Check convergence - relaxed threshold for random initialization
    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(100);

    console.log('\n✓ Camera optimization with real data successful!');
  });
});
