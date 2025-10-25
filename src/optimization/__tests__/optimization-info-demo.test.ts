/**
 * Demo: How to get optimization information from entities
 */

import { describe, it, expect } from '@jest/globals';
import { WorldPoint } from '../../entities/world-point/WorldPoint';
import { Line } from '../../entities/line/Line';
import { Project } from '../../entities/project';
import { optimizeProject } from '../optimize-project';

describe('Optimization Info Demo', () => {
  it('should show optimization info for WorldPoint and Line', () => {
    console.log('\n=== Optimization Info Demo ===\n');

    const p1 = WorldPoint.create('Point 1', {
      lockedXyz: [null, null, null],
      optimizedXyz: [0, 0, 0]
    });

    const p2 = WorldPoint.create('Point 2', {
      lockedXyz: [null, null, null],
      optimizedXyz: [3.5, 4.2, 0.1]
    });

    const line = Line.create('Line 1', p1, p2, { targetLength: 5.0 });

    const project = Project.create('Optimization Info Demo');
    project.addWorldPoint(p1);
    project.addWorldPoint(p2);
    project.addLine(line);

    const result = optimizeProject(project, {
      maxIterations: 50,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: false,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });

    console.log(`Optimization converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Final residual: ${result.residual.toFixed(6)}\n`);

    // Get optimization info for Point 1
    const p1Info = p1.getOptimizationInfo();
    console.log('Point 1 Optimization Info:');
    console.log(`  Position: [${p1Info.lockedXyz?.map(x => x?.toFixed(3)).join(', ')}]`);
    console.log(`  Optimized: ${p1Info.optimizedXyz !== undefined}`);
    console.log(`  Total Residual: ${p1Info.totalResidual.toFixed(6)}`);
    console.log(`  RMS Residual: ${p1Info.rmsResidual.toFixed(6)}\n`);

    // Get optimization info for Point 2
    const p2Info = p2.getOptimizationInfo();
    console.log('Point 2 Optimization Info:');
    console.log(`  Position: [${p2Info.lockedXyz?.map(x => x?.toFixed(3)).join(', ')}]`);
    console.log(`  Optimized: ${p2Info.optimizedXyz !== undefined}`);
    console.log(`  Total Residual: ${p2Info.totalResidual.toFixed(6)}`);
    console.log(`  RMS Residual: ${p2Info.rmsResidual.toFixed(6)}\n`);

    // Get optimization info for Line
    const lineInfo = line.getOptimizationInfo();
    console.log('Line Optimization Info:');
    console.log(`  Current Length: ${lineInfo.length?.toFixed(3)}`);
    console.log(`  Target Length: ${lineInfo.targetLength}`);
    console.log(`  Length Error: ${lineInfo.lengthError?.toFixed(6)}`);
    console.log(`  Direction Constraint: ${lineInfo.direction}`);
    console.log(`  Total Residual: ${lineInfo.totalResidual.toFixed(6)}`);
    console.log(`  RMS Residual: ${lineInfo.rmsResidual.toFixed(6)}\n`);

    // Verify optimization worked
    expect(result.converged).toBe(true);
    expect(p1Info.optimizedXyz).toBeDefined();
    expect(p2Info.optimizedXyz).toBeDefined();

    // Line should be very close to target length and horizontal
    expect(lineInfo.length).toBeCloseTo(5.0, 2);
    expect(lineInfo.lengthError).toBeLessThan(0.01);

    console.log('✓ All optimization info accessible!\n');
  });
});
