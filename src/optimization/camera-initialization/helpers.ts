/**
 * Helper functions for camera initialization.
 */

import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';

/**
 * Count how many fully constrained points are visible in a camera.
 */
export function getConstrainedPointCount(camera: Viewpoint): number {
  return Array.from(camera.imagePoints).filter(ip =>
    (ip.worldPoint as WorldPoint).isFullyConstrained()
  ).length;
}

/**
 * Set up locked points for initialization by copying effective coordinates to optimizedXyz.
 */
export function setupLockedPointsForInitialization(lockedPoints: WorldPoint[]): void {
  for (const wp of lockedPoints) {
    const effective = wp.getEffectiveXyz();
    wp.optimizedXyz = [effective[0]!, effective[1]!, effective[2]!];
  }
}

/**
 * Camera state for backup/restore during initialization attempts.
 */
export interface CameraState {
  position: [number, number, number];
  rotation: [number, number, number, number];
  focalLength: number;
}

export function saveCameraState(camera: Viewpoint): CameraState {
  return {
    position: [...camera.position] as [number, number, number],
    rotation: [...camera.rotation] as [number, number, number, number],
    focalLength: camera.focalLength,
  };
}

export function restoreCameraState(camera: Viewpoint, state: CameraState): void {
  camera.position = state.position;
  camera.rotation = state.rotation;
  camera.focalLength = state.focalLength;
}

/**
 * Count how many world points are visible in both cameras.
 */
export function countSharedPoints(camera1: Viewpoint, camera2: Viewpoint): number {
  const points1 = new Set<WorldPoint>();
  for (const ip of camera1.imagePoints) {
    points1.add(ip.worldPoint as WorldPoint);
  }

  let count = 0;
  for (const ip of camera2.imagePoints) {
    if (points1.has(ip.worldPoint as WorldPoint)) {
      count++;
    }
  }
  return count;
}
