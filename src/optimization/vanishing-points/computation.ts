import type { VanishingLine } from '../../entities/vanishing-line';

export function computeVanishingPoint(
  lines: VanishingLine[]
): { u: number; v: number } | null {
  if (lines.length < 2) {
    return null;
  }

  const homogeneousLines: Array<[number, number, number]> = lines.map(line => {
    const p1 = [line.p1.u, line.p1.v, 1];
    const p2 = [line.p2.u, line.p2.v, 1];

    const a = p1[1] * p2[2] - p1[2] * p2[1];
    const b = p1[2] * p2[0] - p1[0] * p2[2];
    const c = p1[0] * p2[1] - p1[1] * p2[0];

    return [a, b, c];
  });

  if (lines.length === 2) {
    const l1 = homogeneousLines[0];
    const l2 = homogeneousLines[1];

    const vp_x = l1[1] * l2[2] - l1[2] * l2[1];
    const vp_y = l1[2] * l2[0] - l1[0] * l2[2];
    const vp_w = l1[0] * l2[1] - l1[1] * l2[0];

    if (Math.abs(vp_w) < 1e-10) {
      return null;
    }

    return {
      u: vp_x / vp_w,
      v: vp_y / vp_w
    };
  }

  const A: number[][] = homogeneousLines.map(l => [l[0], l[1], l[2]]);

  const svdResult = simpleSVD(A);
  if (!svdResult) {
    return null;
  }

  const vp = svdResult.V[2];

  if (Math.abs(vp[2]) < 1e-10) {
    return null;
  }

  const result = {
    u: vp[0] / vp[2],
    v: vp[1] / vp[2]
  };

  if (Math.abs(result.u) > 10000 || Math.abs(result.v) > 10000) {
    console.log('[VP] WARNING: VP very far from origin:', result, 'eigenvector:', vp);
  }

  return result;
}

function simpleSVD(A: number[][]): { V: number[][] } | null {
  const m = A.length;
  const n = A[0].length;

  const AtA: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < m; k++) {
        sum += A[k][i] * A[k][j];
      }
      AtA[i][j] = sum;
    }
  }

  const eigResult = inversePowerIteration(AtA, 100);
  if (!eigResult) {
    return null;
  }

  return { V: [[0, 0, 1], [0, 1, 0], eigResult.vector] };
}

function inversePowerIteration(A: number[][], maxIter: number): { vector: number[] } | null {
  const n = A.length;

  const shift = 1e-6;
  const AShifted: number[][] = Array(n).fill(0).map((_, i) =>
    Array(n).fill(0).map((_, j) =>
      i === j ? A[i][j] + shift : A[i][j]
    )
  );

  let v = Array(n).fill(1 / Math.sqrt(n));

  for (let iter = 0; iter < maxIter; iter++) {
    const y = solveLinearSystem(AShifted, v);
    if (!y) {
      return null;
    }

    const norm = Math.sqrt(y.reduce((sum, x) => sum + x * x, 0));
    if (norm < 1e-10) {
      return null;
    }

    v = y.map(x => x / norm);
  }

  return { vector: v };
}

function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const aug: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
        maxRow = k;
      }
    }

    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

    if (Math.abs(aug[i][i]) < 1e-10) {
      return null;
    }

    for (let k = i + 1; k < n; k++) {
      const factor = aug[k][i] / aug[i][i];
      for (let j = i; j <= n; j++) {
        aug[k][j] -= factor * aug[i][j];
      }
    }
  }

  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }

  return x;
}

export function computeAngleBetweenVPs(
  vp1: { u: number; v: number },
  vp2: { u: number; v: number },
  principalPoint: { u: number; v: number }
): number {
  const d1_u = vp1.u - principalPoint.u;
  const d1_v = vp1.v - principalPoint.v;
  const d2_u = vp2.u - principalPoint.u;
  const d2_v = vp2.v - principalPoint.v;

  const dot = d1_u * d2_u + d1_v * d2_v;
  const norm1 = Math.sqrt(d1_u * d1_u + d1_v * d1_v);
  const norm2 = Math.sqrt(d2_u * d2_u + d2_v * d2_v);

  if (norm1 < 1e-10 || norm2 < 1e-10) {
    return 0;
  }

  const cosAngle = dot / (norm1 * norm2);
  const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
  const angleDeg = (angleRad * 180) / Math.PI;

  return angleDeg;
}

export function computeLineLength(line: VanishingLine): number {
  const dx = line.p2.u - line.p1.u;
  const dy = line.p2.v - line.p1.v;
  return Math.sqrt(dx * dx + dy * dy);
}

export function computeAngleBetweenLines(
  line1: VanishingLine,
  line2: VanishingLine
): number {
  const dx1 = line1.p2.u - line1.p1.u;
  const dy1 = line1.p2.v - line1.p1.v;
  const dx2 = line2.p2.u - line2.p1.u;
  const dy2 = line2.p2.v - line2.p1.v;

  const dot = dx1 * dx2 + dy1 * dy2;
  const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
  const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

  if (len1 < 1e-10 || len2 < 1e-10) {
    return 0;
  }

  const cosAngle = dot / (len1 * len2);
  const angleRad = Math.acos(Math.max(-1, Math.min(1, Math.abs(cosAngle))));
  const angleDeg = (angleRad * 180) / Math.PI;

  return angleDeg;
}
