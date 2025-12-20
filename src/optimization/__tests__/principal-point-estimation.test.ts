import { describe, it, expect } from '@jest/globals';
import { estimatePrincipalPoint } from '../vanishing-points';

describe('Principal Point Estimation', () => {
  it('should return null to preserve user-set principal point values', async () => {
    // estimatePrincipalPoint now always returns null to support cropped images.
    // The Viewpoint defaults cx/cy to image center when created, and we don't
    // want to override user-specified principal point values.
    const xVanishingPoint = { u: 46.25, v: 373.84, axis: 'x' as const };
    const zVanishingPoint = { u: 1055.35, v: 372.86, axis: 'z' as const };
    const imageWidth = 1100;
    const imageHeight = 724;

    const vanishingPoints = {
      x: xVanishingPoint,
      z: zVanishingPoint
    };

    const estimatedPP = estimatePrincipalPoint(vanishingPoints, imageWidth, imageHeight);

    // Should return null - the caller uses Viewpoint's existing principalPointX/Y
    expect(estimatedPP).toBeNull();
  });

  it('should return null when not enough vanishing points', async () => {
    const imageWidth = 1100;
    const imageHeight = 724;

    const vanishingPoints = {
      x: { u: 100, v: 100, axis: 'x' as const }
    };

    const estimatedPP = estimatePrincipalPoint(vanishingPoints, imageWidth, imageHeight);

    expect(estimatedPP).toBeNull();
  });
});
