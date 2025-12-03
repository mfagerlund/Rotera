/**
 * Tests for projection constraints and bundle adjustment.
 *
 * ProjectionConstraint is the fundamental constraint in photogrammetry that:
 * - Projects a 3D world point through a camera to predict a pixel location
 * - Compares predicted pixel to observed pixel
 * - Residual should be [0, 0] when camera pose and point position are correct
 */

import { describe, it, expect } from '@jest/globals';
import { WorldPoint } from '../../entities/world-point/WorldPoint';
import { Viewpoint } from '../../entities/viewpoint/Viewpoint';
import { ProjectionConstraint } from '../../entities/constraints/projection-constraint';
import { Project } from '../../entities/project';
import { ImagePoint } from '../../entities/imagePoint';
import { optimizeProject } from '../optimize-project';

describe('ProjectionConstraint - Camera Bundle Adjustment', () => {

  describe('Simple Projection', () => {
    it('should optimize camera pose to match multiple observed pixels', () => {
      const project = Project.create('Camera Pose Test');

      // Create multiple world points at known locations (LOCKED - we're optimizing camera)
      const p1 = WorldPoint.create('Point1', {
        lockedXyz: [0, 0, 10], // Center, 10 units away - LOCKED
        optimizedXyz: [0, 0, 10],
      });
      const p2 = WorldPoint.create('Point2', {
        lockedXyz: [2, 0, 10], // 2 units to the right - LOCKED
        optimizedXyz: [2, 0, 10],
      });
      const p3 = WorldPoint.create('Point3', {
        lockedXyz: [0, 2, 10], // 2 units up - LOCKED
        optimizedXyz: [0, 2, 10],
      });

      // Create a viewpoint with wrong initial pose
      const camera = Viewpoint.create(
        'TestCamera',
        'test-camera.jpg',
        '',
        1920,
        1080,
        {
          focalLength: 1000,
          position: [0.5, 0.2, 0.1], // Wrong position (should be at origin)
          rotationEuler: [0.05, 0.03, 0.02], // Wrong rotation (should be zero)
          principalPointX: 960,
          principalPointY: 540,
        }
      );

      // If camera were at origin with zero rotation, points would project to:
      // p1 [0,0,10] -> [960, 540] (center)
      // p2 [2,0,10] -> u = 960 + 1000*(2/10) = 1160, v = 540
      // p3 [0,2,10] -> u = 960, v = 540 - 1000*(2/10) = 340 (Y-flip: v = pp_y - fy*y/z)

      const ip1 = ImagePoint.create(p1, camera, 960, 540);
      const ip2 = ImagePoint.create(p2, camera, 1160, 540);
      const ip3 = ImagePoint.create(p3, camera, 960, 340);

      project.addWorldPoint(p1);
      project.addWorldPoint(p2);
      project.addWorldPoint(p3);
      project.addViewpoint(camera);
      project.addImagePoint(ip1);
      project.addImagePoint(ip2);
      project.addImagePoint(ip3);

      const result = optimizeProject(project, {
        tolerance: 1e-4,
        maxIterations: 100,
        verbose: false,
        autoInitializeCameras: false,
        autoInitializeWorldPoints: false
      });

      console.log('\n=== Camera Pose Optimization ===');
      console.log('Converged:', result.converged);
      console.log('Iterations:', result.iterations);
      console.log('Final residual:', result.residual.toFixed(6));

      expect(result.converged).toBe(true);

      // With only 3 coplanar points, there's a depth-position ambiguity.
      // The optimizer finds a solution with near-zero reprojection error,
      // but camera may not be exactly at origin.
      // What matters is that reprojection error is tiny.
      expect(result.residual).toBeLessThan(1.0); // Very small reprojection error
    });

    it('should optimize point position to match observed pixel', () => {
      const project = Project.create('Point Position Test');

      // Create a viewpoint at a known pose (LOCKED - we're optimizing the point)
      const camera = Viewpoint.create(
        'TestCamera',
        'test-camera.jpg',
        '',
        1920,
        1080,
        {
          focalLength: 1000,
          position: [0, 0, 0], // Camera at origin
          rotation: [1, 0, 0, 0], // No rotation (identity quaternion)
          principalPointX: 960,
          principalPointY: 540,
          isPoseLocked: true, // Lock camera so only point moves
        }
      );

      // Create a world point with wrong initial position
      const worldPoint = WorldPoint.create('WorldPoint', {
        lockedXyz: [null, null, null],
        optimizedXyz: [1, 1, 10], // Wrong position
      });

      // Point should project to image center if it's at [0, 0, 10]
      const observedU = 960;
      const observedV = 540;

      const ip = ImagePoint.create(worldPoint, camera, observedU, observedV);

      project.addViewpoint(camera);
      project.addWorldPoint(worldPoint);
      project.addImagePoint(ip);

      const result = optimizeProject(project, {
        tolerance: 1e-4,
        maxIterations: 100,
        verbose: false,
        autoInitializeCameras: false,
        autoInitializeWorldPoints: false
      });

      console.log('\n=== Point Position from Single Observation ===');
      console.log('Converged:', result.converged);
      console.log('Iterations:', result.iterations);
      console.log('Final residual:', result.residual.toFixed(6));

      expect(result.converged).toBe(true);

      // Point should have moved to correct position
      const finalPos = worldPoint.optimizedXyz!;

      // Should be near [0, 0, 10]
      expect(Math.abs(finalPos[0])).toBeLessThan(0.1);
      expect(Math.abs(finalPos[1])).toBeLessThan(0.1);
      expect(Math.abs(finalPos[2] - 10)).toBeLessThan(0.5);

      expect(result.residual).toBeLessThan(1.0);
    });
  });

  describe('Bundle Adjustment', () => {
    it('should jointly optimize camera pose and point positions', () => {
      const project = Project.create('Bundle Adjustment Test');

      // Create two viewpoints with wrong poses
      const cam1 = Viewpoint.create('Camera1', 'camera1.jpg', '', 1920, 1080, {
        focalLength: 1000,
        position: [-1.5, 0.3, 0.2], // Wrong (should be at [-2, 0, 0])
        rotationEuler: [0, 0.1, 0],      // Wrong (should be [0, 0, 0])
        principalPointX: 960,
        principalPointY: 540,
      });

      const cam2 = Viewpoint.create('Camera2', 'camera2.jpg', '', 1920, 1080, {
        focalLength: 1000,
        position: [1.7, -0.2, 0.1], // Wrong (should be at [2, 0, 0])
        rotationEuler: [0, -0.1, 0],     // Wrong (should be [0, 0, 0])
        principalPointX: 960,
        principalPointY: 540,
      });

      // Create a 3D point with wrong position
      const point = WorldPoint.create('Point1', {
        lockedXyz: [null, null, null],
        optimizedXyz: [0.2, 0.5, 9], // Wrong (should be at [0, 0, 10])
      });

      // Simulated observations:
      // If cameras were at [-2, 0, 0] and [2, 0, 0], both pointing at [0, 0, 10],
      // the point would project to image center in both images

      const ip1 = ImagePoint.create(point, cam1, 960, 540);
      const ip2 = ImagePoint.create(point, cam2, 960, 540);

      project.addViewpoint(cam1);
      project.addViewpoint(cam2);
      project.addWorldPoint(point);
      project.addImagePoint(ip1);
      project.addImagePoint(ip2);

      const result = optimizeProject(project, {
        tolerance: 1e-4,
        maxIterations: 100,
        verbose: false,
        autoInitializeCameras: false,
        autoInitializeWorldPoints: false
      });

      console.log('\n=== Bundle Adjustment (2 cameras, 1 point) ===');
      console.log('Converged:', result.converged);
      console.log('Iterations:', result.iterations);
      console.log('Final residual:', result.residual.toFixed(6));

      expect(result.converged).toBe(true);

      // Check that cameras moved to better poses
      const cam1Pos = cam1.position;
      const cam2Pos = cam2.position;
      const pointPos = point.optimizedXyz!;

      // Cameras should be roughly on opposite sides
      expect(cam1Pos[0]).toBeLessThan(0); // Cam1 on left
      expect(cam2Pos[0]).toBeGreaterThan(0); // Cam2 on right

      // Point should be roughly centered
      expect(Math.abs(pointPos[0])).toBeLessThan(2.0);
      expect(Math.abs(pointPos[1])).toBeLessThan(2.0);

      // Overall residual should be small
      expect(result.residual).toBeLessThan(5.0);
    });

    it('should triangulate point from multiple camera views', () => {
      const project = Project.create('Triangulation Test');

      // Create viewpoints with locked poses
      const camera1 = Viewpoint.create('Camera1', 'camera1.jpg', '', 1920, 1080, {
        focalLength: 1000,
        position: [-2, 0, 0],
        rotation: [1, 0, 0, 0], // Identity quaternion
        principalPointX: 960,
        principalPointY: 540,
        isPoseLocked: true, // Lock camera pose
      });

      const camera2 = Viewpoint.create('Camera2', 'camera2.jpg', '', 1920, 1080, {
        focalLength: 1000,
        position: [2, 0, 0],
        rotation: [1, 0, 0, 0], // Identity quaternion
        principalPointX: 960,
        principalPointY: 540,
        isPoseLocked: true, // Lock camera pose
      });

      // Unknown 3D point (to be triangulated)
      const point = WorldPoint.create('Point', {
        lockedXyz: [null, null, null],
        optimizedXyz: [0, 0, 5], // Initial guess
      });

      // Observations: point projects to image center in both views
      // Actual point should be at [0, 0, 10] to project to center from both cameras

      const ip1 = ImagePoint.create(point, camera1, 960, 540);
      const ip2 = ImagePoint.create(point, camera2, 960, 540);

      project.addViewpoint(camera1);
      project.addViewpoint(camera2);
      project.addWorldPoint(point);
      project.addImagePoint(ip1);
      project.addImagePoint(ip2);

      const result = optimizeProject(project, {
        tolerance: 1e-4,
        maxIterations: 100,
        verbose: false,
        autoInitializeCameras: false,
        autoInitializeWorldPoints: false
      });

      console.log('\n=== Triangulation (2 cameras, locked poses) ===');
      console.log('Converged:', result.converged);
      console.log('Iterations:', result.iterations);
      console.log('Final residual:', result.residual.toFixed(6));

      expect(result.converged).toBe(true);

      const triangulatedPos = point.optimizedXyz!;

      // Point should be centered between cameras and forward
      expect(Math.abs(triangulatedPos[0])).toBeLessThan(0.5); // X near 0
      expect(Math.abs(triangulatedPos[1])).toBeLessThan(0.5); // Y near 0
      expect(triangulatedPos[2]).toBeGreaterThan(5); // Z > 5 (in front)

      expect(result.residual).toBeLessThan(2.0);
    });
  });
});
