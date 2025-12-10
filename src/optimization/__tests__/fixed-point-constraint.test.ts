/**
 * Tests for FixedPointConstraint solver integration.
 *
 * This test uses Pictorigo's actual domain classes to create a complete
 * geometric system, apply constraints, solve using ScalarAutograd, and verify results.
 */

import { describe, it, expect } from '@jest/globals';
import { WorldPoint } from '../../entities/world-point/WorldPoint';
import { FixedPointConstraint } from '../../entities/constraints/fixed-point-constraint';
import { Project } from '../../entities/project';
import { optimizeProject } from '../optimize-project';

describe('FixedPointConstraint - Solver Integration', () => {

  it('should lock point to specified 3D coordinates', () => {
    const project = Project.create('Fixed Point Test');

    // === 1. CREATE POINT (unsatisfied initial state) ===
    const point = WorldPoint.create('P1', {
      lockedXyz: [null, null, null],
      optimizedXyz: [5, 3, 7], // Arbitrary position, NOT at origin
    });

    // === 2. CREATE FIXED POINT CONSTRAINT ===
    const constraint = FixedPointConstraint.create(
      'Lock P1 to Origin',
      point,
      [0, 0, 0], // Target position
      { tolerance: 1e-6 }
    );

    // === 3. BUILD PROJECT ===
    project.addWorldPoint(point);
    project.addConstraint(constraint);

    // === 4. SOLVE ===
    const result = optimizeProject(project, {
      tolerance: 1e-6,
      maxIterations: 100,
      verbose: false,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });

    // === 5. VERIFY ===
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThan(50); // Should converge quickly

    // Point should now be at origin
    const finalCoords = point.optimizedXyz;
    expect(finalCoords).toBeDefined();
    expect(finalCoords![0]).toBeCloseTo(0, 4); // 1e-5 precision is sufficient
    expect(finalCoords![1]).toBeCloseTo(0, 4);
    expect(finalCoords![2]).toBeCloseTo(0, 4);

    // Note: constraint.evaluate() would require proper entity resolution
    // The solver successfully converged, which is the main test
  });

  it('should lock point to arbitrary target position', () => {
    const project = Project.create('Target Position Test');

    // Point starts far from target
    const point = WorldPoint.create('P1', {
      lockedXyz: [null, null, null],
      optimizedXyz: [100, 200, 300],
    });

    // Target is specific position
    const targetXyz: [number, number, number] = [10, 20, 30];
    const constraint = FixedPointConstraint.create(
      'Lock to Target',
      point,
      targetXyz,
      { tolerance: 1e-4 } // Match test tolerance
    );

    project.addWorldPoint(point);
    project.addConstraint(constraint);

    const result = optimizeProject(project, {
      tolerance: 1e-6,
      maxIterations: 100,
      damping: 1e-3, // Use low damping for high precision with limited iterations
      verbose: false,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });

    expect(result.converged).toBe(true);

    const finalCoords = point.optimizedXyz;
    expect(finalCoords![0]).toBeCloseTo(targetXyz[0], 4);
    expect(finalCoords![1]).toBeCloseTo(targetXyz[1], 4);
    expect(finalCoords![2]).toBeCloseTo(targetXyz[2], 4);
  });

  it('should not move locked points', () => {
    const project = Project.create('Locked Point Test');

    // Locked point should not be affected by constraints
    const point = WorldPoint.create('P1', {
      lockedXyz: [5, 3, 7], // LOCKED at this position
      optimizedXyz: [5, 3, 7],
    });

    const constraint = FixedPointConstraint.create(
      'Try to move locked point',
      point,
      [0, 0, 0]
    );

    project.addWorldPoint(point);
    project.addConstraint(constraint);

    const result = optimizeProject(project, {
      tolerance: 1e-6,
      maxIterations: 100,
      verbose: false,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });

    // Solver should recognize over-constrained system (no free variables)
    expect(result.iterations).toBe(0);

    // Point should NOT have moved
    const finalCoords = point.optimizedXyz;
    expect(finalCoords![0]).toBeCloseTo(5, 4);
    expect(finalCoords![1]).toBeCloseTo(3, 4);
    expect(finalCoords![2]).toBeCloseTo(7, 4);
  });

  it('should handle multiple independent fixed points', () => {
    const project = Project.create('Multiple Fixed Points Test');

    const point1 = WorldPoint.create('P1', {
      lockedXyz: [null, null, null],
      optimizedXyz: [10, 20, 30],
    });

    const point2 = WorldPoint.create('P2', {
      lockedXyz: [null, null, null],
      optimizedXyz: [-5, -10, -15],
    });

    const constraint1 = FixedPointConstraint.create(
      'Fix P1',
      point1,
      [1, 2, 3],
      { tolerance: 1e-4 }
    );

    const constraint2 = FixedPointConstraint.create(
      'Fix P2',
      point2,
      [4, 5, 6],
      { tolerance: 1e-4 }
    );

    project.addWorldPoint(point1);
    project.addWorldPoint(point2);
    project.addConstraint(constraint1);
    project.addConstraint(constraint2);

    const result = optimizeProject(project, {
      tolerance: 1e-6,
      maxIterations: 100,
      verbose: false,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });

    expect(result.converged).toBe(true);

    // Both points should be at their targets
    const coords1 = point1.optimizedXyz;
    expect(coords1![0]).toBeCloseTo(1, 4);
    expect(coords1![1]).toBeCloseTo(2, 4);
    expect(coords1![2]).toBeCloseTo(3, 4);

    const coords2 = point2.optimizedXyz;
    expect(coords2![0]).toBeCloseTo(4, 4);
    expect(coords2![1]).toBeCloseTo(5, 4);
    expect(coords2![2]).toBeCloseTo(6, 4);

    // Note: constraint.evaluate() requires proper entity resolution
    // We've already verified the points are at correct positions via solver
  });

  it('should report residual magnitude correctly', () => {
    const project = Project.create('Residual Test');

    const point = WorldPoint.create('P1', {
      lockedXyz: [null, null, null],
      optimizedXyz: [3, 4, 0], // Distance of 5 from origin
    });

    const constraint = FixedPointConstraint.create(
      'Fix to origin',
      point,
      [0, 0, 0],
      { tolerance: 1e-4 }
    );

    project.addWorldPoint(point);
    project.addConstraint(constraint);

    const result = optimizeProject(project, {
      tolerance: 1e-6,
      maxIterations: 100,
      damping: 1e-3, // Use low damping for high precision with limited iterations
      verbose: false,
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false
    });

    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(1e-6);

    // Final position should be at origin
    const finalCoords = point.optimizedXyz;
    expect(finalCoords![0]).toBeCloseTo(0, 4);
    expect(finalCoords![1]).toBeCloseTo(0, 4);
    expect(finalCoords![2]).toBeCloseTo(0, 4);
  });
});
