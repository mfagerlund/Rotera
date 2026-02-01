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

/** Epsilon for numerical differentiation */
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
      // The analytical gradients have edge-case issues with quaternion rotation
      // that cause incorrect results for rotated cameras.
      // Numerical gradients are verified to match autodiff exactly.
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
