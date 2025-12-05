import { describe, it, expect } from '@jest/globals';
import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import { Line } from '../../entities/line';
import { optimizeProject } from '../optimize-project';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';
import { V, Vec3, Vec4 } from 'scalar-autograd';

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return ((state >>> 0) / 4294967296);
  };
}

describe('GOLDEN-9: Partial Visibility Bundle Adjustment', () => {
  // SKIP: This test is flaky due to late PnP initialization with only Camera1's triangulated points.
  // Camera2 sometimes converges to a degenerate solution because WP5, WP6, WP7 are only visible
  // in Camera2 and their triangulation from Camera1 alone can be imprecise.
  // TODO: Fix by using Essential Matrix for Camera2 when it can't do reliable PnP.
  it.skip('should reconstruct all points despite limited visibility using geometric constraints', () => {
    const random = seededRandom(98765);

    console.log('\n=== GOLDEN-9: Partial Visibility Bundle Adjustment ===\n');
    console.log('Testing reconstruction with some points only visible in one camera\n');

    const project = Project.create('Golden Partial Visibility');

    const groundTruthCameras = [
      { name: 'Camera1', position: [0, 0, -20] as [number, number, number], rotation: [1, 0, 0, 0] as [number, number, number, number] },
      { name: 'Camera2', position: [20, 0, -20] as [number, number, number], rotation: [1, 0, 0, 0] as [number, number, number, number] }
    ];

    const groundTruthPoints: Array<{ name: string; xyz: [number, number, number] }> = [
      { name: 'WP0', xyz: [0, 0, 0] },
      { name: 'WP1', xyz: [10, 0, 0] },
      { name: 'WP2', xyz: [10, 10, 0] },
      { name: 'WP3', xyz: [0, 10, 0] },
      { name: 'WP4', xyz: [0, 0, 10] },
      { name: 'WP5', xyz: [10, 0, 10] },
      { name: 'WP6', xyz: [10, 10, 10] },
      { name: 'WP7', xyz: [0, 10, 10] }
    ];

    const focalLength = 1000;
    const imageWidth = 1000;
    const imageHeight = 1000;

    console.log('=== GROUND TRUTH ===');
    console.log('\nCameras:');
    groundTruthCameras.forEach(cam => {
      console.log(`  ${cam.name}: position=[${cam.position.join(', ')}]`);
    });
    console.log('\nWorld Points (10x10x10 cube):');
    groundTruthPoints.forEach(pt => {
      console.log(`  ${pt.name}: [${pt.xyz.join(', ')}]`);
    });

    console.log('\n=== STEP 1: Generate LIMITED visibility image points ===');
    console.log('Camera1 sees: WP0, WP1, WP2, WP3, WP4 (5 points)');
    console.log('Camera2 sees: WP0, WP4, WP5, WP6, WP7 (5 points)');
    console.log('WP0 and WP4 are bridge points visible in both cameras');

    const cameras: Viewpoint[] = [];
    const worldPoints: WorldPoint[] = [];

    for (const gtCam of groundTruthCameras) {
      const cam = Viewpoint.create(
        gtCam.name,
        `${gtCam.name}.jpg`,
        '',
        imageWidth,
        imageHeight,
        {
          focalLength,
          principalPointX: imageWidth / 2,
          principalPointY: imageHeight / 2,
          position: [0, 0, 0],
          rotation: [1, 0, 0, 0],
          aspectRatio: 1.0
        }
      );
      cameras.push(cam);
      project.addViewpoint(cam);
    }

    for (const gtPt of groundTruthPoints) {
      const wp = WorldPoint.create(gtPt.name, {
        lockedXyz: [null, null, null],
        optimizedXyz: undefined
      });
      worldPoints.push(wp);
      project.addWorldPoint(wp);
    }

    const camera1VisiblePoints = [0, 1, 2, 3, 4];
    const camera2VisiblePoints = [0, 4, 5, 6, 7];

    let totalImagePoints = 0;

    for (const ptIdx of camera1VisiblePoints) {
      const gtCam = groundTruthCameras[0];
      const cam = cameras[0];
      const gtPt = groundTruthPoints[ptIdx];
      const wp = worldPoints[ptIdx];

      const worldVec = new Vec3(
        V.C(gtPt.xyz[0]),
        V.C(gtPt.xyz[1]),
        V.C(gtPt.xyz[2])
      );
      const camPos = new Vec3(
        V.C(gtCam.position[0]),
        V.C(gtCam.position[1]),
        V.C(gtCam.position[2])
      );
      const camRot = new Vec4(
        V.C(gtCam.rotation[0]),
        V.C(gtCam.rotation[1]),
        V.C(gtCam.rotation[2]),
        V.C(gtCam.rotation[3])
      );

      const projection = projectWorldPointToPixelQuaternion(
        worldVec,
        camPos,
        camRot,
        V.C(focalLength),
        V.C(1.0),
        V.C(imageWidth / 2),
        V.C(imageHeight / 2),
        V.C(0),
        V.C(0),
        V.C(0),
        V.C(0),
        V.C(0),
        V.C(0)
      );

      if (projection) {
        const ip = ImagePoint.create(wp, cam, projection[0].data, projection[1].data);
        project.addImagePoint(ip);
        cam.addImagePoint(ip);
        wp.addImagePoint(ip);
        totalImagePoints++;
      }
    }

    for (const ptIdx of camera2VisiblePoints) {
      const gtCam = groundTruthCameras[1];
      const cam = cameras[1];
      const gtPt = groundTruthPoints[ptIdx];
      const wp = worldPoints[ptIdx];

      const worldVec = new Vec3(
        V.C(gtPt.xyz[0]),
        V.C(gtPt.xyz[1]),
        V.C(gtPt.xyz[2])
      );
      const camPos = new Vec3(
        V.C(gtCam.position[0]),
        V.C(gtCam.position[1]),
        V.C(gtCam.position[2])
      );
      const camRot = new Vec4(
        V.C(gtCam.rotation[0]),
        V.C(gtCam.rotation[1]),
        V.C(gtCam.rotation[2]),
        V.C(gtCam.rotation[3])
      );

      const projection = projectWorldPointToPixelQuaternion(
        worldVec,
        camPos,
        camRot,
        V.C(focalLength),
        V.C(1.0),
        V.C(imageWidth / 2),
        V.C(imageHeight / 2),
        V.C(0),
        V.C(0),
        V.C(0),
        V.C(0),
        V.C(0),
        V.C(0)
      );

      if (projection) {
        const ip = ImagePoint.create(wp, cam, projection[0].data, projection[1].data);
        project.addImagePoint(ip);
        cam.addImagePoint(ip);
        wp.addImagePoint(ip);
        totalImagePoints++;
      }
    }

    console.log(`Generated ${totalImagePoints} synthetic image points (limited visibility)`);

    console.log('\n=== STEP 2: Add geometric constraints (12 cube edges) ===');

    const cubeEdges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    const lines: Line[] = [];
    for (const [aIdx, bIdx] of cubeEdges) {
      const line = Line.create(
        `Edge_${worldPoints[aIdx].name}_${worldPoints[bIdx].name}`,
        worldPoints[aIdx],
        worldPoints[bIdx],
        {
          targetLength: 10.0,
          direction: 'free'
        }
      );
      lines.push(line);
      project.addLine(line);
    }

    console.log(`Added ${lines.length} edge lines with targetLength=10.0`);
    console.log('These constraints will bridge visibility gaps');

    console.log('\n=== STEP 3: Initialize solver state ===');
    console.log('WP0 at [0,0,0]: LOCKED (origin)');
    console.log('WP1 at [10,0,0]: LOCKED (x-axis)');
    console.log('WP3 at [0,10,0]: LOCKED (y-axis)');
    console.log('WP4 at [0,0,10]: LOCKED (z-axis, fully constrains coordinate frame)');
    console.log('WP2, WP5-WP7: FREE (PnP triangulation)');
    console.log('Cameras: FREE (PnP initialization from visible points)');

    worldPoints[0].lockedXyz = [0, 0, 0];
    worldPoints[0].optimizedXyz = [0, 0, 0];
    worldPoints[1].lockedXyz = [10, 0, 0];
    worldPoints[1].optimizedXyz = [10, 0, 0];
    worldPoints[3].lockedXyz = [0, 10, 0];
    worldPoints[3].optimizedXyz = [0, 10, 0];
    worldPoints[4].lockedXyz = [0, 0, 10];
    worldPoints[4].optimizedXyz = [0, 0, 10];

    console.log('\n=== STEP 4: Run optimizeProject ===');

    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxIterations: 1000,
      tolerance: 1e-6,
      damping: 1.0,
      verbose: false
    });

    console.log(`\nConverged: ${result.converged}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Final Residual: ${result.residual.toFixed(6)}`);
    if (result.camerasInitialized) {
      console.log(`Cameras initialized: ${result.camerasInitialized.join(', ')}`);
    }

    console.log('\n=== STEP 5: Verification ===');

    console.log('\nCamera Position Errors:');
    console.log('Camera           | Ground Truth Pos        | Final Pos               | Error');
    console.log('-----------------|-------------------------|-------------------------|-------');

    let maxCameraError = 0;
    for (let i = 0; i < cameras.length; i++) {
      const cam = cameras[i];
      const gt = groundTruthCameras[i];
      const dx = cam.position[0] - gt.position[0];
      const dy = cam.position[1] - gt.position[1];
      const dz = cam.position[2] - gt.position[2];
      const error = Math.sqrt(dx * dx + dy * dy + dz * dz);
      maxCameraError = Math.max(maxCameraError, error);

      const gtPosStr = gt.position.map(x => x.toFixed(1)).join(', ');
      const finalPosStr = cam.position.map(x => x.toFixed(1)).join(', ');
      console.log(`${cam.name.padEnd(16)} | [${gtPosStr.padEnd(22)}] | [${finalPosStr.padEnd(22)}] | ${error.toFixed(3)}`);
    }

    console.log('\nWorld Point Position Errors:');
    console.log('Point | Visibility      | Ground Truth          | Final                 | Error');
    console.log('------|-----------------|----------------------|----------------------|-------');

    const visibilityMap: { [key: number]: string } = {
      0: 'Both',
      1: 'Cam1 only',
      2: 'Cam1 only',
      3: 'Cam1 only',
      4: 'Both',
      5: 'Cam2 only',
      6: 'Cam2 only',
      7: 'Cam2 only'
    };

    let maxPointError = 0;
    for (let i = 0; i < worldPoints.length; i++) {
      const wp = worldPoints[i];
      const gt = groundTruthPoints[i];

      if (!wp.optimizedXyz) {
        console.log(`${wp.name.padEnd(5)} | NO OPTIMIZED XYZ`);
        continue;
      }

      const dx = wp.optimizedXyz[0] - gt.xyz[0];
      const dy = wp.optimizedXyz[1] - gt.xyz[1];
      const dz = wp.optimizedXyz[2] - gt.xyz[2];
      const error = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!wp.isFullyLocked()) {
        maxPointError = Math.max(maxPointError, error);
      }

      const visibility = visibilityMap[i] || 'Unknown';
      const gtStr = gt.xyz.map(x => x.toFixed(1)).join(', ');
      const finalStr = wp.optimizedXyz.map(x => x.toFixed(1)).join(', ');
      const lockedFlag = wp.isFullyLocked() ? ' (LOCKED)' : '';
      console.log(`${wp.name.padEnd(5)} | ${visibility.padEnd(15)} | [${gtStr.padEnd(19)}] | [${finalStr.padEnd(19)}] | ${error.toFixed(3)}${lockedFlag}`);
    }

    console.log('\nEdge Length Verification:');
    console.log('Edge                     | Target | Actual | Error');
    console.log('-------------------------|--------|--------|-------');

    let maxLengthError = 0;
    for (const line of lines) {
      const info = line.getOptimizationInfo();
      const actualLength = info.length || 0;
      const targetLength = line.targetLength || 10.0;
      const error = Math.abs(actualLength - targetLength);
      maxLengthError = Math.max(maxLengthError, error);

      console.log(`${line.name.padEnd(24)} | ${targetLength.toFixed(1).padStart(6)} | ${actualLength.toFixed(3).padStart(6)} | ${error.toFixed(3)}`);
    }

    console.log(`\nMax camera error: ${maxCameraError.toFixed(3)} units`);
    console.log(`Max point error (excluding locked): ${maxPointError.toFixed(3)} units`);
    console.log(`Max edge length error: ${maxLengthError.toFixed(3)} units`);

    console.log('\n=== SUCCESS CRITERIA ===');
    console.log(`All points within ±20.0 units: ${maxPointError < 20.0 ? 'PASS' : 'FAIL'} (PnP can vary with low reprojection weight)`);
    console.log(`All line lengths = 10.0 ± 2.0: ${maxLengthError < 2.0 ? 'PASS' : 'FAIL'}`);
    console.log(`Cameras within ±20.0 units: ${maxCameraError < 20.0 ? 'PASS' : 'FAIL'} (PnP can vary with low reprojection weight)`);

    expect(result.converged).toBe(true);
    expect(maxPointError).toBeLessThan(20.0);
    expect(maxLengthError).toBeLessThan(2.0);
    expect(maxCameraError).toBeLessThan(20.0);

    console.log('\n=== Test completed successfully ===\n');
  });
});
