/**
 * Diagnostic test for cube fixture
 *
 * Tests whether:
 * 1. Camera pose from VP initialization is correct
 * 2. Image point clicks are correctly placed
 * 3. Triangulation is working correctly
 */

import { describe, it, expect } from '@jest/globals';
import { loadProjectFromJson } from '../../store/project-serialization';
import * as fs from 'fs';
import * as path from 'path';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';
import { V, Vec3, Vec4 } from 'scalar-autograd';
import { initializeCameraWithVanishingPoints } from '../vanishing-points';

describe('Cube Diagnostic', () => {
  it('should diagnose the ORIGINAL cube fixture with the fix applied', () => {
    const jsonPath = path.join(__dirname, 'fixtures', 'cube-2vps-original.json');
    const jsonData = fs.readFileSync(jsonPath, 'utf8');
    const project = loadProjectFromJson(jsonData);

    const viewpoint = Array.from(project.viewpoints)[0] as Viewpoint;
    const worldPoints = Array.from(project.worldPoints) as WorldPoint[];

    console.log('\n=== RE-INITIALIZING CAMERA WITH VP AFTER FIX ===');
    const worldPointsSet = new Set(worldPoints);
    initializeCameraWithVanishingPoints(viewpoint, worldPointsSet);
    console.log('Camera re-initialized with normalized quaternion');

    const wp1 = worldPoints.find(p => p.name === 'WP1')!;
    const wp2 = worldPoints.find(p => p.name === 'WP2')!;
    const wp3 = worldPoints.find(p => p.name === 'WP3')!;
    const wp4 = worldPoints.find(p => p.name === 'WP4')!;

    console.log('\n=== STEP 1: VERIFY CAMERA POSE ===');
    console.log('Camera from VP initialization:');
    console.log(`  Position: [${viewpoint.position.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`  Rotation: [${viewpoint.rotation.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`  Focal length: ${viewpoint.focalLength.toFixed(1)}`);
    console.log(`  Principal point: (${viewpoint.principalPointX}, ${viewpoint.principalPointY})`);

    console.log('\n=== STEP 2: FORWARD PROJECT EXPECTED GEOMETRY ===');

    // Expected cube geometry (as specified by user)
    const expectedPositions = {
      WP1: [0, 0, 0] as [number, number, number],
      WP2: [0, 0, 10] as [number, number, number],
      WP3: [-10, 0, 10] as [number, number, number],
      WP4: [-10, 0, 0] as [number, number, number],
    };

    // Get actual image point clicks
    const actualClicks = {
      WP1: { u: 408.16299651568056, v: 819.5793728222998 },
      WP2: { u: 754.1093991989319, v: 622.3739385847795 },
      WP3: { u: 485.983344947735, v: 444.42996515679437 },
      WP4: { u: 148.2005342624863, v: 609.3722183507542 },
    };

    console.log('\nForward projecting expected 3D positions through camera:');

    const projectionResults: Record<string, { expected: [number, number, number], projected: [number, number] | null, actual: { u: number, v: number }, error: number | null }> = {
      WP1: { expected: expectedPositions.WP1, projected: null, actual: actualClicks.WP1, error: null },
      WP2: { expected: expectedPositions.WP2, projected: null, actual: actualClicks.WP2, error: null },
      WP3: { expected: expectedPositions.WP3, projected: null, actual: actualClicks.WP3, error: null },
      WP4: { expected: expectedPositions.WP4, projected: null, actual: actualClicks.WP4, error: null },
    };

    for (const [name, data] of Object.entries(projectionResults)) {
      // Convert to ScalarAutograd types
      const worldPt = new Vec3(V.C(data.expected[0]), V.C(data.expected[1]), V.C(data.expected[2]));
      const camPos = new Vec3(V.C(viewpoint.position[0]), V.C(viewpoint.position[1]), V.C(viewpoint.position[2]));
      const camRot = new Vec4(
        V.C(viewpoint.rotation[0]),
        V.C(viewpoint.rotation[1]),
        V.C(viewpoint.rotation[2]),
        V.C(viewpoint.rotation[3])
      );

      const projectedValues = projectWorldPointToPixelQuaternion(
        worldPt,
        camPos,
        camRot,
        V.C(viewpoint.focalLength),
        V.C(viewpoint.aspectRatio),
        V.C(viewpoint.principalPointX),
        V.C(viewpoint.principalPointY),
        V.C(viewpoint.skewCoefficient),
        V.C(viewpoint.radialDistortion[0]),
        V.C(viewpoint.radialDistortion[1]),
        V.C(viewpoint.radialDistortion[2]),
        V.C(viewpoint.tangentialDistortion[0]),
        V.C(viewpoint.tangentialDistortion[1])
      );

      if (projectedValues) {
        const projected: [number, number] = [projectedValues[0].data, projectedValues[1].data];
        data.projected = projected;

        const error = Math.sqrt(
          (projected[0] - data.actual.u) ** 2 +
          (projected[1] - data.actual.v) ** 2
        );
        data.error = error;

        console.log(`\n${name}:`);
        console.log(`  Expected 3D: [${data.expected.map(v => v.toFixed(1)).join(', ')}]`);
        console.log(`  Projects to: (${projected[0].toFixed(1)}, ${projected[1].toFixed(1)})`);
        console.log(`  Actual click: (${data.actual.u.toFixed(1)}, ${data.actual.v.toFixed(1)})`);
        console.log(`  Error: ${error.toFixed(1)} px ${error < 5 ? '✓ GOOD' : error < 20 ? '⚠ WARNING' : '✗ BAD'}`);
      } else {
        console.log(`\n${name}: BEHIND CAMERA (cannot project)`);
        data.projected = null;
      }
    }

    console.log('\n=== STEP 3: ANALYZE TRIANGULATION ===');

    // For WP3 and WP4, try to triangulate from their image observations
    const wp3ImagePoints = viewpoint.getImagePointsForWorldPoint(wp3);
    const wp4ImagePoints = viewpoint.getImagePointsForWorldPoint(wp4);

    if (wp3ImagePoints.length > 0) {
      const wp3Click = wp3ImagePoints[0];
      console.log(`\nWP3 triangulation from image point (${wp3Click.u.toFixed(1)}, ${wp3Click.v.toFixed(1)}):`);
      console.log(`  Current triangulated: [${wp3.optimizedXyz?.map(v => v.toFixed(3)).join(', ')}]`);
      console.log(`  Expected position: [${expectedPositions.WP3.map(v => v.toFixed(1)).join(', ')}]`);

      const error3d = wp3.optimizedXyz ? Math.sqrt(
        (wp3.optimizedXyz[0] - expectedPositions.WP3[0]) ** 2 +
        (wp3.optimizedXyz[1] - expectedPositions.WP3[1]) ** 2 +
        (wp3.optimizedXyz[2] - expectedPositions.WP3[2]) ** 2
      ) : null;
      console.log(`  3D position error: ${error3d?.toFixed(3)} units`);

      // Forward project the triangulated position to see if it matches the click
      if (wp3.optimizedXyz) {
        const worldPt = new Vec3(V.C(wp3.optimizedXyz[0]), V.C(wp3.optimizedXyz[1]), V.C(wp3.optimizedXyz[2]));
        const camPos = new Vec3(V.C(viewpoint.position[0]), V.C(viewpoint.position[1]), V.C(viewpoint.position[2]));
        const camRot = new Vec4(
          V.C(viewpoint.rotation[0]),
          V.C(viewpoint.rotation[1]),
          V.C(viewpoint.rotation[2]),
          V.C(viewpoint.rotation[3])
        );

        const reprojectedValues = projectWorldPointToPixelQuaternion(
          worldPt,
          camPos,
          camRot,
          V.C(viewpoint.focalLength),
          V.C(viewpoint.aspectRatio),
          V.C(viewpoint.principalPointX),
          V.C(viewpoint.principalPointY),
          V.C(viewpoint.skewCoefficient),
          V.C(viewpoint.radialDistortion[0]),
          V.C(viewpoint.radialDistortion[1]),
          V.C(viewpoint.radialDistortion[2]),
          V.C(viewpoint.tangentialDistortion[0]),
          V.C(viewpoint.tangentialDistortion[1])
        );

        if (reprojectedValues) {
          const reprojected: [number, number] = [reprojectedValues[0].data, reprojectedValues[1].data];
          const reprojError = Math.sqrt(
            (reprojected[0] - wp3Click.u) ** 2 +
            (reprojected[1] - wp3Click.v) ** 2
          );
          console.log(`  Triangulated position reprojects to: (${reprojected[0].toFixed(1)}, ${reprojected[1].toFixed(1)})`);
          console.log(`  Reprojection error: ${reprojError.toFixed(1)} px`);
        }
      }
    }

    if (wp4ImagePoints.length > 0) {
      const wp4Click = wp4ImagePoints[0];
      console.log(`\nWP4 triangulation from image point (${wp4Click.u.toFixed(1)}, ${wp4Click.v.toFixed(1)}):`);
      console.log(`  Current triangulated: [${wp4.optimizedXyz?.map(v => v.toFixed(3)).join(', ')}]`);
      console.log(`  Expected position: [${expectedPositions.WP4.map(v => v.toFixed(1)).join(', ')}]`);

      const error3d = wp4.optimizedXyz ? Math.sqrt(
        (wp4.optimizedXyz[0] - expectedPositions.WP4[0]) ** 2 +
        (wp4.optimizedXyz[1] - expectedPositions.WP4[1]) ** 2 +
        (wp4.optimizedXyz[2] - expectedPositions.WP4[2]) ** 2
      ) : null;
      console.log(`  3D position error: ${error3d?.toFixed(3)} units`);

      // Forward project the triangulated position to see if it matches the click
      if (wp4.optimizedXyz) {
        const worldPt = new Vec3(V.C(wp4.optimizedXyz[0]), V.C(wp4.optimizedXyz[1]), V.C(wp4.optimizedXyz[2]));
        const camPos = new Vec3(V.C(viewpoint.position[0]), V.C(viewpoint.position[1]), V.C(viewpoint.position[2]));
        const camRot = new Vec4(
          V.C(viewpoint.rotation[0]),
          V.C(viewpoint.rotation[1]),
          V.C(viewpoint.rotation[2]),
          V.C(viewpoint.rotation[3])
        );

        const reprojectedValues = projectWorldPointToPixelQuaternion(
          worldPt,
          camPos,
          camRot,
          V.C(viewpoint.focalLength),
          V.C(viewpoint.aspectRatio),
          V.C(viewpoint.principalPointX),
          V.C(viewpoint.principalPointY),
          V.C(viewpoint.skewCoefficient),
          V.C(viewpoint.radialDistortion[0]),
          V.C(viewpoint.radialDistortion[1]),
          V.C(viewpoint.radialDistortion[2]),
          V.C(viewpoint.tangentialDistortion[0]),
          V.C(viewpoint.tangentialDistortion[1])
        );

        if (reprojectedValues) {
          const reprojected: [number, number] = [reprojectedValues[0].data, reprojectedValues[1].data];
          const reprojError = Math.sqrt(
            (reprojected[0] - wp4Click.u) ** 2 +
            (reprojected[1] - wp4Click.v) ** 2
          );
          console.log(`  Triangulated position reprojects to: (${reprojected[0].toFixed(1)}, ${reprojected[1].toFixed(1)})`);
          console.log(`  Reprojection error: ${reprojError.toFixed(1)} px`);
        }
      }
    }

    console.log('\n=== DIAGNOSIS ===');

    const lockedPointErrors = [
      projectionResults.WP1.error ?? 0,
      projectionResults.WP2.error ?? 0
    ];
    const maxLockedError = Math.max(...lockedPointErrors);

    const unlockedPointErrors = [
      projectionResults.WP3.error ?? 0,
      projectionResults.WP4.error ?? 0
    ];
    const maxUnlockedError = Math.max(...unlockedPointErrors);

    if (maxLockedError < 5) {
      console.log('✓ Camera pose is CORRECT - locked points project perfectly');
      console.log(`  Locked point errors: WP1=${lockedPointErrors[0].toFixed(1)}px, WP2=${lockedPointErrors[1].toFixed(1)}px`);

      if (maxUnlockedError < 5) {
        console.log('✓ Unlocked point clicks are CORRECT - they match expected cube geometry');
      } else {
        console.log(`✗ Unlocked points do NOT match expected cube geometry (max error: ${maxUnlockedError.toFixed(1)}px)`);
        console.log('  This means either:');
        console.log('  1. User did not click a perfect 10x10 cube');
        console.log('  2. The expected positions in the test are wrong');
        console.log('\nThis is EXPECTED - the user may not have perfect geometry.');
      }
    } else if (maxLockedError < 50) {
      console.log('⚠ Camera pose is MOSTLY CORRECT but not perfect');
      console.log(`⚠ Locked point errors: ${maxLockedError.toFixed(1)} px`);
      console.log('⚠ This could be due to:');
      console.log('  - Slight errors in vanishing line placement');
      console.log('  - Lens distortion (not modeled)');
    } else {
      console.log('✗ Camera pose is WRONG - locked points do NOT project correctly');
      console.log('✗ Max locked point error: ' + maxLockedError.toFixed(1) + ' px');
      console.log('✗ This indicates the vanishing point initialization has a bug');
      console.log('\nAction: Debug vanishing point initialization in vanishing-points.ts');
    }

    console.log('\n=== DETAILED PROJECTION ERRORS ===');
    for (const [name, data] of Object.entries(projectionResults)) {
      if (data.error !== null) {
        console.log(`${name}: ${data.error.toFixed(1)} px`);
      }
    }
  });
});
