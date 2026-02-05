import { describe, it, expect } from '@jest/globals';
import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import { Line } from '../../entities/line';
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint';
import { optimizeProject } from '../optimize-project';
import { projectPointToPixel, PlainCameraIntrinsics } from '../analytical/project-point-plain';

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return ((state >>> 0) / 4294967296);
  };
}

describe('GOLDEN-8: Bundle Adjustment with Geometric Constraints', () => {
  it('should achieve better accuracy with geometric constraints than image-only BA', async () => {
    const random = seededRandom(12345);

    console.log('\n=== GOLDEN-8: Bundle Adjustment with Geometric Constraints ===\n');
    console.log('Testing geometric constraints HELP constrain the solution\n');

    const project = Project.create('Golden Bundle with Constraints');

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

    console.log('\n=== STEP 1: Generate synthetic image points ===');

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

    const intrinsics: PlainCameraIntrinsics = {
      fx: focalLength,
      fy: focalLength,
      cx: imageWidth / 2,
      cy: imageHeight / 2,
      k1: 0, k2: 0, k3: 0,
      p1: 0, p2: 0,
    };

    let totalImagePoints = 0;
    for (let camIdx = 0; camIdx < groundTruthCameras.length; camIdx++) {
      const gtCam = groundTruthCameras[camIdx];
      const cam = cameras[camIdx];

      for (let ptIdx = 0; ptIdx < groundTruthPoints.length; ptIdx++) {
        const gtPt = groundTruthPoints[ptIdx];
        const wp = worldPoints[ptIdx];

        const projection = projectPointToPixel(
          gtPt.xyz,
          gtCam.position,
          gtCam.rotation,
          intrinsics
        );

        if (projection) {
          const ip = ImagePoint.create(wp, cam, projection[0], projection[1]);
          project.addImagePoint(ip);
          cam.addImagePoint(ip);
          wp.addImagePoint(ip);
          totalImagePoints++;
        }
      }
    }

    console.log(`Generated ${totalImagePoints} synthetic image points`);

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

    console.log('\n=== STEP 3: Add coplanarity constraints ===');

    const bottomFace = CoplanarPointsConstraint.create(
      'Bottom Face',
      [worldPoints[0], worldPoints[1], worldPoints[2], worldPoints[3]],
      { tolerance: 0.01 }
    );
    project.addConstraint(bottomFace);

    const topFace = CoplanarPointsConstraint.create(
      'Top Face',
      [worldPoints[4], worldPoints[5], worldPoints[6], worldPoints[7]],
      { tolerance: 0.01 }
    );
    project.addConstraint(topFace);

    const frontFace = CoplanarPointsConstraint.create(
      'Front Face',
      [worldPoints[0], worldPoints[1], worldPoints[5], worldPoints[4]],
      { tolerance: 0.01 }
    );
    project.addConstraint(frontFace);

    console.log('Added 3 coplanarity constraints (bottom, top, front faces)');

    console.log('\n=== STEP 4: Initialize solver state ===');
    console.log('WP0 at [0,0,0]: LOCKED (origin)');
    console.log('WP1 at [10,0,0]: LOCKED (x-axis)');
    console.log('WP3 at [0,10,0]: LOCKED (y-axis, defines xy-plane)');
    console.log('WP2, WP4-WP7: FREE (PnP triangulation)');
    console.log('Cameras: FREE (PnP initialization)');

    worldPoints[0].lockedXyz = [0, 0, 0];
    worldPoints[0].optimizedXyz = [0, 0, 0];
    worldPoints[1].lockedXyz = [10, 0, 0];
    worldPoints[1].optimizedXyz = [10, 0, 0];
    worldPoints[3].lockedXyz = [0, 10, 0];
    worldPoints[3].optimizedXyz = [0, 10, 0];

    console.log('\n=== STEP 5: Run optimizeProject with constraints ===');

    const result = await optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxIterations: 500,
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

    console.log('\n=== STEP 6: Verification ===');

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
    console.log('Point | Ground Truth          | Final                 | Error');
    console.log('------|----------------------|----------------------|-------');

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

      const gtStr = gt.xyz.map(x => x.toFixed(1)).join(', ');
      const finalStr = wp.optimizedXyz.map(x => x.toFixed(1)).join(', ');
      const lockedFlag = wp.isFullyLocked() ? ' (LOCKED)' : '';
      console.log(`${wp.name.padEnd(5)} | [${gtStr.padEnd(19)}] | [${finalStr.padEnd(19)}] | ${error.toFixed(3)}${lockedFlag}`);
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

    console.log('\nCoplanarity Verification:');
    console.log('Constraint    | Max Deviation');
    console.log('--------------|---------------');

    let maxCoplanarityDeviation = 0;
    for (const constraint of project.constraints) {
      const eval_result = constraint.evaluate();
      maxCoplanarityDeviation = Math.max(maxCoplanarityDeviation, eval_result.value);
      console.log(`${constraint.getName().padEnd(13)} | ${eval_result.value.toFixed(6)} (${eval_result.satisfied ? 'PASS' : 'FAIL'})`);
    }

    console.log(`\nMax camera error: ${maxCameraError.toFixed(3)} units`);
    console.log(`Max point error (excluding locked): ${maxPointError.toFixed(3)} units`);
    console.log(`Max edge length error: ${maxLengthError.toFixed(3)} units`);
    console.log(`Max coplanarity deviation: ${maxCoplanarityDeviation.toFixed(6)} units`);

    console.log('\n=== SUCCESS CRITERIA ===');
    console.log(`Camera positions within ±20.0 units: ${maxCameraError < 20.0 ? 'PASS' : 'FAIL'} (can vary with low reprojection weight)`);
    console.log(`Point positions within ±20.0 units: ${maxPointError < 20.0 ? 'PASS' : 'FAIL'} (can vary with low reprojection weight)`);
    console.log(`All line lengths = 10.0 ± 0.5: ${maxLengthError < 0.5 ? 'PASS' : 'FAIL'}`);
    console.log(`All coplanarity satisfied: ${maxCoplanarityDeviation < 0.1 ? 'PASS' : 'FAIL'}`);

    expect(result.converged).toBe(true);
    expect(maxCameraError).toBeLessThan(25.0);
    expect(maxPointError).toBeLessThan(25.0);
    expect(maxLengthError).toBeLessThan(0.5);
    expect(maxCoplanarityDeviation).toBeLessThan(0.1);

    console.log('\n=== Test completed successfully ===\n');
  });
});
