/**
 * GOLDEN-SCENARIO-12: Synthetic version of Scenario 12
 *
 * This test recreates scenario-12's geometry with ANALYTICALLY GENERATED image points.
 * The world point positions and camera intrinsics match scenario-12, but the image
 * coordinates are computed using the optimizer's exact projection formula.
 *
 * If this test passes with near-zero error, but the real scenario-12 fixture has
 * high error, it proves that the real image clicks don't match the assumed geometry.
 */

import { describe, it, expect } from '@jest/globals';
import { Project } from '../../entities/project';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { ImagePoint } from '../../entities/imagePoint';
import { Line } from '../../entities/line';
import { VanishingLine } from '../../entities/vanishing-line';
import { optimizeProject } from '../optimize-project';
import { V, Vec3, Vec4 } from 'scalar-autograd';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';
import { Quaternion } from '../Quaternion';

describe('GOLDEN-SCENARIO-12: Synthetic Recreation', () => {
  it('should achieve near-zero reprojection error with scenario-12 geometry and synthetic image points', () => {
    console.log('\n=== GOLDEN-SCENARIO-12: SYNTHETIC RECREATION ===\n');

    // Ground truth world points - matches scenario-12 fixture
    // Rectangle in XZ plane at y=0, with points above at y=10
    const groundTruthPositions: { name: string; xyz: [number, number, number]; locked: [number | null, number | null, number | null] }[] = [
      { name: 'WP1', xyz: [0, 0, 0], locked: [0, 0, 0] },        // Origin - FULLY LOCKED
      { name: 'WP2', xyz: [0, 0, -10], locked: [0, 0, -10] },    // -Z from origin - FULLY LOCKED
      { name: 'WP3', xyz: [10, 0, 0], locked: [10, 0, 0] },      // +X from origin - FULLY LOCKED
      { name: 'WP4', xyz: [0, 10, 0], locked: [null, null, null] },     // Above WP1 - FREE (inferred: x=0, z=0)
      { name: 'WP5', xyz: [0, 10, -10], locked: [null, null, null] },   // Above WP2 - FREE (inferred: x=0, z=-10)
      { name: 'WP6', xyz: [10, 10, 0], locked: [null, null, null] },    // Above WP3 - FREE (inferred: z=0)
    ];

    // Ground truth camera pose
    // Looking at the scene from in front (negative Z side)
    // Slightly tilted to see the 3D structure
    const cameraPosition: [number, number, number] = [5, 15, -25];

    // Camera looking toward the center of the scene
    // Create rotation from Euler angles: slight pitch down to see scene
    const pitch = 0.3; // radians - looking down
    const yaw = 0;
    const roll = 0;

    // Convert Euler to quaternion (using Quaternion class)
    const cameraRotation = Quaternion.fromEuler(pitch, yaw, roll).toArray() as [number, number, number, number];

    // Camera intrinsics - match scenario-12
    const focalLength = 1103;
    const imageWidth = 1103;
    const imageHeight = 794;
    const principalPointX = 551.5;
    const principalPointY = 397;

    console.log('GROUND TRUTH:');
    console.log(`  Camera position: [${cameraPosition.join(', ')}]`);
    console.log(`  Camera rotation (quat): [${cameraRotation.map(x => x.toFixed(4)).join(', ')}]`);
    console.log(`  Intrinsics: f=${focalLength}, pp=[${principalPointX}, ${principalPointY}], size=[${imageWidth}x${imageHeight}]`);
    console.log('\nWorld Points:');
    groundTruthPositions.forEach(p => {
      const lockStatus = p.locked.every(v => v !== null) ? 'LOCKED' : 'FREE';
      console.log(`  ${p.name}: [${p.xyz.join(', ')}] (${lockStatus})`);
    });

    // Create project
    const project = Project.create('Golden Scenario 12 Synthetic');

    // Create world points
    const worldPoints: WorldPoint[] = [];
    for (const p of groundTruthPositions) {
      const wp = WorldPoint.create(p.name, {
        lockedXyz: p.locked,
        optimizedXyz: p.xyz,
      });
      worldPoints.push(wp);
      project.addWorldPoint(wp);
    }

    // Create camera
    const camera = Viewpoint.create(
      'C3',
      'C3.png',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        position: [0, 0, 0], // Will be initialized
        rotation: [1, 0, 0, 0], // Will be initialized by VP
        isPoseLocked: false,
      }
    );
    project.addViewpoint(camera);

    // Project all world points to image using the optimizer's projection formula
    console.log('\nGENERATING SYNTHETIC IMAGE POINTS:');

    function projectPoint(worldPos: [number, number, number]): [number, number] | null {
      const worldVec = new Vec3(V.C(worldPos[0]), V.C(worldPos[1]), V.C(worldPos[2]));
      const camPosVec = new Vec3(V.C(cameraPosition[0]), V.C(cameraPosition[1]), V.C(cameraPosition[2]));
      const camRotQuat = new Vec4(
        V.C(cameraRotation[0]),
        V.C(cameraRotation[1]),
        V.C(cameraRotation[2]),
        V.C(cameraRotation[3])
      );

      const result = projectWorldPointToPixelQuaternion(
        worldVec,
        camPosVec,
        camRotQuat,
        V.C(focalLength),
        V.C(1.0),
        V.C(principalPointX),
        V.C(principalPointY),
        V.C(0),
        V.C(0), V.C(0), V.C(0),
        V.C(0), V.C(0)
      );

      if (!result) return null;
      return [result[0].data, result[1].data];
    }

    for (let i = 0; i < worldPoints.length; i++) {
      const wp = worldPoints[i];
      const worldPos = groundTruthPositions[i].xyz;
      const projected = projectPoint(worldPos);

      if (projected) {
        const [u, v] = projected;
        console.log(`  ${wp.name}: world=[${worldPos.join(', ')}] -> image=[${u.toFixed(2)}, ${v.toFixed(2)}]`);

        const ip = ImagePoint.create(wp, camera, u, v);
        project.addImagePoint(ip);
        camera.addImagePoint(ip);
        wp.addImagePoint(ip);
      } else {
        console.log(`  ${wp.name}: BEHIND CAMERA`);
      }
    }

    // Create lines with direction constraints (matching scenario-12 structure)
    // L1: WP1-WP4 vertical (y-axis)
    const line1 = Line.create('L1_vertical', worldPoints[0], worldPoints[3], {
      direction: 'vertical',
      targetLength: 10,
    });
    project.addLine(line1);

    // L2: WP4-WP5 horizontal (xz-plane)
    const line2 = Line.create('L2_horizontal', worldPoints[3], worldPoints[4], {
      direction: 'horizontal',
    });
    project.addLine(line2);

    // L3: WP5-WP2 vertical
    const line3 = Line.create('L3_vertical', worldPoints[4], worldPoints[1], {
      direction: 'vertical',
    });
    project.addLine(line3);

    // L4: WP2-WP1 z-aligned
    const line4 = Line.create('L4_z-aligned', worldPoints[1], worldPoints[0], {
      direction: 'z-aligned',
      targetLength: 10,
    });
    project.addLine(line4);

    // L5: WP1-WP3 x-aligned
    const line5 = Line.create('L5_x-aligned', worldPoints[0], worldPoints[2], {
      direction: 'x-aligned',
      targetLength: 10,
    });
    project.addLine(line5);

    // L6: WP3-WP6 vertical
    const line6 = Line.create('L6_vertical', worldPoints[2], worldPoints[5], {
      direction: 'vertical',
    });
    project.addLine(line6);

    // L7: WP6-WP4 horizontal
    const line7 = Line.create('L7_horizontal', worldPoints[5], worldPoints[3], {
      direction: 'horizontal',
    });
    project.addLine(line7);

    // Create vanishing lines for all 3 axes
    // Y-axis (vertical) lines
    const wp1_proj = projectPoint(groundTruthPositions[0].xyz)!;
    const wp2_proj = projectPoint(groundTruthPositions[1].xyz)!;
    const wp3_proj = projectPoint(groundTruthPositions[2].xyz)!;
    const wp4_proj = projectPoint(groundTruthPositions[3].xyz)!;
    const wp5_proj = projectPoint(groundTruthPositions[4].xyz)!;
    const wp6_proj = projectPoint(groundTruthPositions[5].xyz)!;

    VanishingLine.fromDto('VL_Y_1', camera, 'y',
      { u: wp1_proj[0], v: wp1_proj[1] },
      { u: wp4_proj[0], v: wp4_proj[1] }
    );
    VanishingLine.fromDto('VL_Y_2', camera, 'y',
      { u: wp3_proj[0], v: wp3_proj[1] },
      { u: wp6_proj[0], v: wp6_proj[1] }
    );

    // Z-axis lines
    VanishingLine.fromDto('VL_Z_1', camera, 'z',
      { u: wp1_proj[0], v: wp1_proj[1] },
      { u: wp2_proj[0], v: wp2_proj[1] }
    );
    VanishingLine.fromDto('VL_Z_2', camera, 'z',
      { u: wp4_proj[0], v: wp4_proj[1] },
      { u: wp5_proj[0], v: wp5_proj[1] }
    );

    // X-axis lines
    VanishingLine.fromDto('VL_X_1', camera, 'x',
      { u: wp1_proj[0], v: wp1_proj[1] },
      { u: wp3_proj[0], v: wp3_proj[1] }
    );
    VanishingLine.fromDto('VL_X_2', camera, 'x',
      { u: wp4_proj[0], v: wp4_proj[1] },
      { u: wp6_proj[0], v: wp6_proj[1] }
    );

    console.log(`\nCreated ${project.lines.size} lines and ${camera.vanishingLines.size} vanishing lines`);

    // Clear optimizedXyz from non-fully-locked points
    for (let i = 0; i < worldPoints.length; i++) {
      if (!groundTruthPositions[i].locked.every(v => v !== null)) {
        worldPoints[i].optimizedXyz = undefined;
      }
    }

    // Run optimization
    console.log('\nRUNNING OPTIMIZATION:');
    const result = optimizeProject(project, {
      autoInitializeCameras: true,
      autoInitializeWorldPoints: true,
      maxIterations: 100,
      tolerance: 1e-8,
      verbose: false,
    });

    console.log(`\nRESULTS:`);
    console.log(`  Converged: ${result.converged}`);
    console.log(`  Error: ${result.error}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Residual: ${result.residual.toFixed(6)}`);
    console.log(`  Median reprojection error: ${result.medianReprojectionError?.toFixed(4)} px`);

    // Verify results
    expect(result.error).toBeNull();
    expect(result.converged).toBe(true);

    // With perfect synthetic data, reprojection error should be near-zero
    expect(result.medianReprojectionError).toBeLessThan(0.1);

    console.log('\nPer-Point Reprojection Errors:');
    for (const ip of camera.imagePoints) {
      if (ip.lastResiduals && ip.lastResiduals.length >= 2) {
        const error = Math.sqrt(ip.lastResiduals[0]**2 + ip.lastResiduals[1]**2);
        console.log(`  ${ip.worldPoint.name}: ${error.toFixed(4)} px`);
        expect(error).toBeLessThan(0.1);
      }
    }

    console.log('\nWorld Point Reconstruction:');
    for (let i = 0; i < worldPoints.length; i++) {
      const wp = worldPoints[i];
      const gt = groundTruthPositions[i].xyz;
      const opt = wp.optimizedXyz;
      if (opt) {
        const error = Math.sqrt((opt[0]-gt[0])**2 + (opt[1]-gt[1])**2 + (opt[2]-gt[2])**2);
        console.log(`  ${wp.name}: gt=[${gt.join(', ')}], opt=[${opt.map(x=>x.toFixed(2)).join(', ')}], error=${error.toFixed(4)}`);
      }
    }

    console.log('\nCamera Position:');
    console.log(`  Ground truth: [${cameraPosition.join(', ')}]`);
    console.log(`  Optimized: [${camera.position.map(x => x.toFixed(2)).join(', ')}]`);
  });
});
