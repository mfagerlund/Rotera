/**
 * Compare a single reprojection residual between analytical and autodiff
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadProjectFromJson } from '../../store/project-serialization';
import { V, Value, Vec3, Vec4 } from 'scalar-autograd';
import { projectWorldPointToPixelQuaternion } from '../camera-projection';
import { reprojection_u_dcam } from '../residuals/gradients/reprojection-u-dcam-gradient';
import { reprojection_v_dcam } from '../residuals/gradients/reprojection-v-dcam-gradient';
import { Viewpoint } from '../../entities/viewpoint';
import { Quaternion } from '../Quaternion';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'Calibration');

describe('Single Residual Comparison', () => {
  it('should compare single reprojection residual', () => {
    const jsonPath = path.join(FIXTURES_DIR, 'Tower 1 - 1 Img NEW.json');
    const jsonData = fs.readFileSync(jsonPath, 'utf8');
    const project = loadProjectFromJson(jsonData);

    const camera = Array.from(project.viewpoints)[0]! as Viewpoint;
    const imagePoint = Array.from(project.imagePoints)[0]!;
    const worldPoint = imagePoint.worldPoint;

    console.log('\n=== CAMERA ===');
    console.log(`Name: ${camera.name}`);
    console.log(`Position: [${camera.position.join(', ')}]`);
    console.log(`Rotation: [${camera.rotation.join(', ')}]`);
    console.log(`focalLength: ${camera.focalLength}`);
    console.log(`aspectRatio: ${camera.aspectRatio}`);
    console.log(`principalPointX: ${camera.principalPointX}`);
    console.log(`principalPointY: ${camera.principalPointY}`);
    console.log(`isZReflected: ${camera.isZReflected}`);
    // Distortion coefficients (default to 0 if not set)
    const k1 = (camera as any).k1 ?? 0;
    const k2 = (camera as any).k2 ?? 0;
    const k3 = (camera as any).k3 ?? 0;
    const p1 = (camera as any).p1 ?? 0;
    const p2 = (camera as any).p2 ?? 0;
    console.log(`k1: ${k1}, k2: ${k2}, k3: ${k3}`);
    console.log(`p1: ${p1}, p2: ${p2}`);

    console.log('\n=== WORLD POINT ===');
    console.log(`Name: ${worldPoint.name}`);
    const wpPos = worldPoint.getEffectiveXyz();
    console.log(`Position: [${wpPos.join(', ')}]`);

    console.log('\n=== IMAGE POINT ===');
    console.log(`Observed: [${imagePoint.u}, ${imagePoint.v}]`);

    // === AUTODIFF COMPUTATION ===
    console.log('\n=== AUTODIFF COMPUTATION ===');

    // Create Value objects for autodiff
    const wpVec = new Vec3(
      V.W(wpPos[0] ?? 0),
      V.W(wpPos[1] ?? 0),
      V.W(wpPos[2] ?? 0)
    );
    const camPos = new Vec3(
      V.W(camera.position[0]),
      V.W(camera.position[1]),
      V.W(camera.position[2])
    );
    const camRot = new Vec4(
      V.W(camera.rotation[0]),
      V.W(camera.rotation[1]),
      V.W(camera.rotation[2]),
      V.W(camera.rotation[3])
    );

    // Using isZReflected=false (calibration mode)
    const isZReflected = false;

    const projection = projectWorldPointToPixelQuaternion(
      wpVec,
      camPos,
      camRot,
      V.W(camera.focalLength),
      V.W(camera.aspectRatio),
      V.W(camera.principalPointX),
      V.W(camera.principalPointY),
      V.W(0), // skew
      V.W(k1),
      V.W(k2),
      V.W(k3),
      V.W(p1),
      V.W(p2),
      isZReflected
    );

    if (projection) {
      const [projU, projV] = projection;
      console.log(`Projected: [${projU.data.toFixed(3)}, ${projV.data.toFixed(3)}]`);
      const residualU = projU.data - imagePoint.u;
      const residualV = projV.data - imagePoint.v;
      console.log(`Residual U: ${residualU.toFixed(3)}`);
      console.log(`Residual V: ${residualV.toFixed(3)}`);
      console.log(`Residual magnitude: ${Math.sqrt(residualU ** 2 + residualV ** 2).toFixed(3)} px`);
    } else {
      console.log('Point is behind camera!');

      // Compute camera-space Z to see deficit
      const translated = wpVec.sub(camPos);
      const rotated = Quaternion.rotateVector(camRot, translated);
      const camZ = isZReflected ? -rotated.z.data : rotated.z.data;
      console.log(`Camera-space Z: ${camZ.toFixed(3)}`);
    }

    // === ANALYTICAL COMPUTATION ===
    console.log('\n=== ANALYTICAL COMPUTATION ===');

    // Compute camera-space coordinates using quatRotate
    const dx = (wpPos[0] ?? 0) - camera.position[0];
    const dy = (wpPos[1] ?? 0) - camera.position[1];
    const dz = (wpPos[2] ?? 0) - camera.position[2];

    // Use RAW quaternion (same as autodiff) - do NOT normalize!
    const [qw, qx, qy, qz] = camera.rotation;
    const qNorm = Math.sqrt(qw ** 2 + qx ** 2 + qy ** 2 + qz ** 2);
    console.log(`Quaternion norm: ${qNorm.toFixed(6)} (non-unit quaternion)`);

    // Use the GENERAL quaternion rotation formula (works for non-unit quaternions):
    // v' = 2*(q_vec · t)*q_vec + (w² - |q_vec|²)*t + 2*w*(q_vec × t)

    // dot = q_vec · t
    const dot = qx * dx + qy * dy + qz * dz;

    // |q_vec|²
    const qVecSq = qx * qx + qy * qy + qz * qz;

    // w² - |q_vec|²
    const wSqMinusQVecSq = qw * qw - qVecSq;

    // q_vec × t (cross product)
    const cx = qy * dz - qz * dy;
    const cy = qz * dx - qx * dz;
    const cz = qx * dy - qy * dx;

    // v' = 2*(q_vec · t)*q_vec + (w² - |q_vec|²)*t + 2*w*(q_vec × t)
    const camX = 2 * dot * qx + wSqMinusQVecSq * dx + 2 * qw * cx;
    const camY = 2 * dot * qy + wSqMinusQVecSq * dy + 2 * qw * cy;
    const camZ = 2 * dot * qz + wSqMinusQVecSq * dz + 2 * qw * cz;

    console.log(`Camera-space: [${camX.toFixed(3)}, ${camY.toFixed(3)}, ${camZ.toFixed(3)}]`);

    const fx = camera.focalLength;
    const fy = camera.focalLength * camera.aspectRatio;

    const analyticalResU = reprojection_u_dcam(
      camX, camY, camZ,
      fx, camera.principalPointX,
      k1, k2, k3, p1, p2,
      imagePoint.u
    );
    const analyticalResV = reprojection_v_dcam(
      camX, camY, camZ,
      fy, camera.principalPointY,
      k1, k2, k3, p1, p2,
      imagePoint.v
    );

    console.log(`Analytical Residual U: ${analyticalResU.toFixed(3)}`);
    console.log(`Analytical Residual V: ${analyticalResV.toFixed(3)}`);
    console.log(`Analytical magnitude: ${Math.sqrt(analyticalResU ** 2 + analyticalResV ** 2).toFixed(3)} px`);

    // === COMPARE CAMERA-SPACE COORDINATES ===
    console.log('\n=== COMPARISON ===');

    // Compute autodiff camera-space coordinates
    const translatedVec = wpVec.sub(camPos);
    const rotatedVec = Quaternion.rotateVector(camRot, translatedVec);
    console.log(`Autodiff camera-space: [${rotatedVec.x.data.toFixed(3)}, ${rotatedVec.y.data.toFixed(3)}, ${rotatedVec.z.data.toFixed(3)}]`);
    console.log(`Analytical camera-space: [${camX.toFixed(3)}, ${camY.toFixed(3)}, ${camZ.toFixed(3)}]`);

    const camSpaceDiff = Math.sqrt(
      (rotatedVec.x.data - camX) ** 2 +
      (rotatedVec.y.data - camY) ** 2 +
      (rotatedVec.z.data - camZ) ** 2
    );

    // Verify by computing q * v * q* directly (Hamilton product)
    function hamiltonMultiply(
      a: [number, number, number, number],
      b: [number, number, number, number]
    ): [number, number, number, number] {
      const [aw, ax, ay, az] = a;
      const [bw, bx, by, bz] = b;
      return [
        aw*bw - ax*bx - ay*by - az*bz,  // w
        aw*bx + ax*bw + ay*bz - az*by,  // x
        aw*by - ax*bz + ay*bw + az*bx,  // y
        aw*bz + ax*by - ay*bx + az*bw,  // z
      ];
    }

    const [qw_raw2, qx_raw2, qy_raw2, qz_raw2] = camera.rotation;
    const t_vec: [number, number, number] = [dx, dy, dz];
    const t_quat: [number, number, number, number] = [0, t_vec[0], t_vec[1], t_vec[2]];
    const q_conj: [number, number, number, number] = [qw_raw2, -qx_raw2, -qy_raw2, -qz_raw2];

    // q * t * q*
    const temp = hamiltonMultiply(camera.rotation as [number, number, number, number], t_quat);
    const result = hamiltonMultiply(temp, q_conj);

    // Extract vector part (ignore w)
    const directCamX = result[1];
    const directCamY = result[2];
    const directCamZ = result[3];

    // Log comparison info
    console.log(`\n=== COMPARISON ===`);
    console.log(`Autodiff camera-space: [${rotatedVec.x.data.toFixed(3)}, ${rotatedVec.y.data.toFixed(3)}, ${rotatedVec.z.data.toFixed(3)}]`);
    console.log(`Direct Hamilton q*v*q*: [${directCamX.toFixed(3)}, ${directCamY.toFixed(3)}, ${directCamZ.toFixed(3)}]`);
    console.log(`Analytical camera-space: [${camX.toFixed(3)}, ${camY.toFixed(3)}, ${camZ.toFixed(3)}]`);
    console.log(`Camera-space difference: ${camSpaceDiff.toFixed(6)}`);

    // All three methods should produce identical camera-space coordinates
    // within floating point tolerance
    expect(camSpaceDiff).toBeLessThan(1e-9);

    // Also verify Hamilton matches autodiff
    const hamiltonDiff = Math.sqrt(
      (rotatedVec.x.data - directCamX) ** 2 +
      (rotatedVec.y.data - directCamY) ** 2 +
      (rotatedVec.z.data - directCamZ) ** 2
    );
    expect(hamiltonDiff).toBeLessThan(1e-9);
  });
});
