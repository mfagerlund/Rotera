export function solveQuartic(a4: number, a3: number, a2: number, a1: number, a0: number): number[] {
  if (Math.abs(a4) < 1e-10) {
    return solveCubic(a3, a2, a1, a0);
  }

  const b3 = a3 / a4;
  const b2 = a2 / a4;
  const b1 = a1 / a4;
  const b0 = a0 / a4;

  const p = b2 - (3 * b3 * b3) / 8;
  const q = b1 - (b3 * b2) / 2 + (b3 * b3 * b3) / 8;
  const r = b0 - (b3 * b1) / 4 + (b3 * b3 * b2) / 16 - (3 * b3 * b3 * b3 * b3) / 256;

  const cubicRoots = solveCubic(1, p / 2, (p * p - 4 * r) / 16, -(q * q) / 64);

  if (cubicRoots.length === 0) return [];

  const y = cubicRoots[0];
  const D = 2 * y - p;

  if (D < -1e-10) return [];

  const sqrtD = Math.sqrt(Math.max(0, D));

  const roots: number[] = [];

  const E1 = -q / (2 * sqrtD) - p / 2 - y;
  if (E1 >= -1e-10) {
    const sqrtE1 = Math.sqrt(Math.max(0, E1));
    roots.push(-b3 / 4 + sqrtD / 2 + sqrtE1 / 2);
    roots.push(-b3 / 4 + sqrtD / 2 - sqrtE1 / 2);
  }

  const E2 = q / (2 * sqrtD) - p / 2 - y;
  if (E2 >= -1e-10) {
    const sqrtE2 = Math.sqrt(Math.max(0, E2));
    roots.push(-b3 / 4 - sqrtD / 2 + sqrtE2 / 2);
    roots.push(-b3 / 4 - sqrtD / 2 - sqrtE2 / 2);
  }

  return roots;
}

export function solveCubic(a3: number, a2: number, a1: number, a0: number): number[] {
  if (Math.abs(a3) < 1e-10) {
    return solveQuadratic(a2, a1, a0);
  }

  const p = a2 / a3;
  const q = a1 / a3;
  const r = a0 / a3;

  const Q = (3 * q - p * p) / 9;
  const R = (9 * p * q - 27 * r - 2 * p * p * p) / 54;
  const D = Q * Q * Q + R * R;

  const roots: number[] = [];

  if (D >= 0) {
    const sqrtD = Math.sqrt(D);
    const S = Math.sign(R + sqrtD) * Math.pow(Math.abs(R + sqrtD), 1 / 3);
    const T = Math.sign(R - sqrtD) * Math.pow(Math.abs(R - sqrtD), 1 / 3);
    roots.push(-p / 3 + S + T);
  } else {
    const theta = Math.acos(R / Math.sqrt(-Q * Q * Q));
    const sqrtQ = Math.sqrt(-Q);
    roots.push(2 * sqrtQ * Math.cos(theta / 3) - p / 3);
    roots.push(2 * sqrtQ * Math.cos((theta + 2 * Math.PI) / 3) - p / 3);
    roots.push(2 * sqrtQ * Math.cos((theta + 4 * Math.PI) / 3) - p / 3);
  }

  return roots;
}

export function solveQuadratic(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-10) {
    if (Math.abs(b) < 1e-10) return [];
    return [-c / b];
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < -1e-10) return [];

  const sqrtD = Math.sqrt(Math.max(0, discriminant));
  return [(-b + sqrtD) / (2 * a), (-b - sqrtD) / (2 * a)];
}
