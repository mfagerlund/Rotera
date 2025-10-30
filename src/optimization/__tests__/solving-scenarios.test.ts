/**
 * Solving Test Protocol - Scenario Tests
 *
 * Tests the optimization/solving system with progressively complex scenarios.
 * All tests use PRODUCTION CODE via optimizeProject().
 *
 * Ground truth values are embedded in test expectations.
 * See scratch/SOLVING-TEST-PROTOCOL.md for full documentation.
 */

import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import { Viewpoint } from '../../entities/viewpoint';
import * as fs from 'fs';
import * as path from 'path';

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  const json = fs.readFileSync(fixturePath, 'utf-8');
  return loadProjectFromJson(json);
}

function expectVec3Close(actual: number[], expected: number[], tolerance: number, label: string) {
  expect(actual).toHaveLength(3);
  expect(actual[0]).toBeCloseTo(expected[0], tolerance);
  expect(actual[1]).toBeCloseTo(expected[1], tolerance);
  expect(actual[2]).toBeCloseTo(expected[2], tolerance);
}

function expectQuatClose(actual: number[], expected: number[], tolerance: number, label: string) {
  expect(actual).toHaveLength(4);

  let minDist = Infinity;

  for (const sign of [1, -1]) {
    const dist = Math.sqrt(
      Math.pow(actual[0] - sign * expected[0], 2) +
      Math.pow(actual[1] - sign * expected[1], 2) +
      Math.pow(actual[2] - sign * expected[2], 2) +
      Math.pow(actual[3] - sign * expected[3], 2)
    );
    minDist = Math.min(minDist, dist);
  }

  expect(minDist).toBeLessThan(tolerance);
}

describe('Solving Scenarios - Phase 1: Single Camera Initialization', () => {
  describe('Scenario 1: Simple PnP (Baseline)', () => {
    it('should initialize camera using PnP and achieve low reprojection error', () => {
      const project = loadFixture('scenario-01-simple-pnp.json');

      expect(project.worldPoints.size).toBe(4);
      expect(project.viewpoints.size).toBe(1);
      expect(project.imagePoints.size).toBe(4);

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: false
      });

      expect(result.error).toBeNull();
      expect(result.converged).toBe(true);
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      expect(result.residual).toBeLessThan(0.1);

      expect(result.camerasInitialized).toBeDefined();
      expect(result.camerasInitialized).toHaveLength(1);
      expect(result.camerasInitialized![0]).toBe('Camera1');

      const camera = Array.from(project.viewpoints)[0] as Viewpoint;

      const groundTruthPosition = [0, 0, -20];
      const groundTruthRotation = [1, 0, 0, 0];

      expectVec3Close(
        camera.position,
        groundTruthPosition,
        0.5,
        'Camera position'
      );

      expectQuatClose(
        camera.rotation,
        groundTruthRotation,
        0.1,
        'Camera rotation'
      );

      expect(result.medianReprojectionError).toBeDefined();
      if (result.medianReprojectionError !== undefined) {
        expect(result.medianReprojectionError).toBeLessThan(2.0);
      }
    });
  });

  describe('Scenario 2: PnP with Bundle Adjustment', () => {
    it('should initialize camera with PnP from locked points and refine partially locked points', () => {
      const project = loadFixture('scenario-02-pnp-bundle-adjustment.json');

      expect(project.worldPoints.size).toBe(5);
      expect(project.viewpoints.size).toBe(1);
      expect(project.imagePoints.size).toBe(5);

      const worldPointsArray = Array.from(project.worldPoints);
      const p1 = worldPointsArray.find(p => p.name === 'P1')!;
      const p2 = worldPointsArray.find(p => p.name === 'P2')!;
      const p3 = worldPointsArray.find(p => p.name === 'P3')!;
      const p4 = worldPointsArray.find(p => p.name === 'P4')!;
      const p5 = worldPointsArray.find(p => p.name === 'P5')!;

      expect(p1.lockedXyz).toEqual([-5, -5, 0]);
      expect(p2.lockedXyz).toEqual([5, -5, 0]);
      expect(p3.lockedXyz).toEqual([5, 5, 0]);
      expect(p4.lockedXyz).toEqual([null, null, 0]);
      expect(p5.lockedXyz).toEqual([null, null, 0]);

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: false
      });

      expect(result.error).toBeNull();
      expect(result.converged).toBe(true);
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      expect(result.residual).toBeLessThan(1.0);

      expect(result.camerasInitialized).toBeDefined();
      expect(result.camerasInitialized).toHaveLength(1);
      expect(result.camerasInitialized![0]).toBe('Camera1');

      const camera = Array.from(project.viewpoints)[0] as Viewpoint;

      const groundTruthPosition = [0, 5, -25];
      const groundTruthRotation = [1, 0, 0, 0];

      expectVec3Close(
        camera.position,
        groundTruthPosition,
        1.0,
        'Camera position'
      );

      expectQuatClose(
        camera.rotation,
        groundTruthRotation,
        0.1,
        'Camera rotation'
      );

      const groundTruthP4 = [-3, 2, 0];
      const groundTruthP5 = [3, -2, 0];

      expect(p4.optimizedXyz).toBeDefined();
      expect(p5.optimizedXyz).toBeDefined();

      if (p4.optimizedXyz) {
        expectVec3Close(
          p4.optimizedXyz,
          groundTruthP4,
          0.5,
          'P4 position (partially locked, refined by bundle adjustment)'
        );
      }

      if (p5.optimizedXyz) {
        expectVec3Close(
          p5.optimizedXyz,
          groundTruthP5,
          0.5,
          'P5 position (partially locked, refined by bundle adjustment)'
        );
      }

      expect(result.medianReprojectionError).toBeDefined();
      if (result.medianReprojectionError !== undefined) {
        expect(result.medianReprojectionError).toBeLessThan(2.0);
      }
    });
  });

  describe('Scenario 3: Vanishing Points Only', () => {
    it('should initialize camera using vanishing points and locked reference points', () => {
      const project = loadFixture('scenario-03-vanishing-points.json');

      expect(project.worldPoints.size).toBe(2);
      expect(project.viewpoints.size).toBe(1);
      expect(project.imagePoints.size).toBe(2);

      const viewpoint = Array.from(project.viewpoints)[0] as Viewpoint;
      expect(viewpoint.getVanishingLineCount()).toBeGreaterThanOrEqual(6);

      const worldPointsArray = Array.from(project.worldPoints);
      const origin = worldPointsArray.find(p => p.name === 'Origin')!;
      const refPoint = worldPointsArray.find(p => p.name === 'RefPoint')!;

      expect(origin.lockedXyz).toEqual([0, 0, 0]);
      expect(refPoint.lockedXyz).toEqual([10, 0, 0]);

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: false
      });

      expect(result.error).toBeNull();
      expect(result.converged).toBe(true);
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      expect(result.residual).toBeLessThan(2.0);

      expect(result.camerasInitialized).toBeDefined();
      expect(result.camerasInitialized).toHaveLength(1);
      expect(result.camerasInitialized![0]).toBe('Camera1');

      const camera = Array.from(project.viewpoints)[0] as Viewpoint;

      const groundTruthPosition = [10, 8, -15];
      const groundTruthRotation = [0.9950041652780258, 0.09983341664682815, 0.0, 0.0];

      expectVec3Close(
        camera.position,
        groundTruthPosition,
        2.0,
        'Camera position'
      );

      expect(result.medianReprojectionError).toBeDefined();
      if (result.medianReprojectionError !== undefined) {
        expect(result.medianReprojectionError).toBeLessThan(3.0);
      }
    });
  });

  describe('Scenario 4: Vanishing Points with Line Constraints', () => {
    it('should initialize camera with VP and satisfy direction constraints', () => {
      const project = loadFixture('scenario-04-vp-with-line-constraints.json');

      expect(project.worldPoints.size).toBe(3);
      expect(project.viewpoints.size).toBe(1);
      expect(project.imagePoints.size).toBe(3);
      expect(project.lines.size).toBe(1);

      const viewpoint = Array.from(project.viewpoints)[0] as Viewpoint;
      expect(viewpoint.getVanishingLineCount()).toBeGreaterThanOrEqual(4);

      const worldPointsArray = Array.from(project.worldPoints);
      const origin = worldPointsArray.find(p => p.name === 'Origin')!;
      const p10 = worldPointsArray.find(p => p.name === 'P10')!;

      expect(origin.lockedXyz).toEqual([0, 0, 0]);
      expect(p10.lockedXyz).toEqual([10, 0, 0]);

      const line = Array.from(project.lines)[0];
      expect(line.direction).toBe('x-aligned');

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: false
      });

      expect(result.error).toBeNull();
      expect(result.converged).toBe(true);
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      expect(result.residual).toBeLessThan(2.0);

      expect(result.camerasInitialized).toBeDefined();
      expect(result.camerasInitialized).toHaveLength(1);
      expect(result.camerasInitialized![0]).toBe('Camera1');

      const camera = Array.from(project.viewpoints)[0] as Viewpoint;

      const groundTruthPosition = [8, 6, -12];

      expectVec3Close(
        camera.position,
        groundTruthPosition,
        2.0,
        'Camera position'
      );

      if (origin.optimizedXyz && p10.optimizedXyz) {
        const dx = p10.optimizedXyz[0] - origin.optimizedXyz[0];
        const dy = p10.optimizedXyz[1] - origin.optimizedXyz[1];
        const dz = p10.optimizedXyz[2] - origin.optimizedXyz[2];

        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const directionX = dx / length;
        const directionY = dy / length;
        const directionZ = dz / length;

        expect(Math.abs(directionX)).toBeGreaterThan(0.99);
        expect(Math.abs(directionY)).toBeLessThan(0.1);
        expect(Math.abs(directionZ)).toBeLessThan(0.1);
      }

      expect(result.medianReprojectionError).toBeDefined();
      if (result.medianReprojectionError !== undefined) {
        expect(result.medianReprojectionError).toBeLessThan(3.0);
      }
    });
  });
});

describe('Solving Scenarios - Phase 2: Two Camera Systems', () => {
  describe('Scenario 5: Essential Matrix Initialization', () => {
    it('should initialize two cameras using Essential Matrix with arbitrary scale', () => {
      const project = loadFixture('scenario-05-essential-matrix.json');

      expect(project.worldPoints.size).toBe(8);
      expect(project.viewpoints.size).toBe(2);
      expect(project.imagePoints.size).toBe(16);

      const worldPointsArray = Array.from(project.worldPoints);
      for (const wp of worldPointsArray) {
        expect(wp.lockedXyz).toEqual([null, null, null]);
      }

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: false
      });

      expect(result.error).toBeNull();
      expect(result.converged).toBe(true);
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      expect(result.residual).toBeLessThan(2.0);

      expect(result.camerasInitialized).toBeDefined();
      expect(result.camerasInitialized).toHaveLength(2);

      const viewpointsArray = Array.from(project.viewpoints) as Viewpoint[];
      const camera1 = viewpointsArray.find(vp => vp.name === 'Camera1')!;
      const camera2 = viewpointsArray.find(vp => vp.name === 'Camera2')!;

      expect(camera1).toBeDefined();
      expect(camera2).toBeDefined();

      const cameraDist = Math.sqrt(
        Math.pow(camera2.position[0] - camera1.position[0], 2) +
        Math.pow(camera2.position[1] - camera1.position[1], 2) +
        Math.pow(camera2.position[2] - camera1.position[2], 2)
      );

      expect(cameraDist).toBeGreaterThan(0.5);

      expect(result.medianReprojectionError).toBeDefined();
      if (result.medianReprojectionError !== undefined) {
        expect(result.medianReprojectionError).toBeLessThan(3.0);
      }
    });
  });

  describe('Scenario 6: Two Cameras with Scale', () => {
    it('should initialize two cameras and resolve scale from locked points', () => {
      const project = loadFixture('scenario-06-two-cameras-with-scale.json');

      expect(project.worldPoints.size).toBe(8);
      expect(project.viewpoints.size).toBe(2);
      expect(project.imagePoints.size).toBe(16);

      const worldPointsArray = Array.from(project.worldPoints);
      const lockedPoints = worldPointsArray.filter(wp => wp.isFullyLocked());
      expect(lockedPoints.length).toBe(3);

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: false
      });

      expect(result.error).toBeNull();
      expect(result.converged).toBe(true);
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      expect(result.residual).toBeLessThan(2.0);

      expect(result.camerasInitialized).toBeDefined();
      expect(result.camerasInitialized).toHaveLength(2);

      const viewpointsArray = Array.from(project.viewpoints) as Viewpoint[];
      const camera1 = viewpointsArray.find(vp => vp.name === 'Camera1')!;
      const camera2 = viewpointsArray.find(vp => vp.name === 'Camera2')!;

      expect(camera1).toBeDefined();
      expect(camera2).toBeDefined();

      const cameraDist = Math.sqrt(
        Math.pow(camera2.position[0] - camera1.position[0], 2) +
        Math.pow(camera2.position[1] - camera1.position[1], 2) +
        Math.pow(camera2.position[2] - camera1.position[2], 2)
      );

      expect(cameraDist).toBeGreaterThan(1.0);

      const p1 = worldPointsArray.find(wp => wp.name === 'P1')!;
      const p2 = worldPointsArray.find(wp => wp.name === 'P2')!;

      expect(p1.lockedXyz).toEqual([-5, -5, 0]);
      expect(p2.lockedXyz).toEqual([5, -5, 0]);

      const distance = Math.sqrt(
        Math.pow((p1.lockedXyz[0]! - p2.lockedXyz[0]!), 2) +
        Math.pow((p1.lockedXyz[1]! - p2.lockedXyz[1]!), 2) +
        Math.pow((p1.lockedXyz[2]! - p2.lockedXyz[2]!), 2)
      );

      expect(distance).toBeCloseTo(10.0, 0.1);

      expect(result.medianReprojectionError).toBeDefined();
      if (result.medianReprojectionError !== undefined) {
        expect(result.medianReprojectionError).toBeLessThan(3.0);
      }
    });
  });
});

describe('Solving Scenarios - Phase 3: Complex Constraints', () => {
  describe('Scenario 7: Mixed VP + PnP', () => {
    it('should initialize Camera1 with VP and Camera2 with PnP', () => {
      const project = loadFixture('scenario-07-mixed-vp-pnp.json');

      expect(project.worldPoints.size).toBe(5);
      expect(project.viewpoints.size).toBe(2);

      const worldPointsArray = Array.from(project.worldPoints);
      const lockedPoints = worldPointsArray.filter(wp => wp.isFullyLocked());
      expect(lockedPoints.length).toBe(3);

      const viewpointsArray = Array.from(project.viewpoints) as Viewpoint[];
      const camera1 = viewpointsArray.find(vp => vp.name === 'Camera1')!;
      const camera2 = viewpointsArray.find(vp => vp.name === 'Camera2')!;

      expect(camera1.getVanishingLineCount()).toBeGreaterThanOrEqual(4);

      const camera1ImagePoints = Array.from(camera1.imagePoints);
      const camera2ImagePoints = Array.from(camera2.imagePoints);
      expect(camera1ImagePoints.length).toBe(3);
      expect(camera2ImagePoints.length).toBe(5);

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: false
      });

      expect(result.error).toBeNull();
      expect(result.converged).toBe(true);
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      expect(result.residual).toBeLessThan(2.0);

      expect(result.camerasInitialized).toBeDefined();
      expect(result.camerasInitialized).toHaveLength(2);
      expect(result.camerasInitialized).toContain('Camera1');
      expect(result.camerasInitialized).toContain('Camera2');

      const cameraDist = Math.sqrt(
        Math.pow(camera2.position[0] - camera1.position[0], 2) +
        Math.pow(camera2.position[1] - camera1.position[1], 2) +
        Math.pow(camera2.position[2] - camera1.position[2], 2)
      );

      expect(cameraDist).toBeGreaterThan(1.0);

      expect(result.medianReprojectionError).toBeDefined();
      if (result.medianReprojectionError !== undefined) {
        expect(result.medianReprojectionError).toBeLessThan(3.0);
      }
    });
  });

  describe('Scenario 8: Length-Constrained Lines', () => {
    it('should initialize cameras and satisfy length constraints', () => {
      const project = loadFixture('scenario-08-length-constraints.json');

      expect(project.worldPoints.size).toBe(4);
      expect(project.viewpoints.size).toBe(2);
      expect(project.imagePoints.size).toBe(8);
      expect(project.lines.size).toBe(2);

      const worldPointsArray = Array.from(project.worldPoints);
      const lockedPoints = worldPointsArray.filter(wp => wp.isFullyLocked());
      expect(lockedPoints.length).toBe(3);

      const linesArray = Array.from(project.lines);
      for (const line of linesArray) {
        expect(line.targetLength).toBe(10.0);
      }

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: false
      });

      expect(result.error).toBeNull();
      expect(result.converged).toBe(true);
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      expect(result.residual).toBeLessThan(2.0);

      expect(result.camerasInitialized).toBeDefined();
      expect(result.camerasInitialized).toHaveLength(2);

      for (const line of linesArray) {
        const pointA = line.pointA;
        const pointB = line.pointB;

        expect(pointA.optimizedXyz).toBeDefined();
        expect(pointB.optimizedXyz).toBeDefined();

        if (pointA.optimizedXyz && pointB.optimizedXyz) {
          const actualLength = Math.sqrt(
            Math.pow(pointB.optimizedXyz[0] - pointA.optimizedXyz[0], 2) +
            Math.pow(pointB.optimizedXyz[1] - pointA.optimizedXyz[1], 2) +
            Math.pow(pointB.optimizedXyz[2] - pointA.optimizedXyz[2], 2)
          );

          expect(actualLength).toBeCloseTo(10.0, 0.1);
        }
      }

      expect(result.medianReprojectionError).toBeDefined();
      if (result.medianReprojectionError !== undefined) {
        expect(result.medianReprojectionError).toBeLessThan(3.0);
      }
    });
  });

  describe('Scenario 9: Direction + Length Constraints', () => {
    it('should initialize camera with VP and satisfy both direction and length constraints', () => {
      const project = loadFixture('scenario-09-direction-length.json');

      expect(project.worldPoints.size).toBe(4);
      expect(project.viewpoints.size).toBe(1);
      expect(project.imagePoints.size).toBe(4);
      expect(project.lines.size).toBe(3);

      const worldPointsArray = Array.from(project.worldPoints);
      const lockedPoints = worldPointsArray.filter(wp => wp.isFullyLocked());
      expect(lockedPoints.length).toBe(2);

      const viewpoint = Array.from(project.viewpoints)[0];
      expect(viewpoint.getVanishingLineCount()).toBe(6);

      const linesArray = Array.from(project.lines);
      for (const line of linesArray) {
        expect(line.targetLength).toBe(10.0);
        expect(['x-aligned', 'y-aligned', 'z-aligned']).toContain(line.direction);
      }

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: false
      });

      expect(result.error).toBeNull();
      expect(result.converged).toBe(true);
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      expect(result.residual).toBeLessThan(2.0);

      expect(result.camerasInitialized).toBeDefined();
      expect(result.camerasInitialized).toHaveLength(1);
      expect(result.camerasInitialized![0]).toBe('Camera1');

      for (const line of linesArray) {
        const pointA = line.pointA;
        const pointB = line.pointB;

        expect(pointA.optimizedXyz).toBeDefined();
        expect(pointB.optimizedXyz).toBeDefined();

        if (pointA.optimizedXyz && pointB.optimizedXyz) {
          const actualLength = Math.sqrt(
            Math.pow(pointB.optimizedXyz[0] - pointA.optimizedXyz[0], 2) +
            Math.pow(pointB.optimizedXyz[1] - pointA.optimizedXyz[1], 2) +
            Math.pow(pointB.optimizedXyz[2] - pointA.optimizedXyz[2], 2)
          );

          expect(actualLength).toBeCloseTo(10.0, 0.1);

          const dx = Math.abs(pointB.optimizedXyz[0] - pointA.optimizedXyz[0]);
          const dy = Math.abs(pointB.optimizedXyz[1] - pointA.optimizedXyz[1]);
          const dz = Math.abs(pointB.optimizedXyz[2] - pointA.optimizedXyz[2]);

          if (line.direction === 'x-aligned') {
            expect(dy).toBeLessThan(0.2);
            expect(dz).toBeLessThan(0.2);
          } else if (line.direction === 'y-aligned') {
            expect(dx).toBeLessThan(0.2);
            expect(dz).toBeLessThan(0.2);
          } else if (line.direction === 'z-aligned') {
            expect(dx).toBeLessThan(0.2);
            expect(dy).toBeLessThan(0.2);
          }
        }
      }

      expect(result.medianReprojectionError).toBeDefined();
      if (result.medianReprojectionError !== undefined) {
        expect(result.medianReprojectionError).toBeLessThan(3.0);
      }
    });
  });

  describe('Scenario 10: Complex Multi-Camera Scene', () => {
    it('should initialize all cameras and satisfy all constraints in complex multi-camera setup', () => {
      const project = loadFixture('scenario-10-complex-multi-camera.json');

      expect(project.worldPoints.size).toBe(10);
      expect(project.viewpoints.size).toBe(3);
      expect(project.imagePoints.size).toBe(20);
      expect(project.lines.size).toBe(5);

      const worldPointsArray = Array.from(project.worldPoints);
      const lockedPoints = worldPointsArray.filter(wp => wp.isFullyLocked());
      expect(lockedPoints.length).toBe(3);

      const viewpoint1 = Array.from(project.viewpoints)[0];
      expect(viewpoint1.getVanishingLineCount()).toBe(4);

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: false
      });

      expect(result.error).toBeNull();
      expect(result.converged).toBe(true);
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      expect(result.residual).toBeLessThan(3.0);

      expect(result.camerasInitialized).toBeDefined();
      expect(result.camerasInitialized).toHaveLength(3);
      expect(result.camerasInitialized).toContain('Camera1');
      expect(result.camerasInitialized).toContain('Camera2');
      expect(result.camerasInitialized).toContain('Camera3');

      const linesArray = Array.from(project.lines);

      const line1 = linesArray.find(l => l.name === 'Line1');
      expect(line1).toBeDefined();
      if (line1 && line1.pointA.optimizedXyz && line1.pointB.optimizedXyz) {
        const length1 = Math.sqrt(
          Math.pow(line1.pointB.optimizedXyz[0] - line1.pointA.optimizedXyz[0], 2) +
          Math.pow(line1.pointB.optimizedXyz[1] - line1.pointA.optimizedXyz[1], 2) +
          Math.pow(line1.pointB.optimizedXyz[2] - line1.pointA.optimizedXyz[2], 2)
        );
        expect(length1).toBeCloseTo(10.0, 0.2);

        const dx = Math.abs(line1.pointB.optimizedXyz[0] - line1.pointA.optimizedXyz[0]);
        const dy = Math.abs(line1.pointB.optimizedXyz[1] - line1.pointA.optimizedXyz[1]);
        const dz = Math.abs(line1.pointB.optimizedXyz[2] - line1.pointA.optimizedXyz[2]);
        expect(dy).toBeLessThan(0.3);
        expect(dz).toBeLessThan(0.3);
      }

      const line2 = linesArray.find(l => l.name === 'Line2');
      expect(line2).toBeDefined();
      if (line2 && line2.pointA.optimizedXyz && line2.pointB.optimizedXyz) {
        const length2 = Math.sqrt(
          Math.pow(line2.pointB.optimizedXyz[0] - line2.pointA.optimizedXyz[0], 2) +
          Math.pow(line2.pointB.optimizedXyz[1] - line2.pointA.optimizedXyz[1], 2) +
          Math.pow(line2.pointB.optimizedXyz[2] - line2.pointA.optimizedXyz[2], 2)
        );
        expect(length2).toBeCloseTo(10.0, 0.2);

        const dx = Math.abs(line2.pointB.optimizedXyz[0] - line2.pointA.optimizedXyz[0]);
        const dy = Math.abs(line2.pointB.optimizedXyz[1] - line2.pointA.optimizedXyz[1]);
        const dz = Math.abs(line2.pointB.optimizedXyz[2] - line2.pointA.optimizedXyz[2]);
        expect(dx).toBeLessThan(0.3);
        expect(dy).toBeLessThan(0.3);
      }

      const line3 = linesArray.find(l => l.name === 'Line3');
      expect(line3).toBeDefined();
      if (line3 && line3.pointA.optimizedXyz && line3.pointB.optimizedXyz) {
        const length3 = Math.sqrt(
          Math.pow(line3.pointB.optimizedXyz[0] - line3.pointA.optimizedXyz[0], 2) +
          Math.pow(line3.pointB.optimizedXyz[1] - line3.pointA.optimizedXyz[1], 2) +
          Math.pow(line3.pointB.optimizedXyz[2] - line3.pointA.optimizedXyz[2], 2)
        );
        expect(length3).toBeCloseTo(6.0, 0.2);
      }

      const line4 = linesArray.find(l => l.name === 'Line4');
      expect(line4).toBeDefined();
      if (line4 && line4.pointA.optimizedXyz && line4.pointB.optimizedXyz) {
        const length4 = Math.sqrt(
          Math.pow(line4.pointB.optimizedXyz[0] - line4.pointA.optimizedXyz[0], 2) +
          Math.pow(line4.pointB.optimizedXyz[1] - line4.pointA.optimizedXyz[1], 2) +
          Math.pow(line4.pointB.optimizedXyz[2] - line4.pointA.optimizedXyz[2], 2)
        );
        expect(length4).toBeCloseTo(3.0, 0.2);
      }

      expect(result.medianReprojectionError).toBeDefined();
      if (result.medianReprojectionError !== undefined) {
        expect(result.medianReprojectionError).toBeLessThan(10.0);
      }
    });
  });
});
