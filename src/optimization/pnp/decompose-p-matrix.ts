/**
 * Decompose projection matrix P = K[R|t] into rotation and translation.
 *
 * P = K[R|t] where K is camera intrinsics, R is rotation, t is translation
 * First we compute M = K^{-1} * P_left where P_left is the left 3x3 of P
 * M should equal R (rotation matrix)
 * Then t = K^{-1} * p4 where p4 is the last column of P
 */

import {
  invert3x3,
  matrixMultiply3x3,
  orthogonalizeMatrix,
  determinant3x3,
  matrixToQuaternion
} from './math-utils';

export function decomposePMatrix(P: number[][], K: number[][]): {
  position: [number, number, number];
  rotation: [number, number, number, number];
} | null {
  const Kinv = invert3x3(K);
  if (!Kinv) return null;

  const P_left = [
    [P[0][0], P[0][1], P[0][2]],
    [P[1][0], P[1][1], P[1][2]],
    [P[2][0], P[2][1], P[2][2]]
  ];

  const M = matrixMultiply3x3(Kinv, P_left);

  const R = orthogonalizeMatrix(M);

  const detR = determinant3x3(R);
  if (detR < 0) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        R[i][j] = -R[i][j];
      }
    }
  }

  const p4 = [P[0][3], P[1][3], P[2][3]];

  const t = [
    Kinv[0][0] * p4[0] + Kinv[0][1] * p4[1] + Kinv[0][2] * p4[2],
    Kinv[1][0] * p4[0] + Kinv[1][1] * p4[1] + Kinv[1][2] * p4[2],
    Kinv[2][0] * p4[0] + Kinv[2][1] * p4[1] + Kinv[2][2] * p4[2]
  ];

  const R_T = [
    [R[0][0], R[1][0], R[2][0]],
    [R[0][1], R[1][1], R[2][1]],
    [R[0][2], R[1][2], R[2][2]]
  ];

  const C_x = -(R_T[0][0] * t[0] + R_T[0][1] * t[1] + R_T[0][2] * t[2]);
  const C_y = -(R_T[1][0] * t[0] + R_T[1][1] * t[1] + R_T[1][2] * t[2]);
  const C_z = -(R_T[2][0] * t[0] + R_T[2][1] * t[1] + R_T[2][2] * t[2]);

  const position: [number, number, number] = [C_x, C_y, C_z];

  const quaternion = matrixToQuaternion(R);

  return { position, rotation: quaternion };
}
