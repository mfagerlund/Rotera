/**
 * Tests for intrinsic constraints extracted from entities (Lines and Points).
 * These constraints are NOT created explicitly by the user - they're part of the entity itself.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { WorldPoint } from '../../entities/world-point/WorldPoint';
import { Line } from '../../entities/line/Line';
import { ConstraintSystem } from '../constraint-system';

describe('Intrinsic Constraints', () => {
  let system: ConstraintSystem;

  beforeEach(() => {
    system = new ConstraintSystem({
      tolerance: 1e-6,
      maxIterations: 100,
      verbose: false,
    });
  });

  describe('Point - Locked (Fixed Position)', () => {
    it('should not move locked points when constrained to another point', () => {
      const lockedPoint = WorldPoint.create('p1', 'Locked', {
        xyz: [10, 20, 30],
        isLocked: true, // INTRINSIC constraint - point is fixed
      });

      const freePoint = WorldPoint.create('p2', 'Free', {
        xyz: [5, 5, 5],
      });

      // Create a line with fixed length between them
      const line = Line.create('l1', 'L1', lockedPoint, freePoint, {
        constraints: {
          direction: 'free',
          targetLength: 50,
        },
      });

      system.addPoint(lockedPoint);
      system.addPoint(freePoint);
      system.addLine(line);

      const result = system.solve();

      expect(result.converged).toBe(true);

      // Locked point should not have moved
      const lockedCoords = lockedPoint.getDefinedCoordinates()!;
      expect(lockedCoords[0]).toBeCloseTo(10, 6);
      expect(lockedCoords[1]).toBeCloseTo(20, 6);
      expect(lockedCoords[2]).toBeCloseTo(30, 6);

      // Free point should have moved to satisfy length constraint
      expect(line.length()).toBeCloseTo(50, 4);
    });
  });

  describe('Line - Fixed Length', () => {
    it('should enforce fixed length intrinsic constraint', () => {
      const p1 = WorldPoint.create('p1', 'P1', { xyz: [0, 0, 0], isLocked: true });
      const p2 = WorldPoint.create('p2', 'P2', { xyz: [5, 0, 0] }); // Currently 5 units

      const line = Line.create('l1', 'L1', p1, p2, {
        constraints: {
          direction: 'free',
          targetLength: 100, // INTRINSIC constraint - line must be 100 units
          tolerance: 1e-4,
        },
      });

      system.addPoint(p1);
      system.addPoint(p2);
      system.addLine(line); // Automatically extracts intrinsic constraints

      const result = system.solve();

      expect(result.converged).toBe(true);

      // Line should now be 100 units long
      const length = line.length()!;
      expect(length).toBeCloseTo(100, 4);
    });
  });

  describe('Line - Horizontal', () => {
    it('should enforce horizontal direction intrinsic constraint', () => {
      const p1 = WorldPoint.create('p1', 'P1', { xyz: [0, 0, 0], isLocked: true });
      const p2 = WorldPoint.create('p2', 'P2', { xyz: [10, 5, 3] }); // Not horizontal

      const line = Line.create('l1', 'L1', p1, p2, {
        constraints: {
          direction: 'horizontal', // INTRINSIC constraint - line must be horizontal
          tolerance: 1e-4,
        },
      });

      system.addPoint(p1);
      system.addPoint(p2);
      system.addLine(line);

      const result = system.solve();

      expect(result.converged).toBe(true);

      // Line should now be horizontal (dy = 0, dz = 0)
      const dir = line.getDirection()!;
      expect(Math.abs(dir[1])).toBeLessThan(1e-4); // dy ≈ 0
      expect(Math.abs(dir[2])).toBeLessThan(1e-4); // dz ≈ 0
    });
  });

  describe('Line - Vertical', () => {
    it('should enforce vertical direction intrinsic constraint', () => {
      const p1 = WorldPoint.create('p1', 'P1', { xyz: [0, 0, 0], isLocked: true });
      const p2 = WorldPoint.create('p2', 'P2', { xyz: [5, 10, 3] }); // Not vertical

      const line = Line.create('l1', 'L1', p1, p2, {
        constraints: {
          direction: 'vertical', // INTRINSIC constraint - line along Y-axis
          tolerance: 1e-4,
        },
      });

      system.addPoint(p1);
      system.addPoint(p2);
      system.addLine(line);

      const result = system.solve();

      expect(result.converged).toBe(true);

      // Line should now be vertical (dx = 0, dz = 0)
      const dir = line.getDirection()!;
      expect(Math.abs(dir[0])).toBeLessThan(1e-4); // dx ≈ 0
      expect(Math.abs(dir[2])).toBeLessThan(1e-4); // dz ≈ 0
    });
  });

  describe('Line - X-Aligned', () => {
    it('should enforce x-aligned direction intrinsic constraint', () => {
      const p1 = WorldPoint.create('p1', 'P1', { xyz: [0, 0, 0], isLocked: true });
      const p2 = WorldPoint.create('p2', 'P2', { xyz: [10, 5, 3] }); // Not x-aligned

      const line = Line.create('l1', 'L1', p1, p2, {
        constraints: {
          direction: 'x-aligned', // INTRINSIC constraint
          tolerance: 1e-4,
        },
      });

      system.addPoint(p1);
      system.addPoint(p2);
      system.addLine(line);

      const result = system.solve();

      expect(result.converged).toBe(true);

      // Line should now be x-aligned (dy = 0, dz = 0)
      const dir = line.getDirection()!;
      expect(Math.abs(dir[1])).toBeLessThan(1e-4); // dy ≈ 0
      expect(Math.abs(dir[2])).toBeLessThan(1e-4); // dz ≈ 0
    });
  });

  describe('Line - Z-Aligned', () => {
    it('should enforce z-aligned direction intrinsic constraint', () => {
      const p1 = WorldPoint.create('p1', 'P1', { xyz: [0, 0, 0], isLocked: true });
      const p2 = WorldPoint.create('p2', 'P2', { xyz: [5, 3, 10] }); // Not z-aligned

      const line = Line.create('l1', 'L1', p1, p2, {
        constraints: {
          direction: 'z-aligned', // INTRINSIC constraint
          tolerance: 1e-4,
        },
      });

      system.addPoint(p1);
      system.addPoint(p2);
      system.addLine(line);

      const result = system.solve();

      expect(result.converged).toBe(true);

      // Line should now be z-aligned (dx = 0, dy = 0)
      const dir = line.getDirection()!;
      expect(Math.abs(dir[0])).toBeLessThan(1e-4); // dx ≈ 0
      expect(Math.abs(dir[1])).toBeLessThan(1e-4); // dy ≈ 0
    });
  });

  describe('Line - Combined Constraints', () => {
    it('should enforce both direction and length intrinsic constraints', () => {
      const p1 = WorldPoint.create('p1', 'P1', { xyz: [0, 0, 0], isLocked: true });
      const p2 = WorldPoint.create('p2', 'P2', { xyz: [5, 3, 2] }); // Wrong direction and length

      const line = Line.create('l1', 'L1', p1, p2, {
        constraints: {
          direction: 'horizontal', // Must be horizontal
          targetLength: 50,        // Must be 50 units long
          tolerance: 1e-4,
        },
      });

      system.addPoint(p1);
      system.addPoint(p2);
      system.addLine(line);

      const result = system.solve();

      expect(result.converged).toBe(true);

      // Check direction
      const dir = line.getDirection()!;
      expect(Math.abs(dir[1])).toBeLessThan(1e-4); // dy ≈ 0 (horizontal)
      expect(Math.abs(dir[2])).toBeLessThan(1e-4); // dz ≈ 0 (horizontal)

      // Check length
      const length = line.length()!;
      expect(length).toBeCloseTo(50, 4);
    });
  });

  describe('Multiple Lines with Intrinsic Constraints', () => {
    it('should solve multiple lines each with their own intrinsic constraints', () => {
      const origin = WorldPoint.create('origin', 'Origin', { xyz: [0, 0, 0], isLocked: true });
      const px = WorldPoint.create('px', 'X-Point', { xyz: [5, 1, 1] });
      const py = WorldPoint.create('py', 'Y-Point', { xyz: [1, 5, 1] });
      const pz = WorldPoint.create('pz', 'Z-Point', { xyz: [1, 1, 5] });

      // Create 3 perpendicular axes from origin
      const lineX = Line.create('lx', 'X-Axis', origin, px, {
        constraints: { direction: 'x-aligned', targetLength: 10 },
      });

      const lineY = Line.create('ly', 'Y-Axis', origin, py, {
        constraints: { direction: 'vertical', targetLength: 10 },
      });

      const lineZ = Line.create('lz', 'Z-Axis', origin, pz, {
        constraints: { direction: 'z-aligned', targetLength: 10 },
      });

      system.addPoint(origin);
      system.addPoint(px);
      system.addPoint(py);
      system.addPoint(pz);
      system.addLine(lineX);
      system.addLine(lineY);
      system.addLine(lineZ);

      const result = system.solve();

      expect(result.converged).toBe(true);

      // Verify each line
      expect(lineX.length()).toBeCloseTo(10, 4);
      expect(lineY.length()).toBeCloseTo(10, 4);
      expect(lineZ.length()).toBeCloseTo(10, 4);

      const pxCoords = px.getDefinedCoordinates()!;
      expect(pxCoords[0]).toBeCloseTo(10, 4); // X-aligned
      expect(Math.abs(pxCoords[1])).toBeLessThan(1e-4);
      expect(Math.abs(pxCoords[2])).toBeLessThan(1e-4);

      const pyCoords = py.getDefinedCoordinates()!;
      expect(Math.abs(pyCoords[0])).toBeLessThan(1e-4);
      expect(pyCoords[1]).toBeCloseTo(10, 4); // Vertical (Y-aligned)
      expect(Math.abs(pyCoords[2])).toBeLessThan(1e-4);

      const pzCoords = pz.getDefinedCoordinates()!;
      expect(Math.abs(pzCoords[0])).toBeLessThan(1e-4);
      expect(Math.abs(pzCoords[1])).toBeLessThan(1e-4);
      expect(pzCoords[2]).toBeCloseTo(10, 4); // Z-aligned
    });
  });
});
