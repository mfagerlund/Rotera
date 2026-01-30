/**
 * Diagnostic test for reprojection gradient computation.
 * Tests that gradients are computed correctly for a simple camera setup.
 */

import { describe, it, expect } from '@jest/globals';
import { createReprojectionProvider } from '../explicit-jacobian/providers/reprojection-provider';
import { reprojection_u_grad } from '../residuals/gradients/reprojection-u-gradient';
import { reprojection_v_grad } from '../residuals/gradients/reprojection-v-gradient';

describe('Reprojection Gradient Debug', () => {
  it('should compute non-zero gradients for point in front of camera', () => {
    // Camera at origin with identity rotation looking down +Z
    // Point at (0, 0, 5) - clearly in front
    const worldPointIndices: [number, number, number] = [0, 1, 2];
    const cameraPosIndices: [number, number, number] = [3, 4, 5];
    const quaternionIndices: [number, number, number, number] = [6, 7, 8, 9];

    const provider = createReprojectionProvider(
      'test',
      worldPointIndices,
      cameraPosIndices,
      quaternionIndices,
      {
        fx: 1000,
        fy: 1000,
        cx: 500,
        cy: 500,
        k1: 0, k2: 0, k3: 0,
        p1: 0, p2: 0,
        observedU: 500,  // Should project to center
        observedV: 500,
        isZReflected: false,
      }
    );

    // Variables: worldPoint [0.1, 0.1, 5], cameraPos [0,0,0], quaternion [1,0,0,0]
    // Use slight offset to avoid optical axis edge case
    const variables = [0.1, 0.1, 5, 0, 0, 0, 1, 0, 0, 0];

    // Compute residuals
    const residuals = provider.computeResiduals(variables);

    // Compute Jacobian
    const jacobian = provider.computeJacobian(variables);

    // Check that Jacobian is not all zeros
    const hasNonZeroU = jacobian[0].some(v => v !== 0);
    const hasNonZeroV = jacobian[1].some(v => v !== 0);
    const hasInvalidU = jacobian[0].some(v => !isFinite(v));
    const hasInvalidV = jacobian[1].some(v => !isFinite(v));

    // Call gradient function directly to see raw output
    const worldPoint = { x: 0.1, y: 0.1, z: 5 };
    const cameraPos = { x: 0, y: 0, z: 0 };
    // Try non-identity quaternion (slight rotation around Y axis)
    const q = { w: 0.9999, x: 0, y: 0.01, z: 0 };
    const gradU = reprojection_u_grad(worldPoint, cameraPos, q, 1000, 1000, 500, 500, 0, 0, 0, 0, 0, 520);
    const gradV = reprojection_v_grad(worldPoint, cameraPos, q, 1000, 1000, 500, 500, 0, 0, 0, 0, 0, 520);

    // DIAGNOSTIC: Throw error with full info
    if (!hasNonZeroU || !hasNonZeroV) {
      throw new Error(
        `Gradient computation failed!\n` +
        `Residuals: ${JSON.stringify(residuals)}\n` +
        `Jacobian U: ${JSON.stringify(jacobian[0])}\n` +
        `Jacobian V: ${JSON.stringify(jacobian[1])}\n` +
        `hasInvalidU: ${hasInvalidU}, hasInvalidV: ${hasInvalidV}\n` +
        `hasNonZeroU: ${hasNonZeroU}, hasNonZeroV: ${hasNonZeroV}\n` +
        `\nDirect gradient call results:\n` +
        `gradU.value: ${gradU.value}\n` +
        `gradU.dworldPoint: x=${gradU.dworldPoint.x}, y=${gradU.dworldPoint.y}, z=${gradU.dworldPoint.z}\n` +
        `gradU.dcameraPos: ${JSON.stringify(gradU.dcameraPos)}\n` +
        `gradU.dq: ${JSON.stringify(gradU.dq)}\n` +
        `gradV.value: ${gradV.value}\n` +
        `gradV.dworldPoint: ${JSON.stringify(gradV.dworldPoint)}\n` +
        `gradV.dcameraPos: ${JSON.stringify(gradV.dcameraPos)}\n` +
        `gradV.dq: ${JSON.stringify(gradV.dq)}`
      );
    }

    expect(hasNonZeroU).toBe(true);
    expect(hasNonZeroV).toBe(true);
  });

  it('should handle point at camera position (camZ = 0)', () => {
    const worldPointIndices: [number, number, number] = [0, 1, 2];
    const cameraPosIndices: [number, number, number] = [3, 4, 5];
    const quaternionIndices: [number, number, number, number] = [6, 7, 8, 9];

    const provider = createReprojectionProvider(
      'test',
      worldPointIndices,
      cameraPosIndices,
      quaternionIndices,
      {
        fx: 1000,
        fy: 1000,
        cx: 500,
        cy: 500,
        k1: 0, k2: 0, k3: 0,
        p1: 0, p2: 0,
        observedU: 500,
        observedV: 500,
        isZReflected: false,
      }
    );

    // Variables: worldPoint [0,0,0], cameraPos [0,0,0], quaternion [1,0,0,0]
    // This point is AT the camera!
    const variables = [0, 0, 0, 0, 0, 0, 1, 0, 0, 0];

    const residuals = provider.computeResiduals(variables);
    console.log('Residuals for point at camera:', residuals);

    // Should return BEHIND_CAMERA_PENALTY
    expect(residuals[0]).toBe(1000);
    expect(residuals[1]).toBe(1000);

    const jacobian = provider.computeJacobian(variables);
    console.log('Jacobian for point at camera:', jacobian);

    // Should return zero gradients (constant penalty)
    expect(jacobian[0].every(v => v === 0)).toBe(true);
    expect(jacobian[1].every(v => v === 0)).toBe(true);
  });

  it('should match 1-loose.rotera setup', () => {
    // This matches the actual fixture setup
    // Camera: position [0,0,0], rotation [1,0,0,0]
    // WP1: optimizedXyz [0, 3.535, 3.535]
    // ImagePoint: u=764.06, v=713.58
    // Camera: fx=fy=1702.6776, cx=736, cy=433

    const worldPointIndices: [number, number, number] = [0, 1, 2];
    const cameraPosIndices: [number, number, number] = [3, 4, 5];
    const quaternionIndices: [number, number, number, number] = [6, 7, 8, 9];

    const provider = createReprojectionProvider(
      'test-wp1',
      worldPointIndices,
      cameraPosIndices,
      quaternionIndices,
      {
        fx: 1702.6776,
        fy: 1702.6776,  // aspectRatio = 1
        cx: 736,
        cy: 433,
        k1: 0, k2: 0, k3: 0,
        p1: 0, p2: 0,
        observedU: 764.06,
        observedV: 713.58,
        isZReflected: false,
      }
    );

    // Variables: worldPoint [0, 3.535, 3.535], cameraPos [0,0,0], quaternion [1,0,0,0]
    const variables = [0, 3.535, 3.535, 0, 0, 0, 1, 0, 0, 0];

    // Compute camZ to verify it's positive
    const tx = 0 - 0;  // worldPoint.x - cameraPos.x
    const ty = 3.535 - 0;
    const tz = 3.535 - 0;
    const qw = 1, qx = 0, qy = 0, qz = 0;
    const qcx = qy * tz - qz * ty;  // 0
    const qcy = qz * tx - qx * tz;  // 0
    const qcz = qx * ty - qy * tx;  // 0
    const dcz = qx * qcy - qy * qcx;  // 0
    const camZ = tz + 2 * qw * qcz + 2 * dcz;  // 3.535

    console.log('CamZ for WP1:', camZ, '(should be 3.535)');
    expect(camZ).toBeCloseTo(3.535, 3);

    const residuals = provider.computeResiduals(variables);
    console.log('Residuals for WP1:', residuals);

    const jacobian = provider.computeJacobian(variables);
    console.log('Jacobian row U for WP1:', jacobian[0]);
    console.log('Jacobian row V for WP1:', jacobian[1]);

    // Should have non-zero gradients
    const hasNonZeroU = jacobian[0].some(v => v !== 0);
    const hasNonZeroV = jacobian[1].some(v => v !== 0);

    // Check for NaN/Infinity
    const hasInvalidU = jacobian[0].some(v => !isFinite(v));
    const hasInvalidV = jacobian[1].some(v => !isFinite(v));

    console.log('Has invalid (NaN/Inf) U gradients:', hasInvalidU);
    console.log('Has invalid (NaN/Inf) V gradients:', hasInvalidV);
    console.log('Has non-zero U gradients:', hasNonZeroU);
    console.log('Has non-zero V gradients:', hasNonZeroV);

    expect(hasInvalidU).toBe(false);
    expect(hasInvalidV).toBe(false);
    expect(hasNonZeroU).toBe(true);
    expect(hasNonZeroV).toBe(true);
  });
});
