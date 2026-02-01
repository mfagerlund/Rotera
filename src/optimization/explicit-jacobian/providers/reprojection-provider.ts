/**
 * Reprojection Residual Provider
 *
 * Projects a world point through a camera and computes the pixel error.
 * Returns 2 residuals (u error, v error).
 *
 * Note: Current gradient functions only differentiate w.r.t. world point,
 * camera position, and quaternion. Intrinsics and distortion parameters
 * are treated as constants. For full bundle adjustment with intrinsic
 * optimization, use the autodiff system.
 */

import type { ResidualWithJacobian, Point3D, Quaternion } from '../types';
import { reprojection_u_dcam_grad } from '../../residuals/gradients/reprojection-u-dcam-gradient';
import { reprojection_v_dcam_grad } from '../../residuals/gradients/reprojection-v-dcam-gradient';

/** Epsilon for numerical differentiation (fallback) */
const NUMERICAL_EPS = 1e-6;

/** Large penalty for points behind the camera */
const BEHIND_CAMERA_PENALTY = 1000;

/**
 * Compute a single residual component (U or V) using the correct projection math.
 * This is used by numerical gradient computation.
 */
function computeResidualComponent(
  worldPointIndices: [number, number, number],
  cameraPosIndices: [number, number, number],
  quaternionIndices: [number, number, number, number],
  config: ReprojectionConfig,
  variables: number[],
  isU: boolean
): number {
  const { fx, fy, cx, cy, k1, k2, k3, p1, p2, observedU, observedV, isZReflected } = config;

  const wp: Point3D = {
    x: variables[worldPointIndices[0]],
    y: variables[worldPointIndices[1]],
    z: variables[worldPointIndices[2]],
  };
  const cp: Point3D = {
    x: variables[cameraPosIndices[0]],
    y: variables[cameraPosIndices[1]],
    z: variables[cameraPosIndices[2]],
  };
  const q: Quaternion = {
    w: variables[quaternionIndices[0]],
    x: variables[quaternionIndices[1]],
    y: variables[quaternionIndices[2]],
    z: variables[quaternionIndices[3]],
  };

  // Transform world point to camera space
  const tx = wp.x - cp.x;
  const ty = wp.y - cp.y;
  const tz = wp.z - cp.z;

  // Apply quaternion rotation
  const qcx = q.y * tz - q.z * ty;
  const qcy = q.z * tx - q.x * tz;
  const qcz = q.x * ty - q.y * tx;
  const dcx = q.y * qcz - q.z * qcy;
  const dcy = q.z * qcx - q.x * qcz;
  const dcz = q.x * qcy - q.y * qcx;
  let camX = tx + 2 * q.w * qcx + 2 * dcx;
  let camY = ty + 2 * q.w * qcy + 2 * dcy;
  let camZ = tz + 2 * q.w * qcz + 2 * dcz;

  // Handle Z-reflection
  if (isZReflected) {
    camX = -camX;
    camY = -camY;
    camZ = -camZ;
  }

  // Behind camera penalty
  if (camZ <= 0) {
    return BEHIND_CAMERA_PENALTY;
  }

  // Perspective division
  const normX = camX / camZ;
  const normY = camY / camZ;

  // Radial distortion
  const r2 = normX * normX + normY * normY;
  const r4 = r2 * r2;
  const r6 = r4 * r2;
  const radial = 1 + k1 * r2 + k2 * r4 + k3 * r6;

  // Tangential distortion
  const tangX = 2 * p1 * normX * normY + p2 * (r2 + 2 * normX * normX);
  const tangY = p1 * (r2 + 2 * normY * normY) + 2 * p2 * normX * normY;

  // Apply distortion
  const distortedX = normX * radial + tangX;
  const distortedY = normY * radial + tangY;

  // Project to pixel coordinates
  if (isU) {
    const projectedU = fx * distortedX + cx;
    return projectedU - observedU;
  } else {
    const projectedV = cy - fy * distortedY;
    return projectedV - observedV;
  }
}

/**
 * Compute numerical gradient for reprojection using finite differences.
 */
function computeNumericalGradient(
  worldPointIndices: [number, number, number],
  cameraPosIndices: [number, number, number],
  quaternionIndices: [number, number, number, number],
  config: ReprojectionConfig,
  variables: number[],
  isU: boolean
): number[] {
  // Central difference for each variable
  const allIndices = [...worldPointIndices, ...cameraPosIndices, ...quaternionIndices];
  const gradients: number[] = [];

  for (const idx of allIndices) {
    const varsPlus = [...variables];
    const varsMinus = [...variables];
    varsPlus[idx] += NUMERICAL_EPS;
    varsMinus[idx] -= NUMERICAL_EPS;

    const valuePlus = computeResidualComponent(
      worldPointIndices, cameraPosIndices, quaternionIndices, config, varsPlus, isU
    );
    const valueMinus = computeResidualComponent(
      worldPointIndices, cameraPosIndices, quaternionIndices, config, varsMinus, isU
    );

    const grad = (valuePlus - valueMinus) / (2 * NUMERICAL_EPS);
    gradients.push(isFinite(grad) ? grad : 0);
  }

  return gradients;
}

/**
 * Transform world point to camera space and return intermediate values
 * needed for gradient chain rule.
 */
function worldToCamera(
  worldPoint: Point3D,
  cameraPos: Point3D,
  q: Quaternion,
  isZReflected: boolean
): { camX: number; camY: number; camZ: number; tx: number; ty: number; tz: number; qcx: number; qcy: number; qcz: number } {
  // Translation
  const tx = worldPoint.x - cameraPos.x;
  const ty = worldPoint.y - cameraPos.y;
  const tz = worldPoint.z - cameraPos.z;

  // Quaternion rotation: v' = v + 2*w*(q x v) + 2*(q x (q x v))
  const qcx = q.y * tz - q.z * ty;
  const qcy = q.z * tx - q.x * tz;
  const qcz = q.x * ty - q.y * tx;
  const dcx = q.y * qcz - q.z * qcy;
  const dcy = q.z * qcx - q.x * qcz;
  const dcz = q.x * qcy - q.y * qcx;
  let camX = tx + 2 * q.w * qcx + 2 * dcx;
  let camY = ty + 2 * q.w * qcy + 2 * dcy;
  let camZ = tz + 2 * q.w * qcz + 2 * dcz;

  // Handle Z-reflection
  if (isZReflected) {
    camX = -camX;
    camY = -camY;
    camZ = -camZ;
  }

  return { camX, camY, camZ, tx, ty, tz, qcx, qcy, qcz };
}

/**
 * Compute the rotation matrix R(q) for a quaternion.
 * Returns a 3x3 matrix as a flat array [r00, r01, r02, r10, r11, r12, r20, r21, r22].
 */
function quaternionToRotationMatrix(q: Quaternion): number[] {
  const { w, x, y, z } = q;
  // Rotation matrix from quaternion (column-major friendly form)
  // R = I + 2*w*[q]_x + 2*[q]_x^2 where [q]_x is skew-symmetric matrix of (x,y,z)
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;

  return [
    1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy),      // Row 0
    2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx),      // Row 1
    2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy),      // Row 2
  ];
}

/**
 * Compute analytical gradients using chain rule through the "narrow waist".
 * See: C:\Dev\gradient-script\docs\LLM-OPTIMIZATION-GUIDE.md
 *
 * The key insight: all parameter gradients flow through (camX, camY, camZ).
 * We compute d_residual/d_cam using gradient-script, then chain back through
 * the world-to-camera transformation.
 */
function computeAnalyticalGradient(
  worldPoint: Point3D,
  cameraPos: Point3D,
  q: Quaternion,
  config: ReprojectionConfig,
  isU: boolean
): { dwp: [number, number, number]; dcp: [number, number, number]; dq: [number, number, number, number] } {
  const { fx, fy, cx, cy, k1, k2, k3, p1, p2, observedU, observedV, isZReflected } = config;

  // Step 1: Forward pass to get camera-space coordinates
  const cam = worldToCamera(worldPoint, cameraPos, q, isZReflected ?? false);

  // Step 2: Get d_residual/d_cam from gradient-script generated function
  let dcamX: number, dcamY: number, dcamZ: number;

  if (isU) {
    const gradU = reprojection_u_dcam_grad(
      cam.camX, cam.camY, cam.camZ,
      fx, cx, k1, k2, k3, p1, p2, observedU
    );
    dcamX = gradU.dcamX;
    dcamY = gradU.dcamY;
    dcamZ = gradU.dcamZ;
  } else {
    const gradV = reprojection_v_dcam_grad(
      cam.camX, cam.camY, cam.camZ,
      fy, cy, k1, k2, k3, p1, p2, observedV
    );
    dcamX = gradV.dcamX;
    dcamY = gradV.dcamY;
    dcamZ = gradV.dcamZ;
  }

  // Handle Z-reflection: if reflected, cam = -R(q)*t, so d_cam/d(R*t) = -I
  // This means gradients are negated
  if (isZReflected) {
    dcamX = -dcamX;
    dcamY = -dcamY;
    dcamZ = -dcamZ;
  }

  // Step 3: Chain rule back through rotation
  // cam = R(q) * t where t = worldPoint - cameraPos
  // d_residual/d_t = R(q)^T * d_residual/d_cam
  const R = quaternionToRotationMatrix(q);

  // R^T * dcam (transpose multiplication)
  const dt_x = R[0] * dcamX + R[3] * dcamY + R[6] * dcamZ;
  const dt_y = R[1] * dcamX + R[4] * dcamY + R[7] * dcamZ;
  const dt_z = R[2] * dcamX + R[5] * dcamY + R[8] * dcamZ;

  // d_worldPoint = d_t (since t = worldPoint - cameraPos, d_t/d_worldPoint = I)
  const dwp: [number, number, number] = [dt_x, dt_y, dt_z];

  // d_cameraPos = -d_t (since d_t/d_cameraPos = -I)
  const dcp: [number, number, number] = [-dt_x, -dt_y, -dt_z];

  // Step 4: Chain rule for quaternion
  // d_residual/d_q = d_residual/d_cam * d_cam/d_q
  // where d_cam/d_q is the Jacobian of R(q)*t w.r.t. q
  // This is a 3x4 matrix: [d_cam/d_w, d_cam/d_x, d_cam/d_y, d_cam/d_z]
  const { tx, ty, tz, qcx, qcy, qcz } = cam;

  // d_cam/d_w = 2 * qc where qc = q × t
  const dcam_dw_x = 2 * qcx;
  const dcam_dw_y = 2 * qcy;
  const dcam_dw_z = 2 * qcz;

  // For d_cam/d_qx, d_cam/d_qy, d_cam/d_qz, we need to differentiate:
  // qc = (qy*tz - qz*ty, qz*tx - qx*tz, qx*ty - qy*tx)
  // dc = qy*qcz - qz*qcy, qz*qcx - qx*qcz, qx*qcy - qy*qcx
  // cam = t + 2*w*qc + 2*dc

  // d_qc/d_qx = (0, -tz, ty)
  // d_qc/d_qy = (tz, 0, -tx)
  // d_qc/d_qz = (-ty, tx, 0)

  // d_dc/d_qx = (qy * d_qcz/d_qx - qz * d_qcy/d_qx - qcz,
  //              qz * d_qcx/d_qx - qx * d_qcz/d_qx + qcz,
  //              qx * d_qcy/d_qx - qy * d_qcx/d_qx + qcy - qcx)
  // = (qy * ty - qz * (-tz) - qcz, qz * 0 - qx * ty + qcz, qx * (-tz) - qy * 0 + qcy - qcx)
  // = (qy*ty + qz*tz - qcz, -qx*ty + qcz, -qx*tz + qcy - qcx)

  // Let me compute this more systematically:
  // d_cam/d_qx = 2*w * d_qc/d_qx + 2 * d_dc/d_qx
  // d_qc/d_qx = (0, -tz, ty)
  // For d_dc/d_qx:
  //   dcx = qy*qcz - qz*qcy
  //   d_dcx/d_qx = qy * (d_qcz/d_qx) - qz * (d_qcy/d_qx) = qy * ty - qz * (-tz) = qy*ty + qz*tz
  //   dcy = qz*qcx - qx*qcz
  //   d_dcy/d_qx = qz * (d_qcx/d_qx) - qcz - qx * (d_qcz/d_qx) = qz * 0 - qcz - qx * ty = -qcz - qx*ty
  //   dcz = qx*qcy - qy*qcx
  //   d_dcz/d_qx = qcy + qx * (d_qcy/d_qx) - qy * (d_qcx/d_qx) = qcy + qx * (-tz) - qy * 0 = qcy - qx*tz

  const dcam_dqx_x = 2 * q.w * 0 + 2 * (q.y * ty + q.z * tz);
  const dcam_dqx_y = 2 * q.w * (-tz) + 2 * (-qcz - q.x * ty);
  const dcam_dqx_z = 2 * q.w * ty + 2 * (qcy - q.x * tz);

  // d_qc/d_qy = (tz, 0, -tx)
  // d_dcx/d_qy = qcz + qy * tz - qz * 0 = qcz + qy * tz
  // d_dcy/d_qy = qz * tz - qx * (-tx) = qz * tz + qx * tx
  // d_dcz/d_qy = qx * 0 - qcx - qy * tz = -qcx - qy * tz

  const dcam_dqy_x = 2 * q.w * tz + 2 * (qcz + q.y * tz);
  const dcam_dqy_y = 2 * q.w * 0 + 2 * (q.z * tz + q.x * tx);
  const dcam_dqy_z = 2 * q.w * (-tx) + 2 * (-qcx - q.y * tz);

  // d_qc/d_qz = (-ty, tx, 0)
  // d_dcx/d_qz = qy * 0 - qcy - qz * tx = -qcy - qz * tx
  // d_dcy/d_qz = qcx + qz * (-ty) - qx * 0 = qcx - qz * ty
  // d_dcz/d_qz = qx * tx + qy * ty - qy * 0 = qx * tx + qy * ty

  const dcam_dqz_x = 2 * q.w * (-ty) + 2 * (-qcy - q.z * tx);
  const dcam_dqz_y = 2 * q.w * tx + 2 * (qcx - q.z * ty);
  const dcam_dqz_z = 2 * q.w * 0 + 2 * (q.x * tx + q.y * ty);

  // Chain rule: d_residual/d_q = dcam · d_residual/d_cam
  const dw = dcam_dw_x * dcamX + dcam_dw_y * dcamY + dcam_dw_z * dcamZ;
  const dx = dcam_dqx_x * dcamX + dcam_dqx_y * dcamY + dcam_dqx_z * dcamZ;
  const dy = dcam_dqy_x * dcamX + dcam_dqy_y * dcamY + dcam_dqy_z * dcamZ;
  const dz = dcam_dqz_x * dcamX + dcam_dqz_y * dcamY + dcam_dqz_z * dcamZ;

  const dq: [number, number, number, number] = [dw, dx, dy, dz];

  return { dwp, dcp, dq };
}

export interface ReprojectionConfig {
  /** Camera intrinsics */
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  /** Distortion parameters */
  k1: number;
  k2: number;
  k3: number;
  p1: number;
  p2: number;
  /** Observed pixel coordinates */
  observedU: number;
  observedV: number;
  /** Whether the camera's Z-axis is reflected */
  isZReflected?: boolean;
}

/**
 * Create a reprojection residual provider.
 * Returns 2 residuals (u and v pixel errors).
 *
 * @param id Unique identifier
 * @param worldPointIndices Variable indices for world point [x, y, z]
 * @param cameraPosIndices Variable indices for camera position [x, y, z]
 * @param quaternionIndices Variable indices for camera rotation [w, x, y, z]
 * @param config Camera intrinsics and observed pixel
 */
export function createReprojectionProvider(
  id: string,
  worldPointIndices: [number, number, number],
  cameraPosIndices: [number, number, number],
  quaternionIndices: [number, number, number, number],
  config: ReprojectionConfig
): ResidualWithJacobian {
  // All 10 variable indices (3 world + 3 camera pos + 4 quaternion)
  const variableIndices = [...worldPointIndices, ...cameraPosIndices, ...quaternionIndices];

  return {
    id,
    name: 'Reprojection',
    residualCount: 2,
    variableIndices,

    computeResiduals(variables: number[]): number[] {
      const worldPoint: Point3D = {
        x: variables[worldPointIndices[0]],
        y: variables[worldPointIndices[1]],
        z: variables[worldPointIndices[2]],
      };
      const cameraPos: Point3D = {
        x: variables[cameraPosIndices[0]],
        y: variables[cameraPosIndices[1]],
        z: variables[cameraPosIndices[2]],
      };
      const q: Quaternion = {
        w: variables[quaternionIndices[0]],
        x: variables[quaternionIndices[1]],
        y: variables[quaternionIndices[2]],
        z: variables[quaternionIndices[3]],
      };

      // Transform world point to camera space
      const tx = worldPoint.x - cameraPos.x;
      const ty = worldPoint.y - cameraPos.y;
      const tz = worldPoint.z - cameraPos.z;

      // Apply quaternion rotation: v' = v + 2*w*(q x v) + 2*(q x (q x v))
      const qcx = q.y * tz - q.z * ty;
      const qcy = q.z * tx - q.x * tz;
      const qcz = q.x * ty - q.y * tx;
      const dcx = q.y * qcz - q.z * qcy;
      const dcy = q.z * qcx - q.x * qcz;
      const dcz = q.x * qcy - q.y * qcx;
      let camX = tx + 2 * q.w * qcx + 2 * dcx;
      let camY = ty + 2 * q.w * qcy + 2 * dcy;
      let camZ = tz + 2 * q.w * qcz + 2 * dcz;

      // Handle Z-reflection: negate all three components
      // When isZReflected is true, the quaternion includes a 180° Z rotation (Rz_180)
      // which negates X and Y. Combined with the Z flip, all three axes are negated.
      if (config.isZReflected) {
        camX = -camX;
        camY = -camY;
        camZ = -camZ;
      }

      // Point is behind camera
      if (camZ <= 0) {
        return [BEHIND_CAMERA_PENALTY, BEHIND_CAMERA_PENALTY];
      }

      const { fx, fy, cx, cy, k1, k2, k3, p1, p2, observedU, observedV } = config;

      // Perspective division
      const normX = camX / camZ;
      const normY = camY / camZ;

      // Radial distortion
      const r2 = normX * normX + normY * normY;
      const r4 = r2 * r2;
      const r6 = r4 * r2;
      const radial = 1 + k1 * r2 + k2 * r4 + k3 * r6;

      // Tangential distortion
      const tangX = 2 * p1 * normX * normY + p2 * (r2 + 2 * normX * normX);
      const tangY = p1 * (r2 + 2 * normY * normY) + 2 * p2 * normX * normY;

      // Apply distortion
      const distortedX = normX * radial + tangX;
      const distortedY = normY * radial + tangY;

      // Project to pixel coordinates
      // Note: V uses subtraction because image Y increases downward
      // while camera Y increases upward
      const projectedU = fx * distortedX + cx;
      const projectedV = cy - fy * distortedY;

      // Residuals
      return [projectedU - observedU, projectedV - observedV];
    },

    computeJacobian(variables: number[]): number[][] {
      // Use numerical gradients for reprojection
      // NOTE: The gradient-script generated code has a sign error in the V gradient
      // (missing negative sign from cy - fy*distortedY subtraction).
      // See: https://github.com/mfagerlund/gradient-script/issues/XXX
      // TODO: Switch to analytical gradients once gradient-script is fixed
      const numericalU = computeNumericalGradient(
        worldPointIndices, cameraPosIndices, quaternionIndices, config, variables, true
      );
      const numericalV = computeNumericalGradient(
        worldPointIndices, cameraPosIndices, quaternionIndices, config, variables, false
      );
      return [numericalU, numericalV];
    },
  };
}
