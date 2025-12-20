/**
 * P3P (Perspective-3-Point) algorithm implementation.
 *
 * Solves camera pose from 3 or 4 point correspondences using Kneip's method.
 *
 * Reference: Kneip et al. "A Novel Parametrization of the P3P Problem" CVPR 2011
 */

import { distance } from '../../utils/vec3';
import { solveQuartic } from './polynomial-solvers';
import {
  dot3D,
  invert3x3,
  computeSVD3x3,
  matrixMultiply3x3,
  transpose3x3,
  determinant3x3,
  matrixToQuaternion,
  quaternionToMatrix
} from './math-utils';

/**
 * Solve P3P (Perspective-3-Point) problem using Kneip's method.
 * Works with 3 or 4 points. For 4 points, returns the solution with best reprojection error.
 *
 * Algorithm:
 * 1. Convert image points to bearing vectors (normalized camera coordinates)
 * 2. Compute angles between bearing vectors
 * 3. Solve quartic polynomial for camera-point distances
 * 4. For each valid solution, compute rotation and translation
 * 5. Return the solution with minimum reprojection error
 */
export function solveP3P(
  points3D: [number, number, number][],
  points2D: [number, number][],
  K: number[][]
): { position: [number, number, number]; rotation: [number, number, number, number] } | null {
  if (points3D.length < 3 || points3D.length > 4) {
    return null;
  }

  const Kinv = invert3x3(K);
  if (!Kinv) return null;

  const bearingVectors: [number, number, number][] = [];
  for (const pt2D of points2D) {
    const x = Kinv[0][0] * pt2D[0] + Kinv[0][1] * pt2D[1] + Kinv[0][2];
    const y = Kinv[1][0] * pt2D[0] + Kinv[1][1] * pt2D[1] + Kinv[1][2];
    const z = Kinv[2][0] * pt2D[0] + Kinv[2][1] * pt2D[1] + Kinv[2][2];

    const norm = Math.sqrt(x * x + y * y + z * z);
    bearingVectors.push([x / norm, y / norm, z / norm]);
  }

  const P1 = points3D[0];
  const P2 = points3D[1];
  const P3 = points3D[2];

  const d12 = distance(P1, P2);
  const d13 = distance(P1, P3);
  const d23 = distance(P2, P3);

  const cosAlpha = dot3D(bearingVectors[1], bearingVectors[2]);
  const cosBeta = dot3D(bearingVectors[0], bearingVectors[2]);
  const cosGamma = dot3D(bearingVectors[0], bearingVectors[1]);

  const a = d23 * d23;
  const b = d13 * d13;
  const c = d12 * d12;

  const a4 = (a - c) * (a - c) - 4 * c * a * cosAlpha * cosAlpha;
  const a3 = 4 * (a - c) * (c * (1 - cosAlpha * cosAlpha) - b) * cosBeta
    + 4 * c * cosAlpha * ((a - c) * cosGamma + 2 * a * cosAlpha * cosBeta);
  const a2 = 2 * (a * a - c * c + 2 * a * c + 2 * b * c
    - 4 * a * c * cosAlpha * cosAlpha - 2 * a * b)
    + 8 * b * c * cosBeta * cosBeta
    + (a - c) * (a + c - 2 * b) * cosGamma * cosGamma
    - 4 * (a + c) * c * cosAlpha * cosGamma
    + 4 * (a * c + b * c - a * b) * cosAlpha * cosAlpha;
  const a1 = 4 * (-a + c + 2 * b) * (c * cosAlpha * cosGamma + b * cosBeta)
    + 4 * b * ((a - c) * cosGamma * cosBeta + 2 * c * cosAlpha * cosBeta * cosBeta);
  const a0 = (b - c) * (b - c) - 4 * b * c * cosBeta * cosBeta;

  const roots = solveQuartic(a4, a3, a2, a1, a0);

  const solutions: Array<{ position: [number, number, number]; rotation: [number, number, number, number] }> = [];

  for (const v of roots) {
    if (v <= 0) continue;

    const u = (((-1 + v * v + b / a) * cosGamma - v * (1 - v * v - c / a) * cosBeta)
      / (v * v - 2 * v * cosGamma + 1));

    if (u <= 0) continue;

    const s1Squared = c / (1 + u * u - 2 * u * cosGamma);
    if (s1Squared <= 0) continue;

    const s1 = Math.sqrt(s1Squared);
    const s2 = u * s1;
    const s3 = v * s1;

    if (s2 <= 0 || s3 <= 0) continue;

    const P1_cam: [number, number, number] = [
      bearingVectors[0][0] * s1,
      bearingVectors[0][1] * s1,
      bearingVectors[0][2] * s1
    ];
    const P2_cam: [number, number, number] = [
      bearingVectors[1][0] * s2,
      bearingVectors[1][1] * s2,
      bearingVectors[1][2] * s2
    ];
    const P3_cam: [number, number, number] = [
      bearingVectors[2][0] * s3,
      bearingVectors[2][1] * s3,
      bearingVectors[2][2] * s3
    ];

    const pose = computePoseFrom3Points(
      [P1, P2, P3],
      [P1_cam, P2_cam, P3_cam]
    );

    if (pose) {
      solutions.push(pose);
    }
  }

  if (solutions.length === 0) {
    return null;
  }

  if (points3D.length === 3 || solutions.length === 1) {
    return solutions[0];
  }

  let bestSolution = solutions[0];
  let bestError = computeReprojectionErrorForPose(points3D, points2D, K, solutions[0]);

  for (let i = 1; i < solutions.length; i++) {
    const error = computeReprojectionErrorForPose(points3D, points2D, K, solutions[i]);
    if (error < bestError) {
      bestError = error;
      bestSolution = solutions[i];
    }
  }

  return bestSolution;
}

/**
 * Compute camera pose from 3 corresponding point pairs.
 * Uses SVD-based absolute orientation method.
 */
export function computePoseFrom3Points(
  worldPoints: [number, number, number][],
  cameraPoints: [number, number, number][]
): { position: [number, number, number]; rotation: [number, number, number, number] } | null {
  const centroidWorld: [number, number, number] = [0, 0, 0];
  const centroidCamera: [number, number, number] = [0, 0, 0];

  for (let i = 0; i < 3; i++) {
    centroidWorld[0] += worldPoints[i][0];
    centroidWorld[1] += worldPoints[i][1];
    centroidWorld[2] += worldPoints[i][2];
    centroidCamera[0] += cameraPoints[i][0];
    centroidCamera[1] += cameraPoints[i][1];
    centroidCamera[2] += cameraPoints[i][2];
  }

  centroidWorld[0] /= 3;
  centroidWorld[1] /= 3;
  centroidWorld[2] /= 3;
  centroidCamera[0] /= 3;
  centroidCamera[1] /= 3;
  centroidCamera[2] /= 3;

  const H: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

  for (let i = 0; i < 3; i++) {
    const pw_centered = [
      worldPoints[i][0] - centroidWorld[0],
      worldPoints[i][1] - centroidWorld[1],
      worldPoints[i][2] - centroidWorld[2]
    ];
    const pc_centered = [
      cameraPoints[i][0] - centroidCamera[0],
      cameraPoints[i][1] - centroidCamera[1],
      cameraPoints[i][2] - centroidCamera[2]
    ];

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        H[r][c] += pc_centered[r] * pw_centered[c];
      }
    }
  }

  const svd = computeSVD3x3(H);
  if (!svd) return null;

  let R = matrixMultiply3x3(svd.V, transpose3x3(svd.U));

  if (determinant3x3(R) < 0) {
    svd.V[0][2] = -svd.V[0][2];
    svd.V[1][2] = -svd.V[1][2];
    svd.V[2][2] = -svd.V[2][2];
    R = matrixMultiply3x3(svd.V, transpose3x3(svd.U));
  }

  const R_T = transpose3x3(R);

  const R_centroid_world = [
    R[0][0] * centroidWorld[0] + R[0][1] * centroidWorld[1] + R[0][2] * centroidWorld[2],
    R[1][0] * centroidWorld[0] + R[1][1] * centroidWorld[1] + R[1][2] * centroidWorld[2],
    R[2][0] * centroidWorld[0] + R[2][1] * centroidWorld[1] + R[2][2] * centroidWorld[2]
  ];

  const position: [number, number, number] = [
    centroidWorld[0] - (R_T[0][0] * (R_centroid_world[0] - centroidCamera[0]) + R_T[0][1] * (R_centroid_world[1] - centroidCamera[1]) + R_T[0][2] * (R_centroid_world[2] - centroidCamera[2])),
    centroidWorld[1] - (R_T[1][0] * (R_centroid_world[0] - centroidCamera[0]) + R_T[1][1] * (R_centroid_world[1] - centroidCamera[1]) + R_T[1][2] * (R_centroid_world[2] - centroidCamera[2])),
    centroidWorld[2] - (R_T[2][0] * (R_centroid_world[0] - centroidCamera[0]) + R_T[2][1] * (R_centroid_world[1] - centroidCamera[1]) + R_T[2][2] * (R_centroid_world[2] - centroidCamera[2]))
  ];

  const quaternion = matrixToQuaternion(R);
  return { position, rotation: quaternion };
}

/**
 * Compute reprojection error for a pose solution.
 */
function computeReprojectionErrorForPose(
  points3D: [number, number, number][],
  points2D: [number, number][],
  K: number[][],
  pose: { position: [number, number, number]; rotation: [number, number, number, number] }
): number {
  const R = quaternionToMatrix(pose.rotation);
  const C_world = pose.position;

  let totalError = 0;

  for (let i = 0; i < points3D.length; i++) {
    const P_world = points3D[i];

    const P_rel = [
      P_world[0] - C_world[0],
      P_world[1] - C_world[1],
      P_world[2] - C_world[2]
    ];

    const P_cam = [
      R[0][0] * P_rel[0] + R[0][1] * P_rel[1] + R[0][2] * P_rel[2],
      R[1][0] * P_rel[0] + R[1][1] * P_rel[1] + R[1][2] * P_rel[2],
      R[2][0] * P_rel[0] + R[2][1] * P_rel[1] + R[2][2] * P_rel[2]
    ];

    if (P_cam[2] <= 0) {
      totalError += 10000;
      continue;
    }

    const projected = [
      K[0][0] * P_cam[0] / P_cam[2] + K[0][2],
      K[1][1] * P_cam[1] / P_cam[2] + K[1][2]
    ];

    const dx = projected[0] - points2D[i][0];
    const dy = projected[1] - points2D[i][1];
    totalError += Math.sqrt(dx * dx + dy * dy);
  }

  return totalError / points3D.length;
}
