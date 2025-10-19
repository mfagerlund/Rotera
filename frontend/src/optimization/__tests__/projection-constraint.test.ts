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
import { Camera } from '../../entities/camera';
import { ProjectionConstraint } from '../../entities/constraints/projection-constraint';
import { ConstraintSystem } from '../constraint-system';

// Test repository implementations
class TestCameraRepository {
  getImagesByCamera() { return []; }
  entityExists() { return true; }
}

class TestConstraintRepository {
  getPoint() { return undefined; }
  getLine() { return undefined; }
  getPlane() { return undefined; }
  entityExists() { return true; }
  pointExists() { return true; }
  lineExists() { return true; }
  planeExists() { return true; }
}

describe('ProjectionConstraint - Camera Bundle Adjustment', () => {
  let system: ConstraintSystem;
  let cameraRepo: TestCameraRepository;
  let constraintRepo: TestConstraintRepository;

  beforeEach(() => {
    system = new ConstraintSystem({
      tolerance: 1e-4,
      maxIterations: 100,
      verbose: false,
    });
    cameraRepo = new TestCameraRepository();
    constraintRepo = new TestConstraintRepository();
  });

  describe('Simple Projection', () => {
    it('should optimize camera pose to match multiple observed pixels', () => {
      // Create multiple world points at known locations (LOCKED - we're optimizing camera)
      const p1 = WorldPoint.create('p1', 'Point1', {
        xyz: [0, 0, 10], // Center, 10 units away
        isLocked: true,
      });
      const p2 = WorldPoint.create('p2', 'Point2', {
        xyz: [2, 0, 10], // 2 units to the right
        isLocked: true,
      });
      const p3 = WorldPoint.create('p3', 'Point3', {
        xyz: [0, 2, 10], // 2 units up
        isLocked: true,
      });

      // Create a camera with wrong initial pose
      const camera = Camera.create(
        'cam1',
        'TestCamera',
        1000, // focal length = 1000 pixels
        1920,
        1080,
        cameraRepo,
        {
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

      const c1 = ProjectionConstraint.create('c1', 'Proj1', 'p1', 'cam1', 960, 540, constraintRepo);
      const c2 = ProjectionConstraint.create('c2', 'Proj2', 'p2', 'cam1', 1160, 540, constraintRepo);
      const c3 = ProjectionConstraint.create('c3', 'Proj3', 'p3', 'cam1', 960, 740, constraintRepo);

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
      // Create a camera at a known pose (LOCKED - we're optimizing the point)
      const camera = Camera.create(
        'cam1',
        'TestCamera',
        1000,
        1920,
        1080,
        cameraRepo,
        {
          position: [0, 0, 0], // Camera at origin
          rotation: [1, 0, 0, 0], // No rotation (identity quaternion)
          principalPointX: 960,
          principalPointY: 540,
          isPoseLocked: true, // Lock camera so only point moves
        }
      );

      // Create a world point with wrong initial position
      const worldPoint = WorldPoint.create('p1', 'WorldPoint', {
        xyz: [1, 1, 10], // Wrong position
      });

      // Point should project to image center if it's at [0, 0, 10]
      const observedU = 960;
      const observedV = 540;

      const constraint = ProjectionConstraint.create(
        'proj1',
        'Projection1',
        'p1',
        'cam1',
        observedU,
        observedV,
        constraintRepo
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
      const finalPos = worldPoint.getDefinedCoordinates()!;

      // Should be near [0, 0, 10]
      expect(Math.abs(finalPos[0])).toBeLessThan(0.1);
      expect(Math.abs(finalPos[1])).toBeLessThan(0.1);
      expect(Math.abs(finalPos[2] - 10)).toBeLessThan(0.5);

      expect(result.residual).toBeLessThan(1.0);
    });
  });

  describe('Bundle Adjustment', () => {
    it('should jointly optimize camera pose and point positions', () => {
      // Create two cameras with wrong poses
      const cam1 = Camera.create('cam1', 'Camera1', 1000, 1920, 1080, cameraRepo, {
        position: [-1.5, 0.3, 0.2], // Wrong (should be at [-2, 0, 0])
        rotationEuler: [0, 0.1, 0],      // Wrong (should be [0, 0, 0])
        principalPointX: 960,
        principalPointY: 540,
      });

      const cam2 = Camera.create('cam2', 'Camera2', 1000, 1920, 1080, cameraRepo, {
        position: [1.7, -0.2, 0.1], // Wrong (should be at [2, 0, 0])
        rotationEuler: [0, -0.1, 0],     // Wrong (should be [0, 0, 0])
        principalPointX: 960,
        principalPointY: 540,
      });

      // Create a 3D point with wrong position
      const point = WorldPoint.create('p1', 'Point1', {
        xyz: [0.2, 0.5, 9], // Wrong (should be at [0, 0, 10])
      });

      // Simulated observations:
      // If cameras were at [-2, 0, 0] and [2, 0, 0], both pointing at [0, 0, 10],
      // the point would project to image center in both images

      const proj1 = ProjectionConstraint.create(
        'proj1',
        'Proj_Cam1_P1',
        'p1',
        'cam1',
        960, // image center
        540,
        constraintRepo
      );

      const proj2 = ProjectionConstraint.create(
        'proj2',
        'Proj_Cam2_P1',
        'p1',
        'cam2',
        960, // image center
        540,
        constraintRepo
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
      const pointPos = point.getDefinedCoordinates()!;

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
      const cam1 = WorldPoint.create('cam1_pos', 'Cam1Position', {
        xyz: [-2, 0, 0],
        isLocked: true, // Lock camera position
      });

      const cam2 = WorldPoint.create('cam2_pos', 'Cam2Position', {
        xyz: [2, 0, 0],
        isLocked: true,
      });

      // Create cameras with locked poses
      const camera1 = Camera.create('cam1', 'Camera1', 1000, 1920, 1080, cameraRepo, {
        position: [-2, 0, 0],
        rotation: [1, 0, 0, 0], // Identity quaternion
        principalPointX: 960,
        principalPointY: 540,
        isPoseLocked: true, // Lock camera pose
      });

      const camera2 = Camera.create('cam2', 'Camera2', 1000, 1920, 1080, cameraRepo, {
        position: [2, 0, 0],
        rotation: [1, 0, 0, 0], // Identity quaternion
        principalPointX: 960,
        principalPointY: 540,
        isPoseLocked: true, // Lock camera pose
      });

      // Unknown 3D point (to be triangulated)
      const point = WorldPoint.create('p1', 'Point', {
        xyz: [0, 0, 5], // Initial guess
      });

      // Observations: point projects to image center in both views
      // Actual point should be at [0, 0, 10] to project to center from both cameras

      const proj1 = ProjectionConstraint.create(
        'proj1',
        'Proj1',
        'p1',
        'cam1',
        960,
        540,
        constraintRepo
      );

      const proj2 = ProjectionConstraint.create(
        'proj2',
        'Proj2',
        'p1',
        'cam2',
        960,
        540,
        constraintRepo
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

      const triangulatedPos = point.getDefinedCoordinates()!;

      // Point should be centered between cameras and forward
      expect(Math.abs(triangulatedPos[0])).toBeLessThan(0.5); // X near 0
      expect(Math.abs(triangulatedPos[1])).toBeLessThan(0.5); // Y near 0
      expect(triangulatedPos[2]).toBeGreaterThan(5); // Z > 5 (in front)

      expect(result.residual).toBeLessThan(2.0);
    });
  });
});
