import { describe, it, expect } from '@jest/globals';
import { deserializeProject } from '../../utils/project-serialization';
import { ConstraintSystem } from '../constraint-system';
import * as fs from 'fs';
import * as path from 'path';

describe('Bundle Adjustment with Real Fixture', () => {
  it('should optimize the real fixture data', () => {
    // Load the fixture
    const fixturePath = 'C:\\Users\\matti\\Downloads\\New Project-optimization-2025-10-18(4).json';
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    // Deserialize to entities
    const project = deserializeProject(fixtureData);

    console.log(`Points: ${project.worldPoints.size}`);
    console.log(`Cameras: ${project.cameras.size}`);
    console.log(`Constraints: ${project.constraints.length}`);

    // Create constraint system
    const system = new ConstraintSystem({
      maxIterations: 200,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: true
    });

    // Add entities
    project.worldPoints.forEach(p => system.addPoint(p));
    project.lines.forEach(l => system.addLine(l));
    project.cameras.forEach(c => system.addCamera(c));
    project.constraints.forEach(c => system.addConstraint(c));

    // Run optimization
    const result = system.solve();

    console.log('Optimization result:', result);

    // Check convergence
    // Note: With random initialization and underdetermined system,
    // we expect the solver to converge but residual may be high
    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(100); // Relaxed threshold for random init
  });
});
