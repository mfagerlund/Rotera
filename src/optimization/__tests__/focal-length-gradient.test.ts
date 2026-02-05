/**
 * Tests for focal length gradient computation.
 *
 * Verifies that analytical mode computes correct gradients for focal length
 * optimization (isPossiblyCropped=true).
 */
import { Value, Vec3, Vec4 } from 'scalar-autograd';
import {
  createReprojectionUProvider,
  createReprojectionVProvider,
} from '../analytical/providers/reprojection-provider';
import { Quaternion } from '../Quaternion';
import { describe, it, expect } from '@jest/globals';

describe('Focal Length Gradient', () => {
  // Camera pose (45° rotation around Y axis)
  const angle = Math.PI / 4;
  const halfAngle = angle / 2;
  const qw = Math.cos(halfAngle);
  const qy = Math.sin(halfAngle);

  // Variable layout: [wp_x, wp_y, wp_z, cp_x, cp_y, cp_z, qw, qx, qy, qz, focalLength]
  const WP_X = 0, WP_Y = 1, WP_Z = 2;
  const CP_X = 3, CP_Y = 4, CP_Z = 5;
  const QW = 6, QX = 7, QY = 8, QZ = 9;
  const FOCAL = 10;

  const initialVars = new Float64Array([
    1, 2, 5,          // world point
    0.5, 0.5, 0,      // camera position
    qw, 0, qy, 0,     // quaternion (45° around Y)
    500,              // focal length
  ]);

  const baseIntrinsics = {
    fx: 500,
    fy: 500,
    cx: 320,
    cy: 240,
    k1: 0, k2: 0, k3: 0,
    p1: 0, p2: 0,
  };

  it('U residual focal length gradient matches autodiff', () => {
    const observedU = 450;

    const provider = createReprojectionUProvider(
      [WP_X, WP_Y, WP_Z],
      [CP_X, CP_Y, CP_Z],
      [QW, QX, QY, QZ],
      baseIntrinsics,
      observedU,
      (v) => ({ x: v[WP_X], y: v[WP_Y], z: v[WP_Z] }),
      (v) => ({ x: v[CP_X], y: v[CP_Y], z: v[CP_Z] }),
      (v) => ({ w: v[QW], x: v[QX], y: v[QY], z: v[QZ] }),
      { focalLength: FOCAL, cx: -1, cy: -1 }
    );

    const analyticalGrad = provider.computeGradient(initialVars);
    const focalIdx = provider.variableIndices.indexOf(FOCAL);
    const analyticalFocalGrad = analyticalGrad[focalIdx];

    // Compute autodiff gradient
    const vars: Value[] = [];
    for (let i = 0; i < initialVars.length; i++) {
      vars.push(new Value(initialVars[i], `v${i}`, true));
    }

    const worldPoint = new Vec3(vars[WP_X], vars[WP_Y], vars[WP_Z]);
    const cameraPos = new Vec3(vars[CP_X], vars[CP_Y], vars[CP_Z]);
    const quatRotation = new Vec4(vars[QW], vars[QX], vars[QY], vars[QZ]);

    const translated = worldPoint.sub(cameraPos);
    const cam = Quaternion.rotateVector(quatRotation, translated);

    const focalLength = vars[FOCAL];
    const invZ = cam.z.pow(-1);
    const normX = cam.x.mul(invZ);
    const u = normX.mul(focalLength).add(baseIntrinsics.cx);
    const uResidual = u.sub(observedU);

    Value.zeroGradTree(uResidual);
    for (const v of vars) v.grad = 0;
    uResidual.backward();

    const autodiffFocalGrad = vars[FOCAL].grad;

    const relDiff = Math.abs(analyticalFocalGrad - autodiffFocalGrad) /
      Math.max(Math.abs(analyticalFocalGrad), Math.abs(autodiffFocalGrad), 1e-10);
    expect(relDiff).toBeLessThan(0.01);
  });

  it('V residual focal length gradient matches autodiff', () => {
    const observedV = 320;

    const provider = createReprojectionVProvider(
      [WP_X, WP_Y, WP_Z],
      [CP_X, CP_Y, CP_Z],
      [QW, QX, QY, QZ],
      baseIntrinsics,
      observedV,
      (v) => ({ x: v[WP_X], y: v[WP_Y], z: v[WP_Z] }),
      (v) => ({ x: v[CP_X], y: v[CP_Y], z: v[CP_Z] }),
      (v) => ({ w: v[QW], x: v[QX], y: v[QY], z: v[QZ] }),
      { focalLength: FOCAL, cx: -1, cy: -1 }
    );

    const analyticalGrad = provider.computeGradient(initialVars);
    const focalIdx = provider.variableIndices.indexOf(FOCAL);
    const analyticalFocalGrad = analyticalGrad[focalIdx];

    // Compute autodiff gradient
    const vars: Value[] = [];
    for (let i = 0; i < initialVars.length; i++) {
      vars.push(new Value(initialVars[i], `v${i}`, true));
    }

    const worldPoint = new Vec3(vars[WP_X], vars[WP_Y], vars[WP_Z]);
    const cameraPos = new Vec3(vars[CP_X], vars[CP_Y], vars[CP_Z]);
    const quatRotation = new Vec4(vars[QW], vars[QX], vars[QY], vars[QZ]);

    const translated = worldPoint.sub(cameraPos);
    const cam = Quaternion.rotateVector(quatRotation, translated);

    const focalLength = vars[FOCAL];
    const invZ = cam.z.pow(-1);
    const normY = cam.y.mul(invZ);
    // V convention: v = cy - fy * normY
    const v = new Value(baseIntrinsics.cy).sub(normY.mul(focalLength));
    const vResidual = v.sub(observedV);

    Value.zeroGradTree(vResidual);
    for (const v of vars) v.grad = 0;
    vResidual.backward();

    const autodiffFocalGrad = vars[FOCAL].grad;

    const relDiff = Math.abs(analyticalFocalGrad - autodiffFocalGrad) /
      Math.max(Math.abs(analyticalFocalGrad), Math.abs(autodiffFocalGrad), 1e-10);
    expect(relDiff).toBeLessThan(0.01);
  });
});
