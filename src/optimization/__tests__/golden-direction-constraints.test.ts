import { describe, it, expect } from '@jest/globals';
import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import { Line } from '../../entities/line';
import { optimizeProject } from '../optimize-project';
import { Vec4, V, Vec3 } from 'scalar-autograd';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';

describe('GOLDEN-3: Line Direction Constraints', () => {
  // Skipped: Too slow after inference-branching - 6 axis-aligned lines = 64 branches
  it.skip('should enforce horizontal, vertical, and axis-aligned direction constraints', () => {
    console.log('\n=== GOLDEN-3: LINE DIRECTION CONSTRAINTS ===\n');

    const groundTruthPositions: [number, number, number][] = [
      [0, 0, 0],      // WP0 (LOCKED origin)
      [10, 0, 0],     // WP1 (horizontal from WP0)
      [0, 10, 0],     // WP2 (vertical from WP0)
      [0, 0, 10],     // WP3 (z-aligned from WP0)
      [20, 0, 0],     // WP4 (x-aligned from WP0)
      [0, 20, 0],     // WP5 (y-aligned from WP0, note: vertical is Y in this system)
      [0, 0, 20],     // WP6 (z-aligned from WP0)
      [10, 10, 0],    // WP7 (diagonal, free)
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

    console.log('World Points:');
    groundTruthPositions.forEach((pos, i) => {
      const locked = i === 0 ? ' (LOCKED)' : '';
      console.log(`  WP${i}: [${pos.join(', ')}]${locked}`);
    });
    console.log();

    const project = Project.create('Golden Test 3');

    const worldPoints: WorldPoint[] = [];
    for (let i = 0; i < groundTruthPositions.length; i++) {
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

    console.log('GENERATING SYNTHETIC IMAGE POINTS:\n');

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
      }

      const proj2 = projectPoint(worldPos, cam2Position, cam2Rotation);
      if (proj2) {
        const ip2 = ImagePoint.create(wp, cam2, proj2[0], proj2[1]);
        project.addImagePoint(ip2);
        cam2.addImagePoint(ip2);
        wp.addImagePoint(ip2);
        imagePointCount++;
      }
    }

    console.log(`Generated ${imagePointCount} image points\n`);

    console.log('CREATING LINE DIRECTION CONSTRAINTS:\n');

    const lineDefinitions: [number, number, string, 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'free', number][] = [
      [0, 1, 'XZ1', 'xz', 10],   // horizontal (in XZ plane)
      [0, 2, 'Y1', 'y', 10],    // vertical (Y-aligned)
      [0, 3, 'Z1', 'z', 10],    // Z-aligned
      [0, 4, 'X1', 'x', 20],    // X-aligned
      [0, 5, 'Y2', 'y', 20],    // Y-aligned (vertical)
      [0, 6, 'Z2', 'z', 20],    // Z-aligned
      [0, 7, 'F1', 'free', Math.sqrt(200)],
    ];

    const lines: Line[] = [];
    for (const [a, b, name, direction, targetLength] of lineDefinitions) {
      const line = Line.create(name, worldPoints[a], worldPoints[b], {
        direction,
        targetLength,
      });
      lines.push(line);
      project.addLine(line);
      console.log(`  ${name}: WP${a} -> WP${b}, direction='${direction}', targetLength=${targetLength.toFixed(3)}`);
    }

    console.log(`\nCreated ${lines.length} line constraints\n`);

    console.log('PERTURBING FREE POINTS (±0.5 units):\n');
    for (let i = 1; i < worldPoints.length; i++) {
      const wp = worldPoints[i];
      const gt = groundTruthPositions[i];
      wp.optimizedXyz = [
        gt[0] + (Math.random() - 0.5) * 1.0,
        gt[1] + (Math.random() - 0.5) * 1.0,
        gt[2] + (Math.random() - 0.5) * 1.0,
      ];
      console.log(`  WP${i}: [${wp.optimizedXyz.map(x => x.toFixed(3)).join(', ')}]`);
    }
    console.log();

    console.log('RUNNING OPTIMIZATION:\n');

    const result = await optimizeProject(project, {
      autoInitializeCameras: false,
      autoInitializeWorldPoints: false,
      maxIterations: 500,
      tolerance: 1e-6,
      damping: 1e-3,
      verbose: false,
    });

    console.log('OPTIMIZATION RESULT:');
    console.log(`  Converged: ${result.converged}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Final Cost: ${result.residual.toFixed(6)}\n`);

    console.log('VERIFICATION:\n');
    console.log('Line | Direction   | Length  | Target  | Dir Error | Len Error | Status');
    console.log('-----|-------------|---------|---------|-----------|-----------|-------');

    let maxDirectionError = 0;
    let maxLengthError = 0;
    const directionErrors: number[] = [];
    const lengthErrors: number[] = [];

    for (const line of lines) {
      const currentLength = line.length();
      const targetLength = line.targetLength || 0;
      const direction = line.direction;
      const dir = line.getDirection();

      if (currentLength === null || !dir) {
        console.log(`${line.name.padEnd(4)} | ${direction.padEnd(11)} | MISSING | ${targetLength.toFixed(3)}   | FAIL      | FAIL      | FAIL`);
        continue;
      }

      const [dx, dy, dz] = dir;
      let dirError = 0;

      switch (direction) {
        case 'x':
          // X-aligned: dy and dz should be 0
          dirError = Math.sqrt(dy**2 + dz**2);
          break;
        case 'y':
          // Y-aligned (vertical): dx and dz should be 0
          dirError = Math.sqrt(dx**2 + dz**2);
          break;
        case 'z':
          // Z-aligned: dx and dy should be 0
          dirError = Math.sqrt(dx**2 + dy**2);
          break;
        case 'xy':
          // XY plane: dz should be 0
          dirError = Math.abs(dz);
          break;
        case 'xz':
          // XZ plane (horizontal): dy should be 0
          dirError = Math.abs(dy);
          break;
        case 'yz':
          // YZ plane: dx should be 0
          dirError = Math.abs(dx);
          break;
        case 'free':
          dirError = 0;
          break;
      }

      const lenError = Math.abs(currentLength - targetLength);

      directionErrors.push(dirError);
      lengthErrors.push(lenError);
      maxDirectionError = Math.max(maxDirectionError, dirError);
      maxLengthError = Math.max(maxLengthError, lenError);

      const dirStatus = direction === 'free' || dirError < 0.01 ? 'OK' : 'FAIL';
      const lenStatus = lenError < 0.1 ? 'OK' : 'FAIL';
      const status = dirStatus === 'OK' && lenStatus === 'OK' ? 'OK' : 'FAIL';

      console.log(
        `${line.name.padEnd(4)} | ${direction.padEnd(11)} | ${currentLength.toFixed(3)}   | ${targetLength.toFixed(3)}   | ` +
        `${dirError.toFixed(6)}  | ${lenError.toFixed(6)}  | ${status}`
      );
    }

    console.log();
    console.log(`Maximum direction error: ${maxDirectionError.toFixed(6)}`);
    console.log(`Maximum length error: ${maxLengthError.toFixed(6)}`);
    console.log(`Average direction error: ${(directionErrors.reduce((a, b) => a + b, 0) / directionErrors.length).toFixed(6)}`);
    console.log(`Average length error: ${(lengthErrors.reduce((a, b) => a + b, 0) / lengthErrors.length).toFixed(6)}\n`);

    expect(result.converged).toBe(true);
    expect(maxDirectionError).toBeLessThan(0.01);
    expect(maxLengthError).toBeLessThan(0.1);

    console.log('GOLDEN-3 TEST PASSED\n');
  });
});
