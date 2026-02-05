import { describe, it, expect } from '@jest/globals';
import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import { optimizeProject } from '../optimize-project';
import { projectPointToPixel, PlainCameraIntrinsics } from '../analytical/project-point-plain';

describe('GOLDEN-1: Two-View Point Reconstruction', () => {
  it('should perfectly reconstruct cube corners from two known cameras', async () => {
    console.log('\n=== GOLDEN-1: TWO-VIEW POINT RECONSTRUCTION ===\n');

    const groundTruthPositions: [number, number, number][] = [
      [0, 0, 0],     // WP0 (locked)
      [10, 0, 0],    // WP1 (locked)
      [10, 10, 0],   // WP2 (free)
      [0, 10, 0],    // WP3 (free)
      [0, 0, 10],    // WP4 (free)
      [10, 0, 10],   // WP5 (free)
      [10, 10, 10],  // WP6 (free)
      [0, 10, 10],   // WP7 (free)
    ];

    const cam1Position: [number, number, number] = [0, 0, -20];
    const cam2Position: [number, number, number] = [20, 0, -20];
    const focalLength = 1000;
    const principalPoint: [number, number] = [960, 540];
    const imageSize: [number, number] = [1920, 1080];

    function lookAtOrigin(position: [number, number, number]): [number, number, number, number] {
      const forward = [
        -position[0],
        -position[1],
        -position[2]
      ];
      const len = Math.sqrt(forward[0]**2 + forward[1]**2 + forward[2]**2);
      forward[0] /= len;
      forward[1] /= len;
      forward[2] /= len;

      const worldUp = [0, 1, 0];
      const right = [
        worldUp[1] * forward[2] - worldUp[2] * forward[1],
        worldUp[2] * forward[0] - worldUp[0] * forward[2],
        worldUp[0] * forward[1] - worldUp[1] * forward[0]
      ];
      const rightLen = Math.sqrt(right[0]**2 + right[1]**2 + right[2]**2);
      right[0] /= rightLen;
      right[1] /= rightLen;
      right[2] /= rightLen;

      const up = [
        forward[1] * right[2] - forward[2] * right[1],
        forward[2] * right[0] - forward[0] * right[2],
        forward[0] * right[1] - forward[1] * right[0]
      ];

      const m00 = right[0], m01 = right[1], m02 = right[2];
      const m10 = up[0], m11 = up[1], m12 = up[2];
      const m20 = forward[0], m21 = forward[1], m22 = forward[2];

      const trace = m00 + m11 + m22;
      let w: number, x: number, y: number, z: number;

      if (trace > 0) {
        const s = 0.5 / Math.sqrt(trace + 1.0);
        w = 0.25 / s;
        x = (m21 - m12) * s;
        y = (m02 - m20) * s;
        z = (m10 - m01) * s;
      } else if (m00 > m11 && m00 > m22) {
        const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
        w = (m21 - m12) / s;
        x = 0.25 * s;
        y = (m01 + m10) / s;
        z = (m02 + m20) / s;
      } else if (m11 > m22) {
        const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
        w = (m02 - m20) / s;
        x = (m01 + m10) / s;
        y = 0.25 * s;
        z = (m12 + m21) / s;
      } else {
        const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
        w = (m10 - m01) / s;
        x = (m02 + m20) / s;
        y = (m12 + m21) / s;
        z = 0.25 * s;
      }

      const len2 = Math.sqrt(w*w + x*x + y*y + z*z);
      return [w/len2, x/len2, y/len2, z/len2];
    }

    const cam1Rotation = lookAtOrigin(cam1Position);
    const cam2Rotation = lookAtOrigin(cam2Position);

    console.log('GROUND TRUTH SETUP:');
    console.log(`Camera 1: pos=[${cam1Position.join(', ')}], rot=[${cam1Rotation.map(x => x.toFixed(3)).join(', ')}]`);
    console.log(`Camera 2: pos=[${cam2Position.join(', ')}], rot=[${cam2Rotation.map(x => x.toFixed(3)).join(', ')}]`);
    console.log(`Intrinsics: f=${focalLength}, pp=[${principalPoint.join(', ')}], size=[${imageSize.join('x')}]\n`);

    console.log('World Points (10x10x10 cube):');
    groundTruthPositions.forEach((pos, i) => {
      const locked = i === 0 || i === 1 ? ' (LOCKED)' : '';
      console.log(`  WP${i}: [${pos.join(', ')}]${locked}`);
    });
    console.log();

    const project = Project.create('Golden Test 1');

    const worldPoints: WorldPoint[] = [];
    for (let i = 0; i < 8; i++) {
      const isLocked = i === 0 || i === 1;
      const wp = WorldPoint.create(`WP${i}`, {
        lockedXyz: isLocked ? groundTruthPositions[i] : [null, null, null],
        optimizedXyz: groundTruthPositions[i],
      });
      worldPoints.push(wp);
      project.addWorldPoint(wp);
    }

    const cam1 = Viewpoint.create(
      'Camera1',
      'cam1.jpg',
      'cam1.jpg',
      imageSize[0],
      imageSize[1],
      {
        focalLength,
        principalPointX: principalPoint[0],
        principalPointY: principalPoint[1],
        position: cam1Position,
        rotation: cam1Rotation,
        isPoseLocked: true,
      }
    );

    const cam2 = Viewpoint.create(
      'Camera2',
      'cam2.jpg',
      'cam2.jpg',
      imageSize[0],
      imageSize[1],
      {
        focalLength,
        principalPointX: principalPoint[0],
        principalPointY: principalPoint[1],
        position: cam2Position,
        rotation: cam2Rotation,
        isPoseLocked: true,
      }
    );

    project.addViewpoint(cam1);
    project.addViewpoint(cam2);

    console.log('GENERATING SYNTHETIC IMAGE POINTS:\n');

    const intrinsics: PlainCameraIntrinsics = {
      fx: focalLength,
      fy: focalLength,
      cx: principalPoint[0],
      cy: principalPoint[1],
      k1: 0, k2: 0, k3: 0,
      p1: 0, p2: 0,
    };

    function projectPoint(
      worldPos: [number, number, number],
      cameraPos: [number, number, number],
      cameraRot: [number, number, number, number]
    ): [number, number] | null {
      return projectPointToPixel(worldPos, cameraPos, cameraRot, intrinsics);
    }

    let imagePointCount = 0;
    for (let i = 0; i < worldPoints.length; i++) {
      const wp = worldPoints[i];
      const worldPos = groundTruthPositions[i];

      const proj1 = projectPoint(worldPos, cam1Position, cam1Rotation);
      if (proj1) {
        const ip1 = ImagePoint.create(wp, cam1, proj1[0], proj1[1]);
        project.addImagePoint(ip1);
        cam1.addImagePoint(ip1);
        wp.addImagePoint(ip1);
        imagePointCount++;
        console.log(`  WP${i} -> Cam1: [${proj1[0].toFixed(1)}, ${proj1[1].toFixed(1)}]`);
      }

      const proj2 = projectPoint(worldPos, cam2Position, cam2Rotation);
      if (proj2) {
        const ip2 = ImagePoint.create(wp, cam2, proj2[0], proj2[1]);
        project.addImagePoint(ip2);
        cam2.addImagePoint(ip2);
        wp.addImagePoint(ip2);
        imagePointCount++;
        console.log(`  WP${i} -> Cam2: [${proj2[0].toFixed(1)}, ${proj2[1].toFixed(1)}]`);
      }
    }

    console.log(`\nGenerated ${imagePointCount} image points (8 points x 2 cameras)\n`);

    console.log('RUNNING OPTIMIZATION:\n');

    const result = await optimizeProject(project, {
      autoInitializeCameras: false,
      autoInitializeWorldPoints: true,
      maxIterations: 100,
      tolerance: 1e-6,
      damping: 1e-3,
      verbose: false,
    });

    console.log('OPTIMIZATION RESULT:');
    console.log(`  Converged: ${result.converged}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Residual: ${result.residual.toFixed(6)}\n`);

    console.log('VERIFICATION (Ground Truth vs Reconstructed):\n');
    console.log('Point | Ground Truth XYZ          | Reconstructed XYZ         | Error');
    console.log('------|---------------------------|---------------------------|-------');

    let maxError = 0;
    const errors: number[] = [];

    for (let i = 0; i < worldPoints.length; i++) {
      const wp = worldPoints[i];
      const gt = groundTruthPositions[i];
      const opt = wp.optimizedXyz;

      if (!opt) {
        console.log(`WP${i}   | [${gt.map(x => x.toFixed(3)).join(', ')}] | MISSING                   | FAIL`);
        errors.push(Infinity);
        continue;
      }

      const error = Math.sqrt(
        (opt[0] - gt[0])**2 +
        (opt[1] - gt[1])**2 +
        (opt[2] - gt[2])**2
      );

      errors.push(error);
      maxError = Math.max(maxError, error);

      const status = error < 0.1 ? 'OK' : 'FAIL';
      console.log(
        `WP${i}   | [${gt.map(x => x.toFixed(3)).join(', ')}] | ` +
        `[${opt.map(x => x.toFixed(3)).join(', ')}] | ${error.toFixed(4)} ${status}`
      );
    }

    console.log();
    console.log(`Maximum error: ${maxError.toFixed(6)} units`);
    console.log(`Average error: ${(errors.reduce((a, b) => a + b, 0) / errors.length).toFixed(6)} units\n`);

    expect(result.converged).toBe(true);
    expect(maxError).toBeLessThan(0.1);

    console.log('GOLDEN-1 TEST PASSED\n');
  });
});
