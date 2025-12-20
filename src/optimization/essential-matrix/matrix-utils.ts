/**
 * Matrix utility functions for Essential Matrix operations.
 */

export function matmul3x3(A: number[][], B: number[][]): number[][] {
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

export function transpose3x3(A: number[][]): number[][] {
  return [
    [A[0][0], A[1][0], A[2][0]],
    [A[0][1], A[1][1], A[2][1]],
    [A[0][2], A[1][2], A[2][2]]
  ];
}

export function det3x3(A: number[][]): number {
  return A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
         A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
         A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
}

export function normalizeImageCoordinates(
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

export function rotationMatrixToQuaternion(R: number[][]): number[] {
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
