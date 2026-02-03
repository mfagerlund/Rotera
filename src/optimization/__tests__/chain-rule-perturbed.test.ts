/**
 * Test chain rule composition at perturbed values.
 */

import { Value } from 'scalar-autograd';
import {
  createReprojectionUProvider,
  createReprojectionVProvider,
} from '../analytical/providers/reprojection-provider';

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

    // Compute autodiff
    const vars: Value[] = [];
    for (let i = 0; i < 10; i++) {
      vars.push(new Value(variables[i], `v${i}`, true));
    }

    const px = vars[0], py = vars[1], pz = vars[2];
    const cpx = vars[3], cpy = vars[4], cpz = vars[5];
    const qw = vars[6], qx = vars[7], qy = vars[8], qz = vars[9];

    // Transform to camera frame
    const tx = px.sub(cpx);
    const ty = py.sub(cpy);
    const tz = pz.sub(cpz);

    // Quaternion rotation
    const cx_ = qy.mul(tz).sub(qz.mul(ty));
    const cy_ = qz.mul(tx).sub(qx.mul(tz));
    const cz_ = qx.mul(ty).sub(qy.mul(tx));

    const dx = qy.mul(cz_).sub(qz.mul(cy_));
    const dy = qz.mul(cx_).sub(qx.mul(cz_));
    const dz = qx.mul(cy_).sub(qy.mul(cx_));

    const camX = tx.add(qw.mul(cx_).mul(2)).add(dx.mul(2));
    const camY = ty.add(qw.mul(cy_).mul(2)).add(dy.mul(2));
    const camZ = tz.add(qw.mul(cz_).mul(2)).add(dz.mul(2));

    // Project
    const invZ = camZ.pow(-1);
    const normX = camX.mul(invZ);

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

    // Compute autodiff
    const vars: Value[] = [];
    for (let i = 0; i < 10; i++) {
      vars.push(new Value(variables[i], `v${i}`, true));
    }

    const px = vars[0], py = vars[1], pz = vars[2];
    const cpx = vars[3], cpy = vars[4], cpz = vars[5];
    const qw = vars[6], qx = vars[7], qy = vars[8], qz = vars[9];

    const tx = px.sub(cpx);
    const ty = py.sub(cpy);
    const tz = pz.sub(cpz);

    const cx_ = qy.mul(tz).sub(qz.mul(ty));
    const cy_ = qz.mul(tx).sub(qx.mul(tz));
    const cz_ = qx.mul(ty).sub(qy.mul(tx));

    const dx = qy.mul(cz_).sub(qz.mul(cy_));
    const dy = qz.mul(cx_).sub(qx.mul(cz_));
    const dz = qx.mul(cy_).sub(qy.mul(cx_));

    const camX = tx.add(qw.mul(cx_).mul(2)).add(dx.mul(2));
    const camY = ty.add(qw.mul(cy_).mul(2)).add(dy.mul(2));
    const camZ = tz.add(qw.mul(cz_).mul(2)).add(dz.mul(2));

    // Project (V = cy - fy * normY)
    const invZ = camZ.pow(-1);
    const normY = camY.mul(invZ);

    const v = new Value(intrinsics.cy).sub(normY.mul(intrinsics.fy));
    const vResidual = v.sub(observedV);

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
