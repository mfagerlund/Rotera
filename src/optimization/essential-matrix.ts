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

  // Compute A^T * A
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

  // Eigendecompose A^T * A to get V and eigenvalues
  const eigResult = jacobiEigenDecomposition(AtA);

  const singularValues: number[] = [
    Math.sqrt(Math.max(0, eigResult.eigenvalues[0])),
    Math.sqrt(Math.max(0, eigResult.eigenvalues[1])),
    Math.sqrt(Math.max(0, eigResult.eigenvalues[2]))
  ];

  // Sort by descending singular values
  const sortedIndices = [0, 1, 2].sort((a, b) => singularValues[b] - singularValues[a]);
  const S = [singularValues[sortedIndices[0]], singularValues[sortedIndices[1]], singularValues[sortedIndices[2]]];

  const Vsorted: number[][] = [
    [eigResult.eigenvectors[0][sortedIndices[0]], eigResult.eigenvectors[0][sortedIndices[1]], eigResult.eigenvectors[0][sortedIndices[2]]],
    [eigResult.eigenvectors[1][sortedIndices[0]], eigResult.eigenvectors[1][sortedIndices[1]], eigResult.eigenvectors[1][sortedIndices[2]]],
    [eigResult.eigenvectors[2][sortedIndices[0]], eigResult.eigenvectors[2][sortedIndices[1]], eigResult.eigenvectors[2][sortedIndices[2]]]
  ];

  // Compute U = A * V * S^(-1) for non-zero singular values
  const U: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

  for (let j = 0; j < 3; j++) {
    if (S[j] > 1e-10) {
      for (let i = 0; i < m; i++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += A[i][k] * Vsorted[k][j];
        }
        U[i][j] = sum / S[j];
      }
    }
    // For null space (S[j] ≈ 0), we leave U[:,j] as zeros for now
    // and will compute it via cross product below
  }

  // Orthonormalize U using modified Gram-Schmidt
  // Step 1: Normalize U[:,0]
  let norm0 = Math.sqrt(U[0][0]*U[0][0] + U[1][0]*U[1][0] + U[2][0]*U[2][0]);
  if (norm0 > 1e-10) {
    U[0][0] /= norm0; U[1][0] /= norm0; U[2][0] /= norm0;
  } else {
    // Fallback: use a default unit vector
    U[0][0] = 1; U[1][0] = 0; U[2][0] = 0;
  }

  // Step 2: Orthogonalize U[:,1] against U[:,0] and normalize
  const dot01 = U[0][0]*U[0][1] + U[1][0]*U[1][1] + U[2][0]*U[2][1];
  U[0][1] -= dot01 * U[0][0];
  U[1][1] -= dot01 * U[1][0];
  U[2][1] -= dot01 * U[2][0];
  let norm1 = Math.sqrt(U[0][1]*U[0][1] + U[1][1]*U[1][1] + U[2][1]*U[2][1]);
  if (norm1 > 1e-10) {
    U[0][1] /= norm1; U[1][1] /= norm1; U[2][1] /= norm1;
  } else {
    // Fallback: find a vector orthogonal to U[:,0]
    if (Math.abs(U[0][0]) < 0.9) {
      U[0][1] = 0; U[1][1] = -U[2][0]; U[2][1] = U[1][0];
    } else {
      U[0][1] = -U[2][0]; U[1][1] = 0; U[2][1] = U[0][0];
    }
    norm1 = Math.sqrt(U[0][1]*U[0][1] + U[1][1]*U[1][1] + U[2][1]*U[2][1]);
    if (norm1 > 1e-10) {
      U[0][1] /= norm1; U[1][1] /= norm1; U[2][1] /= norm1;
    }
  }

  // Step 3: Compute U[:,2] as cross product of U[:,0] and U[:,1]
  // This ensures orthogonality and proper handedness
  U[0][2] = U[1][0] * U[2][1] - U[2][0] * U[1][1];
  U[1][2] = U[2][0] * U[0][1] - U[0][0] * U[2][1];
  U[2][2] = U[0][0] * U[1][1] - U[1][0] * U[0][1];

  return { U, S, V: Vsorted };
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
  // Normalize E to have singular values [1, 1, 0] for numerical stability
  // First compute Frobenius norm and scale
  let frobNorm = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      frobNorm += E[i][j] * E[i][j];
    }
  }
  frobNorm = Math.sqrt(frobNorm);

  // Normalize E (Frobenius norm of a rank-2 matrix with sv [1,1,0] is sqrt(2))
  const scale = frobNorm > 1e-10 ? Math.sqrt(2) / frobNorm : 1;
  const E_normalized: number[][] = [
    [E[0][0] * scale, E[0][1] * scale, E[0][2] * scale],
    [E[1][0] * scale, E[1][1] * scale, E[1][2] * scale],
    [E[2][0] * scale, E[2][1] * scale, E[2][2] * scale]
  ];

  const svd = svd3x3(E_normalized);

  log('[decomposeEssentialMatrix] SVD of E (normalized):');
  log(`  Frobenius norm before: ${frobNorm.toFixed(4)}, scale factor: ${scale.toFixed(6)}`);
  log(`  Singular values: [${svd.S.map(v => v.toFixed(6)).join(', ')}]`);

  // Verify U is orthonormal
  const u0Norm = Math.sqrt(svd.U[0][0]**2 + svd.U[1][0]**2 + svd.U[2][0]**2);
  const u1Norm = Math.sqrt(svd.U[0][1]**2 + svd.U[1][1]**2 + svd.U[2][1]**2);
  const u2Norm = Math.sqrt(svd.U[0][2]**2 + svd.U[1][2]**2 + svd.U[2][2]**2);
  log(`  U column norms: [${u0Norm.toFixed(4)}, ${u1Norm.toFixed(4)}, ${u2Norm.toFixed(4)}]`);

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

  // Validate rotation matrices
  const validateRotation = (R: number[][], name: string): boolean => {
    // Check orthonormality: R^T * R should be identity
    const RtR = matmul3x3(transpose3x3(R), R);
    let maxOffDiag = 0;
    let maxDiagError = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (i === j) {
          maxDiagError = Math.max(maxDiagError, Math.abs(RtR[i][j] - 1));
        } else {
          maxOffDiag = Math.max(maxOffDiag, Math.abs(RtR[i][j]));
        }
      }
    }
    const det = det3x3(R);
    const isValid = maxOffDiag < 0.01 && maxDiagError < 0.01 && Math.abs(det - 1) < 0.01;
    if (!isValid) {
      log(`  WARNING: ${name} is not a valid rotation! maxOffDiag=${maxOffDiag.toFixed(4)}, maxDiagErr=${maxDiagError.toFixed(4)}, det=${det.toFixed(4)}`);
    }
    return isValid;
  };

  validateRotation(R1, 'R1');
  validateRotation(R2, 'R2');

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

/**
 * Check if a translation vector is degenerate (nearly axis-aligned).
 * A degenerate translation has two components near zero, meaning
 * the Essential Matrix decomposition failed to recover the full 3D motion.
 *
 * @param t - Translation vector [x, y, z]
 * @param threshold - Components below this are considered zero (default 0.1)
 * @returns true if translation is degenerate
 */
function isTranslationDegenerate(t: number[], threshold: number = 0.1): boolean {
  const absT = t.map(v => Math.abs(v));
  const nearZeroCount = absT.filter(v => v < threshold).length;
  // If 2 or more components are near zero, it's degenerate
  return nearZeroCount >= 2;
}

/**
 * Compute reprojection-based inlier count for a given R, t solution.
 * Uses the Sampson error (first-order approximation to geometric error).
 */
function countInliersWithSampsonError(
  E: number[][],
  correspondences: Correspondence[],
  threshold: number = 0.01
): number {
  let inliers = 0;

  for (const c of correspondences) {
    const x1 = [c.x1, c.y1, 1];
    const x2 = [c.x2, c.y2, 1];

    // Compute Ex1
    const Ex1 = [
      E[0][0] * x1[0] + E[0][1] * x1[1] + E[0][2] * x1[2],
      E[1][0] * x1[0] + E[1][1] * x1[1] + E[1][2] * x1[2],
      E[2][0] * x1[0] + E[2][1] * x1[1] + E[2][2] * x1[2]
    ];

    // Compute E^T x2
    const Etx2 = [
      E[0][0] * x2[0] + E[1][0] * x2[1] + E[2][0] * x2[2],
      E[0][1] * x2[0] + E[1][1] * x2[1] + E[2][1] * x2[2],
      E[0][2] * x2[0] + E[1][2] * x2[1] + E[2][2] * x2[2]
    ];

    // x2^T * E * x1
    const x2tEx1 = x2[0] * Ex1[0] + x2[1] * Ex1[1] + x2[2] * Ex1[2];

    // Sampson error denominator
    const denom = Ex1[0] * Ex1[0] + Ex1[1] * Ex1[1] + Etx2[0] * Etx2[0] + Etx2[1] * Etx2[1];

    if (denom > 1e-10) {
      const sampsonError = (x2tEx1 * x2tEx1) / denom;
      if (sampsonError < threshold) {
        inliers++;
      }
    }
  }

  return inliers;
}

/**
 * Compute total Sampson error for an Essential Matrix.
 * Used as a tie-breaker when multiple solutions have the same inlier count.
 */
function computeTotalSampsonError(
  E: number[][],
  correspondences: Correspondence[]
): number {
  let totalError = 0;

  for (const corr of correspondences) {
    const x1 = [corr.x1, corr.y1, 1];
    const x2 = [corr.x2, corr.y2, 1];

    // E * x1
    const Ex1 = [
      E[0][0] * x1[0] + E[0][1] * x1[1] + E[0][2] * x1[2],
      E[1][0] * x1[0] + E[1][1] * x1[1] + E[1][2] * x1[2],
      E[2][0] * x1[0] + E[2][1] * x1[1] + E[2][2] * x1[2]
    ];

    // E^T x2
    const Etx2 = [
      E[0][0] * x2[0] + E[1][0] * x2[1] + E[2][0] * x2[2],
      E[0][1] * x2[0] + E[1][1] * x2[1] + E[2][1] * x2[2],
      E[0][2] * x2[0] + E[1][2] * x2[1] + E[2][2] * x2[2]
    ];

    // x2^T * E * x1
    const x2tEx1 = x2[0] * Ex1[0] + x2[1] * Ex1[1] + x2[2] * Ex1[2];

    // Sampson error denominator
    const denom = Ex1[0] * Ex1[0] + Ex1[1] * Ex1[1] + Etx2[0] * Etx2[0] + Etx2[1] * Etx2[1];

    if (denom > 1e-10) {
      const sampsonError = (x2tEx1 * x2tEx1) / denom;
      totalError += sampsonError;
    }
  }

  return totalError;
}

interface RansacResult {
  E: number[][];
  R: number[][];
  t: number[];
  inlierCount: number;
  cheiralityScore: number;
  totalError: number;
}

/**
 * RANSAC-based Essential Matrix estimation using the 7-point algorithm.
 * Samples random 7-point subsets, estimates Essential Matrix candidates,
 * and selects the best non-degenerate solution based on inlier count.
 *
 * @param correspondences - All point correspondences
 * @param maxIterations - Maximum RANSAC iterations (default 100)
 * @param inlierThreshold - Sampson error threshold for inliers (default 0.01)
 * @returns Best Essential Matrix and its decomposition, or null if all solutions are degenerate
 */
function ransacEssentialMatrix(
  correspondences: Correspondence[],
  maxIterations: number = 100,
  inlierThreshold: number = 0.01
): RansacResult | null {
  const n = correspondences.length;
  if (n < 7) {
    return null;
  }

  let bestResult: RansacResult | null = null;
  let bestScore = -1;

  // Helper to get random sample of indices
  const getRandomSample = (size: number, max: number): number[] => {
    const indices: number[] = [];
    while (indices.length < size) {
      const idx = Math.floor(Math.random() * max);
      if (!indices.includes(idx)) {
        indices.push(idx);
      }
    }
    return indices;
  };

  log(`\n[RANSAC] Starting with ${n} correspondences, max ${maxIterations} iterations`);

  let degenerateCount = 0;
  let totalCandidates = 0;

  // For small point counts, try all combinations exhaustively
  // C(8,7) = 8, C(10,7) = 120, C(14,7) = 3432, C(15,7) = 6435 - all reasonable
  const useExhaustive = n <= 15;

  // Generate all combinations of 7 from n
  const allCombinations: number[][] = [];
  if (useExhaustive) {
    const generateCombinations = (start: number, combo: number[]) => {
      if (combo.length === 7) {
        allCombinations.push([...combo]);
        return;
      }
      for (let i = start; i < n; i++) {
        combo.push(i);
        generateCombinations(i + 1, combo);
        combo.pop();
      }
    };
    generateCombinations(0, []);
    log(`[RANSAC] Using exhaustive search: ${allCombinations.length} combinations`);
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    // Sample 7 correspondences (exhaustively for small n, randomly for large n)
    let sampleIndices: number[];
    if (useExhaustive) {
      if (iter >= allCombinations.length) break; // Tried all combinations
      sampleIndices = allCombinations[iter];
    } else {
      sampleIndices = getRandomSample(7, n);
    }
    const sample = sampleIndices.map(i => correspondences[i]);

    // Estimate Essential Matrix candidates using 7-point algorithm
    let candidates: number[][][];
    try {
      candidates = estimateEssentialMatrix7Point(sample);
    } catch {
      continue;
    }

    totalCandidates += candidates.length;

    // Test each candidate
    for (const E of candidates) {
      // Decompose and test all 4 possible R, t combinations
      const decompositions = decomposeEssentialMatrix(E);

      for (const decomp of decompositions) {
        // Check for degenerate translation
        if (isTranslationDegenerate(decomp.t)) {
          degenerateCount++;
          continue;
        }

        // Count cheirality (points in front of both cameras)
        const cheiralityScore = checkCheirality(correspondences, decomp.R, decomp.t, false);

        // Skip if less than 50% pass cheirality
        if (cheiralityScore < n * 0.5) {
          continue;
        }

        // Count inliers using Sampson error
        const inlierCount = countInliersWithSampsonError(E, correspondences, inlierThreshold);

        // Compute total Sampson error for tie-breaking
        const totalError = computeTotalSampsonError(E, correspondences);

        // Combined score: prioritize cheirality, then inliers
        // Higher is better for cheirality and inliers
        const score = cheiralityScore * 1000 + inlierCount;

        // Update best if: better score, OR same score with lower error (tie-breaker)
        const currentBestResult = bestResult;
        const shouldUpdate = score > bestScore ||
          (score === bestScore && currentBestResult !== null && totalError < currentBestResult.totalError);

        if (shouldUpdate) {
          bestScore = score;
          bestResult = {
            E,
            R: decomp.R,
            t: decomp.t,
            inlierCount,
            cheiralityScore,
            totalError
          };
        }
      }
    }

    // Early termination only if we found a PERFECT solution (all points pass cheirality and are inliers)
    // With less than perfect, we want to keep searching for potentially better solutions
    const currentBest = bestResult;
    if (currentBest !== null && currentBest.cheiralityScore === n && currentBest.inlierCount === n) {
      // Only terminate early after testing a minimum number of candidates
      // This helps avoid picking the first solution when multiple perfect solutions exist
      if (totalCandidates >= Math.min(n, 10)) {
        log(`[RANSAC] Early termination at iteration ${iter + 1} with perfect solution`);
        break;
      }
    }
  }

  log(`[RANSAC] Completed: ${totalCandidates} candidates tested, ${degenerateCount} degenerate solutions filtered`);

  const finalResult = bestResult;
  if (finalResult !== null) {
    log(`[RANSAC] Best solution: ${finalResult.cheiralityScore}/${n} cheirality, ${finalResult.inlierCount}/${n} inliers`);
    log(`[RANSAC] Translation: [${finalResult.t.map((v: number) => v.toFixed(4)).join(', ')}]`);
  } else {
    log(`[RANSAC] No valid non-degenerate solution found`);
  }

  return bestResult;
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

  let bestDecomposition: { R: number[][], t: number[] } | null = null;
  let bestE: number[][] | null = null;

  // Try RANSAC first if we have enough correspondences (>= 8 for meaningful sampling)
  if (correspondences.length >= 8) {
    log('[Essential Matrix] Trying RANSAC with 7-point algorithm...');
    const ransacResult = ransacEssentialMatrix(correspondences, 100, 0.01);

    if (ransacResult && !isTranslationDegenerate(ransacResult.t)) {
      log('[Essential Matrix] RANSAC found valid non-degenerate solution');
      bestDecomposition = { R: ransacResult.R, t: ransacResult.t };
      bestE = ransacResult.E;
    } else {
      log('[Essential Matrix] RANSAC failed or found only degenerate solutions, falling back to 8-point');
    }
  }

  // Fall back to deterministic algorithms if RANSAC didn't find a good solution
  if (!bestDecomposition) {
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

    let bestScore = -1;

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

      // Skip degenerate solutions
      if (isTranslationDegenerate(candidateDecomp.t)) {
        log(`[Essential Matrix] Candidate ${candidateIdx + 1} has degenerate translation, skipping`);
        continue;
      }

      if (candidateDecomp.score > bestScore) {
        bestScore = candidateDecomp.score;
        bestDecomposition = candidateDecomp;
        bestE = E;
      }
    }

    if (allCandidates.length > 1 && bestDecomposition) {
      log(`\n[Essential Matrix] Best candidate selected with score: ${bestScore}`);
    } else if (bestDecomposition) {
      log('[Essential Matrix] Selected best decomposition');
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
    log('[Essential Matrix] ERROR: All solutions are degenerate (axis-aligned translation)');
    return {
      success: false,
      error: 'All Essential Matrix solutions are degenerate. The scene geometry may be too planar or the camera motion is ambiguous.'
    };
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
