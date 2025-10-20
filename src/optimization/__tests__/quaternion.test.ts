/**
 * Tests for quaternion operations
 */

import { Vec4 } from '../Vec4';
import { Quaternion } from '../Quaternion';
import { Vec3, V } from 'scalar-autograd';

describe('Vec4', () => {
  it('should create vec4 from constants', () => {
    const v = Vec4.C(1, 2, 3, 4);
    expect(v.w.data).toBe(1);
    expect(v.x.data).toBe(2);
    expect(v.y.data).toBe(3);
    expect(v.z.data).toBe(4);
  });

  it('should compute magnitude correctly', () => {
    const v = Vec4.C(1, 0, 0, 0);
    expect(v.magnitude.data).toBeCloseTo(1, 6);

    const v2 = Vec4.C(0, 1, 0, 0);
    expect(v2.magnitude.data).toBeCloseTo(1, 6);

    const v3 = Vec4.C(2, 0, 0, 0);
    expect(v3.magnitude.data).toBeCloseTo(2, 6);
  });

  it('should normalize quaternion correctly', () => {
    const v = Vec4.C(2, 0, 0, 0);
    const normalized = v.normalized;
    expect(normalized.w.data).toBeCloseTo(1, 6);
    expect(normalized.x.data).toBeCloseTo(0, 6);
  });
});

describe('Quaternion', () => {
  it('should create identity quaternion', () => {
    const q = Quaternion.identity();
    expect(q.w.data).toBe(1);
    expect(q.x.data).toBe(0);
    expect(q.y.data).toBe(0);
    expect(q.z.data).toBe(0);
  });

  it('should convert euler to quaternion and back', () => {
    const roll = 0.1;
    const pitch = 0.2;
    const yaw = 0.3;

    const q = Quaternion.fromEuler(roll, pitch, yaw);
    const [r2, p2, y2] = Quaternion.toEuler(q);

    expect(r2).toBeCloseTo(roll, 5);
    expect(p2).toBeCloseTo(pitch, 5);
    expect(y2).toBeCloseTo(yaw, 5);
  });

  it('should create unit quaternions from euler angles', () => {
    const q = Quaternion.fromEuler(0, 0, 0);
    const mag = q.magnitude.data;
    expect(mag).toBeCloseTo(1, 6);

    const q2 = Quaternion.fromEuler(Math.PI / 4, Math.PI / 6, Math.PI / 3);
    const mag2 = q2.magnitude.data;
    expect(mag2).toBeCloseTo(1, 6);
  });

  it('should rotate vector around X axis by 90 degrees', () => {
    // Rotate Y axis to Z axis (90° around X)
    const q = Quaternion.fromEuler(Math.PI / 2, 0, 0);
    const v = new Vec3(V.C(0), V.C(1), V.C(0)); // Y axis
    const rotated = Quaternion.rotateVector(q, v);

    expect(rotated.x.data).toBeCloseTo(0, 5);
    expect(rotated.y.data).toBeCloseTo(0, 5);
    expect(rotated.z.data).toBeCloseTo(1, 5);
  });

  it('should rotate vector around Z axis by 90 degrees', () => {
    // Rotate X axis to Y axis (90° around Z)
    const q = Quaternion.fromEuler(0, 0, Math.PI / 2);
    const v = new Vec3(V.C(1), V.C(0), V.C(0)); // X axis
    const rotated = Quaternion.rotateVector(q, v);

    expect(rotated.x.data).toBeCloseTo(0, 5);
    expect(rotated.y.data).toBeCloseTo(1, 5);
    expect(rotated.z.data).toBeCloseTo(0, 5);
  });

  it('should compose rotations via quaternion multiplication', () => {
    // Rotate 90° around X, then 90° around Z
    const qX = Quaternion.fromEuler(Math.PI / 2, 0, 0);
    const qZ = Quaternion.fromEuler(0, 0, Math.PI / 2);

    // Composite rotation: qZ * qX (applies qX first)
    const qComposite = Quaternion.multiply(qZ, qX);

    // Apply to X axis: should end up at Z axis
    const v = new Vec3(V.C(1), V.C(0), V.C(0));
    const rotated = Quaternion.rotateVector(qComposite, v);

    expect(rotated.x.data).toBeCloseTo(0, 4);
    expect(rotated.y.data).toBeCloseTo(1, 4);
    expect(rotated.z.data).toBeCloseTo(0, 4);
  });

  it('should have identity quaternion produce no rotation', () => {
    const q = Quaternion.identity();
    const v = new Vec3(V.C(1), V.C(2), V.C(3));
    const rotated = Quaternion.rotateVector(q, v);

    expect(rotated.x.data).toBeCloseTo(1, 6);
    expect(rotated.y.data).toBeCloseTo(2, 6);
    expect(rotated.z.data).toBeCloseTo(3, 6);
  });

  it('should create quaternion from axis-angle', () => {
    // 180° rotation around Z axis
    const axis = new Vec3(V.C(0), V.C(0), V.C(1));
    const q = Quaternion.fromAxisAngle(axis, Math.PI);

    // Should be unit quaternion
    expect(q.magnitude.data).toBeCloseTo(1, 6);

    // Rotate X axis -> should flip to -X
    const v = new Vec3(V.C(1), V.C(0), V.C(0));
    const rotated = Quaternion.rotateVector(q, v);

    expect(rotated.x.data).toBeCloseTo(-1, 5);
    expect(rotated.y.data).toBeCloseTo(0, 5);
    expect(rotated.z.data).toBeCloseTo(0, 5);
  });

  it('should compute conjugate correctly', () => {
    const q = Quaternion.fromEuler(0.1, 0.2, 0.3);
    const qConj = Quaternion.conjugate(q);

    // w should stay the same, xyz should flip
    expect(qConj.w.data).toBeCloseTo(q.w.data, 6);
    expect(qConj.x.data).toBeCloseTo(-q.x.data, 6);
    expect(qConj.y.data).toBeCloseTo(-q.y.data, 6);
    expect(qConj.z.data).toBeCloseTo(-q.z.data, 6);
  });

  it('should invert rotation with conjugate', () => {
    const q = Quaternion.fromEuler(0.5, 0.3, 0.2);
    const qInv = Quaternion.conjugate(q);

    const v = new Vec3(V.C(1), V.C(2), V.C(3));

    // Rotate then inverse rotate should give original vector
    const rotated = Quaternion.rotateVector(q, v);
    const restored = Quaternion.rotateVector(qInv, rotated);

    expect(restored.x.data).toBeCloseTo(1, 5);
    expect(restored.y.data).toBeCloseTo(2, 5);
    expect(restored.z.data).toBeCloseTo(3, 5);
  });
});

describe('Quaternion Normalization Residual', () => {
  it('should be zero for unit quaternions', () => {
    const { quaternionNormalizationResidual } = require('../residuals/quaternion-normalization-residual');

    const q = Quaternion.identity();
    const residual = quaternionNormalizationResidual(q);

    expect(residual.data).toBeCloseTo(0, 6);
  });

  it('should be non-zero for non-unit quaternions', () => {
    const { quaternionNormalizationResidual } = require('../residuals/quaternion-normalization-residual');

    const q = Vec4.C(2, 0, 0, 0); // |q|² = 4
    const residual = quaternionNormalizationResidual(q);

    expect(residual.data).toBeCloseTo(3, 6); // 4 - 1 = 3
  });

  it('should compute gradients correctly', () => {
    const { quaternionNormalizationResidual } = require('../residuals/quaternion-normalization-residual');

    const qw = V.W(1);
    const qx = V.W(0.1);
    const qy = V.W(0.1);
    const qz = V.W(0.1);
    const q = new Vec4(qw, qx, qy, qz);

    const residual = quaternionNormalizationResidual(q);

    // Backprop
    residual.backward();

    // Gradient should be 2*q (since residual = |q|² - 1, d/dq = 2q)
    expect(qw.grad).toBeCloseTo(2 * 1, 5);
    expect(qx.grad).toBeCloseTo(2 * 0.1, 5);
    expect(qy.grad).toBeCloseTo(2 * 0.1, 5);
    expect(qz.grad).toBeCloseTo(2 * 0.1, 5);
  });
});
