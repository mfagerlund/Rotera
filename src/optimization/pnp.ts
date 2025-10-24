import type { IViewpoint, IImagePoint, IWorldPoint } from '../entities/interfaces';
import type { Viewpoint } from '../entities/viewpoint';
import type { WorldPoint } from '../entities/world-point';

export interface PnPResult {
  position: [number, number, number];
  rotation: [number, number, number, number];
  success: boolean;
  reprojectionError?: number;
  inlierCount?: number;
}

/**
 * Solve Perspective-n-Point (PnP) problem using DLT-based approach.
 * Computes camera pose from known 3D-2D correspondences.
 *
 * This is a simplified linear approach suitable for initialization.
 * For production with noisy data, consider EPnP + RANSAC.
 *
 * Algorithm:
 * 1. Build linear system from 3D-2D correspondences
 * 2. Solve for camera projection matrix P (3x4)
 * 3. Decompose P into rotation R and translation t
 * 4. Convert rotation matrix to quaternion
 *
 * @param worldPoints - 3D points in world coordinates (already triangulated)
 * @param imagePoints - Corresponding 2D image observations
 * @param viewpoint - Camera to initialize (uses intrinsics, updates pose)
 * @returns Camera pose or null if solve fails
 */
export function solvePnP(
  correspondences: Array<{ worldPoint: IWorldPoint; imagePoint: IImagePoint }>,
  viewpoint: IViewpoint
): PnPResult | null {
  const vpConcrete = viewpoint as Viewpoint;

  if (correspondences.length < 4) {
    console.log(`PnP: Need at least 4 correspondences, got ${correspondences.length}`);
    return null;
  }

  const validCorrespondences = correspondences.filter(c => {
    const wp = c.worldPoint as WorldPoint;
    return wp.optimizedXyz !== null;
  });

  if (validCorrespondences.length < 4) {
    console.log(`PnP: Need at least 4 points with optimizedXyz, got ${validCorrespondences.length}`);
    return null;
  }

  const K = getCameraMatrix(vpConcrete);

  const Pinv_K = invertCameraMatrix(K);

  const points3D: [number, number, number][] = [];
  const points2D: [number, number][] = [];

  for (const corr of validCorrespondences) {
    const wp = corr.worldPoint as WorldPoint;
    const ip = corr.imagePoint;

    const X = wp.optimizedXyz!;
    const x_normalized = normalizeImagePoint([ip.u, ip.v], Pinv_K);

    points3D.push(X);
    points2D.push(x_normalized);
  }

  const pose = estimatePoseDLT(points3D, points2D);
  if (!pose) {
    console.log('PnP: DLT estimation failed');
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

function invertCameraMatrix(K: number[][]): number[][] {
  const fx = K[0][0];
  const fy = K[1][1];
  const cx = K[0][2];
  const cy = K[1][2];

  return [
    [1 / fx, 0, -cx / fx],
    [0, 1 / fy, -cy / fy],
    [0, 0, 1]
  ];
}

function normalizeImagePoint(pixel: [number, number], Kinv: number[][]): [number, number] {
  const u = pixel[0];
  const v = pixel[1];

  const x = Kinv[0][0] * u + Kinv[0][1] * v + Kinv[0][2];
  const y = Kinv[1][0] * u + Kinv[1][1] * v + Kinv[1][2];

  return [x, y];
}

/**
 * Estimate camera pose using Direct Linear Transform (DLT).
 *
 * For each 3D-2D correspondence (Xi, xi):
 *   xi × (P * Xi) = 0
 *
 * This gives 2 equations per point (third is linearly dependent).
 * We solve for the 12 elements of P, then decompose.
 */
function estimatePoseDLT(
  points3D: [number, number, number][],
  points2D: [number, number][]
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

  return decomposePMatrix(P_matrix);
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
 * Assumes K is already factored out (normalized coordinates).
 *
 * P = [M | p4] where M is 3x3, p4 is 3x1
 * We need: R from M, t from p4
 */
function decomposePMatrix(P: number[][]): {
  position: [number, number, number];
  rotation: [number, number, number, number];
} | null {
  const M = [
    [P[0][0], P[0][1], P[0][2]],
    [P[1][0], P[1][1], P[1][2]],
    [P[2][0], P[2][1], P[2][2]]
  ];

  const p4 = [P[0][3], P[1][3], P[2][3]];

  const R = orthogonalizeMatrix(M);

  const detR = determinant3x3(R);
  if (detR < 0) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        R[i][j] = -R[i][j];
      }
    }
    p4[0] = -p4[0];
    p4[1] = -p4[1];
    p4[2] = -p4[2];
  }

  const C = solveLinearSystem3x3(M, p4);
  if (!C) return null;

  const position: [number, number, number] = [-C[0], -C[1], -C[2]];

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

function solveLinearSystem3x3(A: number[][], b: number[]): number[] | null {
  const det = determinant3x3(A);
  if (Math.abs(det) < 1e-10) return null;

  const x = determinant3x3([
    [b[0], A[0][1], A[0][2]],
    [b[1], A[1][1], A[1][2]],
    [b[2], A[2][1], A[2][2]]
  ]) / det;

  const y = determinant3x3([
    [A[0][0], b[0], A[0][2]],
    [A[1][0], b[1], A[1][2]],
    [A[2][0], b[2], A[2][2]]
  ]) / det;

  const z = determinant3x3([
    [A[0][0], A[0][1], b[0]],
    [A[1][0], A[1][1], b[1]],
    [A[2][0], A[2][1], b[2]]
  ]) / det;

  return [x, y, z];
}

/**
 * Initialize an additional camera using PnP.
 * Finds all world points visible in this camera that already have optimizedXyz,
 * then solves PnP to estimate camera pose.
 */
export function initializeCameraWithPnP(
  viewpoint: IViewpoint,
  allWorldPoints: Set<IWorldPoint>
): boolean {
  const vpConcrete = viewpoint as Viewpoint;

  const correspondences: Array<{ worldPoint: IWorldPoint; imagePoint: IImagePoint }> = [];

  for (const ip of vpConcrete.imagePoints) {
    const wp = ip.worldPoint as WorldPoint;
    if (wp.optimizedXyz !== null) {
      correspondences.push({ worldPoint: wp, imagePoint: ip });
    }
  }

  if (correspondences.length < 4) {
    console.log(`PnP: Camera ${vpConcrete.name} has only ${correspondences.length} points with optimizedXyz`);
    return false;
  }

  const result = solvePnP(correspondences, vpConcrete);
  if (!result || !result.success) {
    console.log(`PnP: Failed to solve for camera ${vpConcrete.name}`);
    return false;
  }

  vpConcrete.position = result.position;
  vpConcrete.rotation = result.rotation;

  console.log(`PnP: Initialized ${vpConcrete.name} using ${correspondences.length} correspondences`);
  console.log(`  Position: [${result.position.map(x => x.toFixed(3)).join(', ')}]`);
  console.log(`  Rotation: [${result.rotation.map(x => x.toFixed(3)).join(', ')}]`);

  return true;
}
