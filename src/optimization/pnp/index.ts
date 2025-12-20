/**
 * Perspective-n-Point (PnP) Camera Pose Estimation
 *
 * This module provides camera pose estimation from known 3D-2D correspondences.
 *
 * Implements:
 * - P3P (Perspective-3-Point) using Kneip's method for 3-4 points
 * - DLT-based approach for 4+ points
 * - Iterative refinement using bundle adjustment
 *
 * References:
 * - Kneip, Scaramuzza, Siegwart: "A Novel Parametrization of the P3P Problem for a Direct Computation of Absolute Camera Position and Orientation" (CVPR 2011)
 * - Hartley & Zisserman: "Multiple View Geometry" Chapter 7
 *
 * @module pnp
 */

import type { IViewpoint, IImagePoint, IWorldPoint } from '../../entities/interfaces';
import type { Viewpoint } from '../../entities/viewpoint';
import type { WorldPoint } from '../../entities/world-point';
import { log } from '../optimization-logger';
import type { PnPResult } from './types';
import { solveP3P } from './p3p';
import { estimatePoseDLT } from './epnp';

// Re-export public APIs
export { initializeCameraWithPnP } from './iterative-refinement';
export type { PnPInitializationResult, PnPOptions } from './iterative-refinement';
export type { PnPResult } from './types';

/**
 * Solve Perspective-n-Point (PnP) problem.
 * Computes camera pose from known 3D-2D correspondences.
 *
 * Algorithm selection:
 * - 3-4 points: Use P3P (Kneip's method)
 * - 4+ points: Use DLT-based approach
 *
 * @param correspondences - Array of 3D world points and their 2D image projections
 * @param viewpoint - Camera to initialize (uses intrinsics, updates pose)
 * @returns Camera pose or null if solve fails
 */
export function solvePnP(
  correspondences: Array<{ worldPoint: IWorldPoint; imagePoint: IImagePoint }>,
  viewpoint: IViewpoint
): PnPResult | null {
  const vpConcrete = viewpoint as Viewpoint;

  if (correspondences.length < 3) {
    log(`PnP: Need at least 3 correspondences, got ${correspondences.length}`);
    return null;
  }

  const validCorrespondences = correspondences.filter(c => {
    const wp = c.worldPoint as WorldPoint;
    return wp.optimizedXyz !== undefined && wp.optimizedXyz !== null;
  });

  if (validCorrespondences.length < 3) {
    log(`PnP: Need at least 3 points with optimizedXyz, got ${validCorrespondences.length}`);
    return null;
  }

  const K = getCameraMatrix(vpConcrete);

  const points3D: [number, number, number][] = [];
  const points2D: [number, number][] = [];

  for (const corr of validCorrespondences) {
    const wp = corr.worldPoint as WorldPoint;
    const ip = corr.imagePoint;

    points3D.push(wp.optimizedXyz!);
    points2D.push([ip.u, ip.v]);
  }

  let pose: { position: [number, number, number]; rotation: [number, number, number, number] } | null = null;

  if (validCorrespondences.length === 3 || validCorrespondences.length === 4) {
    pose = solveP3P(points3D, points2D, K);
    if (!pose) {
      log('PnP: P3P estimation failed, falling back to DLT');
      if (validCorrespondences.length >= 4) {
        pose = estimatePoseDLT(points3D, points2D, K);
      }
    }
  } else {
    pose = estimatePoseDLT(points3D, points2D, K);
  }

  if (!pose) {
    log('PnP: All estimation methods failed');
    return null;
  }

  return {
    position: pose.position,
    rotation: pose.rotation,
    success: true
  };
}

function getCameraMatrix(vp: Viewpoint): number[][] {
  return [
    [vp.focalLength, 0, vp.principalPointX],
    [0, vp.focalLength * vp.aspectRatio, vp.principalPointY],
    [0, 0, 1]
  ];
}
