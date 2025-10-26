/**
 * Essential Matrix estimation and decomposition for two-view geometry initialization.
 *
 * References:
 * - Hartley & Zisserman "Multiple View Geometry in Computer Vision" (2004)
 * - Chapter 9: Epipolar Geometry and the Fundamental Matrix
 */

import type { IImagePoint } from '../entities/interfaces';
import type { Viewpoint } from '../entities/viewpoint';

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

  console.log('[decomposeEssentialMatrix] SVD of E:');
  console.log(`  Singular values: [${svd.S.map(v => v.toFixed(6)).join(', ')}]`);
  console.log(`  U[0] = [${svd.U[0].map(v => v.toFixed(6)).join(', ')}]`);
  console.log(`  U[1] = [${svd.U[1].map(v => v.toFixed(6)).join(', ')}]`);
  console.log(`  U[2] = [${svd.U[2].map(v => v.toFixed(6)).join(', ')}]`);
  console.log(`  Translation t (3rd column of U) = [${svd.U[0][2].toFixed(6)}, ${svd.U[1][2].toFixed(6)}, ${svd.U[2][2].toFixed(6)}]`);

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

  console.log(`  t1 (3rd column of U): [${t1.map(v => v.toFixed(6)).join(', ')}]`);
  console.log(`  t2 (negated): [${t2.map(v => v.toFixed(6)).join(', ')}]`);

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
      if (debug && i < 3) console.log(`    Point ${i}: triangulation failed`);
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
      console.log(`    Point ${i}: z1=${z1.toFixed(2)}, z2=${z2.toFixed(2)} ${z1 > 0 && z2 > 0 ? '✓' : '✗'}`);
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
): DecomposedEssentialMatrix {
  let bestSolution = E_solutions[0];
  let maxInFront = 0;

  console.log('[Essential Matrix] Cheirality test for 4 decompositions:');
  for (let i = 0; i < E_solutions.length; i++) {
    const solution = E_solutions[i];
    const debug = i === 0;
    const numInFront = checkCheirality(correspondences, solution.R, solution.t, debug);
    console.log(`  Solution ${i + 1}: ${numInFront}/${correspondences.length} points in front`);
    if (numInFront > maxInFront) {
      maxInFront = numInFront;
      bestSolution = solution;
    }
  }
  console.log(`  Selected solution with ${maxInFront} points in front`);

  return bestSolution;
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

  if (correspondences.length < 8) {
    return {
      success: false,
      error: `Need at least 8 correspondences, found ${correspondences.length}`
    };
  }

  console.log(`\n[Essential Matrix] Found ${correspondences.length} correspondences`);
  console.log('[Essential Matrix] Sample correspondences:');
  for (let i = 0; i < Math.min(3, correspondences.length); i++) {
    const c = correspondences[i];
    console.log(`  ${i}: cam1=[${c.x1.toFixed(4)}, ${c.y1.toFixed(4)}], cam2=[${c.x2.toFixed(4)}, ${c.y2.toFixed(4)}]`);
  }

  const E = estimateEssentialMatrix8Point(correspondences);
  console.log('\n[Essential Matrix] E matrix:');
  E.forEach(row => console.log(`  [${row.map(v => v.toFixed(6)).join(', ')}]`));

  console.log('\n[Essential Matrix] Verifying epipolar constraint (x2^T * E * x1 should be ~0):');
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
    console.log(`  Point ${i}: error = ${epipolarError.toExponential(4)}`);
  }

  const decompositions = decomposeEssentialMatrix(E);
  console.log(`\n[Essential Matrix] Testing ${decompositions.length} possible decompositions...`);

  const bestDecomposition = selectCorrectDecomposition(decompositions, correspondences);
  console.log('[Essential Matrix] Selected best decomposition');

  console.log(`\n[Essential Matrix] Translation vector t: [${bestDecomposition.t.map(v => v.toFixed(4)).join(', ')}]`);

  const tNorm = Math.sqrt(
    bestDecomposition.t[0] * bestDecomposition.t[0] +
    bestDecomposition.t[1] * bestDecomposition.t[1] +
    bestDecomposition.t[2] * bestDecomposition.t[2]
  );

  console.log(`[Essential Matrix] tNorm: ${tNorm}, baselineScale: ${baselineScale}`);

  if (tNorm < 1e-10) {
    console.error('[Essential Matrix] ERROR: Translation norm is too small!');
    return { success: false, error: 'Translation norm is too small (degenerate configuration)' };
  }

  const tScaled = [
    bestDecomposition.t[0] / tNorm * baselineScale,
    bestDecomposition.t[1] / tNorm * baselineScale,
    bestDecomposition.t[2] / tNorm * baselineScale
  ];

  console.log(`[Essential Matrix] tScaled: [${tScaled.map(v => v.toFixed(4)).join(', ')}]`);

  vp1.position = [0, 0, 0];
  vp1.rotation = [1, 0, 0, 0];

  const quat = rotationMatrixToQuaternion(bestDecomposition.R);
  vp2.position = [tScaled[0], tScaled[1], tScaled[2]];
  vp2.rotation = [quat[0], quat[1], quat[2], quat[3]];

  console.log('\n[Essential Matrix] Camera poses after initialization:');
  console.log(`  Camera 1: pos=[${vp1.position.join(', ')}], rot=[${vp1.rotation.join(', ')}]`);
  console.log(`  Camera 2: pos=[${vp2.position.map(v => v.toFixed(3)).join(', ')}], rot=[${vp2.rotation.map(v => v.toFixed(3)).join(', ')}]`);
  console.log(`  Rotation matrix R:`);
  bestDecomposition.R.forEach(row => console.log(`    [${row.map(v => v.toFixed(4)).join(', ')}]`));
  console.log(`  Translation t (normalized): [${bestDecomposition.t.map(v => v.toFixed(4)).join(', ')}]`);
  console.log(`  Translation t (scaled): [${tScaled.map(v => v.toFixed(3)).join(', ')}]`);

  return { success: true };
}
