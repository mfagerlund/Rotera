/**
 * Tests for projection constraints and bundle adjustment.
 *
 * ProjectionConstraint is the fundamental constraint in photogrammetry that:
 * - Projects a 3D world point through a camera to predict a pixel location
 * - Compares predicted pixel to observed pixel
 * - Residual should be [0, 0] when camera pose and point position are correct
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { WorldPoint } from '../../entities/world-point/WorldPoint';
import { Viewpoint } from '../../entities/viewpoint/Viewpoint';
import { ProjectionConstraint } from '../../entities/constraints/projection-constraint';
import { ConstraintSystem } from '../constraint-system';

describe('ProjectionConstraint - Camera Bundle Adjustment', () => {
  let system: ConstraintSystem;

  beforeEach(() => {
    system = new ConstraintSystem({
      tolerance: 1e-4,
      maxIterations: 100,
      verbose: false,
    });
  });

  describe('Simple Projection', () => {
    it('should optimize camera pose to match multiple observed pixels', () => {
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
      // p2 [2,0,10] -> [960 + 1000*(2/10), 540] = [1160, 540]
      // p3 [0,2,10] -> [960, 540 + 1000*(2/10)] = [960, 740]

      const c1 = ProjectionConstraint.create('Proj1', p1, camera, 960, 540);
      const c2 = ProjectionConstraint.create('Proj2', p2, camera, 1160, 540);
      const c3 = ProjectionConstraint.create('Proj3', p3, camera, 960, 740);

      system.addPoint(p1);
      system.addPoint(p2);
      system.addPoint(p3);
      system.addCamera(camera);
      system.addConstraint(c1);
      system.addConstraint(c2);
      system.addConstraint(c3);

      const result = system.solve();

      console.log('\n=== Camera Pose Optimization ===');
      console.log('Converged:', result.converged);
      console.log('Iterations:', result.iterations);
      console.log('Final residual:', result.residual.toFixed(6));

      expect(result.converged).toBe(true);

      // Camera should have moved close to origin
      const finalPose = camera.position;
      const finalRotationEuler = camera.getRotationEuler();

      expect(Math.abs(finalPose[0])).toBeLessThan(0.1);
      expect(Math.abs(finalPose[1])).toBeLessThan(0.1);
      expect(Math.abs(finalPose[2])).toBeLessThan(0.1);

      expect(Math.abs(finalRotationEuler[0])).toBeLessThan(0.1); // roll
      expect(Math.abs(finalRotationEuler[1])).toBeLessThan(0.1); // pitch
      expect(Math.abs(finalRotationEuler[2])).toBeLessThan(0.1); // yaw

      // Residual should be small (< 1 pixel per observation)
      expect(result.residual).toBeLessThan(3.0); // 3 observations, ~1px each
    });

    it('should optimize point position to match observed pixel', () => {
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

      const constraint = ProjectionConstraint.create(
        'Projection1',
        worldPoint,
        camera,
        observedU,
        observedV
      );

      system.addCamera(camera);
      system.addPoint(worldPoint);
      system.addConstraint(constraint);

      const result = system.solve();

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

      const proj1 = ProjectionConstraint.create(
        'Proj_Cam1_P1',
        point,
        cam1,
        960, // image center
        540
      );

      const proj2 = ProjectionConstraint.create(
        'Proj_Cam2_P1',
        point,
        cam2,
        960, // image center
        540
      );

      system.addCamera(cam1);
      system.addCamera(cam2);
      system.addPoint(point);
      system.addConstraint(proj1);
      system.addConstraint(proj2);

      const result = system.solve();

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
      // Two cameras at known poses (locked)
      const cam1 = WorldPoint.create('Cam1Position', {
        lockedXyz: [-2, 0, 0], // Lock camera position
        optimizedXyz: [-2, 0, 0],
      });

      const cam2 = WorldPoint.create('Cam2Position', {
        lockedXyz: [2, 0, 0],
        optimizedXyz: [2, 0, 0],
      });

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

      const proj1 = ProjectionConstraint.create(
        'Proj1',
        point,
        camera1,
        960,
        540
      );

      const proj2 = ProjectionConstraint.create(
        'Proj2',
        point,
        camera2,
        960,
        540
      );

      system.addPoint(cam1); // Add camera positions as locked points
      system.addPoint(cam2);
      system.addCamera(camera1); // Cameras will use these positions
      system.addCamera(camera2);
      system.addPoint(point);
      system.addConstraint(proj1);
      system.addConstraint(proj2);

      const result = system.solve();

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
