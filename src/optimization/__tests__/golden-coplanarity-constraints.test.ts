import { describe, it, expect } from '@jest/globals';
import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint';
import { optimizeProject } from '../optimize-project';
import { Vec4, V, Vec3 } from 'scalar-autograd';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';

describe('GOLDEN-4: Coplanarity Constraints', () => {
  it('should enforce coplanarity constraint for multiple planes', async () => {
    console.log('\n=== GOLDEN-4: COPLANARITY CONSTRAINTS ===\n');

    const groundTruthPositions: [number, number, number][] = [
      [0, 0, 0],      // WP0 (LOCKED, shared by Plane 1 & 3)
      [10, 0, 0],     // WP1 (Plane 1 & 3)
      [10, 10, 0],    // WP2 (Plane 1)
      [0, 10, 0],     // WP3 (Plane 1)
      [0, 0, 10],     // WP4 (Plane 2 & 3)
      [10, 0, 10],    // WP5 (Plane 2)
      [10, 10, 10],   // WP6 (Plane 2)
      [0, 10, 10],    // WP7 (Plane 2)
      [10, 0, 10],    // WP8 (duplicate of WP5, for Plane 3)
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

    console.log('World Points (3 planes):');
    console.log('  Plane 1 (XY, Z=0):  WP0, WP1, WP2, WP3');
    console.log('  Plane 2 (XY, Z=10): WP4, WP5, WP6, WP7');
    console.log('  Plane 3 (XZ, Y=0):  WP0, WP1, WP8, WP4\n');

    groundTruthPositions.forEach((pos, i) => {
      const locked = i === 0 ? ' (LOCKED)' : '';
      console.log(`  WP${i}: [${pos.join(', ')}]${locked}`);
    });
    console.log();

    const project = Project.create('Golden Test 4');

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

    console.log('CREATING COPLANARITY CONSTRAINTS:\n');

    const constraint1 = CoplanarPointsConstraint.create(
      'Plane1-Bottom',
      [worldPoints[0], worldPoints[1], worldPoints[2], worldPoints[3]],
      { tolerance: 0.1 }
    );
    project.addConstraint(constraint1);
    console.log('  C1: WP0, WP1, WP2, WP3 (bottom face, Z=0)');

    const constraint2 = CoplanarPointsConstraint.create(
      'Plane2-Top',
      [worldPoints[4], worldPoints[5], worldPoints[6], worldPoints[7]],
      { tolerance: 0.1 }
    );
    project.addConstraint(constraint2);
    console.log('  C2: WP4, WP5, WP6, WP7 (top face, Z=10)');

    const constraint3 = CoplanarPointsConstraint.create(
      'Plane3-Front',
      [worldPoints[0], worldPoints[1], worldPoints[8], worldPoints[4]],
      { tolerance: 0.1 }
    );
    project.addConstraint(constraint3);
    console.log('  C3: WP0, WP1, WP8, WP4 (front face, Y=0)\n');

    console.log('PERTURBING FREE POINTS (±1.0 units, including out-of-plane):\n');
    for (let i = 1; i < worldPoints.length; i++) {
      const wp = worldPoints[i];
      const gt = groundTruthPositions[i];
      wp.optimizedXyz = [
        gt[0] + (Math.random() - 0.5) * 2.0,
        gt[1] + (Math.random() - 0.5) * 2.0,
        gt[2] + (Math.random() - 0.5) * 2.0,
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

    console.log('VERIFICATION - COPLANARITY ERRORS:\n');
    console.log('Constraint   | Points           | Coplanarity Error | Status');
    console.log('-------------|------------------|-------------------|-------');

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

    const constraints = [
      { name: 'Plane1-Bottom', points: [worldPoints[0], worldPoints[1], worldPoints[2], worldPoints[3]] },
      { name: 'Plane2-Top', points: [worldPoints[4], worldPoints[5], worldPoints[6], worldPoints[7]] },
      { name: 'Plane3-Front', points: [worldPoints[0], worldPoints[1], worldPoints[8], worldPoints[4]] },
    ];

    let maxCoplanarityError = 0;
    const coplanarityErrors: number[] = [];

    for (const constraint of constraints) {
      const error = computeCoplanarityError(constraint.points);
      coplanarityErrors.push(error);
      maxCoplanarityError = Math.max(maxCoplanarityError, error);

      const status = error < 0.1 ? 'OK' : 'FAIL';
      const pointNames = constraint.points.map(p => p.name).join(', ');
      console.log(
        `${constraint.name.padEnd(12)} | ${pointNames.padEnd(16)} | ${error.toFixed(6).padEnd(17)} | ${status}`
      );
    }

    console.log();
    console.log(`Maximum coplanarity error: ${maxCoplanarityError.toFixed(6)} units`);
    console.log(`Average coplanarity error: ${(coplanarityErrors.reduce((a, b) => a + b, 0) / coplanarityErrors.length).toFixed(6)} units\n`);

    expect(result.converged).toBe(true);
    expect(maxCoplanarityError).toBeLessThan(0.1);

    console.log('GOLDEN-4 TEST PASSED\n');
  });
});
