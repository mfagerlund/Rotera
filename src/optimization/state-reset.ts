/**
 * State management and reset functions for optimization.
 * Handles resetting entities to clean state before optimization runs.
 */

import { Project } from '../entities/project';
import { Viewpoint } from '../entities/viewpoint';
import { WorldPoint } from '../entities/world-point';
import { ImagePoint } from '../entities/imagePoint';
import { Line } from '../entities/line';
import type { InferenceBranch } from './inference-branching';

// WeakMaps for temporary storage during optimization (avoid polluting entity objects)
export const viewpointInitialVps = new WeakMap<Viewpoint, Record<string, { u: number; v: number }>>();
export const worldPointSavedInferredXyz = new WeakMap<WorldPoint, [number | null, number | null, number | null]>();

/**
 * Reset all cached optimization state on project entities.
 * Call this before each solve to ensure no stale data is reused.
 */
export function resetOptimizationState(project: Project): void {
  // Reset world points
  // NOTE: Do NOT clear optimizedXyz here - tests and callers may provide initial values.
  // The auto-initialization pipeline will overwrite if autoInitializeWorldPoints is true.
  for (const wp of project.worldPoints) {
    const point = wp as WorldPoint;
    point.inferredXyz = [null, null, null];
    point.lastResiduals = [];
  }

  // Reset viewpoints (cameras)
  // NOTE: Do NOT clear position/rotation here - tests and callers may provide initial values.
  // The auto-initialization pipeline will overwrite if autoInitializeCameras is true.
  // NOTE: isZReflected is reset in orchestrator.ts at the top-level entry point ONLY.
  for (const vp of project.viewpoints) {
    const viewpoint = vp as Viewpoint;
    viewpoint.lastResiduals = [];
    // Clear hidden VP cache
    viewpointInitialVps.delete(viewpoint);
  }

  // Reset image points
  for (const ip of project.imagePoints) {
    const imagePoint = ip as ImagePoint;
    imagePoint.lastResiduals = [];
    imagePoint.isOutlier = false;
    imagePoint.reprojectedU = undefined;
    imagePoint.reprojectedV = undefined;
  }

  // Reset lines
  for (const line of project.lines) {
    (line as Line).lastResiduals = [];
  }

  // Reset constraints
  for (const constraint of project.constraints) {
    constraint.lastResiduals = [];
  }

  // Re-run inference propagation to rebuild inferredXyz from constraints
  // CRITICAL: This MUST run synchronously before optimization starts
  project.propagateInferences();
}

/**
 * Reset cameras and world points for a fresh initialization.
 * Called when autoInitializeCameras is true.
 */
export function resetCamerasForInitialization(project: Project): void {
  const viewpointArray = Array.from(project.viewpoints);

  for (const vp of viewpointArray) {
    const v = vp as Viewpoint;
    // Reset pose - always reset when autoInitializeCameras is true
    v.position = [0, 0, 0];
    v.rotation = [1, 0, 0, 0];
    // Reset intrinsics that could be garbage from a previous failed solve
    v.skewCoefficient = 0;
    v.aspectRatio = 1;
    v.radialDistortion = [0, 0, 0];
    v.tangentialDistortion = [0, 0];

    // Reset clearly garbage focalLength
    const minFocalLength = Math.min(v.imageWidth, v.imageHeight) * 0.3;
    const maxFocalLength = Math.max(v.imageWidth, v.imageHeight) * 5;
    if (v.focalLength < minFocalLength || v.focalLength > maxFocalLength) {
      v.focalLength = Math.max(v.imageWidth, v.imageHeight);
    }

    // BUG FIX: Reset focal length for cameras without vanishing lines if it looks optimized
    // Optimized focal lengths are typically 1.5x-3x the sensor-based default.
    // If focal length is far from sensor-based default, reset it to avoid using stale values from previous solve.
    if (v.getVanishingLineCount() === 0) {
      const sensorBasedFocal = Math.max(v.imageWidth, v.imageHeight);
      const ratio = v.focalLength / sensorBasedFocal;
      // If focal length is 1.3x-3x the sensor-based default, it's probably optimized - reset it
      if (ratio > 1.3 || ratio < 0.7) {
        v.focalLength = sensorBasedFocal;
      }
    }

    // Principal point should be within image bounds
    if (v.principalPointX < 0 || v.principalPointX > v.imageWidth ||
        v.principalPointY < 0 || v.principalPointY > v.imageHeight) {
      v.principalPointX = v.imageWidth / 2;
      v.principalPointY = v.imageHeight / 2;
    }
  }

  // BUG FIX: Clear optimizedXyz on ALL world points, not just unconstrained
  // Stale optimizedXyz from previous solve can poison initialization
  const wpArray = Array.from(project.worldPoints) as WorldPoint[];
  for (const wp of wpArray) {
    wp.optimizedXyz = undefined;
  }
}

/**
 * Apply branch coordinates to inferredXyz on world points.
 * This overrides the default inference with specific sign choices.
 */
export function applyBranchToInferredXyz(project: Project, branch: InferenceBranch): void {
  for (const wp of project.worldPoints) {
    const point = wp as WorldPoint;
    const coords = branch.coordinates.get(point);
    if (coords) {
      // Override inferredXyz with branch coordinates
      point.inferredXyz = [...coords] as [number | null, number | null, number | null];
    }
  }
}
