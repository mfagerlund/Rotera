/**
 * DLT-based pose estimation for PnP with 4+ points.
 *
 * Implements Direct Linear Transform (DLT) method for camera pose estimation
 * and projection matrix decomposition.
 *
 * Reference: Hartley & Zisserman, "Multiple View Geometry" Chapter 7
 */

import {
  invert3x3,
  matrixMultiply3x3,
  orthogonalizeMatrix,
  determinant3x3,
  matrixToQuaternion,
  multiplyTranspose,
  dotProduct,
  matrixVectorMultiply,
  computeEigenVectors
} from './math-utils';
import { createRng } from '../seeded-random';

/**
 * Estimate camera pose using Direct Linear Transform (DLT).
 *
 * For each 3D-2D correspondence (Xi, xi):
 *   xi × (P * Xi) = 0
 *
 * This gives 2 equations per point (third is linearly dependent).
 * We solve for the 12 elements of P = K[R|t], then decompose.
 */
export function estimatePoseDLT(
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
export function solveHomogeneousSystem(A: number[][]): number[] | null {
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
  const AtA = multiplyTranspose(A, A);

  const eigenVectors = computeEigenVectors(AtA, createRng(700));
  if (!eigenVectors) return null;

  return { V: eigenVectors };
}

/**
 * Decompose projection matrix P = K[R|t] into rotation and translation.
 *
 * P = K[R|t] where K is camera intrinsics, R is rotation, t is translation
 * First we compute M = K^{-1} * P_left where P_left is the left 3x3 of P
 * M should equal R (rotation matrix)
 * Then t = K^{-1} * p4 where p4 is the last column of P
 */
export function decomposePMatrix(P: number[][], K: number[][]): {
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
