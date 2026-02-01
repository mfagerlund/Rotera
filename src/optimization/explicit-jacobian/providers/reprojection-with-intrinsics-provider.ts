/**
 * Reprojection Residual Provider with Intrinsics Optimization
 *
 * Extends the base reprojection provider to include focal length as an
 * optimization variable. Uses numerical gradients for correctness.
 *
 * Since we use fx = focalLength and fy = focalLength * aspectRatio:
 * - du/dfocalLength = distortedX
 * - dv/dfocalLength = -aspectRatio * distortedY (note: V uses subtraction)
 */

import type { ResidualWithJacobian, Point3D, Quaternion } from '../types';

/** Epsilon for numerical differentiation */
const NUMERICAL_EPS = 1e-6;

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
  /** Whether the camera's Z-axis is reflected */
  isZReflected?: boolean;
}

/**
 * Compute a single residual component (U or V) for numerical differentiation.
 */
function computeResidualComponent(
  worldPointIndices: [number, number, number],
  cameraPosIndices: [number, number, number],
  quaternionIndices: [number, number, number, number],
  focalLengthIndex: number,
  config: ReprojectionWithIntrinsicsConfig,
  variables: number[],
  isU: boolean
): number {
  const { aspectRatio, cx, cy, k1, k2, k3, p1, p2, observedU, observedV, isZReflected } = config;

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
  const focalLength = variables[focalLengthIndex];

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

  // Focal lengths
  const fx = focalLength;
  const fy = focalLength * aspectRatio;

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

  return {
    id,
    name: 'ReprojectionWithIntrinsics',
    residualCount: 2,
    variableIndices,

    computeResiduals(variables: number[]): number[] {
      const residualU = computeResidualComponent(
        worldPointIndices, cameraPosIndices, quaternionIndices,
        focalLengthIndex, config, variables, true
      );
      const residualV = computeResidualComponent(
        worldPointIndices, cameraPosIndices, quaternionIndices,
        focalLengthIndex, config, variables, false
      );
      return [residualU, residualV];
    },

    computeJacobian(variables: number[]): number[][] {
      // Use numerical gradients for correctness
      const allIndices = [...worldPointIndices, ...cameraPosIndices, ...quaternionIndices, focalLengthIndex];
      const gradientsU: number[] = [];
      const gradientsV: number[] = [];

      for (const idx of allIndices) {
        const varsPlus = [...variables];
        const varsMinus = [...variables];
        varsPlus[idx] += NUMERICAL_EPS;
        varsMinus[idx] -= NUMERICAL_EPS;

        const uPlus = computeResidualComponent(
          worldPointIndices, cameraPosIndices, quaternionIndices,
          focalLengthIndex, config, varsPlus, true
        );
        const uMinus = computeResidualComponent(
          worldPointIndices, cameraPosIndices, quaternionIndices,
          focalLengthIndex, config, varsMinus, true
        );
        const gradU = (uPlus - uMinus) / (2 * NUMERICAL_EPS);
        gradientsU.push(isFinite(gradU) ? gradU : 0);

        const vPlus = computeResidualComponent(
          worldPointIndices, cameraPosIndices, quaternionIndices,
          focalLengthIndex, config, varsPlus, false
        );
        const vMinus = computeResidualComponent(
          worldPointIndices, cameraPosIndices, quaternionIndices,
          focalLengthIndex, config, varsMinus, false
        );
        const gradV = (vPlus - vMinus) / (2 * NUMERICAL_EPS);
        gradientsV.push(isFinite(gradV) ? gradV : 0);
      }

      return [gradientsU, gradientsV];
    },
  };
}
