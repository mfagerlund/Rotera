import { describe, it, expect, beforeEach } from '@jest/globals';
import * as vec3 from '../../utils/vec3';
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

      const coords1 = p1.optimizedXyz!;
      const coords2 = p2.optimizedXyz!;
      const distance = vec3.distance(coords1, coords2);

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

      const cA = pA.optimizedXyz!;
      const cV = vertex.optimizedXyz!;
      const cC = pC.optimizedXyz!;

      const v1 = vec3.subtract(cA, cV);
      const v2 = vec3.subtract(cC, cV);
      const angleRad = vec3.angleBetween(v1, v2);
      const angleDeg = angleRad * (180 / Math.PI);

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

      const c1 = p1.optimizedXyz!;
      const c2 = p2.optimizedXyz!;
      const c3 = p3.optimizedXyz!;
      const c4 = p4.optimizedXyz!;

      const dist1 = vec3.distance(c1, c2);
      const dist2 = vec3.distance(c3, c4);

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

      const calcAngle = (a: [number, number, number], v: [number, number, number], c: [number, number, number]) => {
        const v1 = vec3.subtract(a, v);
        const v2 = vec3.subtract(c, v);
        const angleRad = vec3.angleBetween(v1, v2);
        return angleRad * (180 / Math.PI);
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

      const dist12 = vec3.distance(c1, c2);
      const dist23 = vec3.distance(c2, c3);
      const dist31 = vec3.distance(c3, c1);

      expect(dist12).toBeCloseTo(dist23, 3);
      expect(dist23).toBeCloseTo(dist31, 3);
    });
  });
});
