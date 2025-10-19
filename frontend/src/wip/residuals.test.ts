/**
 * Unit tests for residual functions.
 */

import {
  worldPointLockResidual,
  lineConstraintResidual,
  imagePointResidual
} from './residuals';

describe('Residuals', () => {
  describe('worldPointLockResidual', () => {
    it('should return empty array when no axes locked', () => {
      const point: [number, number, number] = [1, 2, 3];
      const locked: [boolean, boolean, boolean] = [false, false, false];
      const target: [number, number, number] = [0, 0, 0];

      const residual = worldPointLockResidual(point, locked, target);

      expect(residual).toEqual([]);
    });

    it('should return one residual for single locked axis', () => {
      const point: [number, number, number] = [1.5, 2, 3];
      const locked: [boolean, boolean, boolean] = [true, false, false];
      const target: [number, number, number] = [1.0, 0, 0];
      const tolerance = 0.001;

      const residual = worldPointLockResidual(point, locked, target, tolerance);

      expect(residual.length).toBe(1);
      // Error = (1.5 - 1.0) / 0.001 = 500
      expect(residual[0]).toBeCloseTo(500, 1);
    });

    it('should return multiple residuals for multiple locked axes', () => {
      const point: [number, number, number] = [1.5, 2.3, 3.7];
      const locked: [boolean, boolean, boolean] = [true, false, true];
      const target: [number, number, number] = [1.0, 0, 3.0];
      const tolerance = 0.01;

      const residual = worldPointLockResidual(point, locked, target, tolerance);

      expect(residual.length).toBe(2);
      // x error = (1.5 - 1.0) / 0.01 = 50
      expect(residual[0]).toBeCloseTo(50, 1);
      // z error = (3.7 - 3.0) / 0.01 = 70
      expect(residual[1]).toBeCloseTo(70, 1);
    });

    it('should return zero residuals when point matches target', () => {
      const point: [number, number, number] = [1.0, 2.0, 3.0];
      const locked: [boolean, boolean, boolean] = [true, true, true];
      const target: [number, number, number] = [1.0, 2.0, 3.0];

      const residual = worldPointLockResidual(point, locked, target);

      expect(residual.length).toBe(3);
      expect(residual[0]).toBeCloseTo(0, 5);
      expect(residual[1]).toBeCloseTo(0, 5);
      expect(residual[2]).toBeCloseTo(0, 5);
    });

    it('should apply tolerance correctly', () => {
      const point: [number, number, number] = [1.1, 0, 0];
      const locked: [boolean, boolean, boolean] = [true, false, false];
      const target: [number, number, number] = [1.0, 0, 0];

      // Tight tolerance
      const residual_tight = worldPointLockResidual(point, locked, target, 0.001);
      // Loose tolerance
      const residual_loose = worldPointLockResidual(point, locked, target, 0.1);

      // Same error, but weighted differently
      expect(residual_tight[0]).toBeCloseTo(100, 1); // 0.1 / 0.001
      expect(residual_loose[0]).toBeCloseTo(1, 1);   // 0.1 / 0.1
    });
  });

  describe('lineConstraintResidual', () => {
    it('should return zero for collinear points', () => {
      const A: [number, number, number] = [0, 0, 0];
      const B: [number, number, number] = [1, 0, 0];
      const C: [number, number, number] = [2, 0, 0]; // On line through A and B

      const residual = lineConstraintResidual(A, B, C);

      expect(residual[0]).toBeCloseTo(0, 5);
      expect(residual[1]).toBeCloseTo(0, 5);
      expect(residual[2]).toBeCloseTo(0, 5);
    });

    it('should measure perpendicular distance from line', () => {
      const A: [number, number, number] = [0, 0, 0];
      const B: [number, number, number] = [1, 0, 0]; // Line along x-axis
      const C: [number, number, number] = [0.5, 0, 1]; // Off the line in z direction

      const residual = lineConstraintResidual(A, B, C);

      // AC = [0.5, 0, 1], AB = [1, 0, 0]
      // AC × AB = [0, 1*1 - 0*0, 0*0 - 0.5*1] = [0, 1, -0.5]
      // Wait, let me recalculate:
      // AC × AB = [AC_y * AB_z - AC_z * AB_y, AC_z * AB_x - AC_x * AB_z, AC_x * AB_y - AC_y * AB_x]
      //         = [0*0 - 1*0, 1*1 - 0.5*0, 0.5*0 - 0*1]
      //         = [0, 1, 0]
      expect(residual[0]).toBeCloseTo(0, 5);
      expect(residual[1]).toBeCloseTo(1, 5);
      expect(residual[2]).toBeCloseTo(0, 5);
    });

    it('should handle different line orientations', () => {
      // Line along y-axis
      const A: [number, number, number] = [0, 0, 0];
      const B: [number, number, number] = [0, 1, 0];
      const C: [number, number, number] = [0, 2, 0]; // On line

      const residual = lineConstraintResidual(A, B, C);

      expect(residual[0]).toBeCloseTo(0, 5);
      expect(residual[1]).toBeCloseTo(0, 5);
      expect(residual[2]).toBeCloseTo(0, 5);
    });

    it('should handle diagonal lines', () => {
      const A: [number, number, number] = [0, 0, 0];
      const B: [number, number, number] = [1, 1, 1];
      const C: [number, number, number] = [2, 2, 2]; // On line

      const residual = lineConstraintResidual(A, B, C);

      expect(residual[0]).toBeCloseTo(0, 5);
      expect(residual[1]).toBeCloseTo(0, 5);
      expect(residual[2]).toBeCloseTo(0, 5);
    });

    it('should apply sigma weighting', () => {
      const A: [number, number, number] = [0, 0, 0];
      const B: [number, number, number] = [1, 0, 0];
      const C: [number, number, number] = [0.5, 1, 0]; // Off line in y direction

      const residual_sigma1 = lineConstraintResidual(A, B, C, 1.0);
      const residual_sigma2 = lineConstraintResidual(A, B, C, 2.0);

      // Residual with sigma=2 should be half of sigma=1
      expect(residual_sigma2[0]).toBeCloseTo(residual_sigma1[0] / 2, 5);
      expect(residual_sigma2[1]).toBeCloseTo(residual_sigma1[1] / 2, 5);
      expect(residual_sigma2[2]).toBeCloseTo(residual_sigma1[2] / 2, 5);
    });

    it('should be invariant to point order on line', () => {
      const A: [number, number, number] = [0, 0, 0];
      const B: [number, number, number] = [1, 0, 0];
      const C: [number, number, number] = [0.5, 0.1, 0];

      const residual_ABC = lineConstraintResidual(A, B, C);
      const residual_BAC = lineConstraintResidual(B, A, C);

      // Should give same magnitude (might differ in sign)
      const mag_ABC = Math.sqrt(
        residual_ABC[0] ** 2 + residual_ABC[1] ** 2 + residual_ABC[2] ** 2
      );
      const mag_BAC = Math.sqrt(
        residual_BAC[0] ** 2 + residual_BAC[1] ** 2 + residual_BAC[2] ** 2
      );

      expect(mag_ABC).toBeCloseTo(mag_BAC, 5);
    });
  });

  describe('imagePointResidual', () => {
    it('should return zero for perfectly projected point', () => {
      const worldPoint: [number, number, number] = [1, 2, 10];
      const K = [1000, 1000, 512, 384];
      const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const t: [number, number, number] = [0, 0, 0];

      // Compute expected projection
      // Camera coords: [1, 2, 10]
      // Normalized: [0.1, 0.2]
      // Image: [1000*0.1 + 512, 1000*0.2 + 384] = [612, 584]
      const observed: [number, number] = [612, 584];

      const residual = imagePointResidual(worldPoint, observed, K, R, t);

      expect(residual[0]).toBeCloseTo(0, 1);
      expect(residual[1]).toBeCloseTo(0, 1);
    });

    it('should measure reprojection error', () => {
      const worldPoint: [number, number, number] = [0, 0, 10];
      const K = [1000, 1000, 512, 384];
      const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const t: [number, number, number] = [0, 0, 0];

      // Should project to principal point [512, 384]
      const observed: [number, number] = [520, 390]; // 8 pixels off in u, 6 in v

      const residual = imagePointResidual(worldPoint, observed, K, R, t);

      // Residual = projected - observed = [512, 384] - [520, 390] = [-8, -6]
      expect(residual[0]).toBeCloseTo(-8, 1);
      expect(residual[1]).toBeCloseTo(-6, 1);
    });

    it('should handle camera translation', () => {
      const worldPoint: [number, number, number] = [5, 3, 10];
      const K = [1000, 1000, 512, 384];
      const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const t: [number, number, number] = [5, 3, 0];

      // Relative position: [0, 0, 10] -> projects to [512, 384]
      const observed: [number, number] = [512, 384];

      const residual = imagePointResidual(worldPoint, observed, K, R, t);

      expect(residual[0]).toBeCloseTo(0, 1);
      expect(residual[1]).toBeCloseTo(0, 1);
    });

    it('should apply sigma weighting', () => {
      const worldPoint: [number, number, number] = [0, 0, 10];
      const K = [1000, 1000, 512, 384];
      const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const t: [number, number, number] = [0, 0, 0];
      const observed: [number, number] = [520, 384]; // 8 pixels off

      const residual_sigma1 = imagePointResidual(worldPoint, observed, K, R, t, 1.0);
      const residual_sigma2 = imagePointResidual(worldPoint, observed, K, R, t, 2.0);

      // sigma=2 should give half the weight
      expect(residual_sigma2[0]).toBeCloseTo(residual_sigma1[0] / 2, 5);
      expect(residual_sigma2[1]).toBeCloseTo(residual_sigma1[1] / 2, 5);
    });

    it('should handle points behind camera', () => {
      const worldPoint: [number, number, number] = [0, 0, -10];
      const K = [1000, 1000, 512, 384];
      const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const t: [number, number, number] = [0, 0, 0];
      const observed: [number, number] = [512, 384];

      const residual = imagePointResidual(worldPoint, observed, K, R, t);

      // Should return large error
      expect(Math.abs(residual[0])).toBeGreaterThan(1e5);
      expect(Math.abs(residual[1])).toBeGreaterThan(1e5);
    });

    it('should apply radial distortion', () => {
      const worldPoint: [number, number, number] = [1, 1, 10];
      const K_no_dist = [1000, 1000, 512, 384];
      const K_with_dist = [1000, 1000, 512, 384, 0.1, 0.01];
      const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const t: [number, number, number] = [0, 0, 0];
      const observed: [number, number] = [612, 584]; // Expected without distortion

      const residual_no_dist = imagePointResidual(worldPoint, observed, K_no_dist, R, t);
      const residual_with_dist = imagePointResidual(worldPoint, observed, K_with_dist, R, t);

      // With distortion should give different residual
      expect(Math.abs(residual_with_dist[0] - residual_no_dist[0])).toBeGreaterThan(0.1);
    });
  });
});
