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

import type { IViewpoint, IImagePoint, IWorldPoint } from '../entities/interfaces';
import type { Viewpoint } from '../entities/viewpoint';
import type { WorldPoint } from '../entities/world-point';
import { ConstraintSystem } from './constraint-system';
import { projectWorldPointToPixelQuaternion } from './camera-projection';
import { V, Vec3, Vec4 } from 'scalar-autograd';
import { log, logOnce } from './optimization-logger';
import type { PnPResult } from './pnp/types';
import { distance } from '../utils/vec3';

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
 *
 * Reference: Kneip et al. "A Novel Parametrization of the P3P Problem" CVPR 2011
 */
function solveP3P(
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

function solveQuartic(a4: number, a3: number, a2: number, a1: number, a0: number): number[] {
  if (Math.abs(a4) < 1e-10) {
    return solveCubic(a3, a2, a1, a0);
  }

  const b3 = a3 / a4;
  const b2 = a2 / a4;
  const b1 = a1 / a4;
  const b0 = a0 / a4;

  const p = b2 - (3 * b3 * b3) / 8;
  const q = b1 - (b3 * b2) / 2 + (b3 * b3 * b3) / 8;
  const r = b0 - (b3 * b1) / 4 + (b3 * b3 * b2) / 16 - (3 * b3 * b3 * b3 * b3) / 256;

  const cubicRoots = solveCubic(1, p / 2, (p * p - 4 * r) / 16, -(q * q) / 64);

  if (cubicRoots.length === 0) return [];

  const y = cubicRoots[0];
  const D = 2 * y - p;

  if (D < -1e-10) return [];

  const sqrtD = Math.sqrt(Math.max(0, D));

  const roots: number[] = [];

  const E1 = -q / (2 * sqrtD) - p / 2 - y;
  if (E1 >= -1e-10) {
    const sqrtE1 = Math.sqrt(Math.max(0, E1));
    roots.push(-b3 / 4 + sqrtD / 2 + sqrtE1 / 2);
    roots.push(-b3 / 4 + sqrtD / 2 - sqrtE1 / 2);
  }

  const E2 = q / (2 * sqrtD) - p / 2 - y;
  if (E2 >= -1e-10) {
    const sqrtE2 = Math.sqrt(Math.max(0, E2));
    roots.push(-b3 / 4 - sqrtD / 2 + sqrtE2 / 2);
    roots.push(-b3 / 4 - sqrtD / 2 - sqrtE2 / 2);
  }

  return roots;
}

function solveCubic(a3: number, a2: number, a1: number, a0: number): number[] {
  if (Math.abs(a3) < 1e-10) {
    return solveQuadratic(a2, a1, a0);
  }

  const p = a2 / a3;
  const q = a1 / a3;
  const r = a0 / a3;

  const Q = (3 * q - p * p) / 9;
  const R = (9 * p * q - 27 * r - 2 * p * p * p) / 54;
  const D = Q * Q * Q + R * R;

  const roots: number[] = [];

  if (D >= 0) {
    const sqrtD = Math.sqrt(D);
    const S = Math.sign(R + sqrtD) * Math.pow(Math.abs(R + sqrtD), 1 / 3);
    const T = Math.sign(R - sqrtD) * Math.pow(Math.abs(R - sqrtD), 1 / 3);
    roots.push(-p / 3 + S + T);
  } else {
    const theta = Math.acos(R / Math.sqrt(-Q * Q * Q));
    const sqrtQ = Math.sqrt(-Q);
    roots.push(2 * sqrtQ * Math.cos(theta / 3) - p / 3);
    roots.push(2 * sqrtQ * Math.cos((theta + 2 * Math.PI) / 3) - p / 3);
    roots.push(2 * sqrtQ * Math.cos((theta + 4 * Math.PI) / 3) - p / 3);
  }

  return roots;
}

function solveQuadratic(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-10) {
    if (Math.abs(b) < 1e-10) return [];
    return [-c / b];
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < -1e-10) return [];

  const sqrtD = Math.sqrt(Math.max(0, discriminant));
  return [(-b + sqrtD) / (2 * a), (-b - sqrtD) / (2 * a)];
}

function computePoseFrom3Points(
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

function computeSVD3x3(M: number[][]): { U: number[][]; S: number[]; V: number[][] } | null {
  const MtM = matrixMultiply3x3(transpose3x3(M), M);
  const eigenVectors = computeEigenVectors3x3(MtM);
  if (!eigenVectors) return null;

  const V = eigenVectors;

  const U: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const S: number[] = [0, 0, 0];

  for (let i = 0; i < 3; i++) {
    const v = [V[0][i], V[1][i], V[2][i]];
    const Mv = [
      M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
      M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
      M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
    ];

    S[i] = Math.sqrt(Mv[0] * Mv[0] + Mv[1] * Mv[1] + Mv[2] * Mv[2]);

    if (S[i] > 1e-10) {
      U[0][i] = Mv[0] / S[i];
      U[1][i] = Mv[1] / S[i];
      U[2][i] = Mv[2] / S[i];
    } else {
      U[0][i] = 0;
      U[1][i] = 0;
      U[2][i] = 0;
    }
  }

  return { U, S, V };
}

function computeEigenVectors3x3(M: number[][]): number[][] | null {
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const vectors: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

  for (let iter = 0; iter < 3; iter++) {
    let v = [Math.random(), Math.random(), Math.random()];

    for (let i = 0; i < iter; i++) {
      const proj = v[0] * vectors[i][0] + v[1] * vectors[i][1] + v[2] * vectors[i][2];
      v[0] -= proj * vectors[i][0];
      v[1] -= proj * vectors[i][1];
      v[2] -= proj * vectors[i][2];
    }

    for (let powerIter = 0; powerIter < 100; powerIter++) {
      const Av = [
        M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
        M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
        M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
      ];

      for (let i = 0; i < iter; i++) {
        const proj = Av[0] * vectors[i][0] + Av[1] * vectors[i][1] + Av[2] * vectors[i][2];
        Av[0] -= proj * vectors[i][0];
        Av[1] -= proj * vectors[i][1];
        Av[2] -= proj * vectors[i][2];
      }

      const norm = Math.sqrt(Av[0] * Av[0] + Av[1] * Av[1] + Av[2] * Av[2]);
      if (norm < 1e-10) break;

      v[0] = Av[0] / norm;
      v[1] = Av[1] / norm;
      v[2] = Av[2] / norm;
    }

    const norm = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (norm > 1e-10) {
      vectors[iter][0] = v[0] / norm;
      vectors[iter][1] = v[1] / norm;
      vectors[iter][2] = v[2] / norm;
    } else {
      return null;
    }
  }

  return vectors;
}

function transpose3x3(M: number[][]): number[][] {
  return [
    [M[0][0], M[1][0], M[2][0]],
    [M[0][1], M[1][1], M[2][1]],
    [M[0][2], M[1][2], M[2][2]]
  ];
}

function dot3D(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

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

function quaternionToMatrix(q: [number, number, number, number]): number[][] {
  const [w, x, y, z] = q;

  return [
    [1 - 2 * y * y - 2 * z * z, 2 * x * y - 2 * z * w, 2 * x * z + 2 * y * w],
    [2 * x * y + 2 * z * w, 1 - 2 * x * x - 2 * z * z, 2 * y * z - 2 * x * w],
    [2 * x * z - 2 * y * w, 2 * y * z + 2 * x * w, 1 - 2 * x * x - 2 * y * y]
  ];
}

/**
 * Estimate camera pose using Direct Linear Transform (DLT).
 *
 * For each 3D-2D correspondence (Xi, xi):
 *   xi × (P * Xi) = 0
 *
 * This gives 2 equations per point (third is linearly dependent).
 * We solve for the 12 elements of P = K[R|t], then decompose.
 */
function estimatePoseDLT(
  points3D: [number, number, number][],
  points2D: [number, number][],
  K: number[][]
): { position: [number, number, number]; rotation: [number, number, number, number] } | null {
  const n = points3D.length;
  if (n < 4) return null;

  const A: number[][] = [];

  for (let i = 0; i < n; i++) {
    const [X, Y, Z] = points3D[i];
    const [x, y] = points2D[i];

    A.push([
      0, 0, 0, 0,
      -X, -Y, -Z, -1,
      y * X, y * Y, y * Z, y
    ]);

    A.push([
      X, Y, Z, 1,
      0, 0, 0, 0,
      -x * X, -x * Y, -x * Z, -x
    ]);
  }

  const P = solveHomogeneousSystem(A);
  if (!P) return null;

  const P_matrix = [
    [P[0], P[1], P[2], P[3]],
    [P[4], P[5], P[6], P[7]],
    [P[8], P[9], P[10], P[11]]
  ];

  return decomposePMatrix(P_matrix, K);
}

/**
 * Solve homogeneous linear system A * x = 0 using SVD.
 * Returns the null space vector (last column of V).
 */
function solveHomogeneousSystem(A: number[][]): number[] | null {
  if (A.length === 0 || A[0].length === 0) return null;

  const svd = computeSVD(A);
  if (!svd) return null;

  return svd.V[svd.V.length - 1];
}

/**
 * Simplified SVD using power iteration for the smallest singular value.
 * Returns V (right singular vectors) where last row is the solution.
 */
function computeSVD(A: number[][]): { V: number[][] } | null {
  const m = A.length;
  const n = A[0].length;

  const AtA = multiplyTranspose(A, A);

  const eigenVectors = computeEigenVectors(AtA);
  if (!eigenVectors) return null;

  return { V: eigenVectors };
}

function multiplyTranspose(A: number[][], B: number[][]): number[][] {
  const m = A[0].length;
  const n = B[0].length;
  const result: number[][] = Array(m).fill(0).map(() => Array(n).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < A.length; k++) {
        sum += A[k][i] * B[k][j];
      }
      result[i][j] = sum;
    }
  }

  return result;
}

function computeEigenVectors(A: number[][]): number[][] | null {
  const n = A.length;
  const vectors: number[][] = [];

  for (let iter = 0; iter < n; iter++) {
    let v = Array(n).fill(0).map(() => Math.random());

    for (let i = 0; i < vectors.length; i++) {
      const proj = dotProduct(v, vectors[i]);
      for (let j = 0; j < n; j++) {
        v[j] -= proj * vectors[i][j];
      }
    }

    for (let powerIter = 0; powerIter < 100; powerIter++) {
      const Av = matrixVectorMultiply(A, v);

      for (let i = 0; i < vectors.length; i++) {
        const proj = dotProduct(Av, vectors[i]);
        for (let j = 0; j < n; j++) {
          Av[j] -= proj * vectors[i][j];
        }
      }

      const norm = Math.sqrt(dotProduct(Av, Av));
      if (norm < 1e-10) break;

      for (let i = 0; i < n; i++) {
        v[i] = Av[i] / norm;
      }
    }

    const norm = Math.sqrt(dotProduct(v, v));
    if (norm > 1e-10) {
      for (let i = 0; i < n; i++) {
        v[i] /= norm;
      }
      vectors.push(v);
    }
  }

  return vectors.length === n ? vectors : null;
}

function matrixVectorMultiply(A: number[][], v: number[]): number[] {
  return A.map(row => dotProduct(row, v));
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

/**
 * Decompose projection matrix P = K[R|t] into rotation and translation.
 *
 * P = K[R|t] where K is camera intrinsics, R is rotation, t is translation
 * First we compute M = K^{-1} * P_left where P_left is the left 3x3 of P
 * M should equal R (rotation matrix)
 * Then t = K^{-1} * p4 where p4 is the last column of P
 */
function decomposePMatrix(P: number[][], K: number[][]): {
  position: [number, number, number];
  rotation: [number, number, number, number];
} | null {
  const Kinv = invert3x3(K);
  if (!Kinv) return null;

  const P_left = [
    [P[0][0], P[0][1], P[0][2]],
    [P[1][0], P[1][1], P[1][2]],
    [P[2][0], P[2][1], P[2][2]]
  ];

  const M = matrixMultiply3x3(Kinv, P_left);

  const R = orthogonalizeMatrix(M);

  const detR = determinant3x3(R);
  if (detR < 0) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        R[i][j] = -R[i][j];
      }
    }
  }

  const p4 = [P[0][3], P[1][3], P[2][3]];

  const t = [
    Kinv[0][0] * p4[0] + Kinv[0][1] * p4[1] + Kinv[0][2] * p4[2],
    Kinv[1][0] * p4[0] + Kinv[1][1] * p4[1] + Kinv[1][2] * p4[2],
    Kinv[2][0] * p4[0] + Kinv[2][1] * p4[1] + Kinv[2][2] * p4[2]
  ];

  const R_T = [
    [R[0][0], R[1][0], R[2][0]],
    [R[0][1], R[1][1], R[2][1]],
    [R[0][2], R[1][2], R[2][2]]
  ];

  const C_x = -(R_T[0][0] * t[0] + R_T[0][1] * t[1] + R_T[0][2] * t[2]);
  const C_y = -(R_T[1][0] * t[0] + R_T[1][1] * t[1] + R_T[1][2] * t[2]);
  const C_z = -(R_T[2][0] * t[0] + R_T[2][1] * t[1] + R_T[2][2] * t[2]);

  const position: [number, number, number] = [C_x, C_y, C_z];

  const quaternion = matrixToQuaternion(R);

  return { position, rotation: quaternion };
}

/**
 * Convert rotation matrix to unit quaternion.
 * Using Shepperd's method for numerical stability.
 */
function matrixToQuaternion(R: number[][]): [number, number, number, number] {
  const trace = R[0][0] + R[1][1] + R[2][2];

  let w, x, y, z;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1.0) * 2;
    w = 0.25 * s;
    x = (R[2][1] - R[1][2]) / s;
    y = (R[0][2] - R[2][0]) / s;
    z = (R[1][0] - R[0][1]) / s;
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const s = Math.sqrt(1.0 + R[0][0] - R[1][1] - R[2][2]) * 2;
    w = (R[2][1] - R[1][2]) / s;
    x = 0.25 * s;
    y = (R[0][1] + R[1][0]) / s;
    z = (R[0][2] + R[2][0]) / s;
  } else if (R[1][1] > R[2][2]) {
    const s = Math.sqrt(1.0 + R[1][1] - R[0][0] - R[2][2]) * 2;
    w = (R[0][2] - R[2][0]) / s;
    x = (R[0][1] + R[1][0]) / s;
    y = 0.25 * s;
    z = (R[1][2] + R[2][1]) / s;
  } else {
    const s = Math.sqrt(1.0 + R[2][2] - R[0][0] - R[1][1]) * 2;
    w = (R[1][0] - R[0][1]) / s;
    x = (R[0][2] + R[2][0]) / s;
    y = (R[1][2] + R[2][1]) / s;
    z = 0.25 * s;
  }

  const norm = Math.sqrt(w * w + x * x + y * y + z * z);
  return [w / norm, x / norm, y / norm, z / norm];
}

/**
 * Orthogonalize a 3x3 matrix using SVD approximation (Gram-Schmidt).
 */
function orthogonalizeMatrix(M: number[][]): number[][] {
  let r0 = [M[0][0], M[0][1], M[0][2]];
  let r1 = [M[1][0], M[1][1], M[1][2]];
  let r2 = [M[2][0], M[2][1], M[2][2]];

  r0 = normalize(r0);

  const proj1 = dotProduct(r1, r0);
  r1 = [r1[0] - proj1 * r0[0], r1[1] - proj1 * r0[1], r1[2] - proj1 * r0[2]];
  r1 = normalize(r1);

  const proj2a = dotProduct(r2, r0);
  const proj2b = dotProduct(r2, r1);
  r2 = [
    r2[0] - proj2a * r0[0] - proj2b * r1[0],
    r2[1] - proj2a * r0[1] - proj2b * r1[1],
    r2[2] - proj2a * r0[2] - proj2b * r1[2]
  ];
  r2 = normalize(r2);

  return [r0, r1, r2];
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return norm > 1e-10 ? [v[0] / norm, v[1] / norm, v[2] / norm] : v;
}

function determinant3x3(M: number[][]): number {
  return (
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
    M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
    M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0])
  );
}

function invert3x3(A: number[][]): number[][] | null {
  const det = determinant3x3(A);
  if (Math.abs(det) < 1e-10) return null;

  const inv: number[][] = [
    [
      (A[1][1] * A[2][2] - A[1][2] * A[2][1]) / det,
      (A[0][2] * A[2][1] - A[0][1] * A[2][2]) / det,
      (A[0][1] * A[1][2] - A[0][2] * A[1][1]) / det
    ],
    [
      (A[1][2] * A[2][0] - A[1][0] * A[2][2]) / det,
      (A[0][0] * A[2][2] - A[0][2] * A[2][0]) / det,
      (A[0][2] * A[1][0] - A[0][0] * A[1][2]) / det
    ],
    [
      (A[1][0] * A[2][1] - A[1][1] * A[2][0]) / det,
      (A[0][1] * A[2][0] - A[0][0] * A[2][1]) / det,
      (A[0][0] * A[1][1] - A[0][1] * A[1][0]) / det
    ]
  ];

  return inv;
}

function matrixMultiply3x3(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }

  return result;
}

export interface PnPInitializationResult {
  success: boolean;
  reliable: boolean;
  finalReprojectionError?: number;
  reason?: string;
}

export interface PnPOptions {
  /**
   * If true, use any point with optimizedXyz for PnP, not just fully constrained ones.
   * Use this for "late PnP" cases where points have been triangulated from other cameras.
   * Default: false (only use fully constrained points)
   */
  useTriangulatedPoints?: boolean;
}

/**
 * Initialize an additional camera using iterative PnP optimization.
 *
 * Algorithm:
 * 1. Use geometric heuristic for initial guess
 * 2. Refine camera pose using bundle adjustment (world points fixed)
 * 3. Return reprojection error for diagnostics
 *
 * This approach is robust and leverages our existing optimization infrastructure.
 *
 * Returns:
 * - success: true if pose was computed
 * - reliable: true if the result appears reasonable (not a degenerate solution)
 * - finalReprojectionError: the final reprojection error in pixels
 */
export function initializeCameraWithPnP(
  viewpoint: IViewpoint,
  allWorldPoints: Set<IWorldPoint>,
  options: PnPOptions = {}
): PnPInitializationResult {
  const { useTriangulatedPoints = false } = options;
  const vpConcrete = viewpoint as Viewpoint;

  // For centroid/geometry calculation:
  // - Default mode (useTriangulatedPoints=false): Only use constrained points (locked or inferred coordinates)
  //   Unconstrained points may have garbage optimizedXyz from previous failed optimizations.
  // - Late PnP mode (useTriangulatedPoints=true): Use any point with optimizedXyz, since these
  //   were triangulated from successfully initialized cameras and are reliable.
  const constrainedPoints: [number, number, number][] = [];

  for (const ip of vpConcrete.imagePoints) {
    const wp = ip.worldPoint as WorldPoint;
    const canUsePoint = useTriangulatedPoints
      ? wp.optimizedXyz !== undefined && wp.optimizedXyz !== null
      : wp.optimizedXyz && wp.isFullyConstrained();

    if (canUsePoint && wp.optimizedXyz) {
      constrainedPoints.push(wp.optimizedXyz);
    }
  }

  // Need at least 3 points for reliable centroid
  if (constrainedPoints.length < 3) {
    const pointType = useTriangulatedPoints ? 'triangulated' : 'constrained';
    logOnce(`PnP: Camera ${vpConcrete.name} has only ${constrainedPoints.length} ${pointType} points (need 3)`);
    return { success: false, reliable: false, reason: `Not enough ${pointType} points (have ${constrainedPoints.length}, need 3)` };
  }

  // Use constrained points for centroid (reliable positions)
  const centroid: [number, number, number] = [0, 0, 0];
  for (const pt of constrainedPoints) {
    centroid[0] += pt[0];
    centroid[1] += pt[1];
    centroid[2] += pt[2];
  }
  centroid[0] /= constrainedPoints.length;
  centroid[1] /= constrainedPoints.length;
  centroid[2] /= constrainedPoints.length;

  log(`  Centroid of ${constrainedPoints.length} constrained points: [${centroid.map(x => x.toFixed(3)).join(', ')}]`);
  log(`  Sample constrained points (first 5):`);
  for (let i = 0; i < Math.min(5, constrainedPoints.length); i++) {
    log(`    [${constrainedPoints[i].map(x => x.toFixed(3)).join(', ')}]`);
  }

  let maxDist = 0;
  for (const pt of constrainedPoints) {
    const dx = pt[0] - centroid[0];
    const dy = pt[1] - centroid[1];
    const dz = pt[2] - centroid[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    maxDist = Math.max(maxDist, dist);
  }

  const cameraDistance = Math.max(maxDist * 2.5, 10);
  log(`  Max distance from centroid: ${maxDist.toFixed(3)}`);
  log(`  Computed camera distance: ${cameraDistance.toFixed(3)}`);

  // Helper to run PnP optimization with given initial position/rotation
  function runPnPFromDirection(
    position: [number, number, number],
    rotation: [number, number, number, number]
  ): { error: number; position: [number, number, number]; rotation: [number, number, number, number]; iterations: number } {
    vpConcrete.position = position;
    vpConcrete.rotation = rotation;

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
      system.addImagePoint(ip);
    }

    const result = system.solve();
    const error = computeReprojectionError(vpConcrete);

    return {
      error,
      position: [...vpConcrete.position] as [number, number, number],
      rotation: [...vpConcrete.rotation] as [number, number, number, number],
      iterations: result.iterations
    };
  }

  // First try the standard direction: negative Z from centroid
  const initialPosition: [number, number, number] = [centroid[0], centroid[1], centroid[2] - cameraDistance];
  log(`  Initial camera position: [${initialPosition.map(x => x.toFixed(3)).join(', ')}]`);

  const initialError = computeReprojectionError(vpConcrete);
  let result = runPnPFromDirection(initialPosition, [1, 0, 0, 0]);
  let finalError = result.error;
  let bestIterations = result.iterations;

  // Helper to count points in front of camera
  function countPointsInFrontForPose(position: [number, number, number], rotation: [number, number, number, number]): number {
    const R = quaternionToMatrix(rotation);
    let count = 0;
    for (const pt of constrainedPoints) {
      const rel = [pt[0] - position[0], pt[1] - position[1], pt[2] - position[2]];
      const camZ = R[2][0] * rel[0] + R[2][1] * rel[1] + R[2][2] * rel[2];
      if (camZ > 0) count++;
    }
    return count;
  }

  // Check if first direction has valid solution (low error AND points in front)
  let pointsInFrontForBest = countPointsInFrontForPose(result.position, result.rotation);
  const isFirstDirectionValid = finalError < 50 && pointsInFrontForBest >= constrainedPoints.length * 0.5;

  // If first direction gave poor results (high error OR points behind), try other directions
  if (!isFirstDirectionValid) {
    log(`  First direction: error=${finalError.toFixed(2)} px, points in front=${pointsInFrontForBest}/${constrainedPoints.length} - trying other directions...`);

    const otherDirections: { name: string; offset: [number, number, number]; rotation: [number, number, number, number] }[] = [
      { name: '+Z', offset: [0, 0, cameraDistance], rotation: [0, 0, 1, 0] },
      { name: '-X', offset: [-cameraDistance, 0, 0], rotation: [0.707, 0, 0.707, 0] },
      { name: '+X', offset: [cameraDistance, 0, 0], rotation: [0.707, 0, -0.707, 0] },
      { name: '-Y', offset: [0, -cameraDistance, 0], rotation: [0.707, -0.707, 0, 0] },
      { name: '+Y', offset: [0, cameraDistance, 0], rotation: [0.707, 0.707, 0, 0] },
    ];

    for (const dir of otherDirections) {
      const pos: [number, number, number] = [
        centroid[0] + dir.offset[0],
        centroid[1] + dir.offset[1],
        centroid[2] + dir.offset[2]
      ];

      const dirResult = runPnPFromDirection(pos, dir.rotation);
      const dirPointsInFront = countPointsInFrontForPose(dirResult.position, dirResult.rotation);

      // A solution is better if: (1) more points in front, or (2) same points in front but lower error
      const isBetter = dirPointsInFront > pointsInFrontForBest ||
        (dirPointsInFront === pointsInFrontForBest && dirResult.error < finalError);

      if (isBetter) {
        finalError = dirResult.error;
        result = dirResult;
        bestIterations = dirResult.iterations;
        pointsInFrontForBest = dirPointsInFront;
        log(`  Direction ${dir.name}: error=${dirResult.error.toFixed(2)} px, points in front=${dirPointsInFront}/${constrainedPoints.length} (improved)`);
      }

      // Early exit if we found a good solution (low error AND points in front)
      if (finalError < 10 && pointsInFrontForBest >= constrainedPoints.length * 0.5) break;
    }
  }

  // Use the best result
  vpConcrete.position = result.position;
  vpConcrete.rotation = result.rotation;

  log(`PnP: Initialized ${vpConcrete.name} using ${constrainedPoints.length} constrained points`);
  log(`  Initial reprojection error: ${initialError.toFixed(2)} px`);
  log(`  Final reprojection error: ${finalError.toFixed(2)} px (${bestIterations} iterations)`);
  log(`  Position: [${vpConcrete.position.map(x => x.toFixed(3)).join(', ')}]`);

  // Validate the result to detect degenerate solutions
  // A degenerate solution typically has:
  // 1. Camera drifted far from initial estimate (placed very far away)
  // 2. Final error that's still too high to be useful
  // 3. Points behind the camera

  let reliable = true;
  let reason: string | undefined;

  // Check 1: Verify camera didn't drift too far from initial position estimate
  // A degenerate solution often places the camera very far away where all points
  // project to nearly the same location, achieving low reprojection error incorrectly.
  const finalDx = vpConcrete.position[0] - centroid[0];
  const finalDy = vpConcrete.position[1] - centroid[1];
  const finalDz = vpConcrete.position[2] - centroid[2];
  const finalDistFromCentroid = Math.sqrt(finalDx * finalDx + finalDy * finalDy + finalDz * finalDz);
  const distanceRatio = finalDistFromCentroid / cameraDistance;

  log(`  Final distance from centroid: ${finalDistFromCentroid.toFixed(3)} (ratio to initial: ${distanceRatio.toFixed(2)}x)`);

  const maxDistanceRatio = 15.0; // Allow up to 15x the initial estimate (generous because heuristic is rough)
  if (distanceRatio > maxDistanceRatio) {
    reliable = false;
    reason = `Camera drifted too far: ${finalDistFromCentroid.toFixed(1)} units (${distanceRatio.toFixed(1)}x initial estimate of ${cameraDistance.toFixed(1)})`;
    log(`  WARNING: ${reason}`);

    // Reset to initial position since the optimization diverged
    vpConcrete.position = [centroid[0], centroid[1], centroid[2] - cameraDistance];
    vpConcrete.rotation = [1, 0, 0, 0];
    log(`  Resetting camera to initial position: [${vpConcrete.position.map(x => x.toFixed(3)).join(', ')}]`);
  }

  // Check 2: If final error is still very high, the result is unreliable
  // Note: 60px threshold allows for reasonable manual clicking accuracy
  // while still rejecting clearly bad solutions
  const maxAcceptableError = 60; // pixels
  if (finalError > maxAcceptableError && reliable) {
    reliable = false;
    reason = `Final error too high: ${finalError.toFixed(1)}px > ${maxAcceptableError}px`;
    log(`  WARNING: ${reason}`);
  }

  // Check 3: Verify that most constrained points are in front of the camera
  function countPointsInFront(rotation: [number, number, number, number]): number {
    const R = quaternionToMatrix(rotation);
    let count = 0;
    for (const pt of constrainedPoints) {
      const rel = [
        pt[0] - vpConcrete.position[0],
        pt[1] - vpConcrete.position[1],
        pt[2] - vpConcrete.position[2]
      ];
      const camZ = R[2][0] * rel[0] + R[2][1] * rel[1] + R[2][2] * rel[2];
      if (camZ > 0) count++;
    }
    return count;
  }

  let pointsInFront = countPointsInFront(vpConcrete.rotation);

  // If most/all points are behind the camera, PnP found the "flipped" solution
  // Try rotating 180° around X axis to flip the view direction
  if (pointsInFront < constrainedPoints.length * 0.5) {
    log(`  Only ${pointsInFront}/${constrainedPoints.length} points in front - trying 180° flip...`);

    // 180° rotation around X axis: quaternion [0, 1, 0, 0]
    // q_new = q_old * q_flip (right multiply for local rotation)
    const [w, x, y, z] = vpConcrete.rotation;
    const flippedRotation: [number, number, number, number] = [
      -x,  // w' = w*0 - x*1 - y*0 - z*0 = -x
      w,   // x' = w*1 + x*0 + y*0 - z*0 = w
      z,   // y' = w*0 - x*0 + y*0 + z*1 = z
      -y   // z' = w*0 + x*0 - y*1 + z*0 = -y
    ];

    const flippedPointsInFront = countPointsInFront(flippedRotation);
    log(`  After flip: ${flippedPointsInFront}/${constrainedPoints.length} points in front`);

    if (flippedPointsInFront > pointsInFront) {
      // Mirror the position through the centroid
      // If camera was at P and centroid at C, new position is 2C - P
      const mirroredPosition: [number, number, number] = [
        2 * centroid[0] - vpConcrete.position[0],
        2 * centroid[1] - vpConcrete.position[1],
        2 * centroid[2] - vpConcrete.position[2]
      ];
      log(`  Mirrored position through centroid: [${mirroredPosition.map(x => x.toFixed(3)).join(', ')}]`);

      // Apply flip and mirror WITHOUT re-optimization
      // Bundle adjustment will refine the pose later
      vpConcrete.position = mirroredPosition;
      vpConcrete.rotation = flippedRotation;
      pointsInFront = flippedPointsInFront;

      // Recompute error with flipped orientation
      finalError = computeReprojectionError(vpConcrete);
      log(`  Applied flip - now ${pointsInFront}/${constrainedPoints.length} points in front, error=${finalError.toFixed(2)} px`);
    }
  }

  if (pointsInFront < constrainedPoints.length * 0.5 && reliable) {
    reliable = false;
    reason = `Only ${pointsInFront}/${constrainedPoints.length} points in front of camera`;
    log(`  WARNING: ${reason}`);
  }

  return {
    success: true,
    reliable,
    finalReprojectionError: finalError,
    reason
  };
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
      log(`Error computing reprojection for ${wp.name} @ ${vp.name}: ${e}`);
    }
  }

  return count > 0 ? totalError / count : 0;
}
