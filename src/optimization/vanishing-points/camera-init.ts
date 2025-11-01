import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import type { VanishingPoint } from './types';
import { validateVanishingPoints } from './validation';
import { estimateFocalLength, estimatePrincipalPoint } from './estimation';
import { computeRotationFromVPs, computeCameraPosition } from './rotation';

export function initializeCameraWithVanishingPoints(
  viewpoint: Viewpoint,
  worldPoints: Set<WorldPoint>
): boolean {
  console.log('[initializeCameraWithVanishingPoints] Starting vanishing point initialization...');

  const validation = validateVanishingPoints(viewpoint);
  if (!validation.isValid || !validation.vanishingPoints) {
    console.log('[initializeCameraWithVanishingPoints] Validation failed:', validation.errors);
    return false;
  }

  const vps = validation.vanishingPoints;
  const vpArray = Object.values(vps).filter(vp => vp !== undefined) as VanishingPoint[];

  if (vpArray.length < 2) {
    console.log('[initializeCameraWithVanishingPoints] Not enough vanishing points');
    return false;
  }

  let principalPoint = {
    u: viewpoint.principalPointX,
    v: viewpoint.principalPointY
  };

  const estimatedPP = estimatePrincipalPoint(vps, viewpoint.imageWidth, viewpoint.imageHeight);
  if (estimatedPP) {
    principalPoint = estimatedPP;
    viewpoint.principalPointX = estimatedPP.u;
    viewpoint.principalPointY = estimatedPP.v;
    console.log(`[initializeCameraWithVanishingPoints] Estimated principal point: (${estimatedPP.u.toFixed(1)}, ${estimatedPP.v.toFixed(1)})`);
  } else {
    console.log(`[initializeCameraWithVanishingPoints] Using existing principal point: (${principalPoint.u.toFixed(1)}, ${principalPoint.v.toFixed(1)})`);
  }

  let focalLength = viewpoint.focalLength;
  const estimatedF = estimateFocalLength(vpArray[0], vpArray[1], principalPoint);
  if (estimatedF && estimatedF > 0 && estimatedF < viewpoint.imageWidth * 2) {
    focalLength = estimatedF;
    viewpoint.focalLength = focalLength;
    console.log(`[initializeCameraWithVanishingPoints] Estimated focal length: ${focalLength.toFixed(1)}`);
  } else {
    console.log(`[initializeCameraWithVanishingPoints] Using existing focal length: ${focalLength.toFixed(1)}`);
  }

  const rotation = computeRotationFromVPs(vps, focalLength, principalPoint);
  if (!rotation) {
    console.log('[initializeCameraWithVanishingPoints] Failed to compute rotation');
    return false;
  }

  const fullyConstrainedPoints = Array.from(worldPoints).filter(wp => {
    const lockedXyz = wp.lockedXyz;
    return lockedXyz.every(coord => coord !== null);
  });

  const lockedPointsData = fullyConstrainedPoints
    .map(wp => {
      const imagePoints = viewpoint.getImagePointsForWorldPoint(wp);
      if (imagePoints.length === 0) {
        return null;
      }
      return {
        worldPoint: wp,
        imagePoint: { u: imagePoints[0].u, v: imagePoints[0].v }
      };
    })
    .filter(p => p !== null) as Array<{
    worldPoint: WorldPoint;
    imagePoint: { u: number; v: number };
  }>;

  if (lockedPointsData.length < 2) {
    console.log('[initializeCameraWithVanishingPoints] Not enough locked points with image observations');
    return false;
  }

  const position = computeCameraPosition(rotation, focalLength, principalPoint, lockedPointsData);
  if (!position) {
    console.log('[initializeCameraWithVanishingPoints] Failed to compute camera position');
    return false;
  }

  viewpoint.rotation = rotation;
  viewpoint.position = position;
  viewpoint.focalLength = focalLength;

  const basis = {
    x: [1, 0, 0] as [number, number, number],
    y: [0, 1, 0] as [number, number, number],
    z: [0, 0, 1] as [number, number, number]
  };

  const rotationMatrix = [
    [1 - 2 * (rotation[2] * rotation[2] + rotation[3] * rotation[3]), 2 * (rotation[1] * rotation[2] - rotation[3] * rotation[0]), 2 * (rotation[1] * rotation[3] + rotation[2] * rotation[0])],
    [2 * (rotation[1] * rotation[2] + rotation[3] * rotation[0]), 1 - 2 * (rotation[1] * rotation[1] + rotation[3] * rotation[3]), 2 * (rotation[2] * rotation[3] - rotation[1] * rotation[0])],
    [2 * (rotation[1] * rotation[3] - rotation[2] * rotation[0]), 2 * (rotation[2] * rotation[3] + rotation[1] * rotation[0]), 1 - 2 * (rotation[1] * rotation[1] + rotation[2] * rotation[2])]
  ];

  const cameraVps: Record<string, { u: number; v: number }> = {};
  Object.entries(basis).forEach(([axis, dir]) => {
    const camDir = [
      rotationMatrix[0][0] * dir[0] + rotationMatrix[0][1] * dir[1] + rotationMatrix[0][2] * dir[2],
      rotationMatrix[1][0] * dir[0] + rotationMatrix[1][1] * dir[1] + rotationMatrix[1][2] * dir[2],
      rotationMatrix[2][0] * dir[0] + rotationMatrix[2][1] * dir[1] + rotationMatrix[2][2] * dir[2]
    ];

    if (Math.abs(camDir[2]) < 1e-6) {
      return;
    }

    const u = principalPoint.u + focalLength * (camDir[0] / camDir[2]);
    const v = principalPoint.v - focalLength * (camDir[1] / camDir[2]);
    cameraVps[axis] = { u, v };
  });

  console.log('[initializeCameraWithVanishingPoints] Camera predicted vanishing points:');
  Object.entries(cameraVps).forEach(([axis, vp]) => {
    console.log(`  ${axis.toUpperCase()} axis -> VP at (${vp.u.toFixed(2)}, ${vp.v.toFixed(2)})`);
  });

  (viewpoint as any).__initialCameraVps = cameraVps;

  console.log(
    `[initializeCameraWithVanishingPoints] Success! Position: [${position.map(p => p.toFixed(2)).join(', ')}], ` +
    `Rotation: [${rotation.map(q => q.toFixed(3)).join(', ')}]`
  );

  return true;
}
