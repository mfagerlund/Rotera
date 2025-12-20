/**
 * Essential Matrix estimation algorithms (7-point and 8-point).
 *
 * References:
 * - Hartley & Zisserman "Multiple View Geometry in Computer Vision" (2004)
 * - Chapter 9: Epipolar Geometry and the Fundamental Matrix
 */

import type { Correspondence } from './types';
import { svd3x3, jacobiEigenDecomposition9x9 } from './svd';

/**
 * Estimate Essential Matrix using the 7-point algorithm.
 *
 * The 7-point algorithm finds the Essential Matrix from exactly 7 correspondences.
 * It produces 1 or 3 solutions (cubic polynomial). Use cheirality test to select the correct one.
 *
 * Algorithm:
 * 1. Build constraint matrix from 7 correspondences
 * 2. Find 2D null space (E = α·F1 + β·F2)
 * 3. Enforce det(E) = 0 constraint → cubic equation in α/β
 * 4. Solve cubic to get 1-3 candidate Essential matrices
 * 5. Enforce rank-2 constraint via SVD
 *
 * @param correspondences - Array of exactly 7 normalized point correspondences
 * @returns Array of candidate Essential matrices (1-3 solutions)
 */
export function estimateEssentialMatrix7Point(correspondences: Correspondence[]): number[][][] {
  if (correspondences.length !== 7) {
    throw new Error('7-point algorithm requires exactly 7 correspondences');
  }

  const A: number[][] = [];

  for (const corr of correspondences) {
    const x1 = corr.x1;
    const y1 = corr.y1;
    const x2 = corr.x2;
    const y2 = corr.y2;

    A.push([
      x2 * x1, x2 * y1, x2,
      y2 * x1, y2 * y1, y2,
      x1, y1, 1
    ]);
  }

  const AtA: number[][] = Array(9).fill(0).map(() => Array(9).fill(0));
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      let sum = 0;
      for (let k = 0; k < 7; k++) {
        sum += A[k][i] * A[k][j];
      }
      AtA[i][j] = sum;
    }
  }

  const eig = jacobiEigenDecomposition9x9(AtA);

  const eigenPairs = eig.eigenvalues.map((val, idx) => ({ val, idx }));
  eigenPairs.sort((a, b) => a.val - b.val);

  const e1 = eig.eigenvectors.map(row => row[eigenPairs[0].idx]);
  const e2 = eig.eigenvectors.map(row => row[eigenPairs[1].idx]);

  const F1 = [
    [e1[0], e1[1], e1[2]],
    [e1[3], e1[4], e1[5]],
    [e1[6], e1[7], e1[8]]
  ];

  const F2 = [
    [e2[0], e2[1], e2[2]],
    [e2[3], e2[4], e2[5]],
    [e2[6], e2[7], e2[8]]
  ];

  const cubicCoeffs = computeDetConstraintCubic(F1, F2);

  const alphas = solveCubicEquation(cubicCoeffs[0], cubicCoeffs[1], cubicCoeffs[2], cubicCoeffs[3]);

  const candidates: number[][][] = [];

  for (const alpha of alphas) {
    const E_candidate: number[][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        E_candidate[i][j] = alpha * F1[i][j] + (1 - alpha) * F2[i][j];
      }
    }

    const svd = svd3x3(E_candidate);
    const sigma = [(svd.S[0] + svd.S[1]) / 2, (svd.S[0] + svd.S[1]) / 2, 0];

    const E_enforced: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < 3; k++) {
          E_enforced[i][j] += svd.U[i][k] * sigma[k] * svd.V[j][k];
        }
      }
    }

    candidates.push(E_enforced);
  }

  return candidates;
}

/**
 * Compute coefficients of cubic equation det(α·F1 + (1-α)·F2) = 0
 * Returns [a3, a2, a1, a0] such that a3·α³ + a2·α² + a1·α + a0 = 0
 */
function computeDetConstraintCubic(F1: number[][], F2: number[][]): [number, number, number, number] {
  const det = (M: number[][]): number => {
    return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
         - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
         + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  };

  const a3 = det(F1);

  const M2: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      M2[i][j] = F1[i][j] - F2[i][j];
    }
  }

  const a2 = 3 * (
    F1[0][0] * (M2[1][1] * F1[2][2] - M2[1][2] * F1[2][1] + F1[1][1] * M2[2][2] - F1[1][2] * M2[2][1])
    - F1[0][1] * (M2[1][0] * F1[2][2] - M2[1][2] * F1[2][0] + F1[1][0] * M2[2][2] - F1[1][2] * M2[2][0])
    + F1[0][2] * (M2[1][0] * F1[2][1] - M2[1][1] * F1[2][0] + F1[1][0] * M2[2][1] - F1[1][1] * M2[2][0])
  );

  const a1 = 3 * (
    M2[0][0] * (M2[1][1] * F1[2][2] - M2[1][2] * F1[2][1] + F1[1][1] * M2[2][2] - F1[1][2] * M2[2][1])
    - M2[0][1] * (M2[1][0] * F1[2][2] - M2[1][2] * F1[2][0] + F1[1][0] * M2[2][2] - F1[1][2] * M2[2][0])
    + M2[0][2] * (M2[1][0] * F1[2][1] - M2[1][1] * F1[2][0] + F1[1][0] * M2[2][1] - F1[1][1] * M2[2][0])
  );

  const a0 = det(F2);

  return [a3, a2, a1, a0];
}

/**
 * Solve cubic equation a·x³ + b·x² + c·x + d = 0
 * Returns all real roots (1 to 3 solutions)
 */
function solveCubicEquation(a: number, b: number, c: number, d: number): number[] {
  if (Math.abs(a) < 1e-10) {
    if (Math.abs(b) < 1e-10) {
      if (Math.abs(c) < 1e-10) return [];
      return [-d / c];
    }
    const discriminant = c * c - 4 * b * d;
    if (discriminant < 0) return [];
    const sqrtD = Math.sqrt(discriminant);
    return [(-c + sqrtD) / (2 * b), (-c - sqrtD) / (2 * b)];
  }

  const p = (3 * a * c - b * b) / (3 * a * a);
  const q = (2 * b * b * b - 9 * a * b * c + 27 * a * a * d) / (27 * a * a * a);

  const discriminant = (q * q) / 4 + (p * p * p) / 27;

  const roots: number[] = [];

  if (discriminant > 1e-10) {
    const sqrtD = Math.sqrt(discriminant);
    const u = Math.cbrt(-q / 2 + sqrtD);
    const v = Math.cbrt(-q / 2 - sqrtD);
    roots.push(u + v - b / (3 * a));
  } else if (Math.abs(discriminant) < 1e-10) {
    const u = Math.cbrt(-q / 2);
    roots.push(2 * u - b / (3 * a));
    roots.push(-u - b / (3 * a));
  } else {
    const r = Math.sqrt(-p * p * p / 27);
    const phi = Math.acos(-q / (2 * r));
    const t = 2 * Math.cbrt(r);
    roots.push(t * Math.cos(phi / 3) - b / (3 * a));
    roots.push(t * Math.cos((phi + 2 * Math.PI) / 3) - b / (3 * a));
    roots.push(t * Math.cos((phi + 4 * Math.PI) / 3) - b / (3 * a));
  }

  return roots;
}

export function estimateEssentialMatrix8Point(correspondences: Correspondence[]): number[][] {
  const n = correspondences.length;
  if (n < 8) {
    throw new Error('Need at least 8 correspondences for 8-point algorithm');
  }

  const A: number[][] = [];

  for (const corr of correspondences) {
    const x1 = corr.x1;
    const y1 = corr.y1;
    const x2 = corr.x2;
    const y2 = corr.y2;

    A.push([
      x2 * x1, x2 * y1, x2,
      y2 * x1, y2 * y1, y2,
      x1, y1, 1
    ]);
  }

  const AtA: number[][] = Array(9).fill(0).map(() => Array(9).fill(0));
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += A[k][i] * A[k][j];
      }
      AtA[i][j] = sum;
    }
  }

  const eig = jacobiEigenDecomposition9x9(AtA);

  const minIdx = eig.eigenvalues.indexOf(Math.min(...eig.eigenvalues));
  const e = eig.eigenvectors.map(row => row[minIdx]);

  const E = [
    [e[0], e[1], e[2]],
    [e[3], e[4], e[5]],
    [e[6], e[7], e[8]]
  ];

  const svd = svd3x3(E);
  const sigma = [(svd.S[0] + svd.S[1]) / 2, (svd.S[0] + svd.S[1]) / 2, 0];

  const E_enforced: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        E_enforced[i][j] += svd.U[i][k] * sigma[k] * svd.V[j][k];
      }
    }
  }

  return E_enforced;
}
