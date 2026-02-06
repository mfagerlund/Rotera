/**
 * Singular Value Decomposition (SVD) and eigendecomposition algorithms.
 * Used for solving linear systems in Essential Matrix estimation.
 */

export function svd3x3(A: number[][]): { U: number[][], S: number[], V: number[][] } {
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
  const eigResult = jacobiEigenDecomposition3x3(AtA);

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

export function jacobiEigenDecomposition(A: number[][], maxIterations: number, tolerance: number): { eigenvalues: number[], eigenvectors: number[][] } {
  const n = A.length;
  const V: number[][] = Array(n).fill(0).map((_, i) => Array(n).fill(0).map((_, j) => i === j ? 1 : 0));
  const M: number[][] = A.map(row => [...row]);

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

export function jacobiEigenDecomposition3x3(A: number[][]): { eigenvalues: number[]; eigenvectors: number[][] } {
  return jacobiEigenDecomposition(A, 100, 1e-10);
}

export function jacobiEigenDecomposition9x9(A: number[][]): { eigenvalues: number[]; eigenvectors: number[][] } {
  return jacobiEigenDecomposition(A, 200, 1e-12);
}

export function jacobiEigenDecomposition4x4(A: number[][]): { eigenvalues: number[]; eigenvectors: number[][] } {
  return jacobiEigenDecomposition(A, 100, 1e-10);
}
