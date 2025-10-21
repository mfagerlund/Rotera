/**
 * Comprehensive tests for ALL constraint types using ScalarAutograd solver.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { WorldPoint } from '../../entities/world-point/WorldPoint';
import { FixedPointConstraint } from '../../entities/constraints/fixed-point-constraint';
import { DistanceConstraint } from '../../entities/constraints/distance-constraint';
import { AngleConstraint } from '../../entities/constraints/angle-constraint';
import { CollinearPointsConstraint } from '../../entities/constraints/collinear-points-constraint';
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint';
import { EqualDistancesConstraint } from '../../entities/constraints/equal-distances-constraint';
import { EqualAnglesConstraint } from '../../entities/constraints/equal-angles-constraint';
import { ConstraintSystem } from '../constraint-system';
import type { ConstraintRepository } from '../../entities/constraints/base-constraint';
import type { EntityId, PointId, LineId, PlaneId } from '../../types/ids';

// Test repository implementation
class TestRepository implements ConstraintRepository {
  private points: Map<PointId, WorldPoint> = new Map();

  addPoint(point: WorldPoint): void {
    this.points.set(point.id, point);
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

describe('ConstraintSystem - All Constraint Types', () => {
  let system: ConstraintSystem;
  let repo: TestRepository;

  beforeEach(() => {
    system = new ConstraintSystem({
      tolerance: 1e-6,
      maxIterations: 100,
      verbose: false,
    });
    repo = new TestRepository();
  });

  describe('DistanceConstraint', () => {
    it('should enforce distance between two points', () => {
      const p1 = WorldPoint.create('p1', 'P1', { xyz: [0, 0, 0] });
      const p2 = WorldPoint.create('p2', 'P2', { xyz: [50, 0, 0] }); // 50 units apart

      repo.addPoint(p1);
      repo.addPoint(p2);

      // Constrain to 100 units apart
      const constraint = DistanceConstraint.create(
        'c1',
        'Distance 100',
        p1.id,
        p2.id,
        100,
        repo,
        { tolerance: 1e-4 }
      );

      system.addPoint(p1);
      system.addPoint(p2);
      system.addConstraint(constraint);

      const result = system.solve();

      expect(result.converged).toBe(true);

      // Calculate final distance
      const coords1 = p1.optimizedXyz!;
      const coords2 = p2.optimizedXyz!;
      const dx = coords2[0] - coords1[0];
      const dy = coords2[1] - coords1[1];
      const dz = coords2[2] - coords1[2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      expect(distance).toBeCloseTo(100, 4);
    });
  });

  describe('AngleConstraint', () => {
    it('should enforce angle at vertex', () => {
      const pA = WorldPoint.create('pA', 'PA', { xyz: [10, 0, 0] });
      const vertex = WorldPoint.create('vertex', 'Vertex', { xyz: [0, 0, 0] });
      const pC = WorldPoint.create('pC', 'PC', { xyz: [0, 5, 0] }); // Currently 90 degrees

      repo.addPoint(pA);
      repo.addPoint(vertex);
      repo.addPoint(pC);

      // Constrain to 60 degrees
      const constraint = AngleConstraint.create(
        'c1',
        'Angle 60',
        pA.id,
        vertex.id,
        pC.id,
        60, // degrees
        repo,
        { tolerance: 1e-4 }
      );

      system.addPoint(pA);
      system.addPoint(vertex);
      system.addPoint(pC);
      system.addConstraint(constraint);

      const result = system.solve();

      expect(result.converged).toBe(true);

      // Calculate final angle
      const cA = pA.optimizedXyz!;
      const cV = vertex.optimizedXyz!;
      const cC = pC.optimizedXyz!;

      const v1 = [cA[0] - cV[0], cA[1] - cV[1], cA[2] - cV[2]];
      const v2 = [cC[0] - cV[0], cC[1] - cV[1], cC[2] - cV[2]];

      const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
      const mag1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2);
      const mag2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2);
      const angleDeg = (Math.acos(dot / (mag1 * mag2)) * 180) / Math.PI;

      expect(angleDeg).toBeCloseTo(60, 2);
    });
  });

  describe('CollinearPointsConstraint', () => {
    it('should make 3 points collinear', () => {
      const p1 = WorldPoint.create('p1', 'P1', { xyz: [0, 0, 0], isLocked: true });
      const p2 = WorldPoint.create('p2', 'P2', { xyz: [10, 0, 0], isLocked: true });
      const p3 = WorldPoint.create('p3', 'P3', { xyz: [5, 5, 0] }); // Off the line

      repo.addPoint(p1);
      repo.addPoint(p2);
      repo.addPoint(p3);

      const constraint = CollinearPointsConstraint.create(
        'c1',
        'Collinear',
        [p1.id, p2.id, p3.id],
        repo,
        { tolerance: 1e-4 }
      );

      system.addPoint(p1);
      system.addPoint(p2);
      system.addPoint(p3);
      system.addConstraint(constraint);

      const result = system.solve();

      expect(result.converged).toBe(true);

      // p3 should now be on the line from p1 to p2
      const c3 = p3.optimizedXyz!;
      expect(c3[1]).toBeCloseTo(0, 4); // y should be 0
      expect(c3[2]).toBeCloseTo(0, 4); // z should be 0
    });
  });

  describe('CoplanarPointsConstraint', () => {
    it('should make 4 points coplanar', () => {
      const p1 = WorldPoint.create('p1', 'P1', { xyz: [0, 0, 0], isLocked: true });
      const p2 = WorldPoint.create('p2', 'P2', { xyz: [10, 0, 0], isLocked: true });
      const p3 = WorldPoint.create('p3', 'P3', { xyz: [0, 10, 0], isLocked: true });
      const p4 = WorldPoint.create('p4', 'P4', { xyz: [5, 5, 10] }); // Out of plane

      repo.addPoint(p1);
      repo.addPoint(p2);
      repo.addPoint(p3);
      repo.addPoint(p4);

      const constraint = CoplanarPointsConstraint.create(
        'c1',
        'Coplanar',
        [p1.id, p2.id, p3.id, p4.id],
        repo,
        { tolerance: 1e-4 }
      );

      system.addPoint(p1);
      system.addPoint(p2);
      system.addPoint(p3);
      system.addPoint(p4);
      system.addConstraint(constraint);

      const result = system.solve();

      expect(result.converged).toBe(true);

      // p4 should now be in the xy-plane (z = 0)
      const c4 = p4.optimizedXyz!;
      expect(c4[2]).toBeCloseTo(0, 4);
    });
  });

  describe('EqualDistancesConstraint', () => {
    it('should enforce equal distances between point pairs', () => {
      const p1 = WorldPoint.create('p1', 'P1', { xyz: [0, 0, 0], isLocked: true });
      const p2 = WorldPoint.create('p2', 'P2', { xyz: [10, 0, 0] });
      const p3 = WorldPoint.create('p3', 'P3', { xyz: [0, 20, 0], isLocked: true });
      const p4 = WorldPoint.create('p4', 'P4', { xyz: [0, 35, 0] });

      repo.addPoint(p1);
      repo.addPoint(p2);
      repo.addPoint(p3);
      repo.addPoint(p4);

      // Make distance(p1, p2) equal to distance(p3, p4)
      const constraint = EqualDistancesConstraint.create(
        'c1',
        'Equal Distances',
        [
          [p1.id, p2.id],
          [p3.id, p4.id]
        ],
        repo,
        { tolerance: 1e-4 }
      );

      system.addPoint(p1);
      system.addPoint(p2);
      system.addPoint(p3);
      system.addPoint(p4);
      system.addConstraint(constraint);

      const result = system.solve();

      expect(result.converged).toBe(true);

      // Calculate distances
      const c1 = p1.optimizedXyz!;
      const c2 = p2.optimizedXyz!;
      const c3 = p3.optimizedXyz!;
      const c4 = p4.optimizedXyz!;

      const dist1 = Math.sqrt((c2[0] - c1[0]) ** 2 + (c2[1] - c1[1]) ** 2 + (c2[2] - c1[2]) ** 2);
      const dist2 = Math.sqrt((c4[0] - c3[0]) ** 2 + (c4[1] - c3[1]) ** 2 + (c4[2] - c3[2]) ** 2);

      expect(dist1).toBeCloseTo(dist2, 4);
    });
  });

  describe('EqualAnglesConstraint', () => {
    it('should enforce equal angles', () => {
      // First angle: PA1 - V1 - PC1
      const pA1 = WorldPoint.create('pA1', 'PA1', { xyz: [10, 0, 0], isLocked: true });
      const v1 = WorldPoint.create('v1', 'V1', { xyz: [0, 0, 0], isLocked: true });
      const pC1 = WorldPoint.create('pC1', 'PC1', { xyz: [5, 8.66, 0] }); // ~60 degrees

      // Second angle: PA2 - V2 - PC2
      const pA2 = WorldPoint.create('pA2', 'PA2', { xyz: [20, 0, 0], isLocked: true });
      const v2 = WorldPoint.create('v2', 'V2', { xyz: [10, 0, 0], isLocked: true });
      const pC2 = WorldPoint.create('pC2', 'PC2', { xyz: [15, 5, 0] }); // ~45 degrees

      repo.addPoint(pA1);
      repo.addPoint(v1);
      repo.addPoint(pC1);
      repo.addPoint(pA2);
      repo.addPoint(v2);
      repo.addPoint(pC2);

      // Make both angles equal
      const constraint = EqualAnglesConstraint.create(
        'c1',
        'Equal Angles',
        [
          [pA1.id, v1.id, pC1.id],
          [pA2.id, v2.id, pC2.id]
        ],
        repo,
        { tolerance: 1e-4 }
      );

      system.addPoint(pA1);
      system.addPoint(v1);
      system.addPoint(pC1);
      system.addPoint(pA2);
      system.addPoint(v2);
      system.addPoint(pC2);
      system.addConstraint(constraint);

      const result = system.solve();

      expect(result.converged).toBe(true);

      // Helper to calculate angle
      const calcAngle = (a: [number, number, number], v: [number, number, number], c: [number, number, number]) => {
        const v1 = [a[0] - v[0], a[1] - v[1], a[2] - v[2]];
        const v2 = [c[0] - v[0], c[1] - v[1], c[2] - v[2]];
        const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
        const mag1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2);
        const mag2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2);
        return (Math.acos(dot / (mag1 * mag2)) * 180) / Math.PI;
      };

      const angle1 = calcAngle(
        pA1.optimizedXyz!,
        v1.optimizedXyz!,
        pC1.optimizedXyz!
      );

      const angle2 = calcAngle(
        pA2.optimizedXyz!,
        v2.optimizedXyz!,
        pC2.optimizedXyz!
      );

      expect(angle1).toBeCloseTo(angle2, 2);
    });
  });

  describe('Complex scenarios', () => {
    it('should solve multiple constraints simultaneously', () => {
      // Create an equilateral triangle
      const p1 = WorldPoint.create('p1', 'P1', { xyz: [0, 0, 0], isLocked: true });
      const p2 = WorldPoint.create('p2', 'P2', { xyz: [10, 0, 0] });
      const p3 = WorldPoint.create('p3', 'P3', { xyz: [5, 8, 0] });

      repo.addPoint(p1);
      repo.addPoint(p2);
      repo.addPoint(p3);

      // Equal distances constraint
      const equalDist = EqualDistancesConstraint.create(
        'c1',
        'Equal sides',
        [
          [p1.id, p2.id],
          [p2.id, p3.id],
          [p3.id, p1.id]
        ],
        repo,
        { tolerance: 1e-4 }
      );

      // Equal angles constraint (all 60 degrees)
      const equalAngles = EqualAnglesConstraint.create(
        'c2',
        'Equal angles',
        [
          [p2.id, p1.id, p3.id],
          [p1.id, p2.id, p3.id],
          [p2.id, p3.id, p1.id]
        ],
        repo,
        { tolerance: 1e-4 }
      );

      system.addPoint(p1);
      system.addPoint(p2);
      system.addPoint(p3);
      system.addConstraint(equalDist);
      system.addConstraint(equalAngles);

      const result = system.solve();

      expect(result.converged).toBe(true);

      // Verify all sides are equal
      const c1 = p1.optimizedXyz!;
      const c2 = p2.optimizedXyz!;
      const c3 = p3.optimizedXyz!;

      const dist12 = Math.sqrt((c2[0] - c1[0]) ** 2 + (c2[1] - c1[1]) ** 2 + (c2[2] - c1[2]) ** 2);
      const dist23 = Math.sqrt((c3[0] - c2[0]) ** 2 + (c3[1] - c2[1]) ** 2 + (c3[2] - c2[2]) ** 2);
      const dist31 = Math.sqrt((c1[0] - c3[0]) ** 2 + (c1[1] - c3[1]) ** 2 + (c1[2] - c3[2]) ** 2);

      expect(dist12).toBeCloseTo(dist23, 3);
      expect(dist23).toBeCloseTo(dist31, 3);
    });
  });
});
