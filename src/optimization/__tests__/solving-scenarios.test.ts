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
import {
  expectVec3Close,
  expectQuatClose,
  expectOptimizationSuccess,
  expectCamerasInitialized,
  calculateCameraDistance,
  expectLineLength,
  expectLineDirection,
  expectCameraInitializedAwayFromOrigin,
  expectWorldPointInitialized,
  expectConvergedBeforeMaxIterations,
  Tolerance,
} from './test-helpers';

function loadFixture(filename: string) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  const json = fs.readFileSync(fixturePath, 'utf-8');
  return loadProjectFromJson(json);
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

      expectOptimizationSuccess(result, 1, 0.1, 2.0);
      expectCamerasInitialized(result, 'Camera1');
      expectConvergedBeforeMaxIterations(result, 100);

      const camera = Array.from(project.viewpoints)[0] as Viewpoint;

      expectCameraInitializedAwayFromOrigin(camera, 5.0);
      expectVec3Close(camera.position, [0, 0, -20], Tolerance.NORMAL);
      expectQuatClose(camera.rotation, [1, 0, 0, 0], Tolerance.TIGHT);
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

      expectOptimizationSuccess(result, 1, 1.0, 2.0);
      expectCamerasInitialized(result, 'Camera1');
      expectConvergedBeforeMaxIterations(result, 100);

      const camera = Array.from(project.viewpoints)[0] as Viewpoint;

      expectCameraInitializedAwayFromOrigin(camera, 10.0);
      expectVec3Close(camera.position, [0, 5, -25], Tolerance.LOOSE);
      expectQuatClose(camera.rotation, [1, 0, 0, 0], Tolerance.TIGHT);

      expectWorldPointInitialized(p4);
      expectWorldPointInitialized(p5);

      if (p4.optimizedXyz) {
        expectVec3Close(p4.optimizedXyz, [-3, 2, 0], Tolerance.NORMAL);
      }

      if (p5.optimizedXyz) {
        expectVec3Close(p5.optimizedXyz, [3, -2, 0], Tolerance.NORMAL);
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

      expectOptimizationSuccess(result, 1, 2.0, 3.0);
      expectCamerasInitialized(result, 'Camera1');
      expectConvergedBeforeMaxIterations(result, 100);

      const camera = Array.from(project.viewpoints)[0] as Viewpoint;

      expectCameraInitializedAwayFromOrigin(camera, 5.0);
      expectVec3Close(camera.position, [10, 8, -15], Tolerance.POSITION);
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

      expectOptimizationSuccess(result, 1, 2.0, 3.0);
      expectCamerasInitialized(result, 'Camera1');
      expectConvergedBeforeMaxIterations(result, 100);

      const camera = Array.from(project.viewpoints)[0] as Viewpoint;

      expectCameraInitializedAwayFromOrigin(camera, 5.0);
      expectVec3Close(camera.position, [8, 6, -12], Tolerance.POSITION);
      expectLineDirection(origin, p10, 'x-aligned', Tolerance.DIRECTION_TIGHT);
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

      expectOptimizationSuccess(result, 2, 2.0, 3.0);
      expectCamerasInitialized(result, 'Camera1', 'Camera2');
      expectConvergedBeforeMaxIterations(result, 100);

      const viewpointsArray = Array.from(project.viewpoints) as Viewpoint[];
      const camera1 = viewpointsArray.find(vp => vp.name === 'Camera1')!;
      const camera2 = viewpointsArray.find(vp => vp.name === 'Camera2')!;

      expect(camera1).toBeDefined();
      expect(camera2).toBeDefined();

      expectCameraInitializedAwayFromOrigin(camera1, 0.5);
      expectCameraInitializedAwayFromOrigin(camera2, 0.5);

      for (const wp of worldPointsArray) {
        expectWorldPointInitialized(wp);
      }

      const cameraDist = calculateCameraDistance(camera1, camera2);
      expect(cameraDist).toBeGreaterThan(0.5);
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

      expectOptimizationSuccess(result, 2, 2.0, 3.0);
      expectCamerasInitialized(result, 'Camera1', 'Camera2');
      expectConvergedBeforeMaxIterations(result, 100);

      const viewpointsArray = Array.from(project.viewpoints) as Viewpoint[];
      const camera1 = viewpointsArray.find(vp => vp.name === 'Camera1')!;
      const camera2 = viewpointsArray.find(vp => vp.name === 'Camera2')!;

      expect(camera1).toBeDefined();
      expect(camera2).toBeDefined();

      expectCameraInitializedAwayFromOrigin(camera1, 1.0);
      expectCameraInitializedAwayFromOrigin(camera2, 1.0);

      const unlockedPoints = worldPointsArray.filter(wp => !wp.isFullyLocked());
      for (const wp of unlockedPoints) {
        expectWorldPointInitialized(wp);
      }

      const cameraDist = calculateCameraDistance(camera1, camera2);
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

      expectOptimizationSuccess(result, 2, 2.0, 3.0);
      expectCamerasInitialized(result, 'Camera1', 'Camera2');
      expectConvergedBeforeMaxIterations(result, 100);

      expectCameraInitializedAwayFromOrigin(camera1, 5.0);
      expectCameraInitializedAwayFromOrigin(camera2, 5.0);

      const unlockedPoints = worldPointsArray.filter(wp => !wp.isFullyLocked());
      for (const wp of unlockedPoints) {
        expectWorldPointInitialized(wp);
      }

      const cameraDist = calculateCameraDistance(camera1, camera2);
      expect(cameraDist).toBeGreaterThan(1.0);
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

      expectOptimizationSuccess(result, 2, 2.0, 3.0);

      for (const line of linesArray) {
        expectLineLength(line.pointA, line.pointB, 10.0);
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
        expect(['x-aligned', 'vertical', 'z-aligned']).toContain(line.direction);
      }

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: false
      });

      expectOptimizationSuccess(result, 1, 2.0, 3.0);
      expectCamerasInitialized(result, 'Camera1');

      for (const line of linesArray) {
        expectLineLength(line.pointA, line.pointB, 10.0);

        if (line.direction === 'x-aligned' || line.direction === 'vertical' || line.direction === 'z-aligned') {
          expectLineDirection(line.pointA, line.pointB, line.direction, Tolerance.DIRECTION);
        }
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

      expectOptimizationSuccess(result, 3, 3.0, 10.0);
      expectCamerasInitialized(result, 'Camera1', 'Camera2', 'Camera3');

      const linesArray = Array.from(project.lines);

      const line1 = linesArray.find(l => l.name === 'Line1');
      expect(line1).toBeDefined();
      if (line1) {
        expectLineLength(line1.pointA, line1.pointB, 10.0, Tolerance.DIRECTION);
        expectLineDirection(line1.pointA, line1.pointB, 'x-aligned', Tolerance.DIRECTION_LOOSE);
      }

      const line2 = linesArray.find(l => l.name === 'Line2');
      expect(line2).toBeDefined();
      if (line2) {
        expectLineLength(line2.pointA, line2.pointB, 10.0, Tolerance.DIRECTION);
        expectLineDirection(line2.pointA, line2.pointB, 'z-aligned', Tolerance.DIRECTION_LOOSE);
      }

      const line3 = linesArray.find(l => l.name === 'Line3');
      expect(line3).toBeDefined();
      if (line3) {
        expectLineLength(line3.pointA, line3.pointB, 6.0, Tolerance.DIRECTION);
      }

      const line4 = linesArray.find(l => l.name === 'Line4');
      expect(line4).toBeDefined();
      if (line4) {
        expectLineLength(line4.pointA, line4.pointB, 3.0, Tolerance.DIRECTION);
      }
    });
  });
});
