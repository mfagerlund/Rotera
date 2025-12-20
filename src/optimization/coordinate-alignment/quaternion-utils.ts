export function quaternionMultiply(q1: number[], q2: number[]): number[] {
  const w1 = q1[0], x1 = q1[1], y1 = q1[2], z1 = q1[3];
  const w2 = q2[0], x2 = q2[1], y2 = q2[2], z2 = q2[3];

  return [
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2
  ];
}

export function quaternionRotateVector(q: number[], v: number[]): number[] {
  const qw = q[0], qx = q[1], qy = q[2], qz = q[3];
  const vx = v[0], vy = v[1], vz = v[2];

  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx)
  ];
}

export function quaternionInverse(q: number[]): number[] {
  return [q[0], -q[1], -q[2], -q[3]];
}

export function computeRotationBetweenVectors(from: number[], to: number[]): number[] {
  const fromNorm = Math.sqrt(from[0] * from[0] + from[1] * from[1] + from[2] * from[2]);
  const toNorm = Math.sqrt(to[0] * to[0] + to[1] * to[1] + to[2] * to[2]);

  if (fromNorm < 1e-10 || toNorm < 1e-10) {
    return [1, 0, 0, 0];
  }

  const f = [from[0] / fromNorm, from[1] / fromNorm, from[2] / fromNorm];
  const t = [to[0] / toNorm, to[1] / toNorm, to[2] / toNorm];

  const dot = f[0] * t[0] + f[1] * t[1] + f[2] * t[2];

  if (dot > 0.99999) {
    return [1, 0, 0, 0];
  }

  if (dot < -0.99999) {
    let orthogonal = [1, 0, 0];
    if (Math.abs(f[0]) > 0.9) {
      orthogonal = [0, 1, 0];
    }
    const cross = [
      orthogonal[1] * f[2] - orthogonal[2] * f[1],
      orthogonal[2] * f[0] - orthogonal[0] * f[2],
      orthogonal[0] * f[1] - orthogonal[1] * f[0]
    ];
    const crossNorm = Math.sqrt(cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);
    return [0, cross[0] / crossNorm, cross[1] / crossNorm, cross[2] / crossNorm];
  }

  const cross = [
    f[1] * t[2] - f[2] * t[1],
    f[2] * t[0] - f[0] * t[2],
    f[0] * t[1] - f[1] * t[0]
  ];

  const w = 1 + dot;
  const norm = Math.sqrt(w * w + cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);

  return [w / norm, cross[0] / norm, cross[1] / norm, cross[2] / norm];
}
