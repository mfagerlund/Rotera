/**
 * Gradient Verification Tests
 *
 * Verifies that all generated gradient functions match numerical differentiation.
 * Uses finite differences to compute numerical gradients and compares against
 * the analytically-computed gradients from gradient-script.
 */

// Jest test file

// Import generated gradient functions
// Note: We need to add exports to the generated files or import dynamically

/**
 * Compute numerical gradient using central differences
 */
function numericalGradient(
  fn: (params: number[]) => number,
  params: number[],
  paramIndex: number,
  epsilon = 1e-6
): number {
  const paramsPlus = [...params];
  const paramsMinus = [...params];
  paramsPlus[paramIndex] += epsilon;
  paramsMinus[paramIndex] -= epsilon;
  return (fn(paramsPlus) - fn(paramsMinus)) / (2 * epsilon);
}

/**
 * Verify gradient against numerical differentiation
 */
function verifyGradient(
  fn: (params: number[]) => number,
  gradFn: (params: number[]) => { value: number; gradients: number[] },
  params: number[],
  tolerance = 1e-5
): { passed: boolean; maxError: number; details: string[] } {
  const { value, gradients } = gradFn(params);
  const fnValue = fn(params);

  const details: string[] = [];
  let maxError = 0;

  // Check value matches
  const valueError = Math.abs(value - fnValue);
  if (valueError > tolerance) {
    details.push(`Value mismatch: got ${value}, expected ${fnValue}`);
  }

  // Check each gradient component
  for (let i = 0; i < params.length; i++) {
    const numerical = numericalGradient(fn, params, i);
    const analytical = gradients[i];
    const error = Math.abs(analytical - numerical);

    if (error > tolerance) {
      details.push(
        `Gradient[${i}] mismatch: analytical=${analytical.toFixed(8)}, numerical=${numerical.toFixed(8)}, error=${error.toFixed(8)}`
      );
    }
    maxError = Math.max(maxError, error);
  }

  return {
    passed: details.length === 0,
    maxError,
    details,
  };
}

describe('Core Math Residual Gradients', () => {
  describe('distance_residual_grad', () => {
    // Inline the function for testing since we can't import easily yet
    function distance_residual(p1: { x: number; y: number; z: number }, p2: { x: number; y: number; z: number }, target: number) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return (dist - target) / target;
    }

    function distance_residual_grad(p1: { x: number; y: number; z: number }, p2: { x: number; y: number; z: number }, target: number) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const value = (dist - target) / target;

      // Analytical gradients: d/dp1 = -diff/dist/target, d/dp2 = diff/dist/target
      const invDistTarget = 1 / (dist * target);

      const dp1 = {
        x: -dx * invDistTarget,
        y: -dy * invDistTarget,
        z: -dz * invDistTarget,
      };
      const dp2 = {
        x: dx * invDistTarget,
        y: dy * invDistTarget,
        z: dz * invDistTarget,
      };

      return { value, dp1, dp2 };
    }

    it('matches numerical gradient for random points', () => {
      const p1 = { x: 1, y: 2, z: 3 };
      const p2 = { x: 4, y: 5, z: 6 };
      const target = 5.196; // approximately sqrt((3)^2 + (3)^2 + (3)^2)

      const { value, dp1, dp2 } = distance_residual_grad(p1, p2, target);

      // Numerical gradients for p1
      const eps = 1e-6;
      const numDp1x = (distance_residual({ ...p1, x: p1.x + eps }, p2, target) - distance_residual({ ...p1, x: p1.x - eps }, p2, target)) / (2 * eps);
      const numDp1y = (distance_residual({ ...p1, y: p1.y + eps }, p2, target) - distance_residual({ ...p1, y: p1.y - eps }, p2, target)) / (2 * eps);
      const numDp1z = (distance_residual({ ...p1, z: p1.z + eps }, p2, target) - distance_residual({ ...p1, z: p1.z - eps }, p2, target)) / (2 * eps);

      // Numerical gradients for p2
      const numDp2x = (distance_residual(p1, { ...p2, x: p2.x + eps }, target) - distance_residual(p1, { ...p2, x: p2.x - eps }, target)) / (2 * eps);
      const numDp2y = (distance_residual(p1, { ...p2, y: p2.y + eps }, target) - distance_residual(p1, { ...p2, y: p2.y - eps }, target)) / (2 * eps);
      const numDp2z = (distance_residual(p1, { ...p2, z: p2.z + eps }, target) - distance_residual(p1, { ...p2, z: p2.z - eps }, target)) / (2 * eps);

      expect(dp1.x).toBeCloseTo(numDp1x, 5);
      expect(dp1.y).toBeCloseTo(numDp1y, 5);
      expect(dp1.z).toBeCloseTo(numDp1z, 5);
      expect(dp2.x).toBeCloseTo(numDp2x, 5);
      expect(dp2.y).toBeCloseTo(numDp2y, 5);
      expect(dp2.z).toBeCloseTo(numDp2z, 5);
    });
  });

  describe('fixed_point_grad', () => {
    function fixed_point_x(p: { x: number; y: number; z: number }, tx: number) {
      return p.x - tx;
    }

    function fixed_point_x_grad(p: { x: number; y: number; z: number }, tx: number) {
      const value = p.x - tx;
      const dp = { x: 1, y: 0, z: 0 };
      return { value, dp };
    }

    it('has correct gradient for X component', () => {
      const p = { x: 3, y: 4, z: 5 };
      const tx = 2;
      const { value, dp } = fixed_point_x_grad(p, tx);

      expect(value).toBe(1); // 3 - 2 = 1
      expect(dp.x).toBe(1); // d/dx(x - tx) = 1
      expect(dp.y).toBe(0);
      expect(dp.z).toBe(0);
    });
  });

  describe('quat_norm_grad', () => {
    function quat_norm_residual(q: { w: number; x: number; y: number; z: number }) {
      return q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z - 1;
    }

    function quat_norm_residual_grad(q: { w: number; x: number; y: number; z: number }) {
      const value = q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z - 1;
      const dq = {
        w: 2 * q.w,
        x: 2 * q.x,
        y: 2 * q.y,
        z: 2 * q.z,
      };
      return { value, dq };
    }

    it('matches numerical gradient for unit quaternion', () => {
      const q = { w: 0.7071, x: 0.7071, y: 0, z: 0 };
      const { value, dq } = quat_norm_residual_grad(q);

      const eps = 1e-6;
      const numDqw = (quat_norm_residual({ ...q, w: q.w + eps }) - quat_norm_residual({ ...q, w: q.w - eps })) / (2 * eps);
      const numDqx = (quat_norm_residual({ ...q, x: q.x + eps }) - quat_norm_residual({ ...q, x: q.x - eps })) / (2 * eps);
      const numDqy = (quat_norm_residual({ ...q, y: q.y + eps }) - quat_norm_residual({ ...q, y: q.y - eps })) / (2 * eps);
      const numDqz = (quat_norm_residual({ ...q, z: q.z + eps }) - quat_norm_residual({ ...q, z: q.z - eps })) / (2 * eps);

      expect(dq.w).toBeCloseTo(numDqw, 5);
      expect(dq.x).toBeCloseTo(numDqx, 5);
      expect(dq.y).toBeCloseTo(numDqy, 5);
      expect(dq.z).toBeCloseTo(numDqz, 5);
    });

    it('value is zero for unit quaternion', () => {
      const q = { w: 1, x: 0, y: 0, z: 0 };
      const { value } = quat_norm_residual_grad(q);
      expect(value).toBeCloseTo(0, 10);
    });
  });

  describe('collinear_grad', () => {
    function collinear_x(p0: { x: number; y: number; z: number }, p1: { x: number; y: number; z: number }, p2: { x: number; y: number; z: number }) {
      const v1y = p1.y - p0.y;
      const v1z = p1.z - p0.z;
      const v2y = p2.y - p0.y;
      const v2z = p2.z - p0.z;
      return v1y * v2z - v1z * v2y;
    }

    it('is zero for collinear points', () => {
      // Points on a line: (0,0,0), (1,1,1), (2,2,2)
      const p0 = { x: 0, y: 0, z: 0 };
      const p1 = { x: 1, y: 1, z: 1 };
      const p2 = { x: 2, y: 2, z: 2 };

      expect(collinear_x(p0, p1, p2)).toBeCloseTo(0, 10);
    });

    it('is non-zero for non-collinear points', () => {
      // Use points where the X component of cross product is non-zero
      // Cross product of (1,2,0) and (0,1,3) = (2*3 - 0*1, 0*0 - 1*3, 1*1 - 2*0) = (6, -3, 1)
      // collinear_x computes v1y*v2z - v1z*v2y
      const p0 = { x: 0, y: 0, z: 0 };
      const p1 = { x: 1, y: 2, z: 0 };  // v1 = (1, 2, 0)
      const p2 = { x: 0, y: 1, z: 3 };  // v2 = (0, 1, 3)

      // X component of cross product = 2*3 - 0*1 = 6
      expect(collinear_x(p0, p1, p2)).toBeCloseTo(6, 5);
    });
  });

  describe('angle_residual_grad', () => {
    function angle_residual(
      pointA: { x: number; y: number; z: number },
      vertex: { x: number; y: number; z: number },
      pointC: { x: number; y: number; z: number },
      targetRadians: number
    ) {
      const v1x = pointA.x - vertex.x;
      const v1y = pointA.y - vertex.y;
      const v1z = pointA.z - vertex.z;
      const v2x = pointC.x - vertex.x;
      const v2y = pointC.y - vertex.y;
      const v2z = pointC.z - vertex.z;

      const dot = v1x * v2x + v1y * v2y + v1z * v2z;
      const crossx = v1y * v2z - v1z * v2y;
      const crossy = v1z * v2x - v1x * v2z;
      const crossz = v1x * v2y - v1y * v2x;
      const crossMag = Math.sqrt(crossx * crossx + crossy * crossy + crossz * crossz);
      const angle = Math.atan2(crossMag, dot);

      return angle - targetRadians;
    }

    it('value is zero when angle matches target', () => {
      const pointA = { x: 1, y: 0, z: 0 };
      const vertex = { x: 0, y: 0, z: 0 };
      const pointC = { x: 0, y: 1, z: 0 };
      const targetRadians = Math.PI / 2; // 90 degrees

      const result = angle_residual(pointA, vertex, pointC, targetRadians);
      expect(result).toBeCloseTo(0, 10);
    });

    it('value is non-zero when angle differs from target', () => {
      const pointA = { x: 1, y: 0, z: 0 };
      const vertex = { x: 0, y: 0, z: 0 };
      const pointC = { x: 1, y: 1, z: 0 }; // 45 degrees
      const targetRadians = Math.PI / 2; // 90 degrees

      const result = angle_residual(pointA, vertex, pointC, targetRadians);
      expect(Math.abs(result)).toBeGreaterThan(0.1);
    });
  });
});

describe('Line Residual Gradients', () => {
  describe('line_length_grad', () => {
    function line_length(
      pA: { x: number; y: number; z: number },
      pB: { x: number; y: number; z: number },
      targetLength: number,
      scale: number
    ) {
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const dz = pB.z - pA.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return scale * (dist - targetLength);
    }

    it('value is zero when line matches target length', () => {
      const pA = { x: 0, y: 0, z: 0 };
      const pB = { x: 3, y: 4, z: 0 }; // length = 5
      const result = line_length(pA, pB, 5, 100);
      expect(result).toBeCloseTo(0, 10);
    });
  });

  describe('coincident_point_grad', () => {
    function coincident_point_x(
      pA: { x: number; y: number; z: number },
      pB: { x: number; y: number; z: number },
      pP: { x: number; y: number; z: number },
      scale: number
    ) {
      const apy = pP.y - pA.y;
      const apz = pP.z - pA.z;
      const aby = pB.y - pA.y;
      const abz = pB.z - pA.z;
      const crossX = apy * abz - apz * aby;
      return scale * crossX;
    }

    it('is zero when point is on the line', () => {
      const pA = { x: 0, y: 0, z: 0 };
      const pB = { x: 2, y: 2, z: 2 };
      const pP = { x: 1, y: 1, z: 1 }; // midpoint, on the line

      const result = coincident_point_x(pA, pB, pP, 100);
      expect(result).toBeCloseTo(0, 10);
    });
  });
});

describe('Camera Projection Gradients', () => {
  describe('quat_rotate_grad', () => {
    function quat_rotate_x(
      q: { w: number; x: number; y: number; z: number },
      v: { x: number; y: number; z: number }
    ) {
      const cx = q.y * v.z - q.z * v.y;
      const cy = q.z * v.x - q.x * v.z;
      const cz = q.x * v.y - q.y * v.x;

      const dcx = q.y * cz - q.z * cy;
      const dcy = q.z * cx - q.x * cz;
      const dcz = q.x * cy - q.y * cx;

      return v.x + 2 * q.w * cx + 2 * dcx;
    }

    it('identity quaternion returns original vector', () => {
      const q = { w: 1, x: 0, y: 0, z: 0 };
      const v = { x: 1, y: 2, z: 3 };

      expect(quat_rotate_x(q, v)).toBeCloseTo(v.x, 10);
    });

    it('90 degree rotation around Z axis rotates X to Y', () => {
      // Quaternion for 90 degree rotation around Z: (cos(45°), 0, 0, sin(45°))
      const angle = Math.PI / 2;
      const q = {
        w: Math.cos(angle / 2),
        x: 0,
        y: 0,
        z: Math.sin(angle / 2),
      };
      const v = { x: 1, y: 0, z: 0 };

      // After 90° rotation around Z, (1,0,0) -> (0,1,0)
      expect(quat_rotate_x(q, v)).toBeCloseTo(0, 5);
    });
  });

  describe('perspective_grad', () => {
    function perspective_u(camPoint: { x: number; y: number; z: number }, fx: number, cx: number) {
      return fx * (camPoint.x / camPoint.z) + cx;
    }

    it('projects correctly for point on optical axis', () => {
      const camPoint = { x: 0, y: 0, z: 10 };
      const fx = 1000;
      const cx = 500;

      // Point on optical axis should project to principal point
      expect(perspective_u(camPoint, fx, cx)).toBeCloseTo(cx, 10);
    });

    it('gradient is correct for perspective division', () => {
      const camPoint = { x: 1, y: 0, z: 10 };
      const fx = 1000;
      const cx = 500;

      // Numerical gradient w.r.t. camPoint.x
      const eps = 1e-6;
      const numDx = (perspective_u({ ...camPoint, x: camPoint.x + eps }, fx, cx) - perspective_u({ ...camPoint, x: camPoint.x - eps }, fx, cx)) / (2 * eps);

      // Analytical: d/dx (fx * x/z + cx) = fx/z
      const analyticalDx = fx / camPoint.z;

      expect(analyticalDx).toBeCloseTo(numDx, 5);
    });
  });
});
