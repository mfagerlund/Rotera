/**
 * Test the dcam gradient functions directly to verify signs.
 */

import { Value } from 'scalar-autograd';
import { reprojection_u_dcam_grad } from '../residuals/gradients/reprojection-u-dcam-gradient';
import { reprojection_v_dcam_grad } from '../residuals/gradients/reprojection-v-dcam-gradient';

describe('dcam gradient sign verification', () => {
  const fx = 500;
  const fy = 500;
  const cx = 320;
  const cy = 240;
  const k1 = 0;
  const k2 = 0;
  const k3 = 0;
  const p1 = 0;
  const p2 = 0;

  it('verifies U dcam gradient matches autodiff', () => {
    const camX = 1.5;
    const camY = 2.0;
    const camZ = 5.0;
    const observedU = 420;

    // Compute analytical
    const analytical = reprojection_u_dcam_grad(camX, camY, camZ, fx, cx, k1, k2, k3, p1, p2, observedU);

    // Compute autodiff
    const camXV = new Value(camX, 'camX', true);
    const camYV = new Value(camY, 'camY', true);
    const camZV = new Value(camZ, 'camZ', true);

    const invZ = camZV.pow(-1);
    const normX = camXV.mul(invZ);
    const normY = camYV.mul(invZ);

    // No distortion
    const u = normX.mul(fx).add(cx);
    const uResidual = u.sub(observedU);

    // Get gradients
    Value.zeroGradTree(uResidual);
    camXV.grad = 0;
    camYV.grad = 0;
    camZV.grad = 0;
    uResidual.backward();

    console.log('U dcam gradient comparison:');
    console.log(`  Value: analytical=${analytical.value.toFixed(4)}, autodiff=${uResidual.data.toFixed(4)}`);
    console.log(`  dcamX: analytical=${analytical.dcamX.toFixed(4)}, autodiff=${camXV.grad.toFixed(4)}`);
    console.log(`  dcamY: analytical=${analytical.dcamY.toFixed(4)}, autodiff=${camYV.grad.toFixed(4)}`);
    console.log(`  dcamZ: analytical=${analytical.dcamZ.toFixed(4)}, autodiff=${camZV.grad.toFixed(4)}`);

    expect(analytical.value).toBeCloseTo(uResidual.data);
    expect(analytical.dcamX).toBeCloseTo(camXV.grad);
    expect(analytical.dcamY).toBeCloseTo(camYV.grad);
    expect(analytical.dcamZ).toBeCloseTo(camZV.grad);
  });

  it('verifies V dcam gradient matches autodiff', () => {
    const camX = 1.5;
    const camY = 2.0;
    const camZ = 5.0;
    const observedV = 280;

    // Compute analytical
    const analytical = reprojection_v_dcam_grad(camX, camY, camZ, fy, cy, k1, k2, k3, p1, p2, observedV);

    // Compute autodiff
    const camXV = new Value(camX, 'camX', true);
    const camYV = new Value(camY, 'camY', true);
    const camZV = new Value(camZ, 'camZ', true);

    const invZ = camZV.pow(-1);
    const normX = camXV.mul(invZ);
    const normY = camYV.mul(invZ);

    // No distortion
    // v = cy - fy * normY
    const v = new Value(cy).sub(normY.mul(fy));
    const vResidual = v.sub(observedV);

    // Get gradients
    Value.zeroGradTree(vResidual);
    camXV.grad = 0;
    camYV.grad = 0;
    camZV.grad = 0;
    vResidual.backward();

    console.log('V dcam gradient comparison:');
    console.log(`  Value: analytical=${analytical.value.toFixed(4)}, autodiff=${vResidual.data.toFixed(4)}`);
    console.log(`  dcamX: analytical=${analytical.dcamX.toFixed(4)}, autodiff=${camXV.grad.toFixed(4)}`);
    console.log(`  dcamY: analytical=${analytical.dcamY.toFixed(4)}, autodiff=${camYV.grad.toFixed(4)}`);
    console.log(`  dcamZ: analytical=${analytical.dcamZ.toFixed(4)}, autodiff=${camZV.grad.toFixed(4)}`);

    expect(analytical.value).toBeCloseTo(vResidual.data);
    expect(analytical.dcamX).toBeCloseTo(camXV.grad);
    expect(analytical.dcamY).toBeCloseTo(camYV.grad);
    expect(analytical.dcamZ).toBeCloseTo(camZV.grad);
  });
});
