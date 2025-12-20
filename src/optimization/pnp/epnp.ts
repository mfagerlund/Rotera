/**
 * Estimate camera pose using Direct Linear Transform (DLT).
 *
 * For each 3D-2D correspondence (Xi, xi):
 *   xi × (P * Xi) = 0
 *
 * This gives 2 equations per point (third is linearly dependent).
 * We solve for the 12 elements of P = K[R|t], then decompose.
 */

import {
  dotProduct,
  matrixVectorMultiply,
  multiplyTranspose
} from './math-utils';
import { decomposePMatrix } from './decompose-p-matrix';
import { random } from '../seeded-random';

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

function solveHomogeneousSystem(A: number[][]): number[] | null {
  if (A.length === 0 || A[0].length === 0) return null;

  const svd = computeSVD(A);
  if (!svd) return null;

  return svd.V[svd.V.length - 1];
}

function computeSVD(A: number[][]): { V: number[][] } | null {
  const m = A.length;
  const n = A[0].length;

  const AtA = multiplyTranspose(A, A);

  const eigenVectors = computeEigenVectors(AtA);
  if (!eigenVectors) return null;

  return { V: eigenVectors };
}

function computeEigenVectors(A: number[][]): number[][] | null {
  const n = A.length;
  const vectors: number[][] = [];

  for (let iter = 0; iter < n; iter++) {
    let v = Array(n).fill(0).map(() => random());

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
