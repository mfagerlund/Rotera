import { describe, it, expect } from '@jest/globals';
import { V, Vec3, Vec4 } from 'scalar-autograd';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';
import { Quaternion } from '../Quaternion';

describe('Projection Math Debug', () => {
  it('should project a point correctly with camera at origin', () => {
    const worldPoint = new Vec3(V.C(0), V.C(0), V.C(10));
    const cameraPosition = new Vec3(V.C(0), V.C(0), V.C(0));
    const cameraRotation = Vec4.identity();

    const focalLength = V.C(1000);
    const aspectRatio = V.C(1.0);
    const principalPointX = V.C(960);
    const principalPointY = V.C(540);
    const skew = V.C(0);
    const k1 = V.C(0);
    const k2 = V.C(0);
    const k3 = V.C(0);
    const p1 = V.C(0);
    const p2 = V.C(0);

    const result = projectWorldPointToPixelQuaternion(
      worldPoint,
      cameraPosition,
      cameraRotation,
      focalLength,
      aspectRatio,
      principalPointX,
      principalPointY,
      skew,
      k1, k2, k3, p1, p2
    );

    console.log('\n=== TEST 1: Camera at origin, point at [0, 0, 10] ===');
    console.log('Expected: Should project to principal point (960, 540)');
    if (result) {
      console.log(`Actual: [${result[0].data.toFixed(2)}, ${result[1].data.toFixed(2)}]`);
      console.log(`Error: [${Math.abs(result[0].data - 960).toFixed(2)}, ${Math.abs(result[1].data - 540).toFixed(2)}]`);
    } else {
      console.log('Result: null (point behind camera)');
    }

    expect(result).not.toBeNull();
    if (result) {
      expect(result[0].data).toBeCloseTo(960, 0);
      expect(result[1].data).toBeCloseTo(540, 0);
    }
  });

  it('should project a point offset in X correctly', () => {
    const worldPoint = new Vec3(V.C(5), V.C(0), V.C(10));
    const cameraPosition = new Vec3(V.C(0), V.C(0), V.C(0));
    const cameraRotation = Vec4.identity();

    const focalLength = V.C(1000);
    const aspectRatio = V.C(1.0);
    const principalPointX = V.C(960);
    const principalPointY = V.C(540);
    const skew = V.C(0);
    const k1 = V.C(0);
    const k2 = V.C(0);
    const k3 = V.C(0);
    const p1 = V.C(0);
    const p2 = V.C(0);

    const result = projectWorldPointToPixelQuaternion(
      worldPoint,
      cameraPosition,
      cameraRotation,
      focalLength,
      aspectRatio,
      principalPointX,
      principalPointY,
      skew,
      k1, k2, k3, p1, p2
    );

    console.log('\n=== TEST 2: Camera at origin, point at [5, 0, 10] ===');
    console.log('Camera coordinates should be: [5, 0, 10]');
    console.log('Normalized: [5/10, 0/10] = [0.5, 0]');
    console.log('Pixels: [960 + 1000*0.5, 540 + 1000*0] = [1460, 540]');
    if (result) {
      console.log(`Actual: [${result[0].data.toFixed(2)}, ${result[1].data.toFixed(2)}]`);
      console.log(`Error: [${Math.abs(result[0].data - 1460).toFixed(2)}, ${Math.abs(result[1].data - 540).toFixed(2)}]`);
    } else {
      console.log('Result: null (point behind camera)');
    }

    expect(result).not.toBeNull();
    if (result) {
      expect(result[0].data).toBeCloseTo(1460, 0);
      expect(result[1].data).toBeCloseTo(540, 0);
    }
  });

  it('should verify quaternion rotation is identity', () => {
    const v = new Vec3(V.C(1), V.C(2), V.C(3));
    const q = Vec4.identity();

    const rotated = Quaternion.rotateVector(q, v);

    console.log('\n=== TEST 3: Identity quaternion should not change vector ===');
    console.log(`Original: [${v.x.data}, ${v.y.data}, ${v.z.data}]`);
    console.log(`Rotated: [${rotated.x.data.toFixed(6)}, ${rotated.y.data.toFixed(6)}, ${rotated.z.data.toFixed(6)}]`);
    console.log(`Difference: [${Math.abs(rotated.x.data - v.x.data).toExponential(2)}, ${Math.abs(rotated.y.data - v.y.data).toExponential(2)}, ${Math.abs(rotated.z.data - v.z.data).toExponential(2)}]`);

    expect(rotated.x.data).toBeCloseTo(v.x.data, 10);
    expect(rotated.y.data).toBeCloseTo(v.y.data, 10);
    expect(rotated.z.data).toBeCloseTo(v.z.data, 10);
  });

  it('should test 90-degree rotation around Y axis', () => {
    const v = new Vec3(V.C(1), V.C(0), V.C(0));
    const q = Quaternion.fromEuler(0, Math.PI / 2, 0);

    const rotated = Quaternion.rotateVector(q, v);

    console.log('\n=== TEST 4: 90-degree rotation around Y axis ===');
    console.log(`Original: [${v.x.data}, ${v.y.data}, ${v.z.data}] (pointing in +X)`);
    console.log(`Rotated: [${rotated.x.data.toFixed(6)}, ${rotated.y.data.toFixed(6)}, ${rotated.z.data.toFixed(6)}]`);
    console.log(`Expected: [0, 0, -1] (pointing in -Z after 90deg Y rotation)`);

    expect(rotated.x.data).toBeCloseTo(0, 5);
    expect(rotated.y.data).toBeCloseTo(0, 5);
    expect(rotated.z.data).toBeCloseTo(-1, 5);
  });

  it('should test camera looking down +Z with point in front', () => {
    const worldPoint = new Vec3(V.C(1), V.C(0), V.C(10));
    const cameraPosition = new Vec3(V.C(0), V.C(0), V.C(0));
    const cameraRotation = Vec4.identity();

    const focalLength = V.C(1000);
    const aspectRatio = V.C(1.0);
    const principalPointX = V.C(960);
    const principalPointY = V.C(540);
    const skew = V.C(0);
    const k1 = V.C(0);
    const k2 = V.C(0);
    const k3 = V.C(0);
    const p1 = V.C(0);
    const p2 = V.C(0);

    const result = projectWorldPointToPixelQuaternion(
      worldPoint,
      cameraPosition,
      cameraRotation,
      focalLength,
      aspectRatio,
      principalPointX,
      principalPointY,
      skew,
      k1, k2, k3, p1, p2
    );

    console.log('\n=== TEST 5: OpenCV camera convention test ===');
    console.log('World point: [1, 0, 10]');
    console.log('Camera at origin, identity rotation');
    console.log('OpenCV convention: X right, Y down, Z forward');
    console.log('Point should project to RIGHT of center');
    if (result) {
      console.log(`Actual pixel: [${result[0].data.toFixed(2)}, ${result[1].data.toFixed(2)}]`);
      console.log(`Principal point: [960, 540]`);
      console.log(`Offset from center: [${(result[0].data - 960).toFixed(2)}, ${(result[1].data - 540).toFixed(2)}]`);
    } else {
      console.log('Result: null (point behind camera)');
    }
  });
});
