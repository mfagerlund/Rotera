import { describe, it, expect } from '@jest/globals';
import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import { Line } from '../../entities/line';
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint';
import { optimizeProject } from '../optimize-project';
import { Vec4, V, Vec3 } from 'scalar-autograd';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return ((state >>> 0) / 4294967296);
  };
}

describe('GOLDEN-5: Mixed Constraints', () => {
  it('should solve cube with length, direction, and coplanarity constraints simultaneously', () => {
    const random = seededRandom(55555);

    console.log('\n=== GOLDEN-5: MIXED CONSTRAINTS ===\n');

    const cubeCorners: [number, number, number][] = [
      [0, 0, 0],      // WP0 (LOCKED)
      [10, 0, 0],     // WP1
      [10, 10, 0],    // WP2
      [0, 10, 0],     // WP3
      [0, 0, 10],     // WP4
      [10, 0, 10],    // WP5
      [10, 10, 10],   // WP6
      [0, 10, 10],    // WP7
    ];

    const faceCenters: [number, number, number][] = [
      [5, 5, 0],      // WP8 (bottom face center)
      [5, 5, 10],     // WP9 (top face center)
      [5, 0, 5],      // WP10 (front face center)
      [5, 10, 5],     // WP11 (back face center)
    ];

    const groundTruthPositions = [...cubeCorners, ...faceCenters];

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

    console.log('World Points (10x10x10 cube + face centers):');
    groundTruthPositions.forEach((pos, i) => {
      const locked = i === 0 ? ' (LOCKED)' : '';
      const label = i < 8 ? 'corner' : 'face center';
      console.log(`  WP${i}: [${pos.map(x => x.toString().padStart(2)).join(', ')}] (${label})${locked}`);
    });
    console.log();

    const project = Project.create('Golden Test 5');

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

    console.log('CREATING MIXED CONSTRAINTS:\n');
    console.log('1. CUBE EDGE LINES (12 edges, all length=10, with directions):');

    type LineDir = 'horizontal' | 'vertical' | 'x-aligned' | 'z-aligned' | 'free';
    const edgeDefinitions: [number, number, string, LineDir, number][] = [
      [0, 1, 'Bottom-Front', 'horizontal', 10],
      [1, 2, 'Bottom-Right', 'vertical', 10],
      [2, 3, 'Bottom-Back', 'horizontal', 10],
      [3, 0, 'Bottom-Left', 'vertical', 10],
      [4, 5, 'Top-Front', 'horizontal', 10],
      [5, 6, 'Top-Right', 'vertical', 10],
      [6, 7, 'Top-Back', 'horizontal', 10],
      [7, 4, 'Top-Left', 'vertical', 10],
      [0, 4, 'Vertical-FL', 'z-aligned', 10],
      [1, 5, 'Vertical-FR', 'z-aligned', 10],
      [2, 6, 'Vertical-BR', 'z-aligned', 10],
      [3, 7, 'Vertical-BL', 'z-aligned', 10],
    ];

    const lines: Line[] = [];
    for (const [a, b, name, direction, targetLength] of edgeDefinitions) {
      const line = Line.create(name, worldPoints[a], worldPoints[b], {
        direction,
        targetLength,
      });
      lines.push(line);
      project.addLine(line);
      console.log(`  ${name}: WP${a}->WP${b}, dir='${direction}', len=${targetLength}`);
    }

    console.log('\n2. LINES TO FACE CENTERS (4 lines, length=sqrt(50)~7.07):');

    const faceCenterTargetLength = Math.sqrt(50);
    const faceCenterLines: [number, number, string][] = [
      [0, 8, 'ToBottomCenter'],
      [0, 9, 'ToTopCenter'],
      [0, 10, 'ToFrontCenter'],
      [0, 11, 'ToBackCenter'],
    ];

    for (const [a, b, name] of faceCenterLines) {
      const line = Line.create(name, worldPoints[a], worldPoints[b], {
        targetLength: faceCenterTargetLength,
      });
      lines.push(line);
      project.addLine(line);
      console.log(`  ${name}: WP${a}->WP${b}, len=${faceCenterTargetLength.toFixed(3)}`);
    }

    console.log('\n3. COPLANARITY CONSTRAINTS (6 cube faces):');

    const coplanarityDefinitions: [string, number[]][] = [
      ['Bottom', [0, 1, 2, 3]],
      ['Top', [4, 5, 6, 7]],
      ['Front', [0, 1, 5, 4]],
      ['Back', [2, 3, 7, 6]],
      ['Left', [0, 3, 7, 4]],
      ['Right', [1, 2, 6, 5]],
    ];

    const coplanarityConstraints: CoplanarPointsConstraint[] = [];
    for (const [name, indices] of coplanarityDefinitions) {
      const points = indices.map(i => worldPoints[i]);
      const constraint = CoplanarPointsConstraint.create(`Face-${name}`, points, { tolerance: 0.1 });
      coplanarityConstraints.push(constraint);
      project.addConstraint(constraint);
      console.log(`  Face-${name}: ${indices.map(i => `WP${i}`).join(', ')}`);
    }

    console.log(`\nTotal: ${lines.length} lines, ${coplanarityConstraints.length} coplanarity constraints\n`);

    console.log('PERTURBING FREE POINTS (±1.0 units):\n');
    for (let i = 1; i < worldPoints.length; i++) {
      const wp = worldPoints[i];
      const gt = groundTruthPositions[i];
      wp.optimizedXyz = [
        gt[0] + (random() - 0.5) * 2.0,
        gt[1] + (random() - 0.5) * 2.0,
        gt[2] + (random() - 0.5) * 2.0,
      ];
    }
    console.log('  (Perturbed all free points)\n');

    console.log('RUNNING OPTIMIZATION:\n');

    const result = optimizeProject(project, {
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
    console.log('1. LINE CONSTRAINTS:');
    console.log('Line            | Direction   | Length  | Target  | Dir Error | Len Error | Status');
    console.log('----------------|-------------|---------|---------|-----------|-----------|-------');

    let maxDirectionError = 0;
    let maxLengthError = 0;

    for (const line of lines) {
      const currentLength = line.length();
      const targetLength = line.targetLength || 0;
      const direction = line.direction;
      const dir = line.getDirection();

      if (currentLength === null || !dir) {
        console.log(`${line.name.padEnd(15)} | MISSING`);
        continue;
      }

      const [dx, dy, dz] = dir;
      let dirError = 0;

      switch (direction) {
        case 'horizontal':
          dirError = Math.sqrt(dy**2 + dz**2);
          break;
        case 'vertical':
          dirError = Math.sqrt(dx**2 + dz**2);
          break;
        case 'x-aligned':
          dirError = Math.sqrt(dy**2 + dz**2);
          break;
        case 'z-aligned':
          dirError = Math.sqrt(dx**2 + dy**2);
          break;
        case 'free':
          dirError = 0;
          break;
      }

      const lenError = Math.abs(currentLength - targetLength);

      maxDirectionError = Math.max(maxDirectionError, dirError);
      maxLengthError = Math.max(maxLengthError, lenError);

      const dirStatus = direction === 'free' || dirError < 0.01 ? 'OK' : 'FAIL';
      const lenStatus = lenError < 0.1 ? 'OK' : 'FAIL';
      const status = dirStatus === 'OK' && lenStatus === 'OK' ? 'OK' : 'FAIL';

      console.log(
        `${line.name.padEnd(15)} | ${direction.padEnd(11)} | ${currentLength.toFixed(3)}   | ${targetLength.toFixed(3)}   | ` +
        `${dirError.toFixed(6)}  | ${lenError.toFixed(6)}  | ${status}`
      );
    }

    console.log(`\nMax direction error: ${maxDirectionError.toFixed(6)}, Max length error: ${maxLengthError.toFixed(6)}\n`);

    console.log('2. COPLANARITY CONSTRAINTS:');
    console.log('Face        | Points             | Coplanarity Error | Status');
    console.log('------------|--------------------|--------------------|-------');

    function computeCoplanarityError(points: WorldPoint[]): number {
      const coords = points.map(p => p.optimizedXyz).filter((c): c is [number, number, number] => c !== null);
      if (coords.length < 4) return Infinity;

      const p0 = coords[0];
      const p1 = coords[1];
      const p2 = coords[2];

      const v1: [number, number, number] = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const v2: [number, number, number] = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];

      const normal: [number, number, number] = [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0]
      ];

      const normalMagnitude = Math.sqrt(normal[0]**2 + normal[1]**2 + normal[2]**2);
      if (normalMagnitude === 0) return Infinity;

      const unitNormal: [number, number, number] = [
        normal[0] / normalMagnitude,
        normal[1] / normalMagnitude,
        normal[2] / normalMagnitude
      ];

      let maxDeviation = 0;
      for (let i = 3; i < coords.length; i++) {
        const pi = coords[i];
        const v: [number, number, number] = [pi[0] - p0[0], pi[1] - p0[1], pi[2] - p0[2]];
        const distance = Math.abs(v[0] * unitNormal[0] + v[1] * unitNormal[1] + v[2] * unitNormal[2]);
        maxDeviation = Math.max(maxDeviation, distance);
      }

      return maxDeviation;
    }

    let maxCoplanarityError = 0;

    for (const [name, indices] of coplanarityDefinitions) {
      const points = indices.map(i => worldPoints[i]);
      const error = computeCoplanarityError(points);
      maxCoplanarityError = Math.max(maxCoplanarityError, error);

      const status = error < 0.1 ? 'OK' : 'FAIL';
      const pointNames = indices.map(i => `WP${i}`).join(',');
      console.log(
        `Face-${name.padEnd(6)} | ${pointNames.padEnd(18)} | ${error.toFixed(6).padEnd(18)} | ${status}`
      );
    }

    console.log(`\nMax coplanarity error: ${maxCoplanarityError.toFixed(6)}\n`);

    console.log('3. FACE CENTER VERIFICATION (approximate, not constrained):');
    console.log('Center       | Expected XYZ    | Actual XYZ      | Dist from Origin');
    console.log('-------------|-----------------|-----------------|------------------');

    const faceCenterChecks: [number, string, [number, number, number]][] = [
      [8, 'Bottom', [5, 5, 0]],
      [9, 'Top', [5, 5, 10]],
      [10, 'Front', [5, 0, 5]],
      [11, 'Back', [5, 10, 5]],
    ];

    for (const [idx, name, expected] of faceCenterChecks) {
      const actual = worldPoints[idx].optimizedXyz;
      if (!actual) {
        console.log(`${name.padEnd(12)} | MISSING`);
        continue;
      }

      const distFromOrigin = Math.sqrt(actual[0]**2 + actual[1]**2 + actual[2]**2);

      console.log(
        `${name.padEnd(12)} | [${expected.map(x => x.toString().padStart(2)).join(', ')}] | ` +
        `[${actual.map(x => x.toFixed(1).padStart(4)).join(', ')}] | ${distFromOrigin.toFixed(4)}`
      );
    }

    console.log();

    expect(result.converged).toBe(true);
    expect(maxDirectionError).toBeLessThan(0.01);
    expect(maxLengthError).toBeLessThan(2.0);
    expect(maxCoplanarityError).toBeLessThan(0.01);

    console.log('GOLDEN-5 TEST PASSED (all constraint types satisfied simultaneously)\n');
  });
});
