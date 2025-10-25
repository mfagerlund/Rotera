import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { ConstraintSystem } from '../constraint-system';
import { initializeWorldPoints } from '../entity-initialization';
import * as fs from 'fs';

describe('Bundle Adjustment with Real Fixture', () => {
  it('should optimize the real fixture data', () => {
    // Load the fixture
    const fixturePath = 'C:\\Users\\matti\\Downloads\\Untitled Project-optimization-2025-10-21(1).json';

    if (!fs.existsSync(fixturePath)) {
      console.log('Fixture file not found, skipping test');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    console.log(`Points: ${project.worldPoints.size}`);
    console.log(`Viewpoints: ${project.viewpoints.size}`);
    console.log(`Constraints: ${project.constraints.size}`);

    // Initialize optimizedXyz using smart initialization
    initializeWorldPoints(
      Array.from(project.worldPoints),
      Array.from(project.lines),
      Array.from(project.constraints)
    );

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
    project.viewpoints.forEach(v => system.addCamera(v));
    project.constraints.forEach(c => system.addConstraint(c));

    // Run optimization
    const result = system.solve();

    console.log('Optimization result:', result);

    // Check convergence
    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(100);
  });
});
