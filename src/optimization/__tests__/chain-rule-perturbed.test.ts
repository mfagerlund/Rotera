/**
 * Test chain rule composition at perturbed values.
 *
 * NOTE: Tests perturbed (non-unit) quaternions to verify gradient correctness
 * during optimization when quaternions drift from unit magnitude.
 */

import { Value, Vec3, Vec4, V } from 'scalar-autograd';
import {
  createReprojectionUProvider,
  createReprojectionVProvider,
} from '../analytical/providers/reprojection-provider';
import { Quaternion } from '../Quaternion';

describe('Chain rule at perturbed values', () => {
  const intrinsics = {
    fx: 500,
    fy: 500,
    cx: 320,
    cy: 240,
    k1: 0,
    k2: 0,
    k3: 0,
    p1: 0,
    p2: 0,
  };

  it('U provider gradient matches autodiff at perturbed values', () => {
    // Initial values (same as constraint-system test)
    const angle = Math.PI / 4;
    const halfAngle = angle / 2;

    // Perturbed values matching the failing test
    const variables = new Float64Array([
      1 + 0.1 * 1,   // wp_x
      2 + 0.1 * 2,   // wp_y
      5 + 0.1 * 3,   // wp_z
      0.5 + 0.1 * 4, // cp_x
      0.5 + 0.1 * 5, // cp_y
      0 + 0.1 * 6,   // cp_z
      Math.cos(halfAngle) + 0.1 * 7,  // qw
      0 + 0.1 * 8,   // qx
      Math.sin(halfAngle) + 0.1 * 9,  // qy
      0 + 0.1 * 10,  // qz
    ]);

    const observedU = 450;

    // Create provider
    const provider = createReprojectionUProvider(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8, 9],
      intrinsics,
      observedU,
      (v) => ({ x: v[0], y: v[1], z: v[2] }),
      (v) => ({ x: v[3], y: v[4], z: v[5] }),
      (v) => ({ w: v[6], x: v[7], y: v[8], z: v[9] })
    );

    const analyticalResidual = provider.computeResidual(variables);
    const analyticalGrad = provider.computeGradient(variables);

    // Compute autodiff using the SAME quaternion rotation as actual code
    const vars: Value[] = [];
    for (let i = 0; i < 10; i++) {
      vars.push(new Value(variables[i], `v${i}`, true));
    }

    const worldPoint = new Vec3(vars[0], vars[1], vars[2]);
    const cameraPos = new Vec3(vars[3], vars[4], vars[5]);
    const quatRotation = new Vec4(vars[6], vars[7], vars[8], vars[9]);

    // Transform to camera frame using actual Quaternion.rotateVector
    // This is q * (p - c) * q* which differs from unit-quaternion formula for non-unit q
    const translated = worldPoint.sub(cameraPos);
    const cam = Quaternion.rotateVector(quatRotation, translated);

    // Project
    const invZ = cam.z.pow(-1);
    const normX = cam.x.mul(invZ);

    const u = normX.mul(intrinsics.fx).add(intrinsics.cx);
    const uResidual = u.sub(observedU);

    // Get gradients
    Value.zeroGradTree(uResidual);
    for (const v of vars) v.grad = 0;
    uResidual.backward();

    console.log('U residual comparison:');
    console.log(`  Analytical: ${analyticalResidual.toFixed(6)}`);
    console.log(`  Autodiff: ${uResidual.data.toFixed(6)}`);

    console.log('U gradient comparison:');
    const labels = ['wp_x', 'wp_y', 'wp_z', 'cp_x', 'cp_y', 'cp_z', 'qw', 'qx', 'qy', 'qz'];
    let hasError = false;
    for (let i = 0; i < 10; i++) {
      const ana = analyticalGrad[i];
      const aut = vars[i].grad;
      const diff = Math.abs(ana - aut);
      const relDiff = diff / Math.max(Math.abs(ana), Math.abs(aut), 1);
      if (relDiff > 0.01) {
        console.log(`  ${labels[i]}: analytical=${ana.toFixed(4)}, autodiff=${aut.toFixed(4)}, diff=${diff.toFixed(4)}`);
        hasError = true;
      }
    }

    if (!hasError) {
      console.log('  All gradients match within 1%');
    }

    // Assert
    expect(analyticalResidual).toBeCloseTo(uResidual.data, 4);
    for (let i = 0; i < 10; i++) {
      expect(analyticalGrad[i]).toBeCloseTo(vars[i].grad, 2);
    }
  });

  it('V provider gradient matches autodiff at perturbed values', () => {
    const angle = Math.PI / 4;
    const halfAngle = angle / 2;

    const variables = new Float64Array([
      1 + 0.1 * 1,
      2 + 0.1 * 2,
      5 + 0.1 * 3,
      0.5 + 0.1 * 4,
      0.5 + 0.1 * 5,
      0 + 0.1 * 6,
      Math.cos(halfAngle) + 0.1 * 7,
      0 + 0.1 * 8,
      Math.sin(halfAngle) + 0.1 * 9,
      0 + 0.1 * 10,
    ]);

    const observedV = 320;

    // Create provider
    const provider = createReprojectionVProvider(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8, 9],
      intrinsics,
      observedV,
      (v) => ({ x: v[0], y: v[1], z: v[2] }),
      (v) => ({ x: v[3], y: v[4], z: v[5] }),
      (v) => ({ w: v[6], x: v[7], y: v[8], z: v[9] })
    );

    const analyticalResidual = provider.computeResidual(variables);
    const analyticalGrad = provider.computeGradient(variables);

    // Compute autodiff using the SAME quaternion rotation as actual code
    const vars: Value[] = [];
    for (let i = 0; i < 10; i++) {
      vars.push(new Value(variables[i], `v${i}`, true));
    }

    const worldPoint = new Vec3(vars[0], vars[1], vars[2]);
    const cameraPos = new Vec3(vars[3], vars[4], vars[5]);
    const quatRotation = new Vec4(vars[6], vars[7], vars[8], vars[9]);

    // Transform to camera frame using actual Quaternion.rotateVector
    const translated = worldPoint.sub(cameraPos);
    const cam = Quaternion.rotateVector(quatRotation, translated);

    // Project (V = cy - fy * normY)
    const invZ = cam.z.pow(-1);
    const normY = cam.y.mul(invZ);

    const v = V.sub(V.C(intrinsics.cy), V.mul(normY, V.C(intrinsics.fy)));
    const vResidual = V.sub(v, V.C(observedV));

    // Get gradients
    Value.zeroGradTree(vResidual);
    for (const v of vars) v.grad = 0;
    vResidual.backward();

    console.log('V residual comparison:');
    console.log(`  Analytical: ${analyticalResidual.toFixed(6)}`);
    console.log(`  Autodiff: ${vResidual.data.toFixed(6)}`);

    console.log('V gradient comparison:');
    const labels = ['wp_x', 'wp_y', 'wp_z', 'cp_x', 'cp_y', 'cp_z', 'qw', 'qx', 'qy', 'qz'];
    let hasError = false;
    for (let i = 0; i < 10; i++) {
      const ana = analyticalGrad[i];
      const aut = vars[i].grad;
      const diff = Math.abs(ana - aut);
      const relDiff = diff / Math.max(Math.abs(ana), Math.abs(aut), 1);
      if (relDiff > 0.01) {
        console.log(`  ${labels[i]}: analytical=${ana.toFixed(4)}, autodiff=${aut.toFixed(4)}, diff=${diff.toFixed(4)}`);
        hasError = true;
      }
    }

    if (!hasError) {
      console.log('  All gradients match within 1%');
    }

    // Assert
    expect(analyticalResidual).toBeCloseTo(vResidual.data, 4);
    for (let i = 0; i < 10; i++) {
      expect(analyticalGrad[i]).toBeCloseTo(vars[i].grad, 2);
    }
  });
});
