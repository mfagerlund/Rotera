import { describe, it, expect } from '@jest/globals';
import { WorldPoint } from '../../entities/world-point';
import { Line } from '../../entities/line';
import { Project } from '../../entities/project';
import { optimizeProject } from '../optimize-project';

describe('Simple Length Constraint Test', () => {
  it('should adjust two points to satisfy target length constraint', () => {
    const p1 = WorldPoint.create('P1');
    const p2 = WorldPoint.create('P2');
    p1.optimizedXyz = [0, 0, 0];
    p2.optimizedXyz = [5, 0, 0];

    const line = Line.create('TestLine', p1, p2);
    line.targetLength = 10;

    const project = Project.create('Simple');
    project.addWorldPoint(p1);
    project.addWorldPoint(p2);
    project.addLine(line);

    console.log('\n=== SIMPLE LENGTH CONSTRAINT TEST ===');
    console.log(`Initial length: ${line.length()?.toFixed(3)}`);
    console.log(`Target length: ${line.targetLength}`);

    const result = optimizeProject(project, {
      maxIterations: 100,
      tolerance: 1e-6,
      verbose: true,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });

    console.log('\n=== RESULTS ===');
    console.log(`Final length: ${line.length()?.toFixed(3)}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`P1: ${p1.optimizedXyz?.map(v => v.toFixed(3))}`);
    console.log(`P2: ${p2.optimizedXyz?.map(v => v.toFixed(3))}`);

    const finalLength = line.length();
    expect(finalLength).toBeDefined();
    expect(finalLength).toBeCloseTo(10.0, 0);
  });
});
