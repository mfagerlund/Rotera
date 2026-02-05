/**
 * Direct test: Project world point → Triangulate → Reproject
 * This tests if projection and triangulation are inverses of each other.
 */

import { describe, test, expect } from '@jest/globals';
import { projectPointToPixel, PlainCameraIntrinsics } from '../analytical/project-point-plain';
import { triangulateRayRay } from '../triangulation';

describe('Projection-Triangulation Round-Trip', () => {
  test('project → triangulate → reproject should give same pixels', () => {
    console.log('\n=== PROJECTION → TRIANGULATION → REPROJECTION TEST ===\n');

    const worldPoint: [number, number, number] = [5, 2, 15];
    console.log(`World point: [${worldPoint.join(', ')}]`);

    const cam1 = {
      position: [0, 0, 0] as [number, number, number],
      rotation: [1, 0, 0, 0] as [number, number, number, number],
      focalLength: 1000,
      principalPointX: 500,
      principalPointY: 500
    };

    const cam2 = {
      position: [10, 0, 0] as [number, number, number],
      rotation: [1, 0, 0, 0] as [number, number, number, number],
      focalLength: 1000,
      principalPointX: 500,
      principalPointY: 500
    };

    const intrinsics: PlainCameraIntrinsics = {
      fx: cam1.focalLength,
      fy: cam1.focalLength,
      cx: cam1.principalPointX,
      cy: cam1.principalPointY,
      k1: 0, k2: 0, k3: 0,
      p1: 0, p2: 0,
    };

    console.log(`Camera 1: pos=[${cam1.position.join(', ')}], rot=[${cam1.rotation.join(', ')}]`);
    console.log(`Camera 2: pos=[${cam2.position.join(', ')}], rot=[${cam2.rotation.join(', ')}]`);

    console.log('\n---  STEP 1: PROJECT to both cameras ---');

    const pixel1Result = projectPointToPixel(worldPoint, cam1.position, cam1.rotation, intrinsics);
    const pixel2Result = projectPointToPixel(worldPoint, cam2.position, cam2.rotation, intrinsics);

    if (!pixel1Result || !pixel2Result) {
      console.log('ERROR: Projection failed!');
      expect(pixel1Result).not.toBeNull();
      expect(pixel2Result).not.toBeNull();
      return;
    }

    const [u1, v1] = pixel1Result;
    const [u2, v2] = pixel2Result;

    console.log(`Camera 1 pixel: [${u1.toFixed(2)}, ${v1.toFixed(2)}]`);
    console.log(`Camera 2 pixel: [${u2.toFixed(2)}, ${v2.toFixed(2)}]`);

    console.log('\n--- STEP 2: TRIANGULATE from pixels ---');

    const mockIp1 = { u: u1, v: v1, worldPoint: null };
    const mockIp2 = { u: u2, v: v2, worldPoint: null };

    const triangResult = triangulateRayRay(
      mockIp1 as any,
      mockIp2 as any,
      cam1 as any,
      cam2 as any,
      15.0
    );

    if (!triangResult) {
      console.log('ERROR: Triangulation failed!');
      expect(triangResult).not.toBeNull();
      return;
    }

    const triangulated = triangResult.worldPoint;
    console.log(`Triangulated point: [${triangulated.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`Original point:     [${worldPoint.join(', ')}]`);

    const diff3D = Math.sqrt(
      Math.pow(triangulated[0] - worldPoint[0], 2) +
      Math.pow(triangulated[1] - worldPoint[1], 2) +
      Math.pow(triangulated[2] - worldPoint[2], 2)
    );
    console.log(`3D difference: ${diff3D.toFixed(6)}`);

    console.log('\n--- STEP 3: REPROJECT triangulated point ---');

    const reprojPixel1 = projectPointToPixel(
      triangulated as [number, number, number],
      cam1.position,
      cam1.rotation,
      intrinsics
    );
    const reprojPixel2 = projectPointToPixel(
      triangulated as [number, number, number],
      cam2.position,
      cam2.rotation,
      intrinsics
    );

    if (!reprojPixel1 || !reprojPixel2) {
      console.log('ERROR: Reprojection failed!');
      expect(reprojPixel1).not.toBeNull();
      expect(reprojPixel2).not.toBeNull();
      return;
    }

    const [u1Reproj, v1Reproj] = reprojPixel1;
    const [u2Reproj, v2Reproj] = reprojPixel2;

    console.log(`Camera 1 reprojection: [${u1Reproj.toFixed(2)}, ${v1Reproj.toFixed(2)}]`);
    console.log(`Camera 1 original:     [${u1.toFixed(2)}, ${v1.toFixed(2)}]`);
    console.log(`Camera 1 error: ${Math.sqrt(Math.pow(u1Reproj - u1, 2) + Math.pow(v1Reproj - v1, 2)).toFixed(3)} pixels`);

    console.log(`\nCamera 2 reprojection: [${u2Reproj.toFixed(2)}, ${v2Reproj.toFixed(2)}]`);
    console.log(`Camera 2 original:     [${u2.toFixed(2)}, ${v2.toFixed(2)}]`);
    console.log(`Camera 2 error: ${Math.sqrt(Math.pow(u2Reproj - u2, 2) + Math.pow(v2Reproj - v2, 2)).toFixed(3)} pixels`);

    const error1 = Math.sqrt(Math.pow(u1Reproj - u1, 2) + Math.pow(v1Reproj - v1, 2));
    const error2 = Math.sqrt(Math.pow(u2Reproj - u2, 2) + Math.pow(v2Reproj - v2, 2));
    const avgError = (error1 + error2) / 2;

    console.log(`\n=== RESULT ===`);
    console.log(`Average reprojection error: ${avgError.toFixed(3)} pixels`);
    console.log(`Expected: < 0.001 pixels (near machine precision)`);

    if (avgError > 0.01) {
      console.log(`\nFAILED: Reprojection error too large!`);
      console.log(`This indicates a BUG in either projection or triangulation.`);
    } else {
      console.log(`\nPASSED: Projection and triangulation are consistent`);
    }

    expect(avgError).toBeLessThan(0.01);
  });
});
