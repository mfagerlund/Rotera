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
import { reprojection_u_grad } from '../../residuals/gradients/reprojection-u-gradient';
import { reprojection_v_grad } from '../../residuals/gradients/reprojection-v-gradient';

/** Large penalty for points behind the camera */
const BEHIND_CAMERA_PENALTY = 1000;

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

      // Check for point behind camera (simplified check using z in camera space)
      // Transform world point to camera space
      const tx = worldPoint.x - cameraPos.x;
      const ty = worldPoint.y - cameraPos.y;
      const tz = worldPoint.z - cameraPos.z;

      // Apply quaternion rotation to get camera-space z
      const qcx = q.y * tz - q.z * ty;
      const qcy = q.z * tx - q.x * tz;
      const dcx = q.y * qcy - q.z * qcx;
      const dcy = q.z * qcx - q.x * qcy;
      const dcz = q.x * qcy - q.y * qcx;
      let camZ = tz + 2 * q.w * (q.x * ty - q.y * tx) + 2 * (q.x * dcx - q.y * dcy);

      // Handle Z-reflection: when isZReflected is true, points with negative camZ
      // are actually in front of the camera
      if (config.isZReflected) {
        camZ = -camZ;
      }

      // Point is behind camera
      if (camZ <= 0) {
        return [BEHIND_CAMERA_PENALTY, BEHIND_CAMERA_PENALTY];
      }

      const { fx, fy, cx, cy, k1, k2, k3, p1, p2, observedU, observedV } = config;

      const resU = reprojection_u_grad(worldPoint, cameraPos, q, fx, fy, cx, cy, k1, k2, k3, p1, p2, observedU);
      const resV = reprojection_v_grad(worldPoint, cameraPos, q, fx, fy, cx, cy, k1, k2, k3, p1, p2, observedV);

      return [resU.value, resV.value];
    },

    computeJacobian(variables: number[]): number[][] {
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

      // Check for point behind camera
      const tx = worldPoint.x - cameraPos.x;
      const ty = worldPoint.y - cameraPos.y;
      const tz = worldPoint.z - cameraPos.z;
      let camZ = tz + 2 * q.w * (q.x * ty - q.y * tx) + 2 * (q.x * (q.z * tx - q.x * tz) - q.y * (q.y * tz - q.z * ty));

      // Handle Z-reflection
      if (config.isZReflected) {
        camZ = -camZ;
      }

      // Point behind camera - return zero gradients (penalty is constant)
      if (camZ <= 0) {
        return [
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ];
      }

      const { fx, fy, cx, cy, k1, k2, k3, p1, p2, observedU, observedV } = config;

      const resU = reprojection_u_grad(worldPoint, cameraPos, q, fx, fy, cx, cy, k1, k2, k3, p1, p2, observedU);
      const resV = reprojection_v_grad(worldPoint, cameraPos, q, fx, fy, cx, cy, k1, k2, k3, p1, p2, observedV);

      // Each row: [dworldPoint.x, dworldPoint.y, dworldPoint.z, dcameraPos.x, dcameraPos.y, dcameraPos.z, dq.w, dq.x, dq.y, dq.z]
      return [
        [
          resU.dworldPoint.x,
          resU.dworldPoint.y,
          resU.dworldPoint.z,
          resU.dcameraPos.x,
          resU.dcameraPos.y,
          resU.dcameraPos.z,
          resU.dq.w,
          resU.dq.x,
          resU.dq.y,
          resU.dq.z,
        ],
        [
          resV.dworldPoint.x,
          resV.dworldPoint.y,
          resV.dworldPoint.z,
          resV.dcameraPos.x,
          resV.dcameraPos.y,
          resV.dcameraPos.z,
          resV.dq.w,
          resV.dq.x,
          resV.dq.y,
          resV.dq.z,
        ],
      ];
    },
  };
}
