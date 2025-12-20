/**
 * Essential Matrix estimation and decomposition for two-view geometry initialization.
 *
 * References:
 * - Hartley & Zisserman "Multiple View Geometry in Computer Vision" (2004)
 * - Chapter 9: Epipolar Geometry and the Fundamental Matrix
 */

import type { Viewpoint } from '../../entities/viewpoint';
import type { Correspondence } from './types';
import { normalizeImageCoordinates, rotationMatrixToQuaternion } from './matrix-utils';
import { estimateEssentialMatrix7Point, estimateEssentialMatrix8Point } from './estimation';
import { decomposeEssentialMatrix, selectCorrectDecomposition, isTranslationDegenerate } from './decomposition';
import { ransacEssentialMatrix } from './validation';
import { log } from '../optimization-logger';

export type { Correspondence, EssentialMatrixResult, DecomposedEssentialMatrix, CameraPose, RansacResult } from './types';

export function initializeCamerasWithEssentialMatrix(
  vp1: Viewpoint,
  vp2: Viewpoint,
  baselineScale: number = 1.0
): { success: boolean; error?: string } {
  const correspondences: Correspondence[] = [];

  for (const ip1 of vp1.imagePoints) {
    for (const ip2 of vp2.imagePoints) {
      if (ip1.worldPoint === ip2.worldPoint) {
        const [x1, y1] = normalizeImageCoordinates(
          ip1.u, ip1.v,
          vp1.focalLength, vp1.focalLength,
          vp1.principalPointX, vp1.principalPointY
        );
        const [x2, y2] = normalizeImageCoordinates(
          ip2.u, ip2.v,
          vp2.focalLength, vp2.focalLength,
          vp2.principalPointX, vp2.principalPointY
        );

        correspondences.push({ x1, y1, x2, y2 });
      }
    }
  }

  if (correspondences.length < 7) {
    return {
      success: false,
      error: `Need at least 7 correspondences, found ${correspondences.length}`
    };
  }

  let bestDecomposition: { R: number[][], t: number[] } | null = null;
  let bestE: number[][] | null = null;

  // Try RANSAC first if we have enough correspondences (>= 8 for meaningful sampling)
  if (correspondences.length >= 8) {
    const ransacResult = ransacEssentialMatrix(correspondences, 100, 0.01);

    if (ransacResult && !isTranslationDegenerate(ransacResult.t)) {
      bestDecomposition = { R: ransacResult.R, t: ransacResult.t };
      bestE = ransacResult.E;
    }
  }

  // Fall back to deterministic algorithms if RANSAC didn't find a good solution
  if (!bestDecomposition) {
    let allCandidates: number[][][] = [];

    if (correspondences.length === 7) {
      allCandidates = estimateEssentialMatrix7Point(correspondences);
    } else {
      const E = estimateEssentialMatrix8Point(correspondences);
      allCandidates = [E];
    }

    let bestScore = -1;

    for (let candidateIdx = 0; candidateIdx < allCandidates.length; candidateIdx++) {
      const E = allCandidates[candidateIdx];
      const decompositions = decomposeEssentialMatrix(E);
      const candidateDecomp = selectCorrectDecomposition(decompositions, correspondences);

      // Skip degenerate solutions
      if (isTranslationDegenerate(candidateDecomp.t)) {
        continue;
      }

      if (candidateDecomp.score > bestScore) {
        bestScore = candidateDecomp.score;
        bestDecomposition = candidateDecomp;
        bestE = E;
      }
    }
  }

  if (!bestDecomposition || !bestE) {
    return {
      success: false,
      error: 'Failed to find valid non-degenerate decomposition. Try adding more point correspondences with better spatial distribution.'
    };
  }

  // Check if the selected solution is degenerate
  if (isTranslationDegenerate(bestDecomposition.t)) {
    return {
      success: false,
      error: 'All Essential Matrix solutions are degenerate. The scene geometry may be too planar or the camera motion is ambiguous.'
    };
  }

  const tNorm = Math.sqrt(
    bestDecomposition.t[0] * bestDecomposition.t[0] +
    bestDecomposition.t[1] * bestDecomposition.t[1] +
    bestDecomposition.t[2] * bestDecomposition.t[2]
  );

  if (tNorm < 1e-10) {
    return { success: false, error: 'Translation norm is too small (degenerate configuration)' };
  }

  const tScaled = [
    bestDecomposition.t[0] / tNorm * baselineScale,
    bestDecomposition.t[1] / tNorm * baselineScale,
    bestDecomposition.t[2] / tNorm * baselineScale
  ];

  vp1.position = [0, 0, 0];
  vp1.rotation = [1, 0, 0, 0];

  // The Essential Matrix decomposition gives us R and t where:
  //   x2 = R * x1 + t  (point transformation from cam1 to cam2 coords)
  //   P2 = K * [R | t] (projection matrix)
  //
  // The camera CENTER C2 in world coordinates is: C2 = -R^T * t
  // (since t = -R * C2, we solve for C2)
  const R = bestDecomposition.R;
  const RT = [
    [R[0][0], R[1][0], R[2][0]],
    [R[0][1], R[1][1], R[2][1]],
    [R[0][2], R[1][2], R[2][2]]
  ];
  const camera2Center = [
    -(RT[0][0] * tScaled[0] + RT[0][1] * tScaled[1] + RT[0][2] * tScaled[2]),
    -(RT[1][0] * tScaled[0] + RT[1][1] * tScaled[1] + RT[1][2] * tScaled[2]),
    -(RT[2][0] * tScaled[0] + RT[2][1] * tScaled[1] + RT[2][2] * tScaled[2])
  ];

  const quat = rotationMatrixToQuaternion(bestDecomposition.R);
  vp2.position = [camera2Center[0], camera2Center[1], camera2Center[2]];
  vp2.rotation = [quat[0], quat[1], quat[2], quat[3]];

  log(`[EssentialMatrix] ${correspondences.length} pts, t=[${tScaled.map(v => v.toFixed(2)).join(',')}]`);

  return { success: true };
}
