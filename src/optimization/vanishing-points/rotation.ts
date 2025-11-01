import type { VanishingLineAxis } from '../../entities/vanishing-line';
import type { VanishingPoint } from './types';

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  if (norm < 1e-10) {
    return v;
  }
  return v.map(x => x / norm);
}

function cross(a: number[], b: number[]): number[] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function matrixToQuaternion(R: number[][]): [number, number, number, number] {
  const trace = R[0][0] + R[1][1] + R[2][2];

  let w: number, x: number, y: number, z: number;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    w = 0.25 / s;
    x = (R[2][1] - R[1][2]) * s;
    y = (R[0][2] - R[2][0]) * s;
    z = (R[1][0] - R[0][1]) * s;
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const s = 2.0 * Math.sqrt(1.0 + R[0][0] - R[1][1] - R[2][2]);
    w = (R[2][1] - R[1][2]) / s;
    x = 0.25 * s;
    y = (R[0][1] + R[1][0]) / s;
    z = (R[0][2] + R[2][0]) / s;
  } else if (R[1][1] > R[2][2]) {
    const s = 2.0 * Math.sqrt(1.0 + R[1][1] - R[0][0] - R[2][2]);
    w = (R[0][2] - R[2][0]) / s;
    x = (R[0][1] + R[1][0]) / s;
    y = 0.25 * s;
    z = (R[1][2] + R[2][1]) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + R[2][2] - R[0][0] - R[1][1]);
    w = (R[1][0] - R[0][1]) / s;
    x = (R[0][2] + R[2][0]) / s;
    y = (R[1][2] + R[2][1]) / s;
    z = 0.25 * s;
  }

  const mag = Math.sqrt(w * w + x * x + y * y + z * z);
  return [w / mag, x / mag, y / mag, z / mag];
}

export function computeRotationFromVPs(
  vanishingPoints: {
    x?: VanishingPoint;
    y?: VanishingPoint;
    z?: VanishingPoint;
  },
  focalLength: number,
  principalPoint: { u: number; v: number }
): [number, number, number, number] | null {
  const availableAxes = Object.keys(vanishingPoints).filter(
    axis => vanishingPoints[axis as VanishingLineAxis] !== undefined
  ) as VanishingLineAxis[];

  if (availableAxes.length < 2) {
    return null;
  }

  const directions: Record<VanishingLineAxis, number[]> = {} as any;

  availableAxes.forEach(axis => {
    const vp = vanishingPoints[axis]!;
    const u = vp.u - principalPoint.u;
    const v = vp.v - principalPoint.v;

    const dir = normalize([u / focalLength, -v / focalLength, 1]);
    directions[axis] = dir;
  });

  let d_x: number[], d_y: number[], d_z: number[];
  let derivedYAxis = false;

  if (directions.x && directions.z && !directions.y) {
    d_x = directions.x;
    d_z = directions.z;
    d_y = cross(d_z, d_x);
    d_y = normalize(d_y);
    derivedYAxis = true;
  } else if (directions.x && directions.y) {
    d_x = directions.x;
    d_y = directions.y;
    d_z = cross(d_x, d_y);
    d_z = normalize(d_z);
  } else if (directions.y && directions.z) {
    d_y = directions.y;
    d_z = directions.z;
    d_x = cross(d_y, d_z);
    d_x = normalize(d_x);
  } else {
    return null;
  }

  if (d_y[1] < 0) {
    d_x = d_x.map(v => -v);
    d_y = d_y.map(v => -v);
  }

  let R = [
    [d_x[0], d_y[0], d_z[0]],
    [d_x[1], d_y[1], d_z[1]],
    [d_x[2], d_y[2], d_z[2]]
  ];

  if (derivedYAxis) {
    const targetU = (directions.x[0] / directions.x[2] + directions.z[0] / directions.z[2]) / 2;
    const currentU = R[0][1] / R[2][1];

    if (Math.abs(R[2][1]) > 1e-6 && Math.abs(currentU - targetU) > 0.01) {
      let bestRoll = 0;
      let bestError = Math.abs(currentU - targetU);

      for (let roll = -Math.PI; roll <= Math.PI; roll += 0.05) {
        const c = Math.cos(roll);
        const s = Math.sin(roll);

        const newYx = R[0][1] * c - R[0][0] * s;
        const newYz = R[2][1] * c - R[2][0] * s;

        if (Math.abs(newYz) > 1e-6) {
          const testU = newYx / newYz;
          const error = Math.abs(testU - targetU);
          if (error < bestError) {
            bestError = error;
            bestRoll = roll;
          }
        }
      }

      if (Math.abs(bestRoll) > 0.001) {
        const c = Math.cos(bestRoll);
        const s = Math.sin(bestRoll);

        R = [
          [
            R[0][0] * c + R[0][1] * s,
            R[0][1] * c - R[0][0] * s,
            R[0][2]
          ],
          [
            R[1][0] * c + R[1][1] * s,
            R[1][1] * c - R[1][0] * s,
            R[1][2]
          ],
          [
            R[2][0] * c + R[2][1] * s,
            R[2][1] * c - R[2][0] * s,
            R[2][2]
          ]
        ];

        console.log('[VP Debug] Applied roll correction:', bestRoll, 'radians');
      }
    }
  }

  const quaternion = matrixToQuaternion(R);

  console.log('[VP Debug] Computed rotation matrix from vanishing points:');
  console.log(`[ ${R[0].map(v => v.toFixed(6)).join(', ')} ]`);
  console.log(`[ ${R[1].map(v => v.toFixed(6)).join(', ')} ]`);
  console.log(`[ ${R[2].map(v => v.toFixed(6)).join(', ')} ]`);
  console.log('[VP Debug] Quaternion:', quaternion.map(v => Number(v.toFixed(6))));

  return quaternion;
}

export function computeCameraPosition(
  rotation: [number, number, number, number],
  focalLength: number,
  principalPoint: { u: number; v: number },
  lockedPoints: Array<{
    worldPoint: { lockedXyz: (number | null)[] };
    imagePoint: { u: number; v: number };
  }>
): [number, number, number] | null {
  if (lockedPoints.length < 2) {
    return null;
  }

  const qw = rotation[0];
  const qx = rotation[1];
  const qy = rotation[2];
  const qz = rotation[3];

  let R = [
    [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy)],
    [2 * (qx * qy + qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qw * qx)],
    [2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), 1 - 2 * (qx * qx + qy * qy)]
  ];

  const Rt = [
    [R[0][0], R[1][0], R[2][0]],
    [R[0][1], R[1][1], R[2][1]],
    [R[0][2], R[1][2], R[2][2]]
  ];

  const A: number[][] = [];
  const b: number[] = [];

  lockedPoints.forEach(({ worldPoint, imagePoint }) => {
    const lockedXyz = worldPoint.lockedXyz;
    const P = [lockedXyz[0]!, lockedXyz[1]!, lockedXyz[2]!];

    const u_norm = (imagePoint.u - principalPoint.u) / focalLength;
    const v_norm = (principalPoint.v - imagePoint.v) / focalLength;

    const ray = [u_norm, v_norm, 1];
    const ray_world = [
      Rt[0][0] * ray[0] + Rt[0][1] * ray[1] + Rt[0][2] * ray[2],
      Rt[1][0] * ray[0] + Rt[1][1] * ray[1] + Rt[1][2] * ray[2],
      Rt[2][0] * ray[0] + Rt[2][1] * ray[1] + Rt[2][2] * ray[2]
    ];

    A.push([ray_world[1], -ray_world[0], 0]);
    b.push(P[0] * ray_world[1] - P[1] * ray_world[0]);

    A.push([ray_world[2], 0, -ray_world[0]]);
    b.push(P[0] * ray_world[2] - P[2] * ray_world[0]);

    A.push([0, ray_world[2], -ray_world[1]]);
    b.push(P[1] * ray_world[2] - P[2] * ray_world[1]);
  });

  const AtA: number[][] = Array(3).fill(0).map(() => Array(3).fill(0));
  const Atb: number[] = Array(3).fill(0);

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < A.length; k++) {
        AtA[i][j] += A[k][i] * A[k][j];
      }
    }
    for (let k = 0; k < A.length; k++) {
      Atb[i] += A[k][i] * b[k];
    }
  }

  const C = solveLinearSystem3x3(AtA, Atb);
  if (!C) {
    return null;
  }

  return [C[0], C[1], C[2]];
}

function solveLinearSystem3x3(A: number[][], b: number[]): number[] | null {
  const det =
    A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);

  if (Math.abs(det) < 1e-10) {
    return null;
  }

  const invA: number[][] = [
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

  const x = [
    invA[0][0] * b[0] + invA[0][1] * b[1] + invA[0][2] * b[2],
    invA[1][0] * b[0] + invA[1][1] * b[1] + invA[1][2] * b[2],
    invA[2][0] * b[0] + invA[2][1] * b[1] + invA[2][2] * b[2]
  ];

  return x;
}
