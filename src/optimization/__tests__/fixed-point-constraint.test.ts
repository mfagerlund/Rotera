/**
 * Tests for FixedPointConstraint solver integration.
 *
 * This test uses Pictorigo's actual domain classes to create a complete
 * geometric system, apply constraints, solve using ScalarAutograd, and verify results.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { WorldPoint } from '../../entities/world-point/WorldPoint';
import { FixedPointConstraint } from '../../entities/constraints/fixed-point-constraint';
import { ConstraintSystem } from '../constraint-system';
import type { ConstraintRepository } from '../../entities/constraints/base-constraint';
import type { EntityId, PointId, LineId, PlaneId } from '../../types/ids';

// Create a simple repository for tests
class TestRepository implements ConstraintRepository {
  private points: Map<PointId, WorldPoint> = new Map();

  addPoint(point: WorldPoint): void {
    this.points.set(point.getId(), point);
  }

  getPoint(pointId: PointId): EntityId | undefined {
    return this.points.has(pointId) ? (pointId as EntityId) : undefined;
  }

  getLine(lineId: LineId): EntityId | undefined {
    return undefined;
  }

  getPlane(planeId: PlaneId): EntityId | undefined {
    return undefined;
  }

  entityExists(id: EntityId): boolean {
    return this.points.has(id as PointId);
  }

  pointExists(pointId: PointId): boolean {
    return this.points.has(pointId);
  }

  lineExists(lineId: LineId): boolean {
    return false;
  }

  planeExists(planeId: PlaneId): boolean {
    return false;
  }

  getReferenceManager() {
    const points = this.points;
    return {
      resolve<T>(id: EntityId, type: string): T | undefined {
        if (type === 'point') {
          return points.get(id as PointId) as T | undefined;
        }
        return undefined;
      },
      batchResolve<T>(ids: EntityId[], type: string): T[] {
        if (type === 'point') {
          return ids
            .map(id => points.get(id as PointId))
            .filter((p): p is WorldPoint => p !== undefined) as T[];
        }
        return [];
      },
      preloadReferences(rootIds: EntityId[], options?: { depth?: number }): void {
        // No-op for test repository
      }
    };
  }
}

describe('FixedPointConstraint - Solver Integration', () => {
  let system: ConstraintSystem;
  let repo: TestRepository;

  beforeEach(() => {
    system = new ConstraintSystem({
      tolerance: 1e-6,
      maxIterations: 100,
      verbose: false, // Disable verbose output for cleaner test runs
    });
    repo = new TestRepository();
  });

  it('should lock point to specified 3D coordinates', () => {
    // === 1. CREATE POINT (unsatisfied initial state) ===
    const point = WorldPoint.create('wp1', 'P1', {
      xyz: [5, 3, 7], // Arbitrary position, NOT at origin
      isLocked: false,
    });

    // Add point to repository
    repo.addPoint(point);

    // === 2. CREATE FIXED POINT CONSTRAINT ===
    const constraint = FixedPointConstraint.create(
      'c1',
      'Lock P1 to Origin',
      point.getId(),
      [0, 0, 0], // Target position
      repo,
      { tolerance: 1e-6 }
    );

    // === 3. BUILD SYSTEM ===
    system.addPoint(point);

    // Preload constraint entities before solving
    constraint.preloadEntities();

    system.addConstraint(constraint);

    // === 4. SOLVE ===
    const result = system.solve();

    // === 5. VERIFY ===
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThan(50); // Should converge quickly

    // Point should now be at origin
    const finalCoords = point.getDefinedCoordinates();
    expect(finalCoords).toBeDefined();
    expect(finalCoords![0]).toBeCloseTo(0, 4); // 1e-5 precision is sufficient
    expect(finalCoords![1]).toBeCloseTo(0, 4);
    expect(finalCoords![2]).toBeCloseTo(0, 4);

    // Note: constraint.evaluate() would require proper entity resolution
    // The solver successfully converged, which is the main test
  });

  it('should lock point to arbitrary target position', () => {
    // Point starts far from target
    const point = WorldPoint.create('wp1', 'P1', {
      xyz: [100, 200, 300],
    });

    repo.addPoint(point);

    // Target is specific position
    const targetXyz: [number, number, number] = [10, 20, 30];
    const constraint = FixedPointConstraint.create(
      'c1',
      'Lock to Target',
      point.getId(),
      targetXyz,
      repo,
      { tolerance: 1e-4 } // Match test tolerance
    );

    system.addPoint(point);
    system.addConstraint(constraint);

    const result = system.solve();

    expect(result.converged).toBe(true);

    const finalCoords = point.getDefinedCoordinates();
    expect(finalCoords![0]).toBeCloseTo(targetXyz[0], 4);
    expect(finalCoords![1]).toBeCloseTo(targetXyz[1], 4);
    expect(finalCoords![2]).toBeCloseTo(targetXyz[2], 4);
  });

  it('should not move locked points', () => {
    // Locked point should not be affected by constraints
    const point = WorldPoint.create('wp1', 'P1', {
      xyz: [5, 3, 7],
      isLocked: true, // LOCKED
    });

    repo.addPoint(point);

    const constraint = FixedPointConstraint.create(
      'c1',
      'Try to move locked point',
      point.getId(),
      [0, 0, 0],
      repo
    );

    system.addPoint(point);
    system.addConstraint(constraint);

    const result = system.solve();

    // Solver should recognize over-constrained system (no free variables)
    expect(result.iterations).toBe(0);

    // Point should NOT have moved
    const finalCoords = point.getDefinedCoordinates();
    expect(finalCoords![0]).toBeCloseTo(5, 4);
    expect(finalCoords![1]).toBeCloseTo(3, 4);
    expect(finalCoords![2]).toBeCloseTo(7, 4);
  });

  it('should handle multiple independent fixed points', () => {
    const point1 = WorldPoint.create('wp1', 'P1', {
      xyz: [10, 20, 30],
    });

    const point2 = WorldPoint.create('wp2', 'P2', {
      xyz: [-5, -10, -15],
    });

    repo.addPoint(point1);
    repo.addPoint(point2);

    const constraint1 = FixedPointConstraint.create(
      'c1',
      'Fix P1',
      point1.getId(),
      [1, 2, 3],
      repo,
      { tolerance: 1e-4 }
    );

    const constraint2 = FixedPointConstraint.create(
      'c2',
      'Fix P2',
      point2.getId(),
      [4, 5, 6],
      repo,
      { tolerance: 1e-4 }
    );

    system.addPoint(point1);
    system.addPoint(point2);
    system.addConstraint(constraint1);
    system.addConstraint(constraint2);

    const result = system.solve();

    expect(result.converged).toBe(true);

    // Both points should be at their targets
    const coords1 = point1.getDefinedCoordinates();
    expect(coords1![0]).toBeCloseTo(1, 4);
    expect(coords1![1]).toBeCloseTo(2, 4);
    expect(coords1![2]).toBeCloseTo(3, 4);

    const coords2 = point2.getDefinedCoordinates();
    expect(coords2![0]).toBeCloseTo(4, 4);
    expect(coords2![1]).toBeCloseTo(5, 4);
    expect(coords2![2]).toBeCloseTo(6, 4);

    // Note: constraint.evaluate() requires proper entity resolution
    // We've already verified the points are at correct positions via solver
  });

  it('should report residual magnitude correctly', () => {
    const point = WorldPoint.create('wp1', 'P1', {
      xyz: [3, 4, 0], // Distance of 5 from origin
    });

    repo.addPoint(point);

    const constraint = FixedPointConstraint.create(
      'c1',
      'Fix to origin',
      point.getId(),
      [0, 0, 0],
      repo,
      { tolerance: 1e-4 }
    );

    system.addPoint(point);
    system.addConstraint(constraint);

    const result = system.solve();

    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(1e-6);

    // Final position should be at origin
    const finalCoords = point.getDefinedCoordinates();
    expect(finalCoords![0]).toBeCloseTo(0, 4);
    expect(finalCoords![1]).toBeCloseTo(0, 4);
    expect(finalCoords![2]).toBeCloseTo(0, 4);
  });
});
