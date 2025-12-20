/**
 * Essential Matrix decomposition and triangulation.
 * Extracts camera rotation (R) and translation (t) from Essential Matrix.
 */

import type { Correspondence, DecomposedEssentialMatrix } from './types';
import { svd3x3, jacobiEigenDecomposition4x4 } from './svd';
import { matmul3x3, transpose3x3, det3x3 } from './matrix-utils';
import { log } from '../optimization-logger';

export function decomposeEssentialMatrix(E: number[][]): DecomposedEssentialMatrix[] {
  // Normalize E to have singular values [1, 1, 0] for numerical stability
  let frobNorm = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      frobNorm += E[i][j] * E[i][j];
    }
  }
  frobNorm = Math.sqrt(frobNorm);

  const scale = frobNorm > 1e-10 ? Math.sqrt(2) / frobNorm : 1;
  const E_normalized: number[][] = [
    [E[0][0] * scale, E[0][1] * scale, E[0][2] * scale],
    [E[1][0] * scale, E[1][1] * scale, E[1][2] * scale],
    [E[2][0] * scale, E[2][1] * scale, E[2][2] * scale]
  ];

  const svd = svd3x3(E_normalized);

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

  return [
    { R: R1, t: t1 },
    { R: R1, t: t2 },
    { R: R2, t: t1 },
    { R: R2, t: t2 }
  ];
}

export function triangulatePoint(
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

export function checkCheirality(
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

export function selectCorrectDecomposition(
  E_solutions: DecomposedEssentialMatrix[],
  correspondences: Correspondence[]
): DecomposedEssentialMatrix & { score: number } {
  let bestSolution = E_solutions[0];
  let maxInFront = 0;

  for (let i = 0; i < E_solutions.length; i++) {
    const solution = E_solutions[i];
    const numInFront = checkCheirality(correspondences, solution.R, solution.t, false);
    if (numInFront > maxInFront) {
      maxInFront = numInFront;
      bestSolution = solution;
    }
  }

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
export function isTranslationDegenerate(t: number[], threshold: number = 0.1): boolean {
  const absT = t.map(v => Math.abs(v));
  const nearZeroCount = absT.filter(v => v < threshold).length;
  // If 2 or more components are near zero, it's degenerate
  return nearZeroCount >= 2;
}
