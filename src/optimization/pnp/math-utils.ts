export function dot3D(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

export function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return norm > 1e-10 ? [v[0] / norm, v[1] / norm, v[2] / norm] : v;
}

export function transpose3x3(M: number[][]): number[][] {
  return [
    [M[0][0], M[1][0], M[2][0]],
    [M[0][1], M[1][1], M[2][1]],
    [M[0][2], M[1][2], M[2][2]]
  ];
}

export function determinant3x3(M: number[][]): number {
  return (
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
    M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
    M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0])
  );
}

export function invert3x3(A: number[][]): number[][] | null {
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

export function matrixMultiply3x3(A: number[][], B: number[][]): number[][] {
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

export function matrixVectorMultiply(A: number[][], v: number[]): number[] {
  return A.map(row => dotProduct(row, v));
}

export function multiplyTranspose(A: number[][], B: number[][]): number[][] {
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

export function orthogonalizeMatrix(M: number[][]): number[][] {
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

export function matrixToQuaternion(R: number[][]): [number, number, number, number] {
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

export function quaternionToMatrix(q: [number, number, number, number]): number[][] {
  const [w, x, y, z] = q;

  return [
    [1 - 2 * y * y - 2 * z * z, 2 * x * y - 2 * z * w, 2 * x * z + 2 * y * w],
    [2 * x * y + 2 * z * w, 1 - 2 * x * x - 2 * z * z, 2 * y * z - 2 * x * w],
    [2 * x * z - 2 * y * w, 2 * y * z + 2 * x * w, 1 - 2 * x * x - 2 * y * y]
  ];
}

export function computeReprojectionErrorForPose(
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

export function computeSVD3x3(M: number[][]): { U: number[][]; S: number[]; V: number[][] } | null {
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

export function computeEigenVectors3x3(M: number[][]): number[][] | null {
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

export function computeEigenVectors(A: number[][]): number[][] | null {
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

export function computeSVD(A: number[][]): { V: number[][] } | null {
  const m = A.length;
  const n = A[0].length;

  const AtA = multiplyTranspose(A, A);

  const eigenVectors = computeEigenVectors(AtA);
  if (!eigenVectors) return null;

  return { V: eigenVectors };
}
