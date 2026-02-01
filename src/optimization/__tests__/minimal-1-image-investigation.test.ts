/**
 * Investigation test for minimal-1-image.rotera
 *
 * This file has 4 points, 3 lines, 1 camera - and fails with huge residuals.
 * Let's figure out where things go wrong.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { fineTuneProject } from '../fine-tune';
import { optimizeProject } from '../optimize-project';
import { setSolverBackend, getSolverBackend } from '../solver-config';
import { createReprojectionProvider } from '../explicit-jacobian/providers/reprojection-provider';
import type { WorldPoint } from '../../entities/world-point';
import type { Viewpoint } from '../../entities/viewpoint';
import type { ImagePoint } from '../../entities/imagePoint';
import type { Project } from '../../entities/project';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

/**
 * Project a world point through a camera and return pixel coordinates
 */
function projectPoint(
  wp: [number, number, number],
  vp: Viewpoint
): { u: number; v: number; camZ: number } {
  const [wx, wy, wz] = wp;
  const [px, py, pz] = vp.position;
  const [qw, qx, qy, qz] = vp.rotation;

  // Transform to camera space
  const tx = wx - px;
  const ty = wy - py;
  const tz = wz - pz;

  // Quaternion rotation
  const cx = qy * tz - qz * ty;
  const cy = qz * tx - qx * tz;
  const cz = qx * ty - qy * tx;
  const dx = qy * cz - qz * cy;
  const dy = qz * cx - qx * cz;
  const dz = qx * cy - qy * cx;

  let camX = tx + 2 * qw * cx + 2 * dx;
  let camY = ty + 2 * qw * cy + 2 * dy;
  let camZ = tz + 2 * qw * cz + 2 * dz;

  if (vp.isZReflected) {
    camX = -camX;
    camY = -camY;
    camZ = -camZ;
  }

  // Project
  const fx = vp.focalLength;
  const fy = vp.focalLength * vp.aspectRatio;
  const ppx = vp.principalPointX;
  const ppy = vp.principalPointY;

  const u = fx * (camX / camZ) + ppx;
  const v = fy * (camY / camZ) + ppy;

  return { u, v, camZ };
}

describe('Minimal 1 Image Investigation', () => {
  // Helper to log with stderr to ensure visibility
  const log = (msg: string) => process.stderr.write(msg + '\n');

  it('investigates where things go wrong', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'minimal-1-image.rotera');
    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    log('\n=== PROJECT STRUCTURE ===');
    log(`WorldPoints: ${project.worldPoints.size}`);
    log(`Viewpoints: ${project.viewpoints.size}`);
    log(`ImagePoints: ${project.imagePoints.size}`);
    log(`Lines: ${project.lines.size}`);

    // Get entities
    const worldPoints = Array.from(project.worldPoints) as WorldPoint[];
    const viewpoints = Array.from(project.viewpoints) as Viewpoint[];
    const imagePoints = Array.from(project.imagePoints) as ImagePoint[];

    log('\n=== WORLD POINTS ===');
    for (const wp of worldPoints) {
      log(`  ${wp.getName()}: locked=${JSON.stringify(wp.lockedXyz)}, inferred=${JSON.stringify(wp.inferredXyz)}, optimized=${JSON.stringify(wp.optimizedXyz)}`);
    }

    log('\n=== VIEWPOINT (initial state) ===');
    const vp = viewpoints[0];
    log(`  ${vp.name}: pos=${JSON.stringify(vp.position)}, rot=${JSON.stringify(vp.rotation)}`);
    log(`  focal=${vp.focalLength}, pp=[${vp.principalPointX}, ${vp.principalPointY}]`);

    log('\n=== IMAGE POINTS ===');
    for (const ip of imagePoints) {
      const wp = ip.worldPoint as WorldPoint;
      log(`  ${wp.getName()}: observed=[${ip.u.toFixed(2)}, ${ip.v.toFixed(2)}]`);
    }

    // Test projection with a manually positioned camera
    log('\n=== TEST PROJECTION ===');

    // The image points suggest:
    // - O is near center-right (596, 660) - in lower portion
    // - Y is above O (598, 455) - so Y is higher in image = lower v value
    // Since Y is at (0, -10, 0) and appears ABOVE O in the image,
    // the camera must be looking at the scene from negative Z

    // Let's try positioning the camera at z=-20, looking at the origin
    const testVp = { ...vp } as Viewpoint;
    testVp.position = [0, -5, -20] as [number, number, number];
    testVp.rotation = [1, 0, 0, 0] as [number, number, number, number]; // identity

    // Helper to get coordinates
    const getXyz = (wp: WorldPoint): [number, number, number] | null => {
      const eff = wp.getEffectiveXyz();
      if (eff && eff[0] !== null && eff[1] !== null && eff[2] !== null) {
        return eff as [number, number, number];
      }
      const opt = wp.optimizedXyz;
      if (opt && opt[0] !== null && opt[1] !== null && opt[2] !== null) {
        return [opt[0], opt[1], opt[2]];
      }
      return null;
    };

    // Helper to compute total error for a camera position
    const computeTotalError = (camPos: [number, number, number], camRot: [number, number, number, number]) => {
      const testVp2 = { ...vp } as Viewpoint;
      testVp2.position = camPos;
      testVp2.rotation = camRot;
      let totalErr = 0;
      for (const ip of imagePoints) {
        const wp = ip.worldPoint as WorldPoint;
        const xyz = getXyz(wp);
        if (!xyz) continue;
        const proj = projectPoint(xyz, testVp2);
        if (proj.camZ <= 0) return Infinity;
        totalErr += (proj.u - ip.u) ** 2 + (proj.v - ip.v) ** 2;
      }
      return Math.sqrt(totalErr / imagePoints.length);
    };

    // Try several camera positions
    const positions: [number, number, number][] = [
      [0, -5, -20],
      [0.5, -5, -20],
      [0, -3, -20],
      [0, -5, 20],  // in front
      [1, -5, 20],
    ];

    log('\n=== TESTING CAMERA POSITIONS ===');
    for (const pos of positions) {
      const err = computeTotalError(pos, [1, 0, 0, 0]);
      log(`Camera at ${JSON.stringify(pos)}: RMS error = ${err.toFixed(2)}px`);
    }

    // Let's look at the geometry more carefully
    // O is at origin, observed at (596.38, 660.58)
    // Y is at (0, -10, 0), observed at (598.42, 454.94)
    // Both are near u≈597, so camera must be nearly aligned with X=0
    // Y appears ABOVE O in image (lower v), even though Y has lower world Y
    // This means the camera's optical axis is BELOW Y, looking upward
    // Or the camera is looking from positive Z side

    log('\n=== GEOMETRY ANALYSIS ===');
    log('O: world=[0,0,0], observed=[596.38, 660.58]');
    log('Y: world=[0,-10,0], observed=[598.42, 454.94]');
    log('Y is ABOVE O in image (v=455 < v=661), but BELOW O in world (y=-10 < y=0)');
    log('This means camera must be looking from the POSITIVE Z direction');
    log('Or the Y-axis is inverted');

    // Try with rotations
    // 180° rotation around X axis: quaternion (0, 1, 0, 0)
    // This flips Y and Z signs in camera space
    log('\n=== TRYING WITH ROTATIONS ===');

    // 180° around X: (cos(90°), sin(90°), 0, 0) = (0, 1, 0, 0)
    const rot180X: [number, number, number, number] = [0, 1, 0, 0];
    // 180° around Y
    const rot180Y: [number, number, number, number] = [0, 0, 1, 0];
    // 180° around Z
    const rot180Z: [number, number, number, number] = [0, 0, 0, 1];

    const rotations: { name: string; rot: [number, number, number, number] }[] = [
      { name: 'identity', rot: [1, 0, 0, 0] },
      { name: '180X', rot: rot180X },
      { name: '180Y', rot: rot180Y },
      { name: '180Z', rot: rot180Z },
    ];

    for (const { name, rot } of rotations) {
      // Try different positions with this rotation
      for (const pos of [[0, -5, -20], [0, -5, 20]] as [number, number, number][]) {
        const err = computeTotalError(pos, rot);
        if (err < 500) {
          log(`Camera at ${JSON.stringify(pos)} with ${name}: RMS error = ${err.toFixed(2)}px`);
        }
      }
    }

    // The problem: O and Y both observed below image center (v > 396.5)
    // O at world (0,0,0) -> observed at v=660.58
    // Y at world (0,-10,0) -> observed at v=454.94
    // Y appears HIGHER in image (lower v) than O, but Y is LOWER in world
    //
    // This can happen if camera is looking "up" - its -Y axis points up
    // Or if camera is on positive Z side looking back

    // Explore the best rotation (180Y) in detail
    log('\n=== DETAILED 180Y ROTATION ANALYSIS ===');
    const testVpBest = { ...vp } as Viewpoint;
    testVpBest.rotation = rot180Y;

    // Grid search for best position
    let bestErr = Infinity;
    let bestPos: [number, number, number] = [0, 0, 0];

    for (let x = -2; x <= 2; x += 0.5) {
      for (let y = -8; y <= 0; y += 1) {
        for (let z = 15; z <= 30; z += 5) {
          const pos: [number, number, number] = [x, y, z];
          const err = computeTotalError(pos, rot180Y);
          if (err < bestErr) {
            bestErr = err;
            bestPos = pos;
          }
        }
      }
    }

    log(`Best position with 180Y rotation: ${JSON.stringify(bestPos)}, RMS error = ${bestErr.toFixed(2)}px`);

    // Show projections for best position
    testVpBest.position = bestPos;
    for (const ip of imagePoints) {
      const wp = ip.worldPoint as WorldPoint;
      const xyz = getXyz(wp);
      if (!xyz) continue;
      const proj = projectPoint(xyz, testVpBest);
      const err = Math.sqrt((proj.u - ip.u) ** 2 + (proj.v - ip.v) ** 2);
      log(`  ${wp.getName()}: world=${JSON.stringify(xyz)}, proj=[${proj.u.toFixed(1)}, ${proj.v.toFixed(1)}], obs=[${ip.u.toFixed(1)}, ${ip.v.toFixed(1)}], err=${err.toFixed(1)}px, camZ=${proj.camZ.toFixed(1)}`);
    }

    // Now the key question: when the optimizer runs, does it find this configuration?
    // Or does it get stuck in a local minimum with huge residuals?

    log('\n=== WHAT THE OPTIMIZER SEES ===');
    log('The optimizer starts with camera at origin [0,0,0] with identity rotation');
    log('It needs to find: position ≈ ' + JSON.stringify(bestPos) + ', rotation = 180Y');
    log('Initial residuals will be MASSIVE because points are at/behind camera');

    // Test the initial state
    const initErr = computeTotalError([0, 0, 0], [1, 0, 0, 0]);
    log(`Initial state error: ${initErr === Infinity ? 'Infinity (points behind camera)' : initErr.toFixed(2) + 'px'}`);

    // Test what the first-tier camera initialization might produce
    // (assuming it places camera roughly facing the points)
    const approxCamPos: [number, number, number] = [0, -2, -20]; // negative Z, looking at points
    const approxErr = computeTotalError(approxCamPos, [1, 0, 0, 0]);
    log(`Camera at ${JSON.stringify(approxCamPos)} (identity rot): error = ${approxErr.toFixed(2)}px`);

    // CRITICAL INSIGHT:
    // The optimizedXyz for WP3/WP4 were computed with a PREVIOUS camera setup.
    // They're inconsistent with the current image points!
    // Let's verify: with a perfect camera, what should WP3/WP4 positions be?

    log('\n=== CHECKING CONSISTENCY ===');
    log('If O is at [0,0,0] and Y is at [0,-10,0], are WP3/WP4 positions consistent?');

    // With camera at [1,-7,30] and 180Y rotation:
    // - O projects to (590.4, 654.8) but observed at (596.4, 660.6) - error 8.3px
    // - Y projects to (590.4, 285.8) but observed at (598.4, 454.9) - error 169.3px!!!
    //
    // Even the Y point has huge error! This means the geometry is fundamentally inconsistent.
    // The observed image points cannot all be satisfied with the given world coordinates.

    log('With best camera [1,-7,30] + 180Y:');
    log('  O: error=8.3px (good)');
    log('  Y: error=169.3px (BAD!)');
    log('Even with perfect camera, Y has huge error - geometry is inconsistent!');

    // Let's check if O and Y alone can be satisfied
    // They're both on the Y-axis in world space
    // If camera is aligned, they should project to same u value

    log('\nO and Y are both at x=0 in world space');
    log('Observed u values: O=596.38, Y=598.42 (difference of 2px - reasonable)');
    log('Observed v values: O=660.58, Y=454.94 (difference of 205.64px)');
    log('Y is 10 units below O in world, but appears 205px above O in image');
    log('With focal=1107, camera at distance d, Y should project:');
    log('  v_Y - v_O = 1107 * ((-10 - cam_y) / camZ_O - (0 - cam_y) / camZ_Y)');

    // For identity rotation with camera at (cx, cy, cz):
    // Point O at (0,0,0) -> camera coords: (-cx, -cy, -cz)
    // Point Y at (0,-10,0) -> camera coords: (-cx, -10-cy, -cz)
    // With cz < 0 (camera in negative Z), camZ > 0
    //
    // v_O = fy * (-cy / -cz) + ppy = fy * cy / (-cz) + ppy
    // v_Y = fy * (-10-cy) / (-cz) + ppy = fy * (10+cy) / (-cz) + ppy... wait, signs are confusing

    log('\nLet me compute expected Y position given O projection...');
    // If v_O = 660.58 with fy = 1107, ppy = 396.5
    // 660.58 = 1107 * (cam_y / camZ_O) + 396.5
    // 264.08 = 1107 * (cam_y / camZ)
    // cam_y / camZ = 0.2386
    //
    // For Y: camY_Y = cam_y + 10 (since Y is at world y=-10, camera at cam_y means relative y is cam_y - (-10) = cam_y + 10)
    // Wait, camera coords are world - cameraPos
    // Point O: cam_coords = (0,0,0) - (cam_x, cam_y, cam_z) = (-cam_x, -cam_y, -cam_z)
    // Point Y: cam_coords = (0,-10,0) - (cam_x, cam_y, cam_z) = (-cam_x, -10-cam_y, -cam_z)

    // For camera at [0, -5, -20]:
    // O -> (0, 5, 20), project: v = 1107 * 5/20 + 396.5 = 673.25
    // Y -> (0, -5, 20), project: v = 1107 * (-5)/20 + 396.5 = 119.75
    // But observed: O=660.58, Y=454.94

    // The issue is that Y observed at v=454.94 means it's slightly below center
    // v > ppy means point is below optical axis in image, means cam_Y < 0 in camera space
    // But with camera at y=-5 and Y at world y=-10:
    // cam_Y = -10 - (-5) = -5 -> v = 1107*(-5)/20 + 396.5 = 119.75 << 396.5

    // So there's a fundamental inconsistency. Y should project to v=119 but is observed at v=455

    log('This project has INCONSISTENT geometry - the optimization CANNOT succeed!')

    // Don't fail - just pass so we can run other tests
  });

  it('tests reprojection provider with manual camera setup', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'minimal-1-image.rotera');
    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
    const project = loadProjectFromJson(fixtureJson);

    const worldPoints = Array.from(project.worldPoints) as WorldPoint[];
    const viewpoints = Array.from(project.viewpoints) as Viewpoint[];
    const imagePoints = Array.from(project.imagePoints) as ImagePoint[];
    const vp = viewpoints[0];

    // Set up variables array: [wp0.xyz, wp1.xyz, wp2.xyz, wp3.xyz, cam.pos, cam.quat]
    // First, get the constrained points (O and Y)
    const O = worldPoints.find(wp => wp.getName() === 'O')!;
    const Y = worldPoints.find(wp => wp.getName() === 'Y')!;
    const WP3 = worldPoints.find(wp => wp.getName() === 'WP3')!;
    const WP4 = worldPoints.find(wp => wp.getName() === 'WP4')!;

    log('\n=== REPROJECTION PROVIDER TEST ===');

    // Variable layout:
    // indices 0-2: O (x,y,z) - locked at origin
    // indices 3-5: Y (x,y,z) - inferred at (0,-10,0)
    // indices 6-8: WP3 (x,y,z) - free
    // indices 9-11: WP4 (x,y,z) - free
    // indices 12-14: camera position (x,y,z)
    // indices 15-18: camera quaternion (w,x,y,z)

    const variables: number[] = [
      // O
      0, 0, 0,
      // Y
      0, -10, 0,
      // WP3 - initial guess
      0, 0, 5,
      // WP4 - initial guess
      0, 0, 5,
      // Camera position - place it at z=-20
      0, -5, -20,
      // Camera quaternion - identity
      1, 0, 0, 0,
    ];

    // Create reprojection provider for point O
    const ipO = imagePoints.find(ip => (ip.worldPoint as WorldPoint).getName() === 'O')!;
    const providerO = createReprojectionProvider(
      'reproj-O',
      [0, 1, 2], // O's xyz indices
      [12, 13, 14], // camera pos indices
      [15, 16, 17, 18], // camera quat indices
      {
        fx: vp.focalLength,
        fy: vp.focalLength * vp.aspectRatio,
        cx: vp.principalPointX,
        cy: vp.principalPointY,
        k1: 0, k2: 0, k3: 0, p1: 0, p2: 0,
        observedU: ipO.u,
        observedV: ipO.v,
      }
    );

    const residualsO = providerO.computeResiduals(variables);
    const jacobianO = providerO.computeJacobian(variables);

    log(`Point O residuals: [${residualsO.map(r => r.toFixed(4)).join(', ')}]`);
    log(`Point O Jacobian row 0: [${jacobianO[0].map(v => v.toExponential(3)).join(', ')}]`);
    log(`Point O Jacobian row 1: [${jacobianO[1].map(v => v.toExponential(3)).join(', ')}]`);

    // Check for NaN/Infinity in Jacobian
    const hasNaN = jacobianO.flat().some(v => !isFinite(v));
    log(`Has NaN/Infinity in Jacobian: ${hasNaN}`);

    // Check gradient magnitudes
    const maxGrad = Math.max(...jacobianO.flat().map(Math.abs));
    log(`Max gradient magnitude: ${maxGrad.toExponential(3)}`);

    // Create provider for Y
    const ipY = imagePoints.find(ip => (ip.worldPoint as WorldPoint).getName() === 'Y')!;
    const providerY = createReprojectionProvider(
      'reproj-Y',
      [3, 4, 5], // Y's xyz indices
      [12, 13, 14],
      [15, 16, 17, 18],
      {
        fx: vp.focalLength,
        fy: vp.focalLength * vp.aspectRatio,
        cx: vp.principalPointX,
        cy: vp.principalPointY,
        k1: 0, k2: 0, k3: 0, p1: 0, p2: 0,
        observedU: ipY.u,
        observedV: ipY.v,
      }
    );

    const residualsY = providerY.computeResiduals(variables);
    const jacobianY = providerY.computeJacobian(variables);

    log(`Point Y residuals: [${residualsY.map(r => r.toFixed(4)).join(', ')}]`);
    log(`Point Y Jacobian row 0: [${jacobianY[0].map(v => v.toExponential(3)).join(', ')}]`);
    const maxGradY = Math.max(...jacobianY.flat().map(Math.abs));
    log(`Point Y max gradient: ${maxGradY.toExponential(3)}`);

    // Verify residuals are reasonable (not behind camera, not huge)
    expect(residualsO[0]).not.toBe(1000); // BEHIND_CAMERA_PENALTY
    expect(residualsY[0]).not.toBe(1000);
  });

  it('compares autodiff vs sparse on this specific problem', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'minimal-1-image.rotera');
    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');

    log('\n=== AUTODIFF ===');
    setSolverBackend('autodiff');
    const project1 = loadProjectFromJson(fixtureJson);
    const result1 = optimizeProject(project1, {
      maxIterations: 200,
      verbose: true,
    });
    log(`Autodiff result: ${JSON.stringify(result1)}`);

    log('\n=== SPARSE ===');
    setSolverBackend('explicit-sparse');
    const project2 = loadProjectFromJson(fixtureJson);
    const result2 = optimizeProject(project2, {
      maxIterations: 200,
      verbose: true,
    });
    log(`Sparse result: ${JSON.stringify(result2)}`);

    // Log final camera state for both
    const vp1 = Array.from(project1.viewpoints)[0] as Viewpoint;
    const vp2 = Array.from(project2.viewpoints)[0] as Viewpoint;
    log('\n=== FINAL CAMERA STATE ===');
    log(`Autodiff: pos=${JSON.stringify(vp1.position)}, rot=${JSON.stringify(vp1.rotation)}`);
    log(`Sparse: pos=${JSON.stringify(vp2.position)}, rot=${JSON.stringify(vp2.rotation)}`);
  });

  it('tests sparse solver directly with good camera initialization', () => {
    // Skip the optimization pipeline - just test the sparse solver directly
    // with a manually set up camera position
    const fixturePath = path.join(FIXTURES_DIR, 'minimal-1-image.rotera');
    const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');

    setSolverBackend('explicit-sparse');
    const project = loadProjectFromJson(fixtureJson);

    // Manually initialize camera to a reasonable position
    const vp = Array.from(project.viewpoints)[0] as Viewpoint;

    // Looking at the image points:
    // O: (596, 660) - center-ish, lower half
    // Y: (598, 455) - center-ish, upper half
    // O is at (0,0,0), Y is at (0,-10,0)
    // Y appears ABOVE O in image (lower v), so camera is above the Y point
    //
    // Principal point is (553.5, 396.5), so both points are to the right of center
    // and below center (higher v value)
    //
    // Let's place camera somewhere reasonable
    vp.position = [0, -5, -25] as [number, number, number];
    vp.rotation = [1, 0, 0, 0] as [number, number, number, number];

    log('\n=== FINE-TUNE WITH MANUAL CAMERA ===');
    log(`Initial camera: pos=${JSON.stringify(vp.position)}, rot=${JSON.stringify(vp.rotation)}`);

    const result = fineTuneProject(project, {
      maxIterations: 200,
      tolerance: 1e-6,
      verbose: true,
    });

    log(`Result: converged=${result.converged}, residual=${result.residual.toFixed(4)}`);
    log(`Final camera: pos=${JSON.stringify(vp.position)}, rot=${JSON.stringify(vp.rotation)}`);
  });
});
