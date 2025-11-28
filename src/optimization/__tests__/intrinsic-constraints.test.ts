/**
 * Tests for intrinsic constraints extracted from entities (Lines and Points).
 * These constraints are NOT created explicitly by the user - they're part of the entity itself.
 */

import { describe, it, expect } from '@jest/globals';
import { WorldPoint } from '../../entities/world-point/WorldPoint';
import { Line } from '../../entities/line/Line';
import { Project } from '../../entities/project';
import { optimizeProject } from '../optimize-project';

describe('Intrinsic Constraints', () => {


  describe('Point - Locked (Fixed Position)', () => {
        it('should not move locked points when constrained to another point', () => {
      const project = Project.create('Test');

      
      const lockedPoint = WorldPoint.create('Locked', {
        lockedXyz: [10, 20, 30], // INTRINSIC constraint - point is fixed
      });

      const freePoint = WorldPoint.create('Free', {
        lockedXyz: [null, null, null],
        optimizedXyz: [5, 5, 5],
      });

      // Create a line with fixed length between them
      const line = Line.create('Line1', lockedPoint, freePoint, {
        direction: 'free',
        targetLength: 50,
      });

      project.addWorldPoint(lockedPoint);
      project.addWorldPoint(freePoint);
      project.addLine(line);

      const result = optimizeProject(project, {
        tolerance: 1e-6,
        maxIterations: 100,
        verbose: false,
        autoInitializeCameras: false,
        autoInitializeWorldPoints: false
      });

      expect(result.converged).toBe(true);

      // Locked point should not have moved
      const lockedCoords = lockedPoint.optimizedXyz!;
      expect(lockedCoords[0]).toBeCloseTo(10, 6);
      expect(lockedCoords[1]).toBeCloseTo(20, 6);
      expect(lockedCoords[2]).toBeCloseTo(30, 6);

      // Free point should have moved to satisfy length constraint
      expect(line.length()).toBeCloseTo(50, 4);
    });
  });

  describe('Line - Fixed Length', () => {
        it('should enforce fixed length intrinsic constraint', () => {
      const project = Project.create('Test');

      
      const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0] });
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null], optimizedXyz: [5, 0, 0] }); // Currently 5 units

      const line = Line.create('L1', p1, p2, {
        direction: 'free',
        targetLength: 100, // INTRINSIC constraint - line must be 100 units
        tolerance: 1e-4,
      });

      project.addWorldPoint(p1);
      project.addWorldPoint(p2);
      project.addLine(line); // Automatically extracts intrinsic constraints

      const result = optimizeProject(project, {
        tolerance: 1e-6,
        maxIterations: 100,
        verbose: false,
        autoInitializeCameras: false,
        autoInitializeWorldPoints: false
      });

      expect(result.converged).toBe(true);

      // Line should now be 100 units long
      const length = line.length()!;
      expect(length).toBeCloseTo(100, 4);
    });
  });

  describe('Line - Horizontal', () => {
        it('should enforce horizontal direction intrinsic constraint', () => {
      const project = Project.create('Test');

      
      const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0] });
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null], optimizedXyz: [10, 5, 3] }); // Not horizontal

      const line = Line.create('Horizontal', p1, p2, {
        direction: 'horizontal', // INTRINSIC constraint - line must be horizontal
        tolerance: 1e-4,
      });

      project.addWorldPoint(p1);
      project.addWorldPoint(p2);
      project.addLine(line);

      const result = optimizeProject(project, {
        tolerance: 1e-6,
        maxIterations: 100,
        verbose: false,
        autoInitializeCameras: false,
        autoInitializeWorldPoints: false
      });

      expect(result.converged).toBe(true);

      // Line should now be horizontal (dy = 0, in the XZ plane)
      // Note: "horizontal" only constrains dy=0, NOT dz=0
      const dir = line.getDirection()!;
      expect(Math.abs(dir[1])).toBeLessThan(1e-4); // dy ≈ 0
      // dz can be anything - "horizontal" just means in the XZ plane
    });
  });

  describe('Line - Vertical', () => {
        it('should enforce vertical direction intrinsic constraint', () => {
      const project = Project.create('Test');

      
      const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0] });
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null], optimizedXyz: [5, 10, 3] }); // Not vertical

      const line = Line.create('Vertical', p1, p2, {
        direction: 'vertical', // INTRINSIC constraint - line along Y-axis
        tolerance: 1e-4,
      });

      project.addWorldPoint(p1);
      project.addWorldPoint(p2);
      project.addLine(line);

      const result = optimizeProject(project, {
        tolerance: 1e-6,
        maxIterations: 100,
        verbose: false,
        autoInitializeCameras: false,
        autoInitializeWorldPoints: false
      });

      expect(result.converged).toBe(true);

      // Line should now be vertical (dx = 0, dz = 0)
      const dir = line.getDirection()!;
      expect(Math.abs(dir[0])).toBeLessThan(1e-4); // dx ≈ 0
      expect(Math.abs(dir[2])).toBeLessThan(1e-4); // dz ≈ 0
    });
  });

  describe('Line - X-Aligned', () => {
        it('should enforce x-aligned direction intrinsic constraint', () => {
      const project = Project.create('Test');

      
      const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0] });
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null], optimizedXyz: [10, 5, 3] }); // Not x-aligned

      const line = Line.create('X-Aligned', p1, p2, {
        direction: 'x-aligned', // INTRINSIC constraint
        tolerance: 1e-4,
      });

      project.addWorldPoint(p1);
      project.addWorldPoint(p2);
      project.addLine(line);

      const result = optimizeProject(project, {
        tolerance: 1e-6,
        maxIterations: 100,
        verbose: false,
        autoInitializeCameras: false,
        autoInitializeWorldPoints: false
      });

      expect(result.converged).toBe(true);

      // Line should now be x-aligned (dy = 0, dz = 0)
      const dir = line.getDirection()!;
      expect(Math.abs(dir[1])).toBeLessThan(1e-4); // dy ≈ 0
      expect(Math.abs(dir[2])).toBeLessThan(1e-4); // dz ≈ 0
    });
  });

  describe('Line - Z-Aligned', () => {
        it('should enforce z-aligned direction intrinsic constraint', () => {
      const project = Project.create('Test');

      
      const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0] });
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null], optimizedXyz: [5, 3, 10] }); // Not z-aligned

      const line = Line.create('Z-Aligned', p1, p2, {
        direction: 'z-aligned', // INTRINSIC constraint
        tolerance: 1e-4,
      });

      project.addWorldPoint(p1);
      project.addWorldPoint(p2);
      project.addLine(line);

      const result = optimizeProject(project, {
        tolerance: 1e-6,
        maxIterations: 100,
        verbose: false,
        autoInitializeCameras: false,
        autoInitializeWorldPoints: false
      });

      expect(result.converged).toBe(true);

      // Line should now be z-aligned (dx = 0, dy = 0)
      const dir = line.getDirection()!;
      expect(Math.abs(dir[0])).toBeLessThan(1e-4); // dx ≈ 0
      expect(Math.abs(dir[1])).toBeLessThan(1e-4); // dy ≈ 0
    });
  });

  describe('Line - Combined Constraints', () => {
        it('should enforce both direction and length intrinsic constraints', () => {
      const project = Project.create('Test');

      
      const p1 = WorldPoint.create('P1', { lockedXyz: [0, 0, 0] });
      const p2 = WorldPoint.create('P2', { lockedXyz: [null, null, null], optimizedXyz: [5, 3, 2] }); // Wrong direction and length

      const line = Line.create('Combined', p1, p2, {
        direction: 'horizontal', // Must be horizontal
        targetLength: 50,        // Must be 50 units long
        tolerance: 1e-4,
      });

      project.addWorldPoint(p1);
      project.addWorldPoint(p2);
      project.addLine(line);

      const result = optimizeProject(project, {
        tolerance: 1e-6,
        maxIterations: 100,
        verbose: false,
        autoInitializeCameras: false,
        autoInitializeWorldPoints: false
      });

      expect(result.converged).toBe(true);

      // Check direction - horizontal means dy=0 (in XZ plane)
      const dir = line.getDirection()!;
      expect(Math.abs(dir[1])).toBeLessThan(1e-4); // dy ≈ 0 (horizontal)
      // dz can be anything - "horizontal" just means in the XZ plane

      // Check length
      const length = line.length()!;
      expect(length).toBeCloseTo(50, 4);
    });
  });

  describe('Multiple Lines with Intrinsic Constraints', () => {
        it('should solve multiple lines each with their own intrinsic constraints', () => {
      const project = Project.create('Test');

      
      const origin = WorldPoint.create('Origin', { lockedXyz: [0, 0, 0] });
      const px = WorldPoint.create('X-Point', { lockedXyz: [null, null, null], optimizedXyz: [5, 1, 1] });
      const py = WorldPoint.create('Y-Point', { lockedXyz: [null, null, null], optimizedXyz: [1, 5, 1] });
      const pz = WorldPoint.create('Z-Point', { lockedXyz: [null, null, null], optimizedXyz: [1, 1, 5] });

      // Create 3 perpendicular axes from origin
      const lineX = Line.create('X-Axis', origin, px, {
        direction: 'x-aligned', targetLength: 10,
      });

      const lineY = Line.create('Y-Axis', origin, py, {
        direction: 'vertical', targetLength: 10,
      });

      const lineZ = Line.create('Z-Axis', origin, pz, {
        direction: 'z-aligned', targetLength: 10,
      });

      project.addWorldPoint(origin);
      project.addWorldPoint(px);
      project.addWorldPoint(py);
      project.addWorldPoint(pz);
      project.addLine(lineX);
      project.addLine(lineY);
      project.addLine(lineZ);

      const result = optimizeProject(project, {
        tolerance: 1e-6,
        maxIterations: 100,
        verbose: false,
        autoInitializeCameras: false,
        autoInitializeWorldPoints: false
      });

      expect(result.converged).toBe(true);

      // Verify each line
      expect(lineX.length()).toBeCloseTo(10, 4);
      expect(lineY.length()).toBeCloseTo(10, 4);
      expect(lineZ.length()).toBeCloseTo(10, 4);

      const pxCoords = px.optimizedXyz!;
      expect(pxCoords[0]).toBeCloseTo(10, 4); // X-aligned
      expect(Math.abs(pxCoords[1])).toBeLessThan(1e-4);
      expect(Math.abs(pxCoords[2])).toBeLessThan(1e-4);

      const pyCoords = py.optimizedXyz!;
      expect(Math.abs(pyCoords[0])).toBeLessThan(1e-4);
      expect(pyCoords[1]).toBeCloseTo(10, 4); // Vertical (Y-aligned)
      expect(Math.abs(pyCoords[2])).toBeLessThan(1e-4);

      const pzCoords = pz.optimizedXyz!;
      expect(Math.abs(pzCoords[0])).toBeLessThan(1e-4);
      expect(Math.abs(pzCoords[1])).toBeLessThan(1e-4);
      expect(pzCoords[2]).toBeCloseTo(10, 4); // Z-aligned
    });
  });
});
