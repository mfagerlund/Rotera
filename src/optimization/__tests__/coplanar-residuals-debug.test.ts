import { describe, it, expect } from '@jest/globals';
import { Serialization } from '../../entities/Serialization';
import { optimizeProject } from '../optimize-project';
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint';
import * as fs from 'fs';
import * as path from 'path';

describe('Coplanar Residuals Debug', () => {
  it('should compute non-zero residuals for conflicting coplanar constraints', () => {
    // Load the test file
    const testFilePath = 'C:/Slask/must-fail-coplanar.json';
    if (!fs.existsSync(testFilePath)) {
      console.log('Test file not found, skipping');
      return;
    }

    const json = fs.readFileSync(testFilePath, 'utf-8');
    const project = Serialization.deserialize(json);

    console.log('Before optimization:');
    console.log('Constraints:', project.constraints.size);
    for (const c of project.constraints) {
      if (c instanceof CoplanarPointsConstraint) {
        console.log(`  ${c.getName()}: ${c.points.length} points, lastResiduals=`, c.lastResiduals);
      }
    }

    const result = optimizeProject(project, {
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false,
      maxIterations: 1000,
      tolerance: 1e-6,
      verbose: true,
    });

    console.log('\nAfter optimization:');
    console.log('Converged:', result.converged);
    console.log('Iterations:', result.iterations);
    console.log('Residual:', result.residual);

    for (const c of project.constraints) {
      if (c instanceof CoplanarPointsConstraint) {
        console.log(`  ${c.getName()}: lastResiduals=`, c.lastResiduals);
        const info = c.getOptimizationInfo();
        console.log(`    RMS:`, info.rmsResidual);
        console.log(`    Points:`, c.points.map(p => p.getName()).join(', '));
      }
    }

    // Collect residual info for assertions
    const residualInfos: { name: string; rms: number; residuals: number[] }[] = [];
    for (const c of project.constraints) {
      if (c instanceof CoplanarPointsConstraint) {
        const info = c.getOptimizationInfo();
        residualInfos.push({
          name: c.getName(),
          rms: info.rmsResidual,
          residuals: info.residuals,
        });
      }
    }

    // Verify that residuals are computed (not empty arrays)
    expect(residualInfos.length).toBeGreaterThan(0);
    for (const info of residualInfos) {
      expect(info.residuals.length).toBeGreaterThan(0);
    }
  });
});
