import { describe, it } from '@jest/globals';
import { V, Vec3, Vec4 } from 'scalar-autograd';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';
import { Quaternion } from '../Quaternion';

describe('Coordinate System Debug', () => {
  it('should test the cube scenario camera setup', () => {
    console.log('\n=== TESTING CUBE SCENARIO CAMERA SETUP ===\n');

    const camera1Pos = new Vec3(V.C(7.5), V.C(0), V.C(-30));
    const camera1Rot = Vec4.identity();

    const camera2Pos = new Vec3(V.C(-7.5), V.C(0), V.C(-30));
    const camera2Rot = Vec4.identity();

    console.log(`Camera 1: pos=[7.5, 0, -30], rot=[1, 0, 0, 0] (identity)`);
    console.log(`Camera 2: pos=[-7.5, 0, -30], rot=[1, 0, 0, 0] (identity)`);
    console.log('');

    const testWorldPoint = new Vec3(V.C(0), V.C(0), V.C(0));

    console.log('Test: Where does world origin [0, 0, 0] project in each camera?');
    console.log('');

    const focalLength = V.C(4000);
    const aspectRatio = V.C(1.0);
    const principalPointX = V.C(960);
    const principalPointY = V.C(540);
    const skew = V.C(0);
    const k1 = V.C(0);
    const k2 = V.C(0);
    const k3 = V.C(0);
    const p1 = V.C(0);
    const p2 = V.C(0);

    const cam1WorldInCam = testWorldPoint.sub(camera1Pos);
    console.log(`Camera 1: World point [0,0,0] relative to camera = [${cam1WorldInCam.x.data}, ${cam1WorldInCam.y.data}, ${cam1WorldInCam.z.data}]`);

    const cam1WorldRotated = Quaternion.rotateVector(camera1Rot, cam1WorldInCam);
    console.log(`  After identity rotation: [${cam1WorldRotated.x.data.toFixed(3)}, ${cam1WorldRotated.y.data.toFixed(3)}, ${cam1WorldRotated.z.data.toFixed(3)}]`);

    if (cam1WorldRotated.z.data > 0) {
      console.log(`  Z > 0: Point is IN FRONT of camera (good for OpenCV: X right, Y down, Z forward)`);
    } else {
      console.log(`  Z < 0: Point is BEHIND camera (BAD - will not project or project incorrectly)`);
    }

    const proj1 = projectWorldPointToPixelQuaternion(
      testWorldPoint,
      camera1Pos,
      camera1Rot,
      focalLength,
      aspectRatio,
      principalPointX,
      principalPointY,
      skew,
      k1, k2, k3, p1, p2
    );

    if (proj1) {
      console.log(`  Projected to: [${proj1[0].data.toFixed(2)}, ${proj1[1].data.toFixed(2)}]`);
    } else {
      console.log(`  Projection failed (point behind camera)`);
    }
    console.log('');

    const cam2WorldInCam = testWorldPoint.sub(camera2Pos);
    console.log(`Camera 2: World point [0,0,0] relative to camera = [${cam2WorldInCam.x.data}, ${cam2WorldInCam.y.data}, ${cam2WorldInCam.z.data}]`);

    const cam2WorldRotated = Quaternion.rotateVector(camera2Rot, cam2WorldInCam);
    console.log(`  After identity rotation: [${cam2WorldRotated.x.data.toFixed(3)}, ${cam2WorldRotated.y.data.toFixed(3)}, ${cam2WorldRotated.z.data.toFixed(3)}]`);

    if (cam2WorldRotated.z.data > 0) {
      console.log(`  Z > 0: Point is IN FRONT of camera (good)`);
    } else {
      console.log(`  Z < 0: Point is BEHIND camera (BAD)`);
    }

    const proj2 = projectWorldPointToPixelQuaternion(
      testWorldPoint,
      camera2Pos,
      camera2Rot,
      focalLength,
      aspectRatio,
      principalPointX,
      principalPointY,
      skew,
      k1, k2, k3, p1, p2
    );

    if (proj2) {
      console.log(`  Projected to: [${proj2[0].data.toFixed(2)}, ${proj2[1].data.toFixed(2)}]`);
    } else {
      console.log(`  Projection failed (point behind camera)`);
    }
    console.log('');

    console.log('DIAGNOSIS:');
    console.log('If cameras are at Z=-30 and looking with identity rotation,');
    console.log('and world points are near origin (Z ~0),');
    console.log('then in camera frame: world point Z = 0 - (-30) = +30');
    console.log('This means points ARE in front of cameras (Z > 0), which is correct.');
    console.log('');
    console.log('So the camera setup is geometrically OK.');
    console.log('The problem must be elsewhere...');
  });

  it('should test what happens with a typical triangulated point', () => {
    console.log('\n=== TESTING TRIANGULATED POINT ===\n');

    const camera1Pos = new Vec3(V.C(7.5), V.C(0), V.C(-30));
    const camera1Rot = Vec4.identity();

    const focalLength = V.C(4000);
    const aspectRatio = V.C(1.0);
    const principalPointX = V.C(960);
    const principalPointY = V.C(540);
    const skew = V.C(0);
    const k1 = V.C(0);
    const k2 = V.C(0);
    const k3 = V.C(0);
    const p1 = V.C(0);
    const p2 = V.C(0);

    const imageU = 956.52;
    const imageV = 537.63;

    console.log(`Camera 1 observed image point at [${imageU}, ${imageV}]`);
    console.log(`Principal point: [960, 540]`);
    console.log(`Offset from center: [${(imageU - 960).toFixed(2)}, ${(imageV - 540).toFixed(2)}]`);
    console.log('');

    const worldPoint = new Vec3(V.C(-22.64), V.C(2.61), V.C(149.86));

    console.log(`World point is at: [${worldPoint.x.data}, ${worldPoint.y.data}, ${worldPoint.z.data}]`);
    console.log('');

    const proj = projectWorldPointToPixelQuaternion(
      worldPoint,
      camera1Pos,
      camera1Rot,
      focalLength,
      aspectRatio,
      principalPointX,
      principalPointY,
      skew,
      k1, k2, k3, p1, p2
    );

    if (proj) {
      console.log(`Projected to: [${proj[0].data.toFixed(2)}, ${proj[1].data.toFixed(2)}]`);
      console.log(`Residual: [${(proj[0].data - imageU).toFixed(2)}, ${(proj[1].data - imageV).toFixed(2)}]`);
      const error = Math.sqrt((proj[0].data - imageU)**2 + (proj[1].data - imageV)**2);
      console.log(`Reprojection error: ${error.toFixed(2)} pixels`);
    } else {
      console.log('Projection failed');
    }

    const pointInCam = worldPoint.sub(camera1Pos);
    console.log('');
    console.log(`Point in camera frame: [${pointInCam.x.data.toFixed(2)}, ${pointInCam.y.data.toFixed(2)}, ${pointInCam.z.data.toFixed(2)}]`);

    const pointRotated = Quaternion.rotateVector(camera1Rot, pointInCam);
    console.log(`After rotation: [${pointRotated.x.data.toFixed(2)}, ${pointRotated.y.data.toFixed(2)}, ${pointRotated.z.data.toFixed(2)}]`);

    console.log('');
    console.log('ISSUE FOUND?');
    console.log('The world point Z is 149.86, camera Z is -30');
    console.log('So point is VERY FAR in +Z direction (about 180 units away from camera)');
    console.log('This seems wrong for a cube that should be ~10 units in size!');
  });
});
