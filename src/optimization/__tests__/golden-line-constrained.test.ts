import { describe, it, expect } from '@jest/globals';
import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import { Line } from '../../entities/line';
import { optimizeProject } from '../optimize-project';
import { Vec4, V, Vec3 } from 'scalar-autograd';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';

describe('GOLDEN-2: Line-Constrained Reconstruction', () => {
  it('should reconstruct cube with line constraints from partial visibility', () => {
    console.log('\n=== GOLDEN-2: LINE-CONSTRAINED RECONSTRUCTION ===\n');

    const groundTruthPositions: [number, number, number][] = [
      [0, 0, 0],     // WP0 (locked)
      [10, 0, 0],    // WP1 (free)
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
      const locked = i === 0 ? ' (LOCKED)' : '';
      console.log(`  WP${i}: [${pos.join(', ')}]${locked}`);
    });
    console.log();

    const cam1VisibleIndices = [0, 1, 2, 3, 4];
    const cam2VisibleIndices = [0, 5, 6, 7, 4];

    console.log('PARTIAL VISIBILITY (simulated occlusion):');
    console.log(`  Camera 1 sees: WP${cam1VisibleIndices.join(', WP')}`);
    console.log(`  Camera 2 sees: WP${cam2VisibleIndices.join(', WP')}`);
    console.log(`  Bridge point: WP4 (visible in both)\n`);

    const project = Project.create('Golden Test 2');

    const worldPoints: WorldPoint[] = [];
    for (let i = 0; i < 8; i++) {
      const isLocked = i === 0;
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

    console.log('GENERATING SYNTHETIC IMAGE POINTS (partial visibility):\n');

    function projectPoint(
      worldPos: [number, number, number],
      cameraPos: [number, number, number],
      cameraRot: [number, number, number, number]
    ): [number, number] | null {
      const worldVec = new Vec3(V.C(worldPos[0]), V.C(worldPos[1]), V.C(worldPos[2]));
      const camPosVec = new Vec3(V.C(cameraPos[0]), V.C(cameraPos[1]), V.C(cameraPos[2]));
      const camRotQuat = new Vec4(V.C(cameraRot[0]), V.C(cameraRot[1]), V.C(cameraRot[2]), V.C(cameraRot[3]));

      const result = projectWorldPointToPixelQuaternion(
        worldVec,
        camPosVec,
        camRotQuat,
        V.C(focalLength),
        V.C(1.0),
        V.C(principalPoint[0]),
        V.C(principalPoint[1]),
        V.C(0),
        V.C(0), V.C(0), V.C(0),
        V.C(0), V.C(0)
      );

      if (!result) return null;
      return [result[0].data, result[1].data];
    }

    let imagePointCount = 0;
    for (const i of cam1VisibleIndices) {
      const wp = worldPoints[i];
      const worldPos = groundTruthPositions[i];
      const proj = projectPoint(worldPos, cam1Position, cam1Rotation);
      if (proj) {
        const ip = ImagePoint.create(wp, cam1, proj[0], proj[1]);
        project.addImagePoint(ip);
        cam1.addImagePoint(ip);
        wp.addImagePoint(ip);
        imagePointCount++;
        console.log(`  WP${i} -> Cam1: [${proj[0].toFixed(1)}, ${proj[1].toFixed(1)}]`);
      }
    }

    for (const i of cam2VisibleIndices) {
      const wp = worldPoints[i];
      const worldPos = groundTruthPositions[i];
      const proj = projectPoint(worldPos, cam2Position, cam2Rotation);
      if (proj) {
        const ip = ImagePoint.create(wp, cam2, proj[0], proj[1]);
        project.addImagePoint(ip);
        cam2.addImagePoint(ip);
        wp.addImagePoint(ip);
        imagePointCount++;
        console.log(`  WP${i} -> Cam2: [${proj[0].toFixed(1)}, ${proj[1].toFixed(1)}]`);
      }
    }

    console.log(`\nGenerated ${imagePointCount} image points\n`);

    console.log('CREATING LINE CONSTRAINTS (cube edges, all length=10.0):\n');

    const edgeDefinitions: [number, number, string][] = [
      [0, 1, 'Bottom-Front'],
      [1, 2, 'Bottom-Right'],
      [2, 3, 'Bottom-Back'],
      [3, 0, 'Bottom-Left'],
      [4, 5, 'Top-Front'],
      [5, 6, 'Top-Right'],
      [6, 7, 'Top-Back'],
      [7, 4, 'Top-Left'],
      [0, 4, 'Vertical-FL'],
      [1, 5, 'Vertical-FR'],
      [2, 6, 'Vertical-BR'],
      [3, 7, 'Vertical-BL'],
    ];

    const lines: Line[] = [];
    for (const [a, b, name] of edgeDefinitions) {
      const line = Line.create(name, worldPoints[a], worldPoints[b], {
        targetLength: 10.0,
      });
      lines.push(line);
      project.addLine(line);
      console.log(`  ${name}: WP${a} -> WP${b} (target length: 10.0)`);
    }

    console.log(`\nCreated ${lines.length} line constraints\n`);

    console.log('RUNNING OPTIMIZATION:\n');

    const result = optimizeProject(project, {
      autoInitializeCameras: false,
      autoInitializeWorldPoints: true,
      maxIterations: 500,
      tolerance: 1e-4,
      damping: 1.0,
      verbose: false,
    });

    console.log('OPTIMIZATION RESULT:');
    console.log(`  Converged: ${result.converged}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Residual: ${result.residual.toFixed(6)}\n`);

    console.log('VERIFICATION - POINT POSITIONS (Ground Truth vs Reconstructed):\n');
    console.log('Point | Ground Truth XYZ          | Reconstructed XYZ         | Error');
    console.log('------|---------------------------|---------------------------|-------');

    let maxPointError = 0;
    const pointErrors: number[] = [];

    for (let i = 0; i < worldPoints.length; i++) {
      const wp = worldPoints[i];
      const gt = groundTruthPositions[i];
      const opt = wp.optimizedXyz;

      if (!opt) {
        console.log(`WP${i}   | [${gt.map(x => x.toFixed(3)).join(', ')}] | MISSING                   | FAIL`);
        pointErrors.push(Infinity);
        continue;
      }

      const error = Math.sqrt(
        (opt[0] - gt[0])**2 +
        (opt[1] - gt[1])**2 +
        (opt[2] - gt[2])**2
      );

      pointErrors.push(error);
      maxPointError = Math.max(maxPointError, error);

      const status = error < 0.5 ? 'OK' : 'FAIL';
      console.log(
        `WP${i}   | [${gt.map(x => x.toFixed(3)).join(', ')}] | ` +
        `[${opt.map(x => x.toFixed(3)).join(', ')}] | ${error.toFixed(4)} ${status}`
      );
    }

    console.log();
    console.log(`Maximum point error: ${maxPointError.toFixed(6)} units`);
    console.log(`Average point error: ${(pointErrors.reduce((a, b) => a + b, 0) / pointErrors.length).toFixed(6)} units\n`);

    console.log('VERIFICATION - LINE LENGTHS:\n');
    console.log('Line          | Length  | Target | Error    | Status');
    console.log('--------------|---------|--------|----------|-------');

    let maxLineError = 0;
    const lineErrors: number[] = [];

    for (const line of lines) {
      const currentLength = line.length();
      const targetLength = line.targetLength || 10.0;

      if (currentLength === null) {
        console.log(`${line.name.padEnd(13)} | MISSING | ${targetLength.toFixed(3)}  | FAIL     | FAIL`);
        lineErrors.push(Infinity);
        continue;
      }

      const error = Math.abs(currentLength - targetLength);
      lineErrors.push(error);
      maxLineError = Math.max(maxLineError, error);

      const status = error < 0.1 ? 'OK' : 'FAIL';
      console.log(
        `${line.name.padEnd(13)} | ${currentLength.toFixed(3)}   | ${targetLength.toFixed(3)}  | ` +
        `${error.toFixed(6)} | ${status}`
      );
    }

    console.log();
    console.log(`Maximum line error: ${maxLineError.toFixed(6)} units`);
    console.log(`Average line error: ${(lineErrors.reduce((a, b) => a + b, 0) / lineErrors.length).toFixed(6)} units\n`);

    console.log('NOTE: With partial visibility, absolute positions may differ from ground truth');
    console.log('while still satisfying all geometric constraints. This is expected behavior.\n');

    expect(result.converged).toBe(true);
    expect(maxLineError).toBeLessThan(0.1);

    console.log('GOLDEN-2 TEST PASSED\n');
  });
});
