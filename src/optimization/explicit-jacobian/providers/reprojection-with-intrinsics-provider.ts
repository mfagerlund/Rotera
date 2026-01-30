/**
 * Reprojection Residual Provider with Intrinsics Optimization
 *
 * Extends the base reprojection provider to include focal length as an
 * optimization variable. The derivative of u w.r.t. fx is simply distortedX,
 * and dv/dfy is distortedY.
 *
 * Since we use fx = focalLength and fy = focalLength * aspectRatio:
 * - du/dfocalLength = distortedX
 * - dv/dfocalLength = aspectRatio * distortedY
 */

import type { ResidualWithJacobian, Point3D, Quaternion } from '../types';
import { reprojection_u_grad } from '../../residuals/gradients/reprojection-u-gradient';
import { reprojection_v_grad } from '../../residuals/gradients/reprojection-v-gradient';

/** Large penalty for points behind the camera */
const BEHIND_CAMERA_PENALTY = 1000;

export interface ReprojectionWithIntrinsicsConfig {
  /** Camera intrinsics (used as constants except focal length) */
  aspectRatio: number;
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
}

/**
 * Create a reprojection residual provider that includes focal length optimization.
 * Returns 2 residuals (u and v pixel errors).
 *
 * @param id Unique identifier
 * @param worldPointIndices Variable indices for world point [x, y, z]
 * @param cameraPosIndices Variable indices for camera position [x, y, z]
 * @param quaternionIndices Variable indices for camera rotation [w, x, y, z]
 * @param focalLengthIndex Variable index for focal length
 * @param config Camera intrinsics (except focal length) and observed pixel
 */
export function createReprojectionWithIntrinsicsProvider(
  id: string,
  worldPointIndices: [number, number, number],
  cameraPosIndices: [number, number, number],
  quaternionIndices: [number, number, number, number],
  focalLengthIndex: number,
  config: ReprojectionWithIntrinsicsConfig
): ResidualWithJacobian {
  // All 11 variable indices (3 world + 3 camera pos + 4 quaternion + 1 focal length)
  const variableIndices = [...worldPointIndices, ...cameraPosIndices, ...quaternionIndices, focalLengthIndex];

  /**
   * Compute camera-space coordinates and distorted coordinates.
   * Returns null if point is behind camera.
   */
  function computeProjection(variables: number[]): {
    distortedX: number;
    distortedY: number;
    fx: number;
    fy: number;
    behindCamera: boolean;
  } | null {
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

    // Translate to camera frame
    const tx = worldPoint.x - cameraPos.x;
    const ty = worldPoint.y - cameraPos.y;
    const tz = worldPoint.z - cameraPos.z;

    // Apply quaternion rotation: q * v * q*
    const qcx = q.y * tz - q.z * ty;
    const qcy = q.z * tx - q.x * tz;
    const qcz = q.x * ty - q.y * tx;
    const dcx = q.y * qcz - q.z * qcy;
    const dcy = q.z * qcx - q.x * qcz;
    const dcz = q.x * qcy - q.y * qcx;
    const camX = tx + 2 * q.w * qcx + 2 * dcx;
    const camY = ty + 2 * q.w * qcy + 2 * dcy;
    const camZ = tz + 2 * q.w * qcz + 2 * dcz;

    // Check for point behind camera
    if (camZ <= 0) {
      return { distortedX: 0, distortedY: 0, fx: 0, fy: 0, behindCamera: true };
    }

    // Perspective division
    const normX = camX / camZ;
    const normY = camY / camZ;

    // Radial distortion
    const { k1, k2, k3, p1, p2, aspectRatio } = config;
    const r2 = normX * normX + normY * normY;
    const r4 = r2 * r2;
    const r6 = r4 * r2;
    const radial = 1 + k1 * r2 + k2 * r4 + k3 * r6;

    // Tangential distortion
    const tangX = 2 * p1 * normX * normY + p2 * (r2 + 2 * normX * normX);
    const tangY = p1 * (r2 + 2 * normY * normY) + 2 * p2 * normX * normY;

    // Distorted coordinates
    const distortedX = normX * radial + tangX;
    const distortedY = normY * radial + tangY;

    const focalLength = variables[focalLengthIndex];
    const fx = focalLength;
    const fy = focalLength * aspectRatio;

    return { distortedX, distortedY, fx, fy, behindCamera: false };
  }

  return {
    id,
    name: 'ReprojectionWithIntrinsics',
    residualCount: 2,
    variableIndices,

    computeResiduals(variables: number[]): number[] {
      const proj = computeProjection(variables);
      if (!proj || proj.behindCamera) {
        return [BEHIND_CAMERA_PENALTY, BEHIND_CAMERA_PENALTY];
      }

      const { distortedX, distortedY, fx, fy } = proj;
      const { cx, cy, observedU, observedV } = config;

      const u = fx * distortedX + cx;
      const v = fy * distortedY + cy;

      return [u - observedU, v - observedV];
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

      const proj = computeProjection(variables);
      if (!proj || proj.behindCamera) {
        // Point behind camera - return zero gradients
        return [
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ];
      }

      const { distortedX, distortedY, fx, fy } = proj;
      const { k1, k2, k3, p1, p2, observedU, observedV, aspectRatio, cx, cy } = config;

      // Get gradients from the gradient functions (these are for the original reprojection)
      const resU = reprojection_u_grad(worldPoint, cameraPos, q, fx, fy, cx, cy, k1, k2, k3, p1, p2, observedU);
      const resV = reprojection_v_grad(worldPoint, cameraPos, q, fx, fy, cx, cy, k1, k2, k3, p1, p2, observedV);

      // Focal length derivatives:
      // u = fx * distortedX + cx => du/dfx = distortedX
      // v = fy * distortedY + cy => dv/dfy = distortedY
      // Since fx = focalLength and fy = focalLength * aspectRatio:
      // du/dfocalLength = du/dfx * dfx/dfocalLength = distortedX * 1 = distortedX
      // dv/dfocalLength = dv/dfy * dfy/dfocalLength = distortedY * aspectRatio
      const duDfocalLength = distortedX;
      const dvDfocalLength = distortedY * aspectRatio;

      // Row for U: [dworldPoint.x, .y, .z, dcameraPos.x, .y, .z, dq.w, .x, .y, .z, dfocalLength]
      const rowU = [
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
        duDfocalLength,
      ];

      // Row for V
      const rowV = [
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
        dvDfocalLength,
      ];

      return [rowU, rowV];
    },
  };
}
