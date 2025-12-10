import { describe, it, expect } from '@jest/globals';
import { Serialization } from '../../entities/Serialization';
import { optimizeProject } from '../optimize-project';
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import * as fs from 'fs';

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

    console.log('\n=== BEFORE OPTIMIZATION ===');
    console.log('World Points:', project.worldPoints.size);
    console.log('Viewpoints:', project.viewpoints.size);
    console.log('Image Points:', project.imagePoints.size);
    console.log('Constraints:', project.constraints.size);

    // Show initial point positions
    console.log('\nInitial World Point Positions:');
    for (const wp of project.worldPoints) {
      const p = wp as WorldPoint;
      const locked = p.isFullyLocked() ? ' [LOCKED]' : '';
      console.log(`  ${p.getName()}${locked}: ${p.optimizedXyz?.map(x => x.toFixed(4)).join(', ') ?? 'undefined'}`);
    }

    // Show initial camera positions
    console.log('\nInitial Camera Positions:');
    for (const vp of project.viewpoints) {
      const v = vp as Viewpoint;
      const locked = v.isPoseLocked ? ' [LOCKED]' : '';
      console.log(`  ${v.getName()}${locked}: pos=[${v.position.map(x => x.toFixed(4)).join(', ')}]`);
    }

    const result = optimizeProject(project, {
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false,
      maxIterations: 1000,
      tolerance: 1e-6,
      verbose: false,
    });

    console.log('\n=== AFTER OPTIMIZATION ===');
    console.log('Converged:', result.converged);
    console.log('Iterations:', result.iterations);
    console.log('Total Residual:', result.residual);

    // Show final point positions
    console.log('\nFinal World Point Positions:');
    for (const wp of project.worldPoints) {
      const p = wp as WorldPoint;
      const locked = p.isFullyLocked() ? ' [LOCKED]' : '';
      console.log(`  ${p.getName()}${locked}: ${p.optimizedXyz?.map(x => x.toFixed(4)).join(', ') ?? 'undefined'}`);
    }

    // Show final camera positions
    console.log('\nFinal Camera Positions:');
    for (const vp of project.viewpoints) {
      const v = vp as Viewpoint;
      const locked = v.isPoseLocked ? ' [LOCKED]' : '';
      console.log(`  ${v.getName()}${locked}: pos=[${v.position.map(x => x.toFixed(4)).join(', ')}]`);
    }

    // Show reprojection errors
    console.log('\nReprojection Errors:');
    for (const ip of project.imagePoints) {
      const imagePoint = ip as ImagePoint;
      if (imagePoint.lastResiduals && imagePoint.lastResiduals.length === 2) {
        const error = Math.sqrt(imagePoint.lastResiduals[0]**2 + imagePoint.lastResiduals[1]**2);
        console.log(`  ${imagePoint.worldPoint.getName()}@${imagePoint.viewpoint.getName()}: ${error.toFixed(2)} px`);
      }
    }

    // Show coplanar constraint residuals
    console.log('\nCoplanar Constraint Residuals:');
    for (const c of project.constraints) {
      if (c instanceof CoplanarPointsConstraint) {
        const info = c.getOptimizationInfo();
        console.log(`  ${c.getName()}: RMS=${info.rmsResidual.toExponential(3)}, points=[${c.points.map(p => p.getName()).join(', ')}]`);
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

    // Collect point positions
    const pointPositions: Record<string, number[] | undefined> = {};
    for (const wp of project.worldPoints) {
      const p = wp as WorldPoint;
      pointPositions[p.getName()] = p.optimizedXyz;
    }

    // Collect reprojection errors
    const reprojErrors: Record<string, number> = {};
    for (const ip of project.imagePoints) {
      const imagePoint = ip as ImagePoint;
      if (imagePoint.lastResiduals && imagePoint.lastResiduals.length === 2) {
        const error = Math.sqrt(imagePoint.lastResiduals[0]**2 + imagePoint.lastResiduals[1]**2);
        const key = `${imagePoint.worldPoint.getName()}@${imagePoint.viewpoint.getName()}`;
        reprojErrors[key] = error;
      }
    }

    // With the normalized coplanar residual formula, conflicting constraints
    // should now show meaningful non-zero residuals when they can't be satisfied.
    // At least one constraint should have a residual > 0.001 (meaningful deviation)
    const hasSignificantResidual = residualInfos.some(info => info.rms > 0.001);
    expect(hasSignificantResidual).toBe(true);
  });
});
