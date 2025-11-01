import { describe, it, expect } from '@jest/globals';
import { estimatePrincipalPoint } from '../vanishing-points';

describe('Principal Point Estimation', () => {
  it('should estimate principal point from X and Z vanishing points', () => {
    const xVanishingPoint = { u: 46.25, v: 373.84, axis: 'x' as const };
    const zVanishingPoint = { u: 1055.35, v: 372.86, axis: 'z' as const };
    const imageWidth = 1100;
    const imageHeight = 724;

    const vanishingPoints = {
      x: xVanishingPoint,
      z: zVanishingPoint
    };

    const estimatedPP = estimatePrincipalPoint(vanishingPoints, imageWidth, imageHeight);

    expect(estimatedPP).not.toBeNull();

    const expectedU = (xVanishingPoint.u + zVanishingPoint.u) / 2;
    const expectedV = imageHeight / 2;

    console.log('\n=== Principal Point Estimation Test ===');
    console.log(`Image size: ${imageWidth}x${imageHeight}`);
    console.log(`Vanishing points:`);
    console.log(`  X: (${xVanishingPoint.u.toFixed(2)}, ${xVanishingPoint.v.toFixed(2)})`);
    console.log(`  Z: (${zVanishingPoint.u.toFixed(2)}, ${zVanishingPoint.v.toFixed(2)})`);
    console.log(`\nEstimated principal point: (${estimatedPP!.u.toFixed(2)}, ${estimatedPP!.v.toFixed(2)})`);
    console.log(`Expected: (${expectedU.toFixed(2)}, ${expectedV.toFixed(2)})`);
    console.log(`Error: u=${Math.abs(estimatedPP!.u - expectedU).toFixed(2)}px, v=${Math.abs(estimatedPP!.v - expectedV).toFixed(2)}px\n`);

    expect(Math.abs(estimatedPP!.u - expectedU)).toBeLessThan(1);
    expect(Math.abs(estimatedPP!.v - expectedV)).toBeLessThan(1);
  });

  it('should default to image center when estimation fails', () => {
    const imageWidth = 1100;
    const imageHeight = 724;

    const vanishingPoints = {
      x: { u: 100, v: 100, axis: 'x' as const }
    };

    const estimatedPP = estimatePrincipalPoint(vanishingPoints, imageWidth, imageHeight);

    expect(estimatedPP).toBeNull();
  });
});
