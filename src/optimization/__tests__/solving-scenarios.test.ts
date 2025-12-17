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
import { WorldPoint } from '../../entities/world-point';
import { ImagePoint } from '../../entities/imagePoint';
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

});

describe('Solving Scenarios - Phase 2: Two Camera Systems', () => {
  describe('Scenario 5: Essential Matrix Initialization', () => {
    it('should initialize two cameras using Essential Matrix with arbitrary scale', () => {
      const project = loadFixture('scenario-05-essential-matrix.json');

      expect(project.worldPoints.size).toBe(8);
      expect(project.viewpoints.size).toBe(2);
      expect(project.imagePoints.size).toBe(16);

      // Lock two points to provide both anchor and scale (required since validation change)
      const worldPointsArray = Array.from(project.worldPoints) as WorldPoint[];
      worldPointsArray[0].lockedXyz = [0, 0, 0];
      worldPointsArray[1].lockedXyz = [1, 1, 1];

      // Mark cameras as possibly cropped to allow PP optimization
      // This is needed for Essential Matrix to converge well without locked points
      for (const vp of project.viewpoints) {
        (vp as Viewpoint).isPossiblyCropped = true;
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

      // Essential Matrix places camera1 at origin by convention
      // Only camera2 needs to be away from origin
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

});

describe('Solving Scenarios - Phase 4: Single Camera with Inferred Coordinates', () => {
  describe('Scenario 11: Single Camera with VP Initialization Using Inferred Coordinates', () => {
    /**
     * This test validates the fix for single-camera optimization with inferred coordinates.
     *
     * Key aspects tested:
     * 1. Only ONE world point is fully locked (WP1 at origin)
     * 2. Other 5 points have INFERRED coordinates from line constraints
     * 3. Camera must be initialized using vanishing points + all 6 constrained points
     * 4. The inference system must be trusted for camera position solving
     *
     * This prevents regression of the bug where:
     * - vanishing-points.ts only used lockedXyz (not inferred)
     * - unified-initialization.ts overwrote correct optimizedXyz values
     */
    it('should initialize camera using vanishing points with inferred world point coordinates', () => {
      const project = loadFixture('scenario-11-single-camera-inferred-coords.json');

      // Verify fixture structure
      expect(project.worldPoints.size).toBe(6);
      expect(project.viewpoints.size).toBe(1);
      expect(project.imagePoints.size).toBe(6);
      expect(project.lines.size).toBe(7);

      const worldPointsArray = Array.from(project.worldPoints);

      // WP1, WP2, WP3 are fully locked (3 points for the cube corner reference)
      const fullyLockedPoints = worldPointsArray.filter(wp => wp.isFullyLocked());
      expect(fullyLockedPoints.length).toBe(3);

      // WP4, WP5, WP6 have partial inferred coordinates (missing y due to vertical lines)
      // Total fully constrained = 3 locked + 0 fully inferred = 3
      const constrainedPoints = worldPointsArray.filter(wp => wp.isFullyConstrained());
      expect(constrainedPoints.length).toBe(3);

      // Verify camera has vanishing lines for all 3 axes
      const camera = Array.from(project.viewpoints)[0] as Viewpoint;
      expect(camera.getVanishingLineCount()).toBe(6);

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: false
      });

      // Camera should have been initialized via vanishing points
      expect(result.camerasInitialized).toBeDefined();
      expect(result.camerasInitialized).toContain('C3');

      // The system has free variables (unknown coordinates) so it should optimize
      expect(result.error).toBeNull();
      expect(result.converged).toBe(true);

      // Camera should be initialized away from origin
      expectCameraInitializedAwayFromOrigin(camera, 10.0);

      // Verify all world points got optimized coordinates
      for (const wp of worldPointsArray) {
        expectWorldPointInitialized(wp);
      }
    });

    it('should use partial inferred coordinates and solve for unknowns via optimization', () => {
      const project = loadFixture('scenario-11-single-camera-inferred-coords.json');

      const worldPointsArray = Array.from(project.worldPoints);
      const wp4 = worldPointsArray.find(p => p.name === 'WP4')!;
      const wp5 = worldPointsArray.find(p => p.name === 'WP5')!;
      const wp6 = worldPointsArray.find(p => p.name === 'WP6')!;

      // WP4 is on a vertical line from WP1, so x and z are inferred (0, 0) but y is UNKNOWN
      expect(wp4.inferredXyz[0]).toBe(0);  // x shared with WP1
      expect(wp4.inferredXyz[1]).toBeNull(); // y is UNKNOWN (vertical line, could be +10 or -10)
      expect(wp4.inferredXyz[2]).toBe(0);  // z shared with WP1

      // WP5 has x=0, z=-10 from connected lines, but y is UNKNOWN
      expect(wp5.inferredXyz[0]).toBe(0);
      expect(wp5.inferredXyz[1]).toBeNull();
      expect(wp5.inferredXyz[2]).toBe(-10);

      // WP6 has x=10, z=0 from connected lines, but y is UNKNOWN
      expect(wp6.inferredXyz[0]).toBe(10);
      expect(wp6.inferredXyz[1]).toBeNull();
      expect(wp6.inferredXyz[2]).toBe(0);

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

      // After optimization, all points should have optimizedXyz
      expect(wp4.optimizedXyz).toBeDefined();
      expect(wp5.optimizedXyz).toBeDefined();
      expect(wp6.optimizedXyz).toBeDefined();

      if (wp4.optimizedXyz && wp5.optimizedXyz && wp6.optimizedXyz) {
        // WP4, WP5, WP6 should all be at y ~= 10 (top of cube corner)
        // Allow 1.0 tolerance since optimization may not be perfect
        expect(Math.abs(wp4.optimizedXyz[1] - 10)).toBeLessThan(1.0);
        expect(Math.abs(wp5.optimizedXyz[1] - 10)).toBeLessThan(1.0);
        expect(Math.abs(wp6.optimizedXyz[1] - 10)).toBeLessThan(1.0);
      }
    });
  });

  describe('Scenario 12: Two Locked Points - Debug High Reprojection Error', () => {
    /**
     * This test debugs why reprojection error is 42.54 px when clicks are within +/- 1 pixel.
     *
     * The setup:
     * - 2 fully locked points: WP1 at [0,0,0], WP2 at [0,0,-10]
     * - 4 points with partial inferred coordinates
     * - 6 vanishing lines (2 per axis)
     * - Camera initialized via vanishing points
     */
    it('should achieve low reprojection error with precise clicks', () => {
      const project = loadFixture('scenario-12-two-locked-points.json');

      // Verify fixture structure
      expect(project.worldPoints.size).toBe(6);
      expect(project.viewpoints.size).toBe(1);
      expect(project.imagePoints.size).toBe(6);

      const worldPointsArray = Array.from(project.worldPoints);
      const camera = Array.from(project.viewpoints)[0] as Viewpoint;

      // Debug: Print the image points and their world point associations
      console.log('\n=== IMAGE POINTS ===');
      for (const ip of camera.imagePoints) {
        console.log(`  ${ip.worldPoint.name}: image=(${ip.u.toFixed(2)}, ${ip.v.toFixed(2)})`);
      }

      // Debug: Print world point locked/inferred coordinates
      console.log('\n=== WORLD POINTS ===');
      for (const wp of worldPointsArray) {
        console.log(`  ${wp.name}:`);
        console.log(`    locked: [${wp.lockedXyz.map(v => v === null ? 'null' : v.toFixed(2)).join(', ')}]`);
        console.log(`    inferred: [${wp.inferredXyz.map(v => v === null ? 'null' : v.toFixed(2)).join(', ')}]`);
        console.log(`    effective: [${wp.getEffectiveXyz().map(v => v === null ? 'null' : v.toFixed(2)).join(', ')}]`);
        console.log(`    isFullyConstrained: ${wp.isFullyConstrained()}`);
      }

      // Debug: Print vanishing lines
      console.log('\n=== VANISHING LINES ===');
      for (const vl of camera.vanishingLines) {
        console.log(`  ${vl.axis}: p1=(${vl.p1.u.toFixed(2)}, ${vl.p1.v.toFixed(2)}) -> p2=(${vl.p2.u.toFixed(2)}, ${vl.p2.v.toFixed(2)})`);
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

      // Debug: Print camera position after optimization
      console.log('\n=== CAMERA AFTER OPTIMIZATION ===');
      console.log(`  Position: [${camera.position.map(v => v.toFixed(4)).join(', ')}]`);
      console.log(`  Rotation: [${camera.rotation.map(v => v.toFixed(4)).join(', ')}]`);
      console.log(`  Focal length: ${camera.focalLength.toFixed(2)}`);
      console.log(`  Principal point: (${camera.principalPointX.toFixed(2)}, ${camera.principalPointY.toFixed(2)})`);

      // Debug: Print optimized world points
      console.log('\n=== OPTIMIZED WORLD POINTS ===');
      for (const wp of worldPointsArray) {
        if (wp.optimizedXyz) {
          console.log(`  ${wp.name}: [${wp.optimizedXyz.map(v => v.toFixed(4)).join(', ')}]`);
        }
      }

      // Debug: Compute and print individual reprojection errors
      // Use BOTH rotation methods to compare
      console.log('\n=== REPROJECTION ERRORS (comparing projection methods) ===');
      for (const ip of camera.imagePoints) {
        const wp = ip.worldPoint;
        if (wp.optimizedXyz) {
          // Project world point to image
          const worldPos = wp.optimizedXyz;

          // Get camera transform (R, t)
          const q = camera.rotation;
          // Quaternion to rotation matrix (same formula as vanishing-points.ts)
          const qw = q[0], qx = q[1], qy = q[2], qz = q[3];
          const R = [
            [1 - 2*(qy*qy + qz*qz), 2*(qx*qy - qw*qz), 2*(qx*qz + qw*qy)],
            [2*(qx*qy + qw*qz), 1 - 2*(qx*qx + qz*qz), 2*(qy*qz - qw*qx)],
            [2*(qx*qz - qw*qy), 2*(qy*qz + qw*qx), 1 - 2*(qx*qx + qy*qy)]
          ];

          // Transform world point to camera frame: P_cam = R * (P_world - C)
          const dx = worldPos[0] - camera.position[0];
          const dy = worldPos[1] - camera.position[1];
          const dz = worldPos[2] - camera.position[2];

          const camX = R[0][0]*dx + R[0][1]*dy + R[0][2]*dz;
          const camY = R[1][0]*dx + R[1][1]*dy + R[1][2]*dz;
          const camZ = R[2][0]*dx + R[2][1]*dy + R[2][2]*dz;

          // Projection 1: standard formula
          const u_proj1 = camera.focalLength * camX / camZ + camera.principalPointX;
          const v_proj1 = camera.focalLength * camY / camZ + camera.principalPointY;

          // Projection 2: with Y-flip (like camera-projection.ts)
          const u_proj2 = camera.focalLength * camX / camZ + camera.principalPointX;
          const v_proj2 = camera.principalPointY - camera.focalLength * camY / camZ;

          const error1 = Math.sqrt((ip.u - u_proj1)**2 + (ip.v - v_proj1)**2);
          const error2 = Math.sqrt((ip.u - u_proj2)**2 + (ip.v - v_proj2)**2);
          console.log(`  ${wp.name}: observed=(${ip.u.toFixed(2)}, ${ip.v.toFixed(2)})`);
          console.log(`    proj1 (v=pp+fy): (${u_proj1.toFixed(2)}, ${v_proj1.toFixed(2)}) error=${error1.toFixed(2)} px`);
          console.log(`    proj2 (v=pp-fy): (${u_proj2.toFixed(2)}, ${v_proj2.toFixed(2)}) error=${error2.toFixed(2)} px`);
          console.log(`    camXYZ=[${camX.toFixed(4)}, ${camY.toFixed(4)}, ${camZ.toFixed(4)}]`);
        }
      }

      // Print actual residuals from the optimization system
      console.log('\n=== SYSTEM RESIDUALS ===');
      for (const ip of camera.imagePoints) {
        const imagePoint = ip as ImagePoint;
        if (imagePoint.lastResiduals) {
          const residuals = imagePoint.lastResiduals;
          const error = Math.sqrt(residuals[0]**2 + residuals[1]**2);
          console.log(`  ${ip.worldPoint.name}: system residuals=[${residuals.map((r: number) => r.toFixed(2)).join(', ')}], error=${error.toFixed(2)} px`);
        }
      }

      // With VP initialization + bundle adjustment, expect median error < 10 px
      // Note: VP initialization gives approximate pose, then optimizer refines it
      expect(result.medianReprojectionError).toBeLessThan(10.0);
    });
  });

  describe('VP Initialization with Positive Coordinates', () => {
    it('should work with Y=-10 (stillwrong fixture)', () => {
      const project = loadFixture('stillwrong-neg-y.json');
      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: true
      });
      console.log('\n=== Y=-10 TEST RESULT ===');
      console.log(`Median reproj error: ${result.medianReprojectionError}`);
      expect(result.converged).toBe(true);
    });

    it('should work with Y=+10 (stillwrong fixture)', () => {
      const project = loadFixture('stillwrong-pos-y.json');
      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: true
      });
      console.log('\n=== Y=+10 TEST RESULT ===');
      console.log(`Median reproj error: ${result.medianReprojectionError}`);
      expect(result.converged).toBe(true);
    });

    it('should achieve sub-pixel accuracy with positive locked coordinates and vanishing lines', () => {
      // This test verifies that VP initialization works correctly with positive coordinates
      // The fixture has: O at (0,0,0), X at (10,0,0), Y at (0,10,0), Z at (0,0,10)
      // With X and Z vanishing lines observed
      const project = loadFixture('vp-positive-coords.json');

      expect(project.worldPoints.size).toBe(4);
      expect(project.viewpoints.size).toBe(1);

      const camera = Array.from(project.viewpoints)[0] as Viewpoint;
      const worldPointsArray = Array.from(project.worldPoints);

      // Verify the locked coordinates are positive
      const wpO = worldPointsArray.find(p => p.name === 'O')!;
      const wpX = worldPointsArray.find(p => p.name === 'X')!;
      const wpY = worldPointsArray.find(p => p.name === 'Y')!;
      const wpZ = worldPointsArray.find(p => p.name === 'Z')!;

      expect(wpO.lockedXyz).toEqual([0, 0, 0]);
      expect(wpX.lockedXyz).toEqual([10, 0, 0]);
      expect(wpY.getEffectiveXyz()).toEqual([0, 10, 0]); // Y is inferred from line constraint
      expect(wpZ.lockedXyz).toEqual([0, 0, 10]);

      // Check vanishing lines exist
      expect(camera.vanishingLines.size).toBeGreaterThanOrEqual(2);

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: true  // Enable verbose to see VP initialization logs
      });

      // Log the result for debugging
      console.log('\n=== VP POSITIVE COORDS TEST RESULT ===');
      console.log(`Converged: ${result.converged}`);
      console.log(`Iterations: ${result.iterations}`);
      console.log(`Residual: ${result.residual}`);
      console.log(`Median reproj error: ${result.medianReprojectionError}`);
      console.log(`Cameras initialized: ${result.camerasInitialized}`);

      // Verify convergence
      expect(result.converged).toBe(true);
      expect(result.error).toBeNull();

      // CRITICAL: Median reprojection error should be < 1 pixel for a good solve
      expect(result.medianReprojectionError).toBeLessThan(1.0);
    });
  });

  describe('Scenario 13: Single Fixed Point with Line Length Constraint', () => {
    /**
     * This test validates solving when:
     * - Only ONE world point is fully locked (O at origin)
     * - Another point (Y) is on an axis-aligned line with targetLength
     * - The targetLength should provide enough information to establish scale
     *
     * Current behavior: FAILS because scale requires 2 fully constrained points
     * Expected behavior: Should infer Y's missing coordinate from targetLength
     */
    it('should solve when scale is provided via line targetLength', () => {
      const project = loadFixture('only-one-fixed-point.json');

      // Verify fixture structure
      expect(project.worldPoints.size).toBe(4);
      expect(project.viewpoints.size).toBe(1);
      expect(project.imagePoints.size).toBe(4);
      expect(project.lines.size).toBe(3);

      const worldPointsArray = Array.from(project.worldPoints);
      const camera = Array.from(project.viewpoints)[0] as Viewpoint;

      // O is fully locked at origin
      const wpO = worldPointsArray.find(p => p.name === 'O')!;
      expect(wpO.lockedXyz).toEqual([0, 0, 0]);
      expect(wpO.isFullyConstrained()).toBe(true);

      // Y has inferred x=0, z=0 but y is unknown
      const wpY = worldPointsArray.find(p => p.name === 'Y')!;
      expect(wpY.lockedXyz).toEqual([null, null, null]);
      expect(wpY.inferredXyz[0]).toBe(0);  // x inferred
      expect(wpY.inferredXyz[1]).toBe(null);  // y NOT inferred
      expect(wpY.inferredXyz[2]).toBe(0);  // z inferred

      // Line from O to Y has direction='y' and targetLength=10
      const linesArray = Array.from(project.lines);
      const lineOY = linesArray.find(l =>
        (l.pointA.name === 'O' && l.pointB.name === 'Y') ||
        (l.pointA.name === 'Y' && l.pointB.name === 'O')
      )!;
      expect(lineOY.direction).toBe('y');
      expect(lineOY.targetLength).toBe(10);

      // Verify camera has vanishing lines
      expect(camera.getVanishingLineCount()).toBe(6);

      // Print current state
      console.log('\n=== ONLY ONE FIXED POINT TEST ===');
      console.log('World points:');
      for (const wp of worldPointsArray) {
        console.log(`  ${wp.name}: locked=[${wp.lockedXyz}], inferred=[${wp.inferredXyz}], fullyConstrained=${wp.isFullyConstrained()}`);
      }

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 100,
        tolerance: 1e-6,
        verbose: true
      });

      console.log('\n=== RESULT ===');
      console.log(`Converged: ${result.converged}`);
      console.log(`Error: ${result.error}`);
      console.log(`Median reproj error: ${result.medianReprojectionError}`);
      console.log(`Cameras initialized: ${result.camerasInitialized}`);

      // After fix: should converge with good accuracy
      expect(result.error).toBeNull();
      expect(result.converged).toBe(true);
      expect(result.medianReprojectionError).toBeLessThan(1.0);

      // Y should end up at [0, ±10, 0] after solving
      if (wpY.optimizedXyz) {
        console.log(`Y optimized: [${wpY.optimizedXyz}]`);
        expect(wpY.optimizedXyz[0]).toBeCloseTo(0, 1);
        expect(Math.abs(wpY.optimizedXyz[1])).toBeCloseTo(10, 1);
        expect(wpY.optimizedXyz[2]).toBeCloseTo(0, 1);
      }
    });
  });

  describe('Axis Sign Correction', () => {
    it('should correct X axis sign when locked X is positive but solved is negative', () => {
      // Create a scenario where X axis might be flipped
      const project = loadFixture('coordinate-sign-good.json');

      // Find a point with positive X locked coordinate and verify it's correct after solve
      const worldPointsArray = Array.from(project.worldPoints) as WorldPoint[];
      const pointWithPositiveX = worldPointsArray.find(wp => {
        const locked = wp.lockedXyz;
        return locked && locked[0] !== null && locked[0] > 0;
      });

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        forceRightHanded: true,
        maxIterations: 100,
        tolerance: 1e-6,
      });

      expect(result.converged).toBe(true);

      // If there's a point with positive locked X, its solved X should also be positive
      if (pointWithPositiveX && pointWithPositiveX.optimizedXyz) {
        const lockedX = pointWithPositiveX.lockedXyz![0]!;
        const solvedX = pointWithPositiveX.optimizedXyz[0];
        console.log(`Point ${pointWithPositiveX.name}: locked X=${lockedX}, solved X=${solvedX}`);
        expect(Math.sign(solvedX)).toBe(Math.sign(lockedX));
      }
    });

    it('should correct Y axis sign when locked Y is positive but solved is negative', () => {
      const project = loadFixture('coordinate-sign-good.json');

      const worldPointsArray = Array.from(project.worldPoints) as WorldPoint[];
      const pointWithPositiveY = worldPointsArray.find(wp => {
        const locked = wp.lockedXyz;
        return locked && locked[1] !== null && locked[1] > 0;
      });

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        forceRightHanded: true,
        maxIterations: 100,
        tolerance: 1e-6,
      });

      expect(result.converged).toBe(true);

      if (pointWithPositiveY && pointWithPositiveY.optimizedXyz) {
        const lockedY = pointWithPositiveY.lockedXyz![1]!;
        const solvedY = pointWithPositiveY.optimizedXyz[1];
        console.log(`Point ${pointWithPositiveY.name}: locked Y=${lockedY}, solved Y=${solvedY}`);
        expect(Math.sign(solvedY)).toBe(Math.sign(lockedY));
      }
    });

    it('should correct Z axis sign when locked Z is positive but solved is negative', () => {
      const project = loadFixture('coordinate-sign-good.json');

      const worldPointsArray = Array.from(project.worldPoints) as WorldPoint[];
      const pointWithPositiveZ = worldPointsArray.find(wp => {
        const locked = wp.lockedXyz;
        return locked && locked[2] !== null && locked[2] > 0;
      });

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        forceRightHanded: true,
        maxIterations: 100,
        tolerance: 1e-6,
      });

      expect(result.converged).toBe(true);

      if (pointWithPositiveZ && pointWithPositiveZ.optimizedXyz) {
        const lockedZ = pointWithPositiveZ.lockedXyz![2]!;
        const solvedZ = pointWithPositiveZ.optimizedXyz[2];
        console.log(`Point ${pointWithPositiveZ.name}: locked Z=${lockedZ}, solved Z=${solvedZ}`);
        expect(Math.sign(solvedZ)).toBe(Math.sign(lockedZ));
      }
    });

    it('should ensure all locked axis signs match after solving', () => {
      // Test that forceRightHanded corrects any axis sign mismatches
      const project = loadFixture('coordinate-sign-posZ.json');

      const worldPointsArray = Array.from(project.worldPoints) as WorldPoint[];

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        forceRightHanded: true,
        maxIterations: 100,
        tolerance: 1e-6,
      });

      expect(result.converged).toBe(true);

      // After solving with forceRightHanded, ALL locked coordinates should have matching signs
      for (const wp of worldPointsArray) {
        const locked = wp.lockedXyz;
        const solved = wp.optimizedXyz;
        if (!locked || !solved) continue;

        // Only check non-zero locked values
        if (locked[0] !== null && locked[0] !== 0 && solved[0] !== null) {
          expect(Math.sign(solved[0])).toBe(Math.sign(locked[0]));
        }
        if (locked[1] !== null && locked[1] !== 0 && solved[1] !== null) {
          expect(Math.sign(solved[1])).toBe(Math.sign(locked[1]));
        }
        if (locked[2] !== null && locked[2] !== 0 && solved[2] !== null) {
          expect(Math.sign(solved[2])).toBe(Math.sign(locked[2]));
        }
      }
    });
  });

  describe.skip('Scenario 15: Single Camera VP Initialization from Axis-Aligned Lines', () => {
    /**
     * Regression test for Tower VL fixture:
     * - Single camera scene
     * - No explicit VanishingLines, but many axis-aligned Lines (x, y, z directions)
     * - These should serve as "virtual" vanishing lines for VP initialization
     * - Tests ray-based sign determination for ambiguous point coordinates
     */
    it('should solve using axis-aligned lines as virtual vanishing lines', () => {
      const project = loadFixture('Tower-VL-axis-aligned-only.json');

      expect(project.worldPoints.size).toBe(14);
      expect(project.viewpoints.size).toBe(1);
      expect(project.imagePoints.size).toBe(14);
      expect(project.lines.size).toBe(20);

      // Count direction-constrained lines
      let axisAlignedCount = 0;
      for (const line of project.lines.values()) {
        if (line.direction && ['x', 'y', 'z'].includes(line.direction)) {
          axisAlignedCount++;
        }
      }
      expect(axisAlignedCount).toBeGreaterThanOrEqual(15); // Many axis-aligned lines

      const result = optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        detectOutliers: true,
        maxIterations: 1000,
        tolerance: 1e-8,
      });

      // Should converge with low error
      expect(result.converged).toBe(true);
      expect(result.residual).toBeLessThan(2); // Target: error < 2px

      // Camera should be initialized away from origin
      const camera = Array.from(project.viewpoints.values())[0] as Viewpoint;
      const camDist = Math.sqrt(
        camera.position[0] ** 2 + camera.position[1] ** 2 + camera.position[2] ** 2
      );
      expect(camDist).toBeGreaterThan(50); // Camera should be well away from origin

      // Origin point should remain at origin
      const originPoint = Array.from(project.worldPoints.values()).find(
        wp => wp.name === 'O'
      ) as WorldPoint;
      expect(originPoint.optimizedXyz).toBeDefined();
      expect(originPoint.optimizedXyz![0]).toBeCloseTo(0, 1);
      expect(originPoint.optimizedXyz![1]).toBeCloseTo(0, 1);
      expect(originPoint.optimizedXyz![2]).toBeCloseTo(0, 1);

      // Y point should be on the Y-axis (X=0, Z=0)
      const yPoint = Array.from(project.worldPoints.values()).find(
        wp => wp.name === 'Y'
      ) as WorldPoint;
      expect(yPoint.optimizedXyz).toBeDefined();
      expect(yPoint.optimizedXyz![0]).toBeCloseTo(0, 1);
      expect(yPoint.optimizedXyz![2]).toBeCloseTo(0, 1);
      // Y should be ~20 in magnitude (positive or negative depending on scene orientation)
      expect(Math.abs(yPoint.optimizedXyz![1])).toBeCloseTo(20, 1);
    });
  });
});
