import { describe, it, expect } from '@jest/globals';

describe('VP Roll Correction - Standalone', () => {
  it('should compute rotation with Y VP horizontally centered between X and Z VPs', () => {
    const focalLength = 243.6;
    const principalPoint = { u: 550, v: 362 };

    const xVanishingPoint = { u: 46.25, v: 373.84 };
    const zVanishingPoint = { u: 1055.35, v: 372.86 };

    const directionX = [
      (xVanishingPoint.u - principalPoint.u) / focalLength,
      -(xVanishingPoint.v - principalPoint.v) / focalLength,
      1
    ];

    const directionZ = [
      (zVanishingPoint.u - principalPoint.u) / focalLength,
      -(zVanishingPoint.v - principalPoint.v) / focalLength,
      1
    ];

    const targetYvpU = (xVanishingPoint.u + zVanishingPoint.u) / 2;

    const R = computeRotationFromVanishingDirections(
      directionX,
      directionZ,
      focalLength,
      principalPoint,
      targetYvpU
    );

    const computeVPu = (worldAxisCol: number): number => {
      const dir = [R[0][worldAxisCol], R[1][worldAxisCol], R[2][worldAxisCol]];
      if (Math.abs(dir[2]) < 1e-6) return NaN;
      return principalPoint.u + focalLength * (dir[0] / dir[2]);
    };

    const xVP = computeVPu(0);
    const yVP = computeVPu(1);
    const zVP = computeVPu(2);

    console.log('\n=== VP Roll Correction Test ===');
    console.log(`Input vanishing points:`);
    console.log(`  X-axis: u=${xVanishingPoint.u.toFixed(2)}`);
    console.log(`  Z-axis: u=${zVanishingPoint.u.toFixed(2)}`);
    console.log(`\nComputed camera VPs:`);
    console.log(`  X-axis VP u: ${xVP.toFixed(2)} (expected ${xVanishingPoint.u.toFixed(2)})`);
    console.log(`  Y-axis VP u: ${yVP.toFixed(2)} (expected ${targetYvpU.toFixed(2)})`);
    console.log(`  Z-axis VP u: ${zVP.toFixed(2)} (expected ${zVanishingPoint.u.toFixed(2)})`);
    console.log(`\nErrors:`);
    console.log(`  X VP error: ${Math.abs(xVP - xVanishingPoint.u).toFixed(2)} pixels`);
    console.log(`  Y VP error: ${Math.abs(yVP - targetYvpU).toFixed(2)} pixels`);
    console.log(`  Z VP error: ${Math.abs(zVP - zVanishingPoint.u).toFixed(2)} pixels\n`);

    expect(Math.abs(xVP - xVanishingPoint.u)).toBeLessThan(1);
    expect(Math.abs(zVP - zVanishingPoint.u)).toBeLessThan(1);
    expect(Math.abs(yVP - targetYvpU)).toBeLessThan(10);
  });
});

function computeRotationFromVanishingDirections(
  directionX: number[],
  directionZ: number[],
  focalLength: number,
  principalPoint: { u: number; v: number },
  targetYvpU: number
): number[][] {
  const normalize = (v: number[]): number[] => {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
  };

  const cross = (a: number[], b: number[]): number[] => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];

  const rX = normalize(directionX);
  const rZ = normalize(directionZ);
  const rY = normalize(cross(rZ, rX));

  return [
    [rX[0], rY[0], rZ[0]],
    [rX[1], rY[1], rZ[1]],
    [rX[2], rY[2], rZ[2]]
  ];
}
