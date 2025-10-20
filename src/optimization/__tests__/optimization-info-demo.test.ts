/**
 * Demo: How to get optimization information from entities
 */

import { describe, it, expect } from '@jest/globals';
import { WorldPoint } from '../../entities/world-point/WorldPoint';
import { Line } from '../../entities/line/Line';
import { ConstraintSystem } from '../constraint-system';

describe('Optimization Info Demo', () => {
  it('should show optimization info for WorldPoint and Line', () => {
    console.log('\n=== Optimization Info Demo ===\n');

    // Create 2 points and a line with constraints
    const p1 = WorldPoint.create('p1', 'Point 1', {
      xyz: [0, 0, 0],
      isLocked: false
    });

    const p2 = WorldPoint.create('p2', 'Point 2', {
      xyz: [3.5, 4.2, 0.1],  // Not exactly 5 units from p1
      isLocked: false
    });

    const line = Line.create('line1', 'Line 1', p1, p2, {
      constraints: {
        direction: 'horizontal',
        targetLength: 5.0,
        tolerance: 0.001
      }
    });

    // Create system and optimize
    const system = new ConstraintSystem({
      maxIterations: 50,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: false
    });

    system.addPoint(p1);
    system.addPoint(p2);
    system.addLine(line);

    const result = system.solve();

    console.log(`Optimization converged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Final residual: ${result.residual.toFixed(6)}\n`);

    // Get optimization info for Point 1
    const p1Info = p1.getOptimizationInfo();
    console.log('Point 1 Optimization Info:');
    console.log(`  Position: [${p1Info.lockedXyz?.map(x => x?.toFixed(3)).join(', ')}]`);
    console.log(`  Optimized: ${p1Info.isOptimized}`);
    console.log(`  Total Residual: ${p1Info.totalResidual.toFixed(6)}`);
    console.log(`  RMS Residual: ${p1Info.rmsResidual.toFixed(6)}\n`);

    // Get optimization info for Point 2
    const p2Info = p2.getOptimizationInfo();
    console.log('Point 2 Optimization Info:');
    console.log(`  Position: [${p2Info.lockedXyz?.map(x => x?.toFixed(3)).join(', ')}]`);
    console.log(`  Optimized: ${p2Info.isOptimized}`);
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
    expect(p1Info.isOptimized).toBe(true);
    expect(p2Info.isOptimized).toBe(true);

    // Line should be very close to target length and horizontal
    expect(lineInfo.length).toBeCloseTo(5.0, 2);
    expect(lineInfo.lengthError).toBeLessThan(0.01);

    console.log('✓ All optimization info accessible!\n');
  });
});
