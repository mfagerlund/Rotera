import { describe, it, expect } from '@jest/globals';
import { initializeCamerasWithEssentialMatrix } from '../essential-matrix';
import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';
import { V, Vec3, Vec4 } from 'scalar-autograd';

describe('7-Point Essential Matrix Algorithm', () => {
  const focalLength = 1000;
  const imageWidth = 1000;
  const imageHeight = 1000;

  function createCamera(name: string): Viewpoint {
    return Viewpoint.create(
      name,
      `${name}.jpg`,
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
  }

  function projectPoint(
    worldXyz: [number, number, number],
    cameraPos: [number, number, number],
    cameraRot: [number, number, number, number]
  ): [number, number] | null {
    const worldVec = new Vec3(V.C(worldXyz[0]), V.C(worldXyz[1]), V.C(worldXyz[2]));
    const camPos = new Vec3(V.C(cameraPos[0]), V.C(cameraPos[1]), V.C(cameraPos[2]));
    const camRot = new Vec4(V.C(cameraRot[0]), V.C(cameraRot[1]), V.C(cameraRot[2]), V.C(cameraRot[3]));

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

    return projection ? [projection[0].data, projection[1].data] : null;
  }

  it('should initialize two cameras from exactly 7 point correspondences', () => {
    console.log('\n=== 7-Point Test: Exact 7 Points ===\n');

    const project = Project.create('7-Point Test');

    const groundTruthCamera1 = {
      position: [0, 0, 0] as [number, number, number],
      rotation: [1, 0, 0, 0] as [number, number, number, number]
    };

    const groundTruthCamera2 = {
      position: [10, 0, 0] as [number, number, number],
      rotation: [1, 0, 0, 0] as [number, number, number, number]
    };

    const groundTruthPoints: [number, number, number][] = [
      [5, 0, 10],
      [0, 5, 10],
      [10, 5, 10],
      [5, -5, 10],
      [5, 5, 15],
      [2, 2, 8],
      [8, -2, 12]
    ];

    console.log('Ground Truth Cameras:');
    console.log(`  Camera1: position=[${groundTruthCamera1.position.join(', ')}]`);
    console.log(`  Camera2: position=[${groundTruthCamera2.position.join(', ')}]`);
    console.log(`\nGround Truth Points (${groundTruthPoints.length} points):`);
    groundTruthPoints.forEach((pt, i) => {
      console.log(`  P${i}: [${pt.join(', ')}]`);
    });

    const camera1 = createCamera('Camera1');
    const camera2 = createCamera('Camera2');
    project.addViewpoint(camera1);
    project.addViewpoint(camera2);

    for (let i = 0; i < groundTruthPoints.length; i++) {
      const wp = WorldPoint.create(`P${i}`, {
        lockedXyz: [null, null, null],
        optimizedXyz: undefined
      });
      project.addWorldPoint(wp);

      const proj1 = projectPoint(groundTruthPoints[i], groundTruthCamera1.position, groundTruthCamera1.rotation);
      const proj2 = projectPoint(groundTruthPoints[i], groundTruthCamera2.position, groundTruthCamera2.rotation);

      expect(proj1).not.toBeNull();
      expect(proj2).not.toBeNull();

      const ip1 = ImagePoint.create(wp, camera1, proj1![0], proj1![1]);
      const ip2 = ImagePoint.create(wp, camera2, proj2![0], proj2![1]);

      project.addImagePoint(ip1);
      project.addImagePoint(ip2);
      camera1.addImagePoint(ip1);
      camera2.addImagePoint(ip2);
      wp.addImagePoint(ip1);
      wp.addImagePoint(ip2);

      console.log(`  P${i}: cam1=[${proj1![0].toFixed(2)}, ${proj1![1].toFixed(2)}], cam2=[${proj2![0].toFixed(2)}, ${proj2![1].toFixed(2)}]`);
    }

    console.log('\nInitializing cameras with Essential Matrix (7-point algorithm)...');
    const result = initializeCamerasWithEssentialMatrix(camera1, camera2, 10.0);

    console.log(`\nResult: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    if (!result.success) {
      console.log(`Error: ${result.error}`);
    }

    expect(result.success).toBe(true);

    console.log('\nEstimated Camera Poses:');
    console.log(`  Camera1: position=[${camera1.position.join(', ')}], rotation=[${camera1.rotation.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`  Camera2: position=[${camera2.position.map(v => v.toFixed(3)).join(', ')}], rotation=[${camera2.rotation.map(v => v.toFixed(3)).join(', ')}]`);

    expect(camera1.position).toEqual([0, 0, 0]);
    expect(camera1.rotation).toEqual([1, 0, 0, 0]);

    const camera2PosNorm = Math.sqrt(
      camera2.position[0] * camera2.position[0] +
      camera2.position[1] * camera2.position[1] +
      camera2.position[2] * camera2.position[2]
    );
    console.log(`  Camera2 position norm: ${camera2PosNorm.toFixed(3)} (expected: 10.0)`);

    expect(camera2PosNorm).toBeCloseTo(10.0, 0);

    console.log('\n=== Test Passed ===\n');
  });

  it('should handle 8+ points using 8-point algorithm', () => {
    console.log('\n=== 7-Point Test: 8+ Points (fallback to 8-point) ===\n');

    const project = Project.create('8-Point Fallback Test');

    const groundTruthCamera1 = {
      position: [0, 0, 0] as [number, number, number],
      rotation: [1, 0, 0, 0] as [number, number, number, number]
    };

    const groundTruthCamera2 = {
      position: [15, 5, 0] as [number, number, number],
      rotation: [0.9962, 0, 0.0872, 0] as [number, number, number, number]
    };

    const groundTruthPoints: [number, number, number][] = [
      [5, 0, 20],
      [0, 5, 20],
      [10, 5, 20],
      [5, -5, 20],
      [5, 5, 25],
      [2, 2, 18],
      [8, -2, 22],
      [3, 7, 19],
      [7, 3, 21]
    ];

    console.log('Ground Truth Cameras:');
    console.log(`  Camera1: position=[${groundTruthCamera1.position.join(', ')}]`);
    console.log(`  Camera2: position=[${groundTruthCamera2.position.join(', ')}]`);
    console.log(`\nUsing ${groundTruthPoints.length} points (should use 8-point algorithm)`);

    const camera1 = createCamera('Camera1');
    const camera2 = createCamera('Camera2');
    project.addViewpoint(camera1);
    project.addViewpoint(camera2);

    for (let i = 0; i < groundTruthPoints.length; i++) {
      const wp = WorldPoint.create(`P${i}`, {
        lockedXyz: [null, null, null],
        optimizedXyz: undefined
      });
      project.addWorldPoint(wp);

      const proj1 = projectPoint(groundTruthPoints[i], groundTruthCamera1.position, groundTruthCamera1.rotation);
      const proj2 = projectPoint(groundTruthPoints[i], groundTruthCamera2.position, groundTruthCamera2.rotation);

      expect(proj1).not.toBeNull();
      expect(proj2).not.toBeNull();

      const ip1 = ImagePoint.create(wp, camera1, proj1![0], proj1![1]);
      const ip2 = ImagePoint.create(wp, camera2, proj2![0], proj2![1]);

      project.addImagePoint(ip1);
      project.addImagePoint(ip2);
      camera1.addImagePoint(ip1);
      camera2.addImagePoint(ip2);
      wp.addImagePoint(ip1);
      wp.addImagePoint(ip2);
    }

    const baseline = Math.sqrt(15 * 15 + 5 * 5);

    console.log('\nInitializing cameras with Essential Matrix (8-point algorithm)...');
    const result = initializeCamerasWithEssentialMatrix(camera1, camera2, baseline);

    console.log(`\nResult: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    if (!result.success) {
      console.log(`Error: ${result.error}`);
    }

    expect(result.success).toBe(true);

    const camera2PosNorm = Math.sqrt(
      camera2.position[0] * camera2.position[0] +
      camera2.position[1] * camera2.position[1] +
      camera2.position[2] * camera2.position[2]
    );
    console.log(`  Camera2 position norm: ${camera2PosNorm.toFixed(3)} (expected: ${baseline.toFixed(3)})`);

    expect(camera2PosNorm).toBeCloseTo(baseline, 0);

    console.log('\n=== Test Passed ===\n');
  });

  it('should fail gracefully with fewer than 7 points', () => {
    console.log('\n=== 7-Point Test: Insufficient Points ===\n');

    const project = Project.create('Insufficient Points Test');

    const camera1 = createCamera('Camera1');
    const camera2 = createCamera('Camera2');
    project.addViewpoint(camera1);
    project.addViewpoint(camera2);

    for (let i = 0; i < 6; i++) {
      const wp = WorldPoint.create(`P${i}`, {
        lockedXyz: [null, null, null],
        optimizedXyz: undefined
      });
      project.addWorldPoint(wp);

      const ip1 = ImagePoint.create(wp, camera1, 500 + i * 10, 500);
      const ip2 = ImagePoint.create(wp, camera2, 500 + i * 10, 500 + i * 5);

      project.addImagePoint(ip1);
      project.addImagePoint(ip2);
      camera1.addImagePoint(ip1);
      camera2.addImagePoint(ip2);
      wp.addImagePoint(ip1);
      wp.addImagePoint(ip2);
    }

    console.log('Testing with only 6 points...');
    const result = initializeCamerasWithEssentialMatrix(camera1, camera2, 10.0);

    console.log(`Result: ${result.success ? 'SUCCESS' : 'FAILED (expected)'}`);
    if (!result.success) {
      console.log(`Error: ${result.error}`);
    }

    expect(result.success).toBe(false);
    expect(result.error).toContain('7');

    console.log('\n=== Test Passed ===\n');
  });

  it('should block optimization when insufficient correspondences for initial cameras', () => {
    console.log('\n=== 7-Point Test: Block Optimization with Insufficient Points ===\n');

    const project = Project.create('Block Test');
    const { optimizeProject } = require('../optimize-project');

    const camera1 = createCamera('Camera1');
    const camera2 = createCamera('Camera2');
    project.addViewpoint(camera1);
    project.addViewpoint(camera2);

    for (let i = 0; i < 5; i++) {
      const wp = WorldPoint.create(`P${i}`, {
        lockedXyz: [null, null, null],
        optimizedXyz: undefined
      });
      project.addWorldPoint(wp);

      const ip1 = ImagePoint.create(wp, camera1, 500 + i * 10, 500);
      const ip2 = ImagePoint.create(wp, camera2, 500 + i * 10, 500 + i * 5);

      project.addImagePoint(ip1);
      project.addImagePoint(ip2);
      camera1.addImagePoint(ip1);
      camera2.addImagePoint(ip2);
      wp.addImagePoint(ip1);
      wp.addImagePoint(ip2);
    }

    console.log('Testing optimization with only 5 points (should throw)...');

    expect(() => {
      optimizeProject(project, {
        autoInitializeCameras: true,
        autoInitializeWorldPoints: true,
        maxIterations: 10,
        verbose: false
      });
    }).toThrow(/No fully locked world points found/);

    console.log('Optimization correctly blocked due to insufficient correspondences');
    console.log('\n=== Test Passed ===\n');
  });
});
