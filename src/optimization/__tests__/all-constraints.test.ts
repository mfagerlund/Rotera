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

describe('ConstraintSystem - All Constraint Types', () => {
  let system: ConstraintSystem;

  beforeEach(() => {
    system = new ConstraintSystem({
      tolerance: 1e-6,
      maxIterations: 100,
      verbose: false,
    });
  });

  describe('DistanceConstraint', () => {
    it('should enforce distance between two points', () => {
      const p1 = WorldPoint.create('P1', { lockedXyz: [null, null, null], optimizedXyz: [0, 0, 0] });
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null], optimizedXyz: [50, 0, 0] }); // 50 units apart

      // Constrain to 100 units apart
      const constraint = DistanceConstraint.create(
        'Distance 100',
        p1,
        p2,
        100,
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
      const pA = WorldPoint.create('PA', { lockedXyz: [null, null, null], optimizedXyz: [10, 0, 0] });
      const vertex = WorldPoint.create('Vertex', { lockedXyz: [null, null, null], optimizedXyz: [0, 0, 0] });
      const pC = WorldPoint.create('PC', { lockedXyz: [null, null, null], optimizedXyz: [0, 5, 0] }); // Currently 90 degrees

      // Constrain to 60 degrees
      const constraint = AngleConstraint.create(
        'Angle 60 degrees',
        pA,
        vertex,
        pC,
        60, // degrees
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
      const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0] });
      const p2 = WorldPoint.create('P2', { lockedXyz: [10, 0, 0] });
      const p3 = WorldPoint.create('P3', { lockedXyz: [null, null, null], optimizedXyz: [5, 5, 0] }); // Off the line

      const constraint = CollinearPointsConstraint.create(
        'Collinear',
        [p1, p2, p3],
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
      const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0] });
      const p2 = WorldPoint.create('P2', { lockedXyz: [10, 0, 0] });
      const p3 = WorldPoint.create('P3', { lockedXyz: [0, 10, 0] });
      const p4 = WorldPoint.create('P4', { lockedXyz: [null, null, null], optimizedXyz: [5, 5, 10] }); // Out of plane

      const constraint = CoplanarPointsConstraint.create(
        'Coplanar',
        [p1, p2, p3, p4],
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
      const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0] });
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null], optimizedXyz: [10, 0, 0] });
      const p3 = WorldPoint.create('P3', { lockedXyz: [0, 20, 0] });
      const p4 = WorldPoint.create('P4', { lockedXyz: [null, null, null], optimizedXyz: [0, 35, 0] });

      // Make distance(p1, p2) equal to distance(p3, p4)
      const constraint = EqualDistancesConstraint.create(
        'Equal Distances',
        [
          [p1, p2],
          [p3, p4]
        ],
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
      const pA1 = WorldPoint.create('PA1', { lockedXyz: [10, 0, 0] });
      const v1 = WorldPoint.create('V1', { lockedXyz: [0, 0, 0] });
      const pC1 = WorldPoint.create('PC1', { lockedXyz: [null, null, null], optimizedXyz: [5, 8.66, 0] }); // ~60 degrees

      // Second angle: PA2 - V2 - PC2
      const pA2 = WorldPoint.create('PA2', { lockedXyz: [20, 0, 0] });
      const v2 = WorldPoint.create('V2', { lockedXyz: [10, 0, 0] });
      const pC2 = WorldPoint.create('PC2', { lockedXyz: [null, null, null], optimizedXyz: [15, 5, 0] }); // ~45 degrees

      // Make both angles equal
      const constraint = EqualAnglesConstraint.create(
        'Equal Angles',
        [
          [pA1, v1, pC1],
          [pA2, v2, pC2]
        ],
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
      const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0] });
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null], optimizedXyz: [10, 0, 0] });
      const p3 = WorldPoint.create('P3', { lockedXyz: [null, null, null], optimizedXyz: [5, 8, 0] });

      // Equal distances constraint
      const equalDist = EqualDistancesConstraint.create(
        'Equal sides',
        [
          [p1, p2],
          [p2, p3],
          [p3, p1]
        ],
        { tolerance: 1e-4 }
      );

      // Equal angles constraint (all 60 degrees)
      const equalAngles = EqualAnglesConstraint.create(
        'Equal angles',
        [
          [p2, p1, p3],
          [p1, p2, p3],
          [p2, p3, p1]
        ],
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
