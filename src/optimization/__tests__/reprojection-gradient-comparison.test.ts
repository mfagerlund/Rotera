/**
 * Direct comparison of reprojection gradients.
 * Compares analytical provider gradient vs autodiff gradient.
 */

import { Value } from 'scalar-autograd';
import {
  createReprojectionUProvider,
  createReprojectionVProvider,
} from '../analytical/providers/reprojection-provider';

describe('Reprojection gradient comparison', () => {
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

  /**
   * Compute reprojection gradient using autodiff.
   * Returns gradient w.r.t. all 10 variables: [wp_x, wp_y, wp_z, cp_x, cp_y, cp_z, qw, qx, qy, qz]
   */
  function computeReprojectionGradientAutodiff(
    worldPoint: [number, number, number],
    cameraPos: [number, number, number],
    quat: [number, number, number, number],
    fx: number,
    fy: number,
    cx: number,
    cy: number,
    observedU: number,
    observedV: number
  ): { uGradient: number[]; vGradient: number[] } {
    const [wpx, wpy, wpz] = worldPoint;
    const [cpx, cpy, cpz] = cameraPos;
    const [qw, qx, qy, qz] = quat;

    // Create Value objects with gradients enabled
    const px = new Value(wpx, 'px', true);
    const py = new Value(wpy, 'py', true);
    const pz = new Value(wpz, 'pz', true);
    const cpxV = new Value(cpx, 'cpx', true);
    const cpyV = new Value(cpy, 'cpy', true);
    const cpzV = new Value(cpz, 'cpz', true);
    const qwV = new Value(qw, 'qw', true);
    const qxV = new Value(qx, 'qx', true);
    const qyV = new Value(qy, 'qy', true);
    const qzV = new Value(qz, 'qz', true);

    const variables = [px, py, pz, cpxV, cpyV, cpzV, qwV, qxV, qyV, qzV];

    // Transform world point to camera frame
    const tx = px.sub(cpxV);
    const ty = py.sub(cpyV);
    const tz = pz.sub(cpzV);

    // Quaternion rotation using Hamilton product: q * v * q*
    // This is the GENERAL formula that works for non-unit quaternions.
    //
    // Formula: v' = 2*(q_vec · t)*q_vec + (w² - |q_vec|²)*t + 2*w*(q_vec × t)
    //
    // dot = q_vec · t
    const dot = qxV.mul(tx).add(qyV.mul(ty)).add(qzV.mul(tz));

    // |q_vec|²
    const qVecSq = qxV.mul(qxV).add(qyV.mul(qyV)).add(qzV.mul(qzV));

    // w² - |q_vec|²
    const wSqMinusQVecSq = qwV.mul(qwV).sub(qVecSq);

    // q_vec × t (cross product)
    const crossX = qyV.mul(tz).sub(qzV.mul(ty));
    const crossY = qzV.mul(tx).sub(qxV.mul(tz));
    const crossZ = qxV.mul(ty).sub(qyV.mul(tx));

    // v' = 2*(q_vec · t)*q_vec + (w² - |q_vec|²)*t + 2*w*(q_vec × t)
    const camX = dot.mul(2).mul(qxV).add(wSqMinusQVecSq.mul(tx)).add(qwV.mul(crossX).mul(2));
    const camY = dot.mul(2).mul(qyV).add(wSqMinusQVecSq.mul(ty)).add(qwV.mul(crossY).mul(2));
    const camZ = dot.mul(2).mul(qzV).add(wSqMinusQVecSq.mul(tz)).add(qwV.mul(crossZ).mul(2));

    // Project (no distortion)
    // Convention: U = fx * xNorm + cx, V = cy - fy * yNorm
    const invZ = camZ.pow(-1);
    const normX = camX.mul(invZ);
    const normY = camY.mul(invZ);

    const u = normX.mul(fx).add(cx);
    const v = new Value(cy).sub(normY.mul(fy));

    const uResidual = u.sub(observedU);
    const vResidual = v.sub(observedV);

    // Compute U gradient
    Value.zeroGradTree(uResidual);
    for (const v of variables) v.grad = 0;
    uResidual.backward();
    const uGradient = variables.map((v) => v.grad);

    // Compute V gradient
    Value.zeroGradTree(vResidual);
    for (const v of variables) v.grad = 0;
    vResidual.backward();
    const vGradient = variables.map((v) => v.grad);

    return { uGradient, vGradient };
  }

  it('gradients match for identity rotation', () => {
    const worldPoint: [number, number, number] = [0, 0, 5];
    const cameraPos: [number, number, number] = [0, 0, 0];
    const quat: [number, number, number, number] = [1, 0, 0, 0];
    const observedU = 320;
    const observedV = 240;

    // Compute analytical
    const variables = new Float64Array([...worldPoint, ...cameraPos, ...quat]);

    const uProvider = createReprojectionUProvider(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8, 9],
      intrinsics,
      observedU,
      (v) => ({ x: v[0], y: v[1], z: v[2] }),
      (v) => ({ x: v[3], y: v[4], z: v[5] }),
      (v) => ({ w: v[6], x: v[7], y: v[8], z: v[9] })
    );

    const vProvider = createReprojectionVProvider(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8, 9],
      intrinsics,
      observedV,
      (v) => ({ x: v[0], y: v[1], z: v[2] }),
      (v) => ({ x: v[3], y: v[4], z: v[5] }),
      (v) => ({ w: v[6], x: v[7], y: v[8], z: v[9] })
    );

    const analyticalUGrad = uProvider.computeGradient(variables);
    const analyticalVGrad = vProvider.computeGradient(variables);

    // Compute autodiff
    const autodiff = computeReprojectionGradientAutodiff(
      worldPoint,
      cameraPos,
      quat,
      intrinsics.fx,
      intrinsics.fy,
      intrinsics.cx,
      intrinsics.cy,
      observedU,
      observedV
    );

    console.log('Identity rotation gradients:');
    console.log('  Analytical U grad:', Array.from(analyticalUGrad));
    console.log('  Autodiff U grad:', autodiff.uGradient);
    console.log('  Analytical V grad:', Array.from(analyticalVGrad));
    console.log('  Autodiff V grad:', autodiff.vGradient);

    // Compare U gradients
    for (let i = 0; i < 10; i++) {
      expect(analyticalUGrad[i]).toBeCloseTo(autodiff.uGradient[i], 4);
    }

    // Compare V gradients
    for (let i = 0; i < 10; i++) {
      expect(analyticalVGrad[i]).toBeCloseTo(autodiff.vGradient[i], 4);
    }
  });

  it('gradients match for 45-degree rotation around Y', () => {
    const angle = Math.PI / 4;
    const halfAngle = angle / 2;
    const qw = Math.cos(halfAngle);
    const qy = Math.sin(halfAngle);

    const worldPoint: [number, number, number] = [1, 2, 5];
    const cameraPos: [number, number, number] = [0.5, 0.5, 0];
    const quat: [number, number, number, number] = [qw, 0, qy, 0];
    const observedU = 450;
    const observedV = 320;

    // Compute analytical
    const variables = new Float64Array([...worldPoint, ...cameraPos, ...quat]);

    const uProvider = createReprojectionUProvider(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8, 9],
      intrinsics,
      observedU,
      (v) => ({ x: v[0], y: v[1], z: v[2] }),
      (v) => ({ x: v[3], y: v[4], z: v[5] }),
      (v) => ({ w: v[6], x: v[7], y: v[8], z: v[9] })
    );

    const vProvider = createReprojectionVProvider(
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8, 9],
      intrinsics,
      observedV,
      (v) => ({ x: v[0], y: v[1], z: v[2] }),
      (v) => ({ x: v[3], y: v[4], z: v[5] }),
      (v) => ({ w: v[6], x: v[7], y: v[8], z: v[9] })
    );

    const analyticalUGrad = uProvider.computeGradient(variables);
    const analyticalVGrad = vProvider.computeGradient(variables);

    // Compute autodiff
    const autodiff = computeReprojectionGradientAutodiff(
      worldPoint,
      cameraPos,
      quat,
      intrinsics.fx,
      intrinsics.fy,
      intrinsics.cx,
      intrinsics.cy,
      observedU,
      observedV
    );

    console.log('45° Y rotation gradients:');
    console.log('  Analytical U grad:', Array.from(analyticalUGrad).map((v) => v.toFixed(4)));
    console.log('  Autodiff U grad:', autodiff.uGradient.map((v) => v.toFixed(4)));
    console.log('  Analytical V grad:', Array.from(analyticalVGrad).map((v) => v.toFixed(4)));
    console.log('  Autodiff V grad:', autodiff.vGradient.map((v) => v.toFixed(4)));

    // Find differences
    for (let i = 0; i < 10; i++) {
      const uDiff = Math.abs(analyticalUGrad[i] - autodiff.uGradient[i]);
      const vDiff = Math.abs(analyticalVGrad[i] - autodiff.vGradient[i]);
      if (uDiff > 0.01 || vDiff > 0.01) {
        const labels = ['wp_x', 'wp_y', 'wp_z', 'cp_x', 'cp_y', 'cp_z', 'qw', 'qx', 'qy', 'qz'];
        console.log(
          `  MISMATCH at ${labels[i]}: U diff=${uDiff.toFixed(4)}, V diff=${vDiff.toFixed(4)}`
        );
      }
    }

    // Compare U gradients
    for (let i = 0; i < 10; i++) {
      expect(analyticalUGrad[i]).toBeCloseTo(autodiff.uGradient[i], 4);
    }

    // Compare V gradients
    for (let i = 0; i < 10; i++) {
      expect(analyticalVGrad[i]).toBeCloseTo(autodiff.vGradient[i], 4);
    }
  });
});
