/**
 * Unit tests for camera math utilities.
 */

import { axisAngleToMatrix, project, reprojectionResidual } from './camera-math';

describe('Camera Math', () => {
  describe('axisAngleToMatrix', () => {
    it('should return identity for zero rotation', () => {
      const R = axisAngleToMatrix([0, 0, 0]);

      expect(R[0][0]).toBeCloseTo(1);
      expect(R[1][1]).toBeCloseTo(1);
      expect(R[2][2]).toBeCloseTo(1);
      expect(R[0][1]).toBeCloseTo(0);
      expect(R[0][2]).toBeCloseTo(0);
      expect(R[1][2]).toBeCloseTo(0);
    });

    it('should handle 90° rotation around x-axis', () => {
      const R = axisAngleToMatrix([Math.PI / 2, 0, 0]);

      // R_x(90°) should map y -> z and z -> -y
      expect(R[0][0]).toBeCloseTo(1);
      expect(R[1][1]).toBeCloseTo(0, 5);
      expect(R[1][2]).toBeCloseTo(-1, 5);
      expect(R[2][1]).toBeCloseTo(1, 5);
      expect(R[2][2]).toBeCloseTo(0, 5);
    });

    it('should handle 90° rotation around y-axis', () => {
      const R = axisAngleToMatrix([0, Math.PI / 2, 0]);

      // R_y(90°) should map x -> -z and z -> x
      expect(R[0][0]).toBeCloseTo(0, 5);
      expect(R[0][2]).toBeCloseTo(1, 5);
      expect(R[1][1]).toBeCloseTo(1, 5);
      expect(R[2][0]).toBeCloseTo(-1, 5);
      expect(R[2][2]).toBeCloseTo(0, 5);
    });

    it('should handle 90° rotation around z-axis', () => {
      const R = axisAngleToMatrix([0, 0, Math.PI / 2]);

      // R_z(90°) should map x -> y and y -> -x
      expect(R[0][0]).toBeCloseTo(0, 5);
      expect(R[0][1]).toBeCloseTo(-1, 5);
      expect(R[1][0]).toBeCloseTo(1, 5);
      expect(R[1][1]).toBeCloseTo(0, 5);
      expect(R[2][2]).toBeCloseTo(1, 5);
    });

    it('should produce orthogonal rotation matrices', () => {
      const angles: [number, number, number][] = [
        [0.1, 0.2, 0.3],
        [1.0, -0.5, 0.8],
        [Math.PI / 4, Math.PI / 3, Math.PI / 6]
      ];

      angles.forEach(angle => {
        const R = axisAngleToMatrix(angle);

        // Check R * R^T = I (orthogonality)
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            const dot = R[i][0] * R[j][0] + R[i][1] * R[j][1] + R[i][2] * R[j][2];
            const expected = i === j ? 1 : 0;
            expect(dot).toBeCloseTo(expected, 5);
          }
        }

        // Check det(R) = 1 (proper rotation, not reflection)
        const det =
          R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) -
          R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) +
          R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
        expect(det).toBeCloseTo(1, 5);
      });
    });
  });

  describe('project', () => {
    it('should project point at camera center to principal point', () => {
      const worldPoint: [number, number, number] = [0, 0, 0];
      const K = [1000, 1000, 512, 384]; // fx, fy, cx, cy
      const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; // Identity
      const t: [number, number, number] = [0, 0, 0];

      // Point at camera center should project to infinity (returns NaN)
      const [u, v] = project(worldPoint, K, R, t);
      expect(isNaN(u) || Math.abs(u) > 1e6).toBe(true);
    });

    it('should project point in front of camera', () => {
      const worldPoint: [number, number, number] = [0, 0, 10]; // 10m in front
      const K = [1000, 1000, 512, 384];
      const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const t: [number, number, number] = [0, 0, 0];

      const [u, v] = project(worldPoint, K, R, t);

      // Should project to principal point (0, 0, 10) -> (512, 384)
      expect(u).toBeCloseTo(512, 1);
      expect(v).toBeCloseTo(384, 1);
    });

    it('should handle camera translation', () => {
      const worldPoint: [number, number, number] = [5, 3, 10];
      const K = [1000, 1000, 512, 384];
      const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const t: [number, number, number] = [5, 3, 0]; // Camera at (5, 3, 0)

      const [u, v] = project(worldPoint, K, R, t);

      // Relative position is (0, 0, 10), should project to principal point
      expect(u).toBeCloseTo(512, 1);
      expect(v).toBeCloseTo(384, 1);
    });

    it('should handle camera rotation', () => {
      const worldPoint: [number, number, number] = [10, 0, 0];
      const K = [1000, 1000, 512, 384];
      // 90° rotation around y-axis: x -> -z, z -> x
      const R = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];
      const t: [number, number, number] = [0, 0, 0];

      const [u, v] = project(worldPoint, K, R, t);

      // Point at (10, 0, 0) becomes (0, 0, -10) in camera frame
      // Point behind camera should give NaN or very large values
      expect(isNaN(u) || isNaN(v)).toBe(true);
    });

    it('should apply radial distortion', () => {
      const worldPoint: [number, number, number] = [1, 1, 10];
      const K_no_dist = [1000, 1000, 512, 384];
      const K_with_dist = [1000, 1000, 512, 384, 0.1, 0.01]; // k1=0.1, k2=0.01
      const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const t: [number, number, number] = [0, 0, 0];

      const [u_no_dist, v_no_dist] = project(worldPoint, K_no_dist, R, t);
      const [u_dist, v_dist] = project(worldPoint, K_with_dist, R, t);

      // With positive distortion, points should move away from center
      const du = u_dist - u_no_dist;
      const dv = v_dist - v_no_dist;

      // Both should be positive (moving away from center at 512, 384)
      expect(du).toBeGreaterThan(0);
      expect(dv).toBeGreaterThan(0);
    });
  });

  describe('reprojectionResidual', () => {
    it('should return zero residual for perfect projection', () => {
      const worldPoint: [number, number, number] = [0, 0, 10];
      const K = [1000, 1000, 512, 384];
      const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const t: [number, number, number] = [0, 0, 0];

      const projected = project(worldPoint, K, R, t);
      const residual = reprojectionResidual(worldPoint, projected, K, R, t);

      expect(residual[0]).toBeCloseTo(0, 5);
      expect(residual[1]).toBeCloseTo(0, 5);
    });

    it('should measure projection error correctly', () => {
      const worldPoint: [number, number, number] = [1, 2, 10];
      const K = [1000, 1000, 512, 384];
      const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const t: [number, number, number] = [0, 0, 0];

      // True projection
      const [u_true, v_true] = project(worldPoint, K, R, t);

      // Observed with some error
      const observed: [number, number] = [u_true + 5, v_true - 3];

      const residual = reprojectionResidual(worldPoint, observed, K, R, t);

      // Residual should be (projected - observed)
      expect(residual[0]).toBeCloseTo(-5, 5);
      expect(residual[1]).toBeCloseTo(3, 5);
    });

    it('should handle points behind camera', () => {
      const worldPoint: [number, number, number] = [0, 0, -10]; // Behind camera
      const K = [1000, 1000, 512, 384];
      const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const t: [number, number, number] = [0, 0, 0];
      const observed: [number, number] = [512, 384];

      const residual = reprojectionResidual(worldPoint, observed, K, R, t);

      // Should return large error
      expect(Math.abs(residual[0])).toBeGreaterThan(1e5);
      expect(Math.abs(residual[1])).toBeGreaterThan(1e5);
    });
  });
});
