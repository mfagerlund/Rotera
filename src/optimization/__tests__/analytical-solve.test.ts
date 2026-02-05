/**
 * Tests for Analytical LM Solver
 *
 * Verifies the analytical solver works correctly.
 */

import { transparentLM } from '../autodiff-dense-lm';
import { ConstraintSystem } from '../constraint-system/ConstraintSystem';
import { WorldPoint } from '../../entities/world-point/WorldPoint';
import { Line } from '../../entities/line/Line';
import { Viewpoint } from '../../entities/viewpoint/Viewpoint';
import { ImagePoint } from '../../entities/imagePoint/ImagePoint';
import { DistanceConstraint } from '../../entities/constraints/distance-constraint';

describe('Analytical Solve', () => {
  describe('basic optimization', () => {
    it('solves distance constraint with analytical path', () => {
      // Create 2 points with distance constraint
      const pointA = WorldPoint.create('A', { lockedXyz: [0, 0, 0] });
      const pointB = WorldPoint.create('B', {
        lockedXyz: [null, null, null],
        optimizedXyz: [1.5, 0.5, 0.2], // Start slightly off
      });

      const constraint = DistanceConstraint.create('dist', pointA, pointB, 2.0);

      const system = new ConstraintSystem();
      system.addPoint(pointA);
      system.addPoint(pointB);
      system.addConstraint(constraint);

      const { providers, layout } = system.buildAnalyticalProviders();

      const result = transparentLM(layout.initialValues, null, {
        analyticalProviders: providers,
        maxIterations: 100,
        verbose: false,
        costTolerance: 1e-10,
        paramTolerance: 1e-10,
        gradientTolerance: 1e-10,
      });

      expect(result.success).toBe(true);
      expect(result.finalCost).toBeLessThan(1e-8);

      // Verify the distance is now ~2.0
      const finalX = result.variableValues[0];
      const finalY = result.variableValues[1];
      const finalZ = result.variableValues[2];
      const distance = Math.sqrt(finalX * finalX + finalY * finalY + finalZ * finalZ);
      expect(Math.abs(distance - 2.0)).toBeLessThan(0.01);
    });

    it('solves line direction constraint with analytical path', () => {
      // Create a line that should be along +X axis
      const pointA = WorldPoint.create('A', { lockedXyz: [0, 0, 0] });
      const pointB = WorldPoint.create('B', {
        lockedXyz: [null, null, null],
        optimizedXyz: [1.0, 0.3, -0.2], // Start with some Y/Z offset
      });

      const line = Line.create('AB', pointA, pointB, { direction: 'x', targetLength: 2.0 });

      const system = new ConstraintSystem();
      system.addPoint(pointA);
      system.addPoint(pointB);
      system.addLine(line);

      const { providers, layout } = system.buildAnalyticalProviders();

      const result = transparentLM(layout.initialValues, null, {
        analyticalProviders: providers,
        maxIterations: 100,
      });

      expect(result.success).toBe(true);
      expect(result.finalCost).toBeLessThan(1e-6);

      // Verify point B is at (2, 0, 0)
      expect(Math.abs(result.variableValues[0] - 2.0)).toBeLessThan(0.01);
      expect(Math.abs(result.variableValues[1])).toBeLessThan(0.01);
      expect(Math.abs(result.variableValues[2])).toBeLessThan(0.01);
    });

    it('solves multiple distance constraints with analytical path', () => {
      // Test with multiple points and constraints
      const pointA = WorldPoint.create('A', { lockedXyz: [0, 0, 0] });
      const pointB = WorldPoint.create('B', {
        lockedXyz: [null, null, null],
        optimizedXyz: [1.2, 0.3, -0.1],
      });
      const pointC = WorldPoint.create('C', {
        lockedXyz: [null, null, null],
        optimizedXyz: [0.5, 1.1, 0.2],
      });

      // A-B distance = 1.0, B-C distance = 1.5
      const constraint1 = DistanceConstraint.create('dist1', pointA, pointB, 1.0);
      const constraint2 = DistanceConstraint.create('dist2', pointB, pointC, 1.5);

      const system = new ConstraintSystem();
      system.addPoint(pointA);
      system.addPoint(pointB);
      system.addPoint(pointC);
      system.addConstraint(constraint1);
      system.addConstraint(constraint2);

      const { providers, layout } = system.buildAnalyticalProviders();

      const result = transparentLM(layout.initialValues, null, {
        analyticalProviders: providers,
        maxIterations: 100,
      });

      expect(result.success).toBe(true);
      expect(result.finalCost).toBeLessThan(0.01);

      // Check distances are approximately correct
      const bx = result.variableValues[0],
        by = result.variableValues[1],
        bz = result.variableValues[2];
      const cx = result.variableValues[3],
        cy = result.variableValues[4],
        cz = result.variableValues[5];

      const distAB = Math.sqrt(bx * bx + by * by + bz * bz);
      const distBC = Math.sqrt((cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2);

      expect(Math.abs(distAB - 1.0)).toBeLessThan(0.1);
      expect(Math.abs(distBC - 1.5)).toBeLessThan(0.1);
    });
  });

  describe('with camera and reprojection', () => {
    it('solves camera-point system with analytical path', () => {
      // Create a point and camera
      const point = WorldPoint.create('P', {
        lockedXyz: [null, null, null],
        optimizedXyz: [0.1, 0.1, 5.5], // Start slightly perturbed
      });

      const camera = Viewpoint.create('Camera', 'test.jpg', '/test.jpg', 640, 480, {
        focalLength: 500,
        position: [0, 0, 0],
        rotation: [1, 0, 0, 0], // Identity
        isPoseLocked: true, // Lock camera, only optimize point
      });

      // Point projects to center (320, 240)
      const imagePoint = ImagePoint.create(point, camera, 320, 240);

      const system = new ConstraintSystem();
      system.addPoint(point);
      system.addCamera(camera);
      system.addImagePoint(imagePoint);

      const { providers, layout } = system.buildAnalyticalProviders();

      const result = transparentLM(layout.initialValues, null, {
        analyticalProviders: providers,
        maxIterations: 100,
      });

      expect(result.success).toBe(true);
      // Cost should be very low (point projects to observed location)
      expect(result.finalCost).toBeLessThan(0.1);

      // The point should remain on the ray through (0,0,5+) approximately
      // X and Y should be close to 0 (projects to center)
      expect(Math.abs(result.variableValues[0])).toBeLessThan(0.1);
      expect(Math.abs(result.variableValues[1])).toBeLessThan(0.1);
    });
  });

  describe('error handling', () => {
    it('throws when no providers given', () => {
      expect(() => {
        transparentLM(new Float64Array([1, 2]), null, {
          analyticalProviders: [],
        });
      }).toThrow('analyticalProviders is required and must not be empty');
    });
  });

  describe('sparse solve with analytical', () => {
    it('solves with sparse CG and analytical providers', () => {
      const pointA = WorldPoint.create('A', { lockedXyz: [0, 0, 0] });
      const pointB = WorldPoint.create('B', {
        lockedXyz: [null, null, null],
        optimizedXyz: [1.5, 0.5, 0.2],
      });

      const constraint = DistanceConstraint.create('dist', pointA, pointB, 2.0);

      const system = new ConstraintSystem();
      system.addPoint(pointA);
      system.addPoint(pointB);
      system.addConstraint(constraint);

      const { providers, layout } = system.buildAnalyticalProviders();

      const result = transparentLM(layout.initialValues, null, {
        analyticalProviders: providers,
        useSparseLinearSolve: true, // Use sparse CG
        maxIterations: 100,
        costTolerance: 1e-10,
        paramTolerance: 1e-10,
        gradientTolerance: 1e-10,
      });

      expect(result.success).toBe(true);
      expect(result.finalCost).toBeLessThan(1e-8);
    });
  });
});
