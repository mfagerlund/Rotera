import type { VanishingPoint } from './types';

export function estimateFocalLength(
  vp1: { u: number; v: number },
  vp2: { u: number; v: number },
  principalPoint: { u: number; v: number }
): number | null {
  const u1 = vp1.u - principalPoint.u;
  const v1 = vp1.v - principalPoint.v;
  const u2 = vp2.u - principalPoint.u;
  const v2 = vp2.v - principalPoint.v;

  const discriminant = -(u1 * u2 + v1 * v2);

  if (discriminant < 0) {
    return null;
  }

  const f = Math.sqrt(discriminant);
  return f;
}

export function estimatePrincipalPoint(
  vanishingPoints: {
    x?: VanishingPoint;
    y?: VanishingPoint;
    z?: VanishingPoint;
  },
  imageWidth: number,
  imageHeight: number
): { u: number; v: number } | null {
  const vps = Object.values(vanishingPoints).filter(vp => vp !== undefined) as VanishingPoint[];

  if (vps.length < 2) {
    return null;
  }

  const vp1 = vps[0];
  const vp2 = vps[1];
  const vp3 = vps[2];

  if (vps.length === 3 && vp3) {
    const u1 = vp1.u;
    const v1 = vp1.v;
    const u2 = vp2.u;
    const v2 = vp2.v;
    const u3 = vp3.u;
    const v3 = vp3.v;

    const A = u1 * u2 - u1 * u3 - u2 * u3;
    const B = v1 * v2 + v1 * v3 + v2 * v3;
    const C = u1 * u2 + u1 * u3 + u2 * u3;
    const D = v1 * v2 - v1 * v3 - v2 * v3;

    const denom = A + D;
    if (Math.abs(denom) < 1e-6) {
      return null;
    }

    const u0 = -(u1 * u2 * u3 + v1 * v2 * v3) / denom;
    const v0 = (B * u1 + C * v1) / denom;

    if (u0 < 0 || u0 > imageWidth || v0 < 0 || v0 > imageHeight) {
      return { u: imageWidth / 2, v: imageHeight / 2 };
    }

    return { u: u0, v: v0 };
  }

  if (vanishingPoints.x && vanishingPoints.z && !vanishingPoints.y) {
    const xVP = vanishingPoints.x;
    const zVP = vanishingPoints.z;

    const midU = (xVP.u + zVP.u) / 2;

    const v0 = imageHeight / 2;

    return { u: midU, v: v0 };
  }

  return { u: imageWidth / 2, v: imageHeight / 2 };
}
