/**
 * Initialize an additional camera using iterative PnP optimization.
 *
 * Algorithm:
 * 1. Use geometric heuristic for initial guess
 * 2. Refine camera pose using bundle adjustment (world points fixed)
 * 3. Return reprojection error for diagnostics
 *
 * This approach is robust and leverages our existing optimization infrastructure.
 */

import type { IViewpoint, IWorldPoint } from '../../entities/interfaces';
import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import { ConstraintSystem } from '../constraint-system';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';
import { V, Vec3, Vec4 } from 'scalar-autograd';

export function initializeCameraWithPnP(
  viewpoint: IViewpoint,
  allWorldPoints: Set<IWorldPoint>
): boolean {
  const vpConcrete = viewpoint as Viewpoint;

  const visiblePoints: [number, number, number][] = [];

  for (const ip of vpConcrete.imagePoints) {
    const wp = ip.worldPoint as WorldPoint;
    if (wp.optimizedXyz) {
      visiblePoints.push(wp.optimizedXyz);
    }
  }

  if (visiblePoints.length < 3) {
    console.log(`PnP: Camera ${vpConcrete.name} has only ${visiblePoints.length} points with optimizedXyz`);
    return false;
  }

  const centroid: [number, number, number] = [0, 0, 0];
  for (const pt of visiblePoints) {
    centroid[0] += pt[0];
    centroid[1] += pt[1];
    centroid[2] += pt[2];
  }
  centroid[0] /= visiblePoints.length;
  centroid[1] /= visiblePoints.length;
  centroid[2] /= visiblePoints.length;

  console.log(`  Centroid of ${visiblePoints.length} points: [${centroid.map(x => x.toFixed(3)).join(', ')}]`);
  console.log(`  Sample points (first 5):`);
  for (let i = 0; i < Math.min(5, visiblePoints.length); i++) {
    console.log(`    [${visiblePoints[i].map(x => x.toFixed(3)).join(', ')}]`);
  }

  let maxDist = 0;
  for (const pt of visiblePoints) {
    const dx = pt[0] - centroid[0];
    const dy = pt[1] - centroid[1];
    const dz = pt[2] - centroid[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    maxDist = Math.max(maxDist, dist);
  }

  const cameraDistance = Math.max(maxDist * 2.5, 10);
  console.log(`  Max distance from centroid: ${maxDist.toFixed(3)}`);
  console.log(`  Computed camera distance: ${cameraDistance.toFixed(3)}`);

  vpConcrete.position = [centroid[0], centroid[1], centroid[2] - cameraDistance];
  vpConcrete.rotation = [1, 0, 0, 0];
  console.log(`  Initial camera position: [${vpConcrete.position.map(x => x.toFixed(3)).join(', ')}]`);

  const initialError = computeReprojectionError(vpConcrete);

  const system = new ConstraintSystem({
    maxIterations: 100,
    tolerance: 1e-6,
    damping: 10.0,
    verbose: false
  });

  for (const ip of vpConcrete.imagePoints) {
    const wp = ip.worldPoint as WorldPoint;
    if (wp.optimizedXyz) {
      system.addPoint(wp);
    }
  }
  system.addCamera(vpConcrete);

  for (const ip of vpConcrete.imagePoints) {
    system.addImagePoint(ip as any);
  }

  const result = system.solve();
  const finalError = computeReprojectionError(vpConcrete);

  console.log(`PnP: Initialized ${vpConcrete.name} using ${visiblePoints.length} points`);
  console.log(`  Initial reprojection error: ${initialError.toFixed(2)} px`);
  console.log(`  Final reprojection error: ${finalError.toFixed(2)} px (${result.iterations} iterations)`);
  console.log(`  Position: [${vpConcrete.position.map(x => x.toFixed(3)).join(', ')}]`);

  return true;
}

function computeReprojectionError(vp: Viewpoint): number {
  let totalError = 0;
  let count = 0;

  for (const ip of vp.imagePoints) {
    const wp = ip.worldPoint as WorldPoint;
    if (!wp.optimizedXyz) continue;

    try {
      const worldPoint = new Vec3(
        V.C(wp.optimizedXyz[0]),
        V.C(wp.optimizedXyz[1]),
        V.C(wp.optimizedXyz[2])
      );

      const cameraPosition = new Vec3(
        V.C(vp.position[0]),
        V.C(vp.position[1]),
        V.C(vp.position[2])
      );

      const cameraRotation = new Vec4(
        V.C(vp.rotation[0]),
        V.C(vp.rotation[1]),
        V.C(vp.rotation[2]),
        V.C(vp.rotation[3])
      );

      const projected = projectWorldPointToPixelQuaternion(
        worldPoint,
        cameraPosition,
        cameraRotation,
        V.C(vp.focalLength ?? 1000),
        V.C(vp.aspectRatio ?? 1.0),
        V.C(vp.principalPointX ?? 500),
        V.C(vp.principalPointY ?? 500),
        V.C(vp.skewCoefficient ?? 0),
        V.C(vp.radialDistortion[0] ?? 0),
        V.C(vp.radialDistortion[1] ?? 0),
        V.C(vp.radialDistortion[2] ?? 0),
        V.C(vp.tangentialDistortion[0] ?? 0),
        V.C(vp.tangentialDistortion[1] ?? 0)
      );

      if (projected) {
        const dx = projected[0].data - ip.u;
        const dy = projected[1].data - ip.v;
        totalError += Math.sqrt(dx * dx + dy * dy);
        count++;
      }
    } catch (e) {
      console.warn(`Error computing reprojection for ${wp.name} @ ${vp.name}:`, e);
    }
  }

  return count > 0 ? totalError / count : 0;
}
