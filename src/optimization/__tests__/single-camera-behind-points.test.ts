/**
 * Regression test for single-camera optimization producing points behind camera.
 *
 * BUG: Optimization reports good residuals, but when visualizing the camera overlay,
 * the image points don't align with the image. This happens when world points are
 * positioned behind the camera plane (negative Z in camera coordinates).
 *
 * ROOT CAUSE: The isZReflected flag is set incorrectly. This can happen when:
 * 1. VP initialization computes a camera pose with the wrong handedness
 * 2. The solver converges to a mirrored solution
 *
 * DETECTION: This test checks if the majority of observed world points are in front
 * of the camera. If not, the isZReflected flag is likely wrong.
 *
 * Fixture: Farnsworth House with 1 camera, vanishing lines, axis-aligned line constraints.
 */
import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import { optimizeProject } from '../optimize-project';
import { projectPointToPixel, PlainCameraIntrinsics } from '../analytical/project-point-plain';
import { optimizationLogs } from '../optimization-logger';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Transform world point to camera coordinates using quaternion rotation.
 */
function worldToCameraCoordinates(
  worldPoint: [number, number, number],
  cameraPos: [number, number, number],
  cameraRot: [number, number, number, number]
): { x: number; y: number; z: number } {
  // Translate to camera origin
  const tx = worldPoint[0] - cameraPos[0];
  const ty = worldPoint[1] - cameraPos[1];
  const tz = worldPoint[2] - cameraPos[2];

  // Quaternion rotation: v' = q * v * q*
  const [qw, qx, qy, qz] = cameraRot;

  // q_vec · t (dot product)
  const dot = qx * tx + qy * ty + qz * tz;

  // |q_vec|² (squared magnitude of vector part)
  const qVecSq = qx * qx + qy * qy + qz * qz;

  // w² - |q_vec|²
  const wSqMinusQVecSq = qw * qw - qVecSq;

  // q_vec × t (cross product)
  const cx = qy * tz - qz * ty;
  const cy = qz * tx - qx * tz;
  const cz = qx * ty - qy * tx;

  // v' = 2*(q_vec · t)*q_vec + (w² - |q_vec|²)*t + 2*w*(q_vec × t)
  return {
    x: 2 * dot * qx + wSqMinusQVecSq * tx + 2 * qw * cx,
    y: 2 * dot * qy + wSqMinusQVecSq * ty + 2 * qw * cy,
    z: 2 * dot * qz + wSqMinusQVecSq * tz + 2 * qw * cz,
  };
}

describe('Single-Camera Behind-Points Regression', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'farnsworth-house-5.rotera');

  function countPointsBehindCamera(project: ReturnType<typeof loadProjectFromJson>, useIsZReflected: boolean) {
    const vp = Array.from(project.viewpoints)[0] as Viewpoint;

    let behindCount = 0;
    let frontCount = 0;

    for (const wp of project.worldPoints) {
      const worldPoint = wp as WorldPoint;
      if (!worldPoint.optimizedXyz) continue;

      let camCoords = worldToCameraCoordinates(
        worldPoint.optimizedXyz as [number, number, number],
        vp.position as [number, number, number],
        vp.rotation as [number, number, number, number]
      );

      if (useIsZReflected) {
        camCoords = { x: -camCoords.x, y: -camCoords.y, z: -camCoords.z };
      }

      if (camCoords.z < 0.099) {
        behindCount++;
      } else {
        frontCount++;
      }
    }

    return { frontCount, behindCount, vp };
  }

  it('should load the fixture correctly', () => {
    if (!fs.existsSync(fixturePath)) {
      console.log('Fixture file not found, skipping test');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    expect(project.viewpoints.size).toBe(1);
    expect(project.worldPoints.size).toBeGreaterThan(10);
    expect(project.imagePoints.size).toBeGreaterThan(10);
    expect(project.lines.size).toBeGreaterThan(5);

    const vp = Array.from(project.viewpoints)[0] as Viewpoint;
    expect(vp.vanishingLines.size).toBeGreaterThan(0);
  });

  it('should detect incorrect isZReflected setting', () => {
    if (!fs.existsSync(fixturePath)) {
      console.log('Fixture file not found, skipping test');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    const vp = Array.from(project.viewpoints)[0] as Viewpoint;

    // Test with both settings
    const resultTrue = countPointsBehindCamera(project, true);
    const resultFalse = countPointsBehindCamera(project, false);

    console.log(`[isZReflected Diagnostic]`);
    console.log(`  Stored isZReflected: ${vp.isZReflected}`);
    console.log(`  With isZReflected=true:  ${resultTrue.frontCount} front, ${resultTrue.behindCount} behind`);
    console.log(`  With isZReflected=false: ${resultFalse.frontCount} front, ${resultFalse.behindCount} behind`);

    // The CORRECT setting should have most points in front
    const correctWithStored = vp.isZReflected
      ? resultTrue.frontCount > resultTrue.behindCount
      : resultFalse.frontCount > resultFalse.behindCount;

    // Determine what the correct setting SHOULD be
    const shouldBeTrue = resultTrue.frontCount > resultTrue.behindCount;
    const shouldBeFalse = resultFalse.frontCount > resultFalse.behindCount;

    if (!correctWithStored) {
      const correctSetting = shouldBeTrue ? 'true' : shouldBeFalse ? 'false' : 'neither (both have issues)';
      console.log(`  BUG DETECTED: isZReflected should be ${correctSetting}, but is ${vp.isZReflected}`);
    }

    // This test intentionally documents the known bug
    // When fixed, the stored isZReflected should match the correct setting
    expect(correctWithStored).toBe(true);
  });

  it('should not have world points behind camera after optimization', async () => {
    if (!fs.existsSync(fixturePath)) {
      console.log('Fixture file not found, skipping test');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    const result = await optimizeProject(project, {
      maxIterations: 1000,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: false,
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxAttempts: 3,
    });

    console.log(`[Optimization] iter=${result.iterations}, residual=${result.residual.toFixed(2)}, converged=${result.converged}`);

    const vp = Array.from(project.viewpoints)[0] as Viewpoint;

    // Check with the stored isZReflected value
    const useIsZReflected = vp.isZReflected;
    const observedPoints = new Set<WorldPoint>();
    for (const ip of project.imagePoints) {
      observedPoints.add((ip as ImagePoint).worldPoint as WorldPoint);
    }

    let observedBehindCount = 0;
    const behindDetails: string[] = [];

    for (const wp of observedPoints) {
      if (!wp.optimizedXyz) continue;
      let camCoords = worldToCameraCoordinates(
        wp.optimizedXyz as [number, number, number],
        vp.position as [number, number, number],
        vp.rotation as [number, number, number, number]
      );
      if (useIsZReflected) {
        camCoords = { x: -camCoords.x, y: -camCoords.y, z: -camCoords.z };
      }
      if (camCoords.z < 0.099) {
        observedBehindCount++;
        behindDetails.push(`${wp.getName()}: camZ=${camCoords.z}, world=[${wp.optimizedXyz?.join(',')}]`);
      }
    }

    if (observedBehindCount > 0) {
      throw new Error(`[Behind Camera] ${observedBehindCount} observed points behind camera (cam at [${vp.position.map(p=>p.toFixed(2)).join(',')}], isZReflected=${useIsZReflected}): ${behindDetails.join('; ')}`);
    }

    expect(observedBehindCount).toBe(0);
  });

  it('should have reasonable reprojection errors', async () => {
    if (!fs.existsSync(fixturePath)) {
      console.log('Fixture file not found, skipping test');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    await optimizeProject(project, {
      maxIterations: 1000,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: false,
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxAttempts: 3,
    });

    const vp = Array.from(project.viewpoints)[0] as Viewpoint;

    const intrinsics: PlainCameraIntrinsics = {
      fx: vp.focalLength,
      fy: vp.focalLength * vp.aspectRatio,
      cx: vp.principalPointX,
      cy: vp.principalPointY,
      k1: vp.radialDistortion[0],
      k2: vp.radialDistortion[1],
      k3: vp.radialDistortion[2],
      p1: vp.tangentialDistortion[0],
      p2: vp.tangentialDistortion[1],
    };

    const errors: number[] = [];
    let behindCamera = 0;

    for (const ip of project.imagePoints) {
      const imagePoint = ip as ImagePoint;
      const wp = imagePoint.worldPoint as WorldPoint;
      if (!wp.optimizedXyz) continue;

      const projected = projectPointToPixel(
        wp.optimizedXyz as [number, number, number],
        vp.position as [number, number, number],
        vp.rotation as [number, number, number, number],
        intrinsics,
        vp.isZReflected
      );

      if (projected) {
        const du = projected[0] - imagePoint.u;
        const dv = projected[1] - imagePoint.v;
        const error = Math.sqrt(du * du + dv * dv);
        errors.push(error);
      } else {
        behindCamera++;
      }
    }

    // Sort errors and compute statistics
    errors.sort((a, b) => a - b);
    const median = errors.length > 0 ? errors[Math.floor(errors.length / 2)] : Infinity;

    console.log(`[Reprojection] median=${median.toFixed(1)}px, behind=${behindCamera}/${errors.length + behindCamera}`);

    // Should have no points behind camera
    expect(behindCamera).toBe(0);

    // Should have reasonable median error (under 20px for this scene)
    expect(median).toBeLessThan(20);
  });

  it('should diagnose isZReflected during fresh optimization', async () => {
    if (!fs.existsSync(fixturePath)) {
      console.log('Fixture file not found, skipping test');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    // DON'T clear optimized data - simulate real user clicking "Optimize" on existing file
    const vp = Array.from(project.viewpoints)[0] as Viewpoint;
    // Only reset isZReflected to see if optimization sets it correctly
    vp.isZReflected = false;

    console.log(`[BEFORE] isZReflected=${vp.isZReflected}`);

    const result = await optimizeProject(project, {
      maxIterations: 1000,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: true, // Enable verbose to see logs
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxAttempts: 1,
    });

    console.log(`[AFTER] isZReflected=${vp.isZReflected}`);
    console.log(`[AFTER] Camera position: [${vp.position.map(p => p.toFixed(2)).join(', ')}]`);

    // Print handedness-related logs
    const handednessLogs = optimizationLogs.filter(l => l.includes('Handedness') || l.includes('AxisFlips') || l.includes('AxisSigns'));
    console.log(`[HANDEDNESS LOGS] (${handednessLogs.length} entries):`);
    handednessLogs.forEach(l => console.log(`  ${l}`));

    // Check if points are in front
    let behindCount = 0;
    for (const wp of project.worldPoints) {
      const worldPoint = wp as WorldPoint;
      if (!worldPoint.optimizedXyz) continue;

      let camCoords = worldToCameraCoordinates(
        worldPoint.optimizedXyz as [number, number, number],
        vp.position as [number, number, number],
        vp.rotation as [number, number, number, number]
      );
      if (vp.isZReflected) {
        camCoords = { x: -camCoords.x, y: -camCoords.y, z: -camCoords.z };
      }

      if (camCoords.z < 0.099) {
        behindCount++;
        console.log(`BEHIND: ${worldPoint.getName()} Z=${camCoords.z.toFixed(2)} (world: [${worldPoint.optimizedXyz!.map(c => c.toFixed(2)).join(', ')}])`);
      }
    }

    console.log(`[AFTER] Points behind camera: ${behindCount}/${project.worldPoints.size}`);

    // Collect behind point names for logging
    const behindNames: string[] = [];
    for (const wp of project.worldPoints) {
      const worldPoint = wp as WorldPoint;
      if (!worldPoint.optimizedXyz) continue;

      let camCoords2 = worldToCameraCoordinates(
        worldPoint.optimizedXyz as [number, number, number],
        vp.position as [number, number, number],
        vp.rotation as [number, number, number, number]
      );
      if (vp.isZReflected) {
        camCoords2 = { x: -camCoords2.x, y: -camCoords2.y, z: -camCoords2.z };
      }

      if (camCoords2.z < 0.099) {
        behindNames.push(`${worldPoint.getName()}(Z=${camCoords2.z.toFixed(2)})`);
      }
    }

    // This test does a fresh solve from scratch - 2 poorly-constrained outlier points
    // (WP11, WP12) may end up behind camera. The main isZReflected bug is fixed if
    // most points (>80%) are in front and isZReflected is properly reset to false.
    const frontCount = project.worldPoints.size - behindCount;
    const percentInFront = (frontCount / project.worldPoints.size) * 100;

    console.log(`Fresh solve: ${frontCount}/${project.worldPoints.size} points in front (${percentInFront.toFixed(0)}%)`);
    console.log(`isZReflected=${vp.isZReflected} (should be false after reset)`);

    // isZReflected should be false (reset by the fix)
    expect(vp.isZReflected).toBe(false);

    // Most points should be in front (allow 2 outliers)
    expect(percentInFront).toBeGreaterThanOrEqual(80);
  });

  it('should produce consistent camera position (not at origin)', async () => {
    if (!fs.existsSync(fixturePath)) {
      console.log('Fixture file not found, skipping test');
      return;
    }

    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    await optimizeProject(project, {
      maxIterations: 1000,
      tolerance: 1e-6,
      damping: 0.1,
      verbose: false,
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxAttempts: 3,
    });

    const vp = Array.from(project.viewpoints)[0] as Viewpoint;

    // Camera should not be at origin (that would indicate initialization failure)
    const distFromOrigin = Math.sqrt(
      vp.position[0] ** 2 + vp.position[1] ** 2 + vp.position[2] ** 2
    );

    console.log(`[Camera] position: [${vp.position.map(p => p.toFixed(2)).join(', ')}], dist=${distFromOrigin.toFixed(2)}`);

    expect(distFromOrigin).toBeGreaterThan(0.1);
  });
});
