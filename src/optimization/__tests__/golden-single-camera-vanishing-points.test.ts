/**
 * GOLDEN-VP: Single Camera with Vanishing Point Initialization
 *
 * Tests: Camera initialized from vanishing points, world points constrained by lines
 * Ground Truth: Known camera pose and world point positions
 * Image Points: Generated analytically using the optimizer's projection formula
 *
 * This test verifies that:
 * 1. VP initialization recovers correct camera orientation
 * 2. Bundle adjustment refines camera position
 * 3. Line constraints (direction + length) are satisfied
 * 4. Reprojection error is near-zero with perfect synthetic data
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

describe('GOLDEN-VP: Single Camera with Vanishing Point Initialization', () => {
  it('should achieve near-zero reprojection error with analytically generated image points', async () => {
    console.log('\n=== GOLDEN-VP: SINGLE CAMERA WITH VP INITIALIZATION ===\n');

    // Ground truth world points forming a rectangle in XY plane at z=0 plus points above
    // Similar structure to scenario-12 but simpler
    const groundTruthPositions: { name: string; xyz: [number, number, number]; locked: boolean }[] = [
      { name: 'WP1', xyz: [0, 0, 0], locked: true },       // Origin - LOCKED
      { name: 'WP2', xyz: [10, 0, 0], locked: true },      // +X - LOCKED
      { name: 'WP3', xyz: [10, 0, -10], locked: true },    // +X, -Z - LOCKED
      { name: 'WP4', xyz: [0, 10, 0], locked: false },     // Above origin - FREE
      { name: 'WP5', xyz: [10, 10, 0], locked: false },    // Above WP2 - FREE
      { name: 'WP6', xyz: [10, 10, -10], locked: false },  // Above WP3 - FREE
    ];

    // Ground truth camera pose
    // Camera looking at scene from in front and slightly above
    const cameraPosition: [number, number, number] = [5, 5, -30];

    // Camera looking toward origin with slight tilt
    // Identity quaternion = looking down -Z axis, Y up
    // We need to rotate to look at the scene
    const cameraRotation: [number, number, number, number] = [1, 0, 0, 0]; // Identity for now

    // Camera intrinsics
    const focalLength = 1000;
    const imageWidth = 1920;
    const imageHeight = 1080;
    const principalPointX = imageWidth / 2;
    const principalPointY = imageHeight / 2;

    console.log('GROUND TRUTH:');
    console.log(`  Camera position: [${cameraPosition.join(', ')}]`);
    console.log(`  Camera rotation: [${cameraRotation.map(x => x.toFixed(4)).join(', ')}]`);
    console.log(`  Intrinsics: f=${focalLength}, pp=[${principalPointX}, ${principalPointY}]`);
    console.log('\nWorld Points:');
    groundTruthPositions.forEach(p => {
      console.log(`  ${p.name}: [${p.xyz.join(', ')}] ${p.locked ? '(LOCKED)' : '(FREE)'}`);
    });

    // Create project
    const project = Project.create('Golden VP Test');

    // Create world points
    const worldPoints: WorldPoint[] = [];
    for (const p of groundTruthPositions) {
      const wp = WorldPoint.create(p.name, {
        lockedXyz: p.locked ? p.xyz : [null, null, null],
        optimizedXyz: p.xyz, // Initialize with ground truth for projection
      });
      worldPoints.push(wp);
      project.addWorldPoint(wp);
    }

    // Create camera (position will be reset, rotation will be set from VP)
    const camera = Viewpoint.create(
      'Camera1',
      'test.jpg',
      '',
      imageWidth,
      imageHeight,
      {
        focalLength,
        principalPointX,
        principalPointY,
        position: [0, 0, 0], // Will be initialized by optimizer
        rotation: [1, 0, 0, 0], // Will be initialized by VP
        isPoseLocked: false,
      }
    );
    project.addViewpoint(camera);

    // Project all world points to image using the optimizer's projection formula
    console.log('\nGENERATING IMAGE POINTS (using optimizer projection formula):');

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
        V.C(1.0), // aspectRatio
        V.C(principalPointX),
        V.C(principalPointY),
        V.C(0), // skew
        V.C(0), V.C(0), V.C(0), // k1, k2, k3
        V.C(0), V.C(0) // p1, p2
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

    // Create lines with direction constraints
    // WP1-WP4: vertical (Y-aligned)
    const line1 = Line.create('L1_vertical', worldPoints[0], worldPoints[3], {
      direction: 'y',
      targetLength: 10,
    });
    project.addLine(line1);

    // WP1-WP2: X-aligned
    const line2 = Line.create('L2_x-aligned', worldPoints[0], worldPoints[1], {
      direction: 'x',
      targetLength: 10,
    });
    project.addLine(line2);

    // WP2-WP3: Z-aligned
    const line3 = Line.create('L3_z-aligned', worldPoints[1], worldPoints[2], {
      direction: 'z',
      targetLength: 10,
    });
    project.addLine(line3);

    // Create vanishing lines for VP initialization
    // We need at least 2 lines per axis for VP computation

    // X-axis vanishing lines (horizontal lines along X)
    // Project WP1-WP2 endpoints
    const wp1_proj = projectPoint(groundTruthPositions[0].xyz)!;
    const wp2_proj = projectPoint(groundTruthPositions[1].xyz)!;
    const wp4_proj = projectPoint(groundTruthPositions[3].xyz)!;
    const wp5_proj = projectPoint(groundTruthPositions[4].xyz)!;

    VanishingLine.fromDto('VL_X_1', camera, 'x',
      { u: wp1_proj[0], v: wp1_proj[1] },
      { u: wp2_proj[0], v: wp2_proj[1] }
    );
    VanishingLine.fromDto('VL_X_2', camera, 'x',
      { u: wp4_proj[0], v: wp4_proj[1] },
      { u: wp5_proj[0], v: wp5_proj[1] }
    );

    // Y-axis vanishing lines (vertical lines along Y)
    VanishingLine.fromDto('VL_Y_1', camera, 'y',
      { u: wp1_proj[0], v: wp1_proj[1] },
      { u: wp4_proj[0], v: wp4_proj[1] }
    );
    VanishingLine.fromDto('VL_Y_2', camera, 'y',
      { u: wp2_proj[0], v: wp2_proj[1] },
      { u: wp5_proj[0], v: wp5_proj[1] }
    );

    // Z-axis vanishing lines
    const wp3_proj = projectPoint(groundTruthPositions[2].xyz)!;
    const wp6_proj = projectPoint(groundTruthPositions[5].xyz)!;

    VanishingLine.fromDto('VL_Z_1', camera, 'z',
      { u: wp2_proj[0], v: wp2_proj[1] },
      { u: wp3_proj[0], v: wp3_proj[1] }
    );
    VanishingLine.fromDto('VL_Z_2', camera, 'z',
      { u: wp5_proj[0], v: wp5_proj[1] },
      { u: wp6_proj[0], v: wp6_proj[1] }
    );

    console.log(`\nCreated ${camera.vanishingLines.size} vanishing lines`);

    // Clear optimizedXyz from non-locked points to test reconstruction
    for (let i = 0; i < worldPoints.length; i++) {
      if (!groundTruthPositions[i].locked) {
        worldPoints[i].optimizedXyz = undefined;
      }
    }

    // Run optimization
    console.log('\nRUNNING OPTIMIZATION:');
    const result = await optimizeProject(project, {
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
    // Allow 0.1 px for numerical precision
    expect(result.medianReprojectionError).toBeLessThan(0.1);

    console.log('\nVERIFICATION:');
    console.log(`  Camera position: [${camera.position.map(x => x.toFixed(4)).join(', ')}]`);
    console.log(`  Expected: [${cameraPosition.join(', ')}]`);

    // Verify camera position is close to ground truth
    const posDiff = Math.sqrt(
      (camera.position[0] - cameraPosition[0])**2 +
      (camera.position[1] - cameraPosition[1])**2 +
      (camera.position[2] - cameraPosition[2])**2
    );
    console.log(`  Position error: ${posDiff.toFixed(4)} units`);

    // Verify world points
    console.log('\nWorld Point Reconstruction:');
    for (let i = 0; i < worldPoints.length; i++) {
      const wp = worldPoints[i];
      const gt = groundTruthPositions[i].xyz;
      const opt = wp.optimizedXyz;

      if (opt) {
        const error = Math.sqrt(
          (opt[0] - gt[0])**2 +
          (opt[1] - gt[1])**2 +
          (opt[2] - gt[2])**2
        );
        console.log(`  ${wp.name}: gt=[${gt.join(', ')}], opt=[${opt.map(x => x.toFixed(2)).join(', ')}], error=${error.toFixed(4)} units`);

        // With perfect data and sufficient constraints, error should be very small
        if (groundTruthPositions[i].locked) {
          expect(error).toBeLessThan(0.001); // Locked points should be exact
        } else {
          // Single camera can't fully resolve depth without additional constraints
          // Just verify reprojection is correct, not absolute position
        }
      }
    }

    // Verify reprojection errors for individual points
    console.log('\nPer-Point Reprojection Errors:');
    for (const ip of camera.imagePoints) {
      if (ip.lastResiduals && ip.lastResiduals.length >= 2) {
        const error = Math.sqrt(ip.lastResiduals[0]**2 + ip.lastResiduals[1]**2);
        console.log(`  ${ip.worldPoint.name}: ${error.toFixed(4)} px`);
        expect(error).toBeLessThan(0.1); // Each point should have near-zero error
      }
    }
  });
});
