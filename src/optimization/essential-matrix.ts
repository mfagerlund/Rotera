/**
 * Essential Matrix estimation and decomposition for two-view geometry initialization.
 *
 * References:
 * - Hartley & Zisserman "Multiple View Geometry in Computer Vision" (2004)
 * - Chapter 9: Epipolar Geometry and the Fundamental Matrix
 */

import type { IImagePoint } from '../entities/interfaces';
import type { Viewpoint } from '../entities/viewpoint';
import { log } from './optimization-logger';

export interface Correspondence {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface EssentialMatrixResult {
  E: number[][];
  inliers: number[];
  numInliers: number;
}

export interface DecomposedEssentialMatrix {
  R: number[][];
  t: number[];
}

export interface CameraPose {
  position: number[];
  rotation: number[];
}

function svd3x3(A: number[][]): { U: number[][], S: number[], V: number[][] } {
  const m = 3;
  const n = 3;

  const AtA: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < m; k++) {
        sum += A[k][i] * A[k][j];
      }
      AtA[i][j] = sum;
    }
  }

  const V = jacobiEigenDecomposition(AtA);

  const singularValues: number[] = [
    Math.sqrt(Math.max(0, V.eigenvalues[0])),
    Math.sqrt(Math.max(0, V.eigenvalues[1])),
    Math.sqrt(Math.max(0, V.eigenvalues[2]))
  ];

  const sortedIndices = [0, 1, 2].sort((a, b) => singularValues[b] - singularValues[a]);
  const S = [singularValues[sortedIndices[0]], singularValues[sortedIndices[1]], singularValues[sortedIndices[2]]];

  const Vsorted: number[][] = [
    [V.eigenvectors[0][sortedIndices[0]], V.eigenvectors[0][sortedIndices[1]], V.eigenvectors[0][sortedIndices[2]]],
    [V.eigenvectors[1][sortedIndices[0]], V.eigenvectors[1][sortedIndices[1]], V.eigenvectors[1][sortedIndices[2]]],
    [V.eigenvectors[2][sortedIndices[0]], V.eigenvectors[2][sortedIndices[1]], V.eigenvectors[2][sortedIndices[2]]]
  ];

  const U: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < 3; j++) {
      if (S[j] > 1e-10) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += A[i][k] * Vsorted[k][j];
        }
        U[i][j] = sum / S[j];
      } else {
        U[i][j] = Vsorted[i][j];
      }
    }
  }

  const Unorm: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let j = 0; j < 3; j++) {
    let colNorm = 0;
    for (let i = 0; i < 3; i++) {
      colNorm += U[i][j] * U[i][j];
    }
    colNorm = Math.sqrt(colNorm);
    if (colNorm > 1e-10) {
      for (let i = 0; i < 3; i++) {
        Unorm[i][j] = U[i][j] / colNorm;
      }
    } else {
      for (let i = 0; i < 3; i++) {
        Unorm[i][j] = i === j ? 1 : 0;
      }
    }
  }

  return { U: Unorm, S, V: Vsorted };
}

function jacobiEigenDecomposition(A: number[][]): { eigenvalues: number[], eigenvectors: number[][] } {
  const n = 3;
  const V: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const M: number[][] = [
    [A[0][0], A[0][1], A[0][2]],
    [A[1][0], A[1][1], A[1][2]],
    [A[2][0], A[2][1], A[2][2]]
  ];

  const maxIterations = 100;
  const tolerance = 1e-10;

  for (let iter = 0; iter < maxIterations; iter++) {
    let maxOffDiag = 0;
    let p = 0, q = 1;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(M[i][j]) > maxOffDiag) {
          maxOffDiag = Math.abs(M[i][j]);
          p = i;
          q = j;
        }
      }
    }

    if (maxOffDiag < tolerance) break;

    const theta = 0.5 * Math.atan2(2 * M[p][q], M[q][q] - M[p][p]);
    const c = Math.cos(theta);
    const s = Math.sin(theta);

    const Mpp = M[p][p];
    const Mqq = M[q][q];
    const Mpq = M[p][q];

    M[p][p] = c * c * Mpp - 2 * s * c * Mpq + s * s * Mqq;
    M[q][q] = s * s * Mpp + 2 * s * c * Mpq + c * c * Mqq;
    M[p][q] = 0;
    M[q][p] = 0;

    for (let i = 0; i < n; i++) {
      if (i !== p && i !== q) {
        const Mip = M[i][p];
        const Miq = M[i][q];
        M[i][p] = c * Mip - s * Miq;
        M[p][i] = M[i][p];
        M[i][q] = s * Mip + c * Miq;
        M[q][i] = M[i][q];
      }
    }

    for (let i = 0; i < n; i++) {
      const Vip = V[i][p];
      const Viq = V[i][q];
      V[i][p] = c * Vip - s * Viq;
      V[i][q] = s * Vip + c * Viq;
    }
  }

  return {
    eigenvalues: [M[0][0], M[1][1], M[2][2]],
    eigenvectors: V
  };
}

function normalizeImageCoordinates(
  u: number,
  v: number,
  fx: number,
  fy: number,
  cx: number,
  cy: number
): [number, number] {
  const x = (u - cx) / fx;
  const y = (v - cy) / fy;
  return [x, y];
}

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
function estimateEssentialMatrix7Point(correspondences: Correspondence[]): number[][][] {
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

function estimateEssentialMatrix8Point(correspondences: Correspondence[]): number[][] {
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

function jacobiEigenDecomposition9x9(A: number[][]): { eigenvalues: number[], eigenvectors: number[][] } {
  const n = 9;
  const V: number[][] = Array(n).fill(0).map((_, i) => Array(n).fill(0).map((_, j) => i === j ? 1 : 0));
  const M: number[][] = A.map(row => [...row]);

  const maxIterations = 200;
  const tolerance = 1e-12;

  for (let iter = 0; iter < maxIterations; iter++) {
    let maxOffDiag = 0;
    let p = 0, q = 1;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(M[i][j]) > maxOffDiag) {
          maxOffDiag = Math.abs(M[i][j]);
          p = i;
          q = j;
        }
      }
    }

    if (maxOffDiag < tolerance) break;

    const theta = 0.5 * Math.atan2(2 * M[p][q], M[q][q] - M[p][p]);
    const c = Math.cos(theta);
    const s = Math.sin(theta);

    const Mpp = M[p][p];
    const Mqq = M[q][q];
    const Mpq = M[p][q];

    M[p][p] = c * c * Mpp - 2 * s * c * Mpq + s * s * Mqq;
    M[q][q] = s * s * Mpp + 2 * s * c * Mpq + c * c * Mqq;
    M[p][q] = 0;
    M[q][p] = 0;

    for (let i = 0; i < n; i++) {
      if (i !== p && i !== q) {
        const Mip = M[i][p];
        const Miq = M[i][q];
        M[i][p] = c * Mip - s * Miq;
        M[p][i] = M[i][p];
        M[i][q] = s * Mip + c * Miq;
        M[q][i] = M[i][q];
      }
    }

    for (let i = 0; i < n; i++) {
      const Vip = V[i][p];
      const Viq = V[i][q];
      V[i][p] = c * Vip - s * Viq;
      V[i][q] = s * Vip + c * Viq;
    }
  }

  return {
    eigenvalues: Array(n).fill(0).map((_, i) => M[i][i]),
    eigenvectors: V
  };
}

function decomposeEssentialMatrix(E: number[][]): DecomposedEssentialMatrix[] {
  const svd = svd3x3(E);

  log('[decomposeEssentialMatrix] SVD of E:');
  log(`  Singular values: [${svd.S.map(v => v.toFixed(6)).join(', ')}]`);
  log(`  U[0] = [${svd.U[0].map(v => v.toFixed(6)).join(', ')}]`);
  log(`  U[1] = [${svd.U[1].map(v => v.toFixed(6)).join(', ')}]`);
  log(`  U[2] = [${svd.U[2].map(v => v.toFixed(6)).join(', ')}]`);
  log(`  Translation t (3rd column of U) = [${svd.U[0][2].toFixed(6)}, ${svd.U[1][2].toFixed(6)}, ${svd.U[2][2].toFixed(6)}]`);

  const W = [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1]
  ];

  const Wt = [
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, 1]
  ];

  const R1 = matmul3x3(matmul3x3(svd.U, W), transpose3x3(svd.V));
  const R2 = matmul3x3(matmul3x3(svd.U, Wt), transpose3x3(svd.V));

  if (det3x3(R1) < 0) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        R1[i][j] = -R1[i][j];
      }
    }
  }

  if (det3x3(R2) < 0) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        R2[i][j] = -R2[i][j];
      }
    }
  }

  const t1 = [svd.U[0][2], svd.U[1][2], svd.U[2][2]];
  const t2 = [-svd.U[0][2], -svd.U[1][2], -svd.U[2][2]];

  log(`  t1 (3rd column of U): [${t1.map(v => v.toFixed(6)).join(', ')}]`);
  log(`  t2 (negated): [${t2.map(v => v.toFixed(6)).join(', ')}]`);

  return [
    { R: R1, t: t1 },
    { R: R1, t: t2 },
    { R: R2, t: t1 },
    { R: R2, t: t2 }
  ];
}

function matmul3x3(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return result;
}

function transpose3x3(A: number[][]): number[][] {
  return [
    [A[0][0], A[1][0], A[2][0]],
    [A[0][1], A[1][1], A[2][1]],
    [A[0][2], A[1][2], A[2][2]]
  ];
}

function det3x3(A: number[][]): number {
  return A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
         A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
         A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
}

function triangulatePoint(
  x1: number, y1: number,
  x2: number, y2: number,
  R: number[][], t: number[]
): number[] | null {
  const P1 = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0]
  ];

  const P2 = [
    [R[0][0], R[0][1], R[0][2], t[0]],
    [R[1][0], R[1][1], R[1][2], t[1]],
    [R[2][0], R[2][1], R[2][2], t[2]]
  ];

  const A = [
    [x1 * P1[2][0] - P1[0][0], x1 * P1[2][1] - P1[0][1], x1 * P1[2][2] - P1[0][2], x1 * P1[2][3] - P1[0][3]],
    [y1 * P1[2][0] - P1[1][0], y1 * P1[2][1] - P1[1][1], y1 * P1[2][2] - P1[1][2], y1 * P1[2][3] - P1[1][3]],
    [x2 * P2[2][0] - P2[0][0], x2 * P2[2][1] - P2[0][1], x2 * P2[2][2] - P2[0][2], x2 * P2[2][3] - P2[0][3]],
    [y2 * P2[2][0] - P2[1][0], y2 * P2[2][1] - P2[1][1], y2 * P2[2][2] - P2[1][2], y2 * P2[2][3] - P2[1][3]]
  ];

  const AtA: number[][] = Array(4).fill(0).map(() => Array(4).fill(0));
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += A[k][i] * A[k][j];
      }
      AtA[i][j] = sum;
    }
  }

  const eig = jacobiEigenDecomposition4x4(AtA);
  const minIdx = eig.eigenvalues.indexOf(Math.min(...eig.eigenvalues));
  const X = eig.eigenvectors.map(row => row[minIdx]);

  if (Math.abs(X[3]) < 1e-10) return null;

  return [X[0] / X[3], X[1] / X[3], X[2] / X[3]];
}

function jacobiEigenDecomposition4x4(A: number[][]): { eigenvalues: number[], eigenvectors: number[][] } {
  const n = 4;
  const V: number[][] = Array(n).fill(0).map((_, i) => Array(n).fill(0).map((_, j) => i === j ? 1 : 0));
  const M: number[][] = A.map(row => [...row]);

  const maxIterations = 100;
  const tolerance = 1e-10;

  for (let iter = 0; iter < maxIterations; iter++) {
    let maxOffDiag = 0;
    let p = 0, q = 1;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(M[i][j]) > maxOffDiag) {
          maxOffDiag = Math.abs(M[i][j]);
          p = i;
          q = j;
        }
      }
    }

    if (maxOffDiag < tolerance) break;

    const theta = 0.5 * Math.atan2(2 * M[p][q], M[q][q] - M[p][p]);
    const c = Math.cos(theta);
    const s = Math.sin(theta);

    const Mpp = M[p][p];
    const Mqq = M[q][q];
    const Mpq = M[p][q];

    M[p][p] = c * c * Mpp - 2 * s * c * Mpq + s * s * Mqq;
    M[q][q] = s * s * Mpp + 2 * s * c * Mpq + c * c * Mqq;
    M[p][q] = 0;
    M[q][p] = 0;

    for (let i = 0; i < n; i++) {
      if (i !== p && i !== q) {
        const Mip = M[i][p];
        const Miq = M[i][q];
        M[i][p] = c * Mip - s * Miq;
        M[p][i] = M[i][p];
        M[i][q] = s * Mip + c * Miq;
        M[q][i] = M[i][q];
      }
    }

    for (let i = 0; i < n; i++) {
      const Vip = V[i][p];
      const Viq = V[i][q];
      V[i][p] = c * Vip - s * Viq;
      V[i][q] = s * Vip + c * Viq;
    }
  }

  return {
    eigenvalues: Array(n).fill(0).map((_, i) => M[i][i]),
    eigenvectors: V
  };
}

function checkCheirality(
  correspondences: Correspondence[],
  R: number[][],
  t: number[],
  debug: boolean = false
): number {
  let inFrontOfBoth = 0;

  for (let i = 0; i < correspondences.length; i++) {
    const corr = correspondences[i];
    const X = triangulatePoint(corr.x1, corr.y1, corr.x2, corr.y2, R, t);
    if (!X) {
      if (debug && i < 3) log(`    Point ${i}: triangulation failed`);
      continue;
    }

    const z1 = X[2];

    const X2 = [
      R[0][0] * X[0] + R[0][1] * X[1] + R[0][2] * X[2] + t[0],
      R[1][0] * X[0] + R[1][1] * X[1] + R[1][2] * X[2] + t[1],
      R[2][0] * X[0] + R[2][1] * X[1] + R[2][2] * X[2] + t[2]
    ];
    const z2 = X2[2];

    if (debug && i < 3) {
      log(`    Point ${i}: z1=${z1.toFixed(2)}, z2=${z2.toFixed(2)} ${z1 > 0 && z2 > 0 ? '✓' : '✗'}`);
    }

    if (z1 > 0 && z2 > 0) {
      inFrontOfBoth++;
    }
  }

  return inFrontOfBoth;
}

function selectCorrectDecomposition(
  E_solutions: DecomposedEssentialMatrix[],
  correspondences: Correspondence[]
): DecomposedEssentialMatrix & { score: number } {
  let bestSolution = E_solutions[0];
  let maxInFront = 0;

  log('[Essential Matrix] Cheirality test for 4 decompositions:');
  for (let i = 0; i < E_solutions.length; i++) {
    const solution = E_solutions[i];
    const debug = i === 0;
    const numInFront = checkCheirality(correspondences, solution.R, solution.t, debug);
    log(`  Solution ${i + 1}: ${numInFront}/${correspondences.length} points in front`);
    if (numInFront > maxInFront) {
      maxInFront = numInFront;
      bestSolution = solution;
    }
  }
  log(`  Selected solution with ${maxInFront} points in front`);

  return { ...bestSolution, score: maxInFront };
}

function rotationMatrixToQuaternion(R: number[][]): number[] {
  const trace = R[0][0] + R[1][1] + R[2][2];
  let q: number[];

  if (trace > 0) {
    const s = Math.sqrt(trace + 1.0) * 2;
    q = [
      0.25 * s,
      (R[2][1] - R[1][2]) / s,
      (R[0][2] - R[2][0]) / s,
      (R[1][0] - R[0][1]) / s
    ];
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const s = Math.sqrt(1.0 + R[0][0] - R[1][1] - R[2][2]) * 2;
    q = [
      (R[2][1] - R[1][2]) / s,
      0.25 * s,
      (R[0][1] + R[1][0]) / s,
      (R[0][2] + R[2][0]) / s
    ];
  } else if (R[1][1] > R[2][2]) {
    const s = Math.sqrt(1.0 + R[1][1] - R[0][0] - R[2][2]) * 2;
    q = [
      (R[0][2] - R[2][0]) / s,
      (R[0][1] + R[1][0]) / s,
      0.25 * s,
      (R[1][2] + R[2][1]) / s
    ];
  } else {
    const s = Math.sqrt(1.0 + R[2][2] - R[0][0] - R[1][1]) * 2;
    q = [
      (R[1][0] - R[0][1]) / s,
      (R[0][2] + R[2][0]) / s,
      (R[1][2] + R[2][1]) / s,
      0.25 * s
    ];
  }

  const mag = Math.sqrt(q[0]*q[0] + q[1]*q[1] + q[2]*q[2] + q[3]*q[3]);
  return [q[0]/mag, q[1]/mag, q[2]/mag, q[3]/mag];
}

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

  log(`\n[Essential Matrix] Found ${correspondences.length} correspondences`);
  log('[Essential Matrix] Sample correspondences:');
  for (let i = 0; i < Math.min(3, correspondences.length); i++) {
    const c = correspondences[i];
    log(`  ${i}: cam1=[${c.x1.toFixed(4)}, ${c.y1.toFixed(4)}], cam2=[${c.x2.toFixed(4)}, ${c.y2.toFixed(4)}]`);
  }

  let allCandidates: number[][][] = [];

  if (correspondences.length === 7) {
    log('[Essential Matrix] Using 7-point algorithm');
    allCandidates = estimateEssentialMatrix7Point(correspondences);
    log(`[Essential Matrix] 7-point produced ${allCandidates.length} candidate(s)`);
  } else {
    log('[Essential Matrix] Using 8-point algorithm');
    const E = estimateEssentialMatrix8Point(correspondences);
    allCandidates = [E];
  }

  let bestDecomposition: { R: number[][], t: number[] } | null = null;
  let bestScore = -1;
  let bestE: number[][] | null = null;

  for (let candidateIdx = 0; candidateIdx < allCandidates.length; candidateIdx++) {
    const E = allCandidates[candidateIdx];

    if (allCandidates.length > 1) {
      log(`\n[Essential Matrix] Testing candidate ${candidateIdx + 1}/${allCandidates.length}:`);
    } else {
      log('\n[Essential Matrix] E matrix:');
    }
    E.forEach(row => log(`  [${row.map(v => v.toFixed(6)).join(', ')}]`));

    log('\n[Essential Matrix] Verifying epipolar constraint (x2^T * E * x1 should be ~0):');
    for (let i = 0; i < Math.min(5, correspondences.length); i++) {
      const c = correspondences[i];
      const x1 = [c.x1, c.y1, 1];
      const x2 = [c.x2, c.y2, 1];

      const Ex1 = [
        E[0][0] * x1[0] + E[0][1] * x1[1] + E[0][2] * x1[2],
        E[1][0] * x1[0] + E[1][1] * x1[1] + E[1][2] * x1[2],
        E[2][0] * x1[0] + E[2][1] * x1[1] + E[2][2] * x1[2]
      ];

      const epipolarError = x2[0] * Ex1[0] + x2[1] * Ex1[1] + x2[2] * Ex1[2];
      if (allCandidates.length === 1 || i < 2) {
        log(`  Point ${i}: error = ${epipolarError.toExponential(4)}`);
      }
    }

    const decompositions = decomposeEssentialMatrix(E);
    if (allCandidates.length > 1) {
      log(`[Essential Matrix] Testing ${decompositions.length} decompositions for candidate ${candidateIdx + 1}...`);
    } else {
      log(`\n[Essential Matrix] Testing ${decompositions.length} possible decompositions...`);
    }

    const candidateDecomp = selectCorrectDecomposition(decompositions, correspondences);

    if (candidateDecomp.score > bestScore) {
      bestScore = candidateDecomp.score;
      bestDecomposition = candidateDecomp;
      bestE = E;
    }
  }

  if (!bestDecomposition || !bestE) {
    return { success: false, error: 'Failed to find valid decomposition' };
  }

  if (allCandidates.length > 1) {
    log(`\n[Essential Matrix] Best candidate selected with score: ${bestScore}`);
  } else {
    log('[Essential Matrix] Selected best decomposition');
  }

  log(`\n[Essential Matrix] Translation vector t: [${bestDecomposition.t.map(v => v.toFixed(4)).join(', ')}]`);

  const tNorm = Math.sqrt(
    bestDecomposition.t[0] * bestDecomposition.t[0] +
    bestDecomposition.t[1] * bestDecomposition.t[1] +
    bestDecomposition.t[2] * bestDecomposition.t[2]
  );

  log(`[Essential Matrix] tNorm: ${tNorm}, baselineScale: ${baselineScale}`);

  if (tNorm < 1e-10) {
    log('[Essential Matrix] ERROR: Translation norm is too small!');
    return { success: false, error: 'Translation norm is too small (degenerate configuration)' };
  }

  const tScaled = [
    bestDecomposition.t[0] / tNorm * baselineScale,
    bestDecomposition.t[1] / tNorm * baselineScale,
    bestDecomposition.t[2] / tNorm * baselineScale
  ];

  log(`[Essential Matrix] tScaled: [${tScaled.map(v => v.toFixed(4)).join(', ')}]`);

  vp1.position = [0, 0, 0];
  vp1.rotation = [1, 0, 0, 0];

  const quat = rotationMatrixToQuaternion(bestDecomposition.R);
  vp2.position = [tScaled[0], tScaled[1], tScaled[2]];
  vp2.rotation = [quat[0], quat[1], quat[2], quat[3]];

  log('\n[Essential Matrix] Camera poses after initialization:');
  log(`  Camera 1: pos=[${vp1.position.join(', ')}], rot=[${vp1.rotation.join(', ')}]`);
  log(`  Camera 2: pos=[${vp2.position.map(v => v.toFixed(3)).join(', ')}], rot=[${vp2.rotation.map(v => v.toFixed(3)).join(', ')}]`);
  log(`  Rotation matrix R:`);
  bestDecomposition.R.forEach(row => log(`    [${row.map(v => v.toFixed(4)).join(', ')}]`));
  log(`  Translation t (normalized): [${bestDecomposition.t.map(v => v.toFixed(4)).join(', ')}]`);
  log(`  Translation t (scaled): [${tScaled.map(v => v.toFixed(3)).join(', ')}]`);

  return { success: true };
}
