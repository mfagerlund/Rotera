/**
 * Reprojection Provider
 *
 * Creates residual providers for reprojection constraints.
 * Each image point contributes 2 residuals (U and V).
 *
 * Uses chain rule composition:
 * 1. Transform world point to camera frame: cam = R(q) * (worldPoint - cameraPos)
 * 2. Use dcam gradient for projection: dResidual/dcam
 * 3. Chain rule: dResidual/dX = dResidual/dcam * dcam/dX
 *
 * Supports both fixed and optimized intrinsics:
 * - Fixed intrinsics (index = -1): uses locked values
 * - Variable intrinsics (index >= 0): reads from variable array, computes numerical gradients
 *
 * Variables affected:
 * - world point (3), camera position (3), quaternion (4) = 10 base variables
 * - focalLength, cx, cy when optimizing intrinsics = up to 3 more
 */

import { AnalyticalResidualProvider } from '../types';
import { reprojection_u_dcam_grad } from '../../residuals/gradients/reprojection-u-dcam-gradient';
import { reprojection_v_dcam_grad } from '../../residuals/gradients/reprojection-v-dcam-gradient';

type Point3D = { x: number; y: number; z: number };
type Quaternion = { w: number; x: number; y: number; z: number };

/**
 * Camera intrinsics VALUES (for computing residuals)
 */
export interface CameraIntrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  k1: number;
  k2: number;
  k3: number;
  p1: number;
  p2: number;
}

/**
 * Camera intrinsics INDICES for optimization
 * -1 means locked (use value from CameraIntrinsics)
 * >= 0 means variable index in optimization array
 */
export interface CameraIntrinsicsIndices {
  focalLength: number; // affects both fx and fy
  cx: number;
  cy: number;
  // aspectRatio, k1, k2, k3, p1, p2 - not optimized for now
}

export interface ReprojectionObservation {
  observedU: number;
  observedV: number;
}

export interface ReprojectionFlags {
  /**
   * When true, negate all camera-frame coordinates before projection.
   * This handles the Z-reflected coordinate system from handedness correction.
   * Must match the autodiff behavior in camera-projection.ts.
   */
  isZReflected?: boolean;
}

/**
 * Rotate a vector by a quaternion: v' = q * v * q*
 *
 * This uses the GENERAL formula (works for non-unit quaternions):
 * v' = 2*(q_vec · v)*q_vec + (w² - |q_vec|²)*v + 2*w*(q_vec × v)
 *
 * The previous formula v' = v + 2*w*(q×v) + 2*(q×(q×v)) ONLY works for unit quaternions.
 * When the quaternion is not normalized (as happens during optimization),
 * the general formula must be used to match the autodiff's q * v * q* computation.
 */
function quatRotate(q: Quaternion, v: Point3D): Point3D {
  const { w, x: qx, y: qy, z: qz } = q;

  // q_vec · v (dot product)
  const dot = qx * v.x + qy * v.y + qz * v.z;

  // |q_vec|² (squared magnitude of vector part)
  const qVecSq = qx * qx + qy * qy + qz * qz;

  // w² - |q_vec|²
  const wSqMinusQVecSq = w * w - qVecSq;

  // q_vec × v (cross product)
  const cx = qy * v.z - qz * v.y;
  const cy = qz * v.x - qx * v.z;
  const cz = qx * v.y - qy * v.x;

  // v' = 2*(q_vec · v)*q_vec + (w² - |q_vec|²)*v + 2*w*(q_vec × v)
  return {
    x: 2 * dot * qx + wSqMinusQVecSq * v.x + 2 * w * cx,
    y: 2 * dot * qy + wSqMinusQVecSq * v.y + 2 * w * cy,
    z: 2 * dot * qz + wSqMinusQVecSq * v.z + 2 * w * cz,
  };
}

/**
 * Compute dcam/dt where cam = quatRotate(q, t) and t = worldPoint - cameraPos
 *
 * For the general quaternion formula:
 * cam = 2*(q_vec · t)*q_vec + (w² - |q_vec|²)*t + 2*w*(q_vec × t)
 *
 * The derivative with respect to t is:
 * dcam/dt = 2*q_vec*q_vec^T + (w² - |q_vec|²)*I + 2*w*[q_vec×]
 *
 * where [q_vec×] is the skew-symmetric cross-product matrix.
 */
function quatRotateDerivative_dt(q: Quaternion): number[][] {
  const { w, x: qx, y: qy, z: qz } = q;

  // w² - |q_vec|²
  const wSqMinusQVecSq = w * w - (qx * qx + qy * qy + qz * qz);

  // dcam/dt = 2*q_vec*q_vec^T + (w² - |q_vec|²)*I + 2*w*[q_vec×]
  //
  // 2*q_vec*q_vec^T is the outer product:
  // [2*qx*qx  2*qx*qy  2*qx*qz]
  // [2*qy*qx  2*qy*qy  2*qy*qz]
  // [2*qz*qx  2*qz*qy  2*qz*qz]
  //
  // (w² - |q_vec|²)*I:
  // [wSqMinusQVecSq  0               0              ]
  // [0               wSqMinusQVecSq  0              ]
  // [0               0               wSqMinusQVecSq ]
  //
  // 2*w*[q_vec×]:
  // [0         -2*w*qz    2*w*qy ]
  // [2*w*qz    0         -2*w*qx ]
  // [-2*w*qy   2*w*qx    0       ]

  return [
    [2 * qx * qx + wSqMinusQVecSq,     2 * qx * qy - 2 * w * qz,      2 * qx * qz + 2 * w * qy],
    [2 * qy * qx + 2 * w * qz,         2 * qy * qy + wSqMinusQVecSq,  2 * qy * qz - 2 * w * qx],
    [2 * qz * qx - 2 * w * qy,         2 * qz * qy + 2 * w * qx,      2 * qz * qz + wSqMinusQVecSq],
  ];
}

/**
 * Compute dcam/dq where cam = quatRotate(q, t)
 * Returns [dcam/dw, dcam/dx, dcam/dy, dcam/dz] each as Point3D
 *
 * For the general formula:
 * cam = 2*(q_vec · t)*q_vec + (w² - |q_vec|²)*t + 2*w*(q_vec × t)
 *
 * Derivatives computed analytically for each component.
 */
function quatRotateGradient(q: Quaternion, t: Point3D): { dw: Point3D; dx: Point3D; dy: Point3D; dz: Point3D } {
  const { w, x: qx, y: qy, z: qz } = q;

  // dot = q_vec · t
  const dot = qx * t.x + qy * t.y + qz * t.z;

  // c = q_vec × t (cross product)
  const cx = qy * t.z - qz * t.y;
  const cy = qz * t.x - qx * t.z;
  const cz = qx * t.y - qy * t.x;

  // d(cam)/dw = 2*w*t + 2*(q_vec × t)
  const dw: Point3D = {
    x: 2 * w * t.x + 2 * cx,
    y: 2 * w * t.y + 2 * cy,
    z: 2 * w * t.z + 2 * cz,
  };

  // d(cam)/dqx:
  // cam.x: 2*dot
  // cam.y: 2*t.x*qy - 2*qx*t.y - 2*w*t.z
  // cam.z: 2*t.x*qz - 2*qx*t.z + 2*w*t.y
  const dx: Point3D = {
    x: 2 * dot,
    y: 2 * t.x * qy - 2 * qx * t.y - 2 * w * t.z,
    z: 2 * t.x * qz - 2 * qx * t.z + 2 * w * t.y,
  };

  // d(cam)/dqy:
  // cam.x: 2*t.y*qx - 2*qy*t.x + 2*w*t.z
  // cam.y: 2*dot
  // cam.z: 2*t.y*qz - 2*qy*t.z - 2*w*t.x
  const dy: Point3D = {
    x: 2 * t.y * qx - 2 * qy * t.x + 2 * w * t.z,
    y: 2 * dot,
    z: 2 * t.y * qz - 2 * qy * t.z - 2 * w * t.x,
  };

  // d(cam)/dqz:
  // cam.x: 2*t.z*qx - 2*qz*t.x - 2*w*t.y
  // cam.y: 2*t.z*qy - 2*qz*t.y + 2*w*t.x
  // cam.z: 2*dot
  const dz: Point3D = {
    x: 2 * t.z * qx - 2 * qz * t.x - 2 * w * t.y,
    y: 2 * t.z * qy - 2 * qz * t.y + 2 * w * t.x,
    z: 2 * dot,
  };

  return { dw, dx, dy, dz };
}

type DcamGradFn = (
  camX: number,
  camY: number,
  camZ: number,
  fx: number,
  cx: number,
  k1: number,
  k2: number,
  k3: number,
  p1: number,
  p2: number,
  observed: number
) => { value: number; dcamX: number; dcamY: number; dcamZ: number };

// Numerical differentiation epsilon
const NUM_GRAD_EPS = 1e-7;

// Behind-camera penalty constants (must match autodiff in ImagePoint.ts)
const NEAR_PLANE = 0.1;
const PENALTY_SCALE = 500;

/**
 * Creates a single reprojection residual provider (U or V component) using chain rule.
 *
 * When intrinsicsIndices are provided and valid (>= 0), the provider:
 * - Reads intrinsics values from the variable array
 * - Computes numerical gradients for intrinsics parameters
 *
 * @param isUComponent - true for U residual, false for V
 */
function createReprojectionComponentProvider(
  worldPointIndices: readonly [number, number, number],
  cameraPosIndices: readonly [number, number, number],
  quatIndices: readonly [number, number, number, number],
  intrinsics: CameraIntrinsics,
  intrinsicsIndices: CameraIntrinsicsIndices | undefined,
  observed: number,
  getWorldPoint: (variables: Float64Array) => Point3D,
  getCameraPos: (variables: Float64Array) => Point3D,
  getQuat: (variables: Float64Array) => Quaternion,
  dcamGradFn: DcamGradFn,
  isUComponent: boolean,
  flags?: ReprojectionFlags
): AnalyticalResidualProvider {
  const isZReflected = flags?.isZReflected ?? false;
  // Build active indices and mapping
  const activeIndices: number[] = [];
  const wpMap: [number, number, number] = [-1, -1, -1];
  const cpMap: [number, number, number] = [-1, -1, -1];
  const qMap: [number, number, number, number] = [-1, -1, -1, -1];

  // World point indices
  for (let i = 0; i < 3; i++) {
    if (worldPointIndices[i] >= 0) {
      wpMap[i] = activeIndices.length;
      activeIndices.push(worldPointIndices[i]);
    }
  }

  // Camera position indices
  for (let i = 0; i < 3; i++) {
    if (cameraPosIndices[i] >= 0) {
      cpMap[i] = activeIndices.length;
      activeIndices.push(cameraPosIndices[i]);
    }
  }

  // Quaternion indices
  for (let i = 0; i < 4; i++) {
    if (quatIndices[i] >= 0) {
      qMap[i] = activeIndices.length;
      activeIndices.push(quatIndices[i]);
    }
  }

  // Intrinsics indices (for numerical gradients)
  // Only add if we're optimizing them
  let focalLengthMap = -1;
  let cxMap = -1;
  let cyMap = -1;

  if (intrinsicsIndices) {
    if (intrinsicsIndices.focalLength >= 0) {
      focalLengthMap = activeIndices.length;
      activeIndices.push(intrinsicsIndices.focalLength);
    }
    // cx affects U only, cy affects V only
    if (isUComponent && intrinsicsIndices.cx >= 0) {
      cxMap = activeIndices.length;
      activeIndices.push(intrinsicsIndices.cx);
    }
    if (!isUComponent && intrinsicsIndices.cy >= 0) {
      cyMap = activeIndices.length;
      activeIndices.push(intrinsicsIndices.cy);
    }
  }

  /**
   * Get intrinsics values, reading from variables array when optimizing
   */
  function getIntrinsicsValues(variables: Float64Array): CameraIntrinsics {
    let fx = intrinsics.fx;
    let fy = intrinsics.fy;
    const cx = (intrinsicsIndices && intrinsicsIndices.cx >= 0)
      ? variables[intrinsicsIndices.cx]
      : intrinsics.cx;
    const cy = (intrinsicsIndices && intrinsicsIndices.cy >= 0)
      ? variables[intrinsicsIndices.cy]
      : intrinsics.cy;

    // When optimizing focal length, read it and recompute fx, fy
    if (intrinsicsIndices && intrinsicsIndices.focalLength >= 0) {
      const focalLength = variables[intrinsicsIndices.focalLength];
      // fx = focalLength, fy = focalLength * aspectRatio
      // aspectRatio = fy / fx originally
      const aspectRatio = intrinsics.fy / intrinsics.fx;
      fx = focalLength;
      fy = focalLength * aspectRatio;
    }

    return {
      fx,
      fy,
      cx,
      cy,
      k1: intrinsics.k1,
      k2: intrinsics.k2,
      k3: intrinsics.k3,
      p1: intrinsics.p1,
      p2: intrinsics.p2,
    };
  }

  /**
   * Compute the residual value
   */
  function computeResidualWithIntrinsics(
    variables: Float64Array,
    currentIntrinsics: CameraIntrinsics
  ): number {
    const wp = getWorldPoint(variables);
    const cp = getCameraPos(variables);
    const q = getQuat(variables);

    // Transform to camera frame
    const t = { x: wp.x - cp.x, y: wp.y - cp.y, z: wp.z - cp.z };
    let cam = quatRotate(q, t);

    // When isZReflected, negate all camera-frame coordinates
    if (isZReflected) {
      cam = { x: -cam.x, y: -cam.y, z: -cam.z };
    }

    const fParam = isUComponent ? currentIntrinsics.fx : currentIntrinsics.fy;
    const cParam = isUComponent ? currentIntrinsics.cx : currentIntrinsics.cy;

    const { value } = dcamGradFn(
      cam.x,
      cam.y,
      cam.z,
      fParam,
      cParam,
      currentIntrinsics.k1,
      currentIntrinsics.k2,
      currentIntrinsics.k3,
      currentIntrinsics.p1,
      currentIntrinsics.p2,
      observed
    );
    return value;
  }

  /**
   * Compute the behind-camera penalty gradient using chain rule.
   * penalty = (NEAR_PLANE - camZ) * PENALTY_SCALE
   * d(penalty)/dX = -PENALTY_SCALE * dcamZ/dX
   */
  function computePenaltyGradient(
    q: Quaternion,
    t: Point3D
  ): Float64Array {
    const grad = new Float64Array(activeIndices.length);

    // Derivative of quatRotate with respect to t
    const R = quatRotateDerivative_dt(q);

    // dcam/dq
    const quatGrad = quatRotateGradient(q, t);

    // d(penalty)/dcamZ = -PENALTY_SCALE
    // d(penalty)/dX = -PENALTY_SCALE * dcamZ/dX
    const dPenalty_dcamZ = -PENALTY_SCALE;

    // World point gradient: dcamZ/dwp = R[2][0..2]
    if (wpMap[0] >= 0) grad[wpMap[0]] = dPenalty_dcamZ * R[2][0];
    if (wpMap[1] >= 0) grad[wpMap[1]] = dPenalty_dcamZ * R[2][1];
    if (wpMap[2] >= 0) grad[wpMap[2]] = dPenalty_dcamZ * R[2][2];

    // Camera position gradient: dcamZ/dcp = -R[2][0..2]
    if (cpMap[0] >= 0) grad[cpMap[0]] = dPenalty_dcamZ * (-R[2][0]);
    if (cpMap[1] >= 0) grad[cpMap[1]] = dPenalty_dcamZ * (-R[2][1]);
    if (cpMap[2] >= 0) grad[cpMap[2]] = dPenalty_dcamZ * (-R[2][2]);

    // Quaternion gradient: dcamZ/dq
    if (qMap[0] >= 0) grad[qMap[0]] = dPenalty_dcamZ * quatGrad.dw.z;
    if (qMap[1] >= 0) grad[qMap[1]] = dPenalty_dcamZ * quatGrad.dx.z;
    if (qMap[2] >= 0) grad[qMap[2]] = dPenalty_dcamZ * quatGrad.dy.z;
    if (qMap[3] >= 0) grad[qMap[3]] = dPenalty_dcamZ * quatGrad.dz.z;

    // Intrinsics don't affect penalty (penalty doesn't use projection)
    // focalLengthMap, cxMap, cyMap gradients are 0

    return grad;
  }

  return {
    variableIndices: activeIndices,

    computeResidual(variables: Float64Array): number {
      const wp = getWorldPoint(variables);
      const cp = getCameraPos(variables);
      const q = getQuat(variables);

      // Transform to camera frame
      const t = { x: wp.x - cp.x, y: wp.y - cp.y, z: wp.z - cp.z };
      let cam = quatRotate(q, t);

      // When isZReflected, negate all camera-frame coordinates
      // This matches autodiff behavior in camera-projection.ts:269-271
      if (isZReflected) {
        cam = { x: -cam.x, y: -cam.y, z: -cam.z };
      }

      // Behind-camera check - must match autodiff behavior in ImagePoint.ts
      if (cam.z < NEAR_PLANE) {
        // Return penalty instead of projection residual
        const penalty = (NEAR_PLANE - cam.z) * PENALTY_SCALE;
        return penalty;
      }

      const currentIntrinsics = getIntrinsicsValues(variables);
      return computeResidualWithIntrinsics(variables, currentIntrinsics);
    },

    computeGradient(variables: Float64Array): Float64Array {
      const wp = getWorldPoint(variables);
      const cp = getCameraPos(variables);
      const q = getQuat(variables);

      // Transform to camera frame
      const t = { x: wp.x - cp.x, y: wp.y - cp.y, z: wp.z - cp.z };
      let cam = quatRotate(q, t);

      // When isZReflected, negate all camera-frame coordinates
      // This matches autodiff behavior in camera-projection.ts:269-271
      if (isZReflected) {
        cam = { x: -cam.x, y: -cam.y, z: -cam.z };
      }

      // Behind-camera check - use penalty gradient
      // NOTE: When isZReflected, penalty gradient also needs sign flip
      if (cam.z < NEAR_PLANE) {
        const penaltyGrad = computePenaltyGradient(q, t);
        // When isZReflected, cam = -quatRotate(q, t), so dcam/dX flips sign
        // d(penalty)/d(camZ) = -PENALTY_SCALE is still the same
        // But dcamZ/dX = -d(quatRotate).z/dX, so the whole gradient flips
        if (isZReflected) {
          for (let i = 0; i < penaltyGrad.length; i++) {
            penaltyGrad[i] = -penaltyGrad[i];
          }
        }
        return penaltyGrad;
      }

      const currentIntrinsics = getIntrinsicsValues(variables);

      const fParam = isUComponent ? currentIntrinsics.fx : currentIntrinsics.fy;
      const cParam = isUComponent ? currentIntrinsics.cx : currentIntrinsics.cy;

      // Get dcam gradient - evaluated at the (possibly negated) camera point
      const { dcamX, dcamY, dcamZ } = dcamGradFn(
        cam.x,
        cam.y,
        cam.z,
        fParam,
        cParam,
        currentIntrinsics.k1,
        currentIntrinsics.k2,
        currentIntrinsics.k3,
        currentIntrinsics.p1,
        currentIntrinsics.p2,
        observed
      );

      // Derivative of quatRotate with respect to t
      const R = quatRotateDerivative_dt(q);

      // dcam/dq (computed from the original transformation, without negation)
      const quatGrad = quatRotateGradient(q, t);

      const grad = new Float64Array(activeIndices.length);

      // Sign multiplier for isZReflected
      // When isZReflected: cam = -quatRotate(q, t)
      // So dcam/dwp = -R, dcam/dcp = R, dcam/dq = -quatGrad
      const signFlip = isZReflected ? -1 : 1;

      // World point gradient: cam = signFlip * R * (wp - cp)
      // dcam/dwp = signFlip * R
      // dResidual/dwp = [dcamX, dcamY, dcamZ] * (signFlip * R)
      if (wpMap[0] >= 0 || wpMap[1] >= 0 || wpMap[2] >= 0) {
        const dwpX = signFlip * (dcamX * R[0][0] + dcamY * R[1][0] + dcamZ * R[2][0]);
        const dwpY = signFlip * (dcamX * R[0][1] + dcamY * R[1][1] + dcamZ * R[2][1]);
        const dwpZ = signFlip * (dcamX * R[0][2] + dcamY * R[1][2] + dcamZ * R[2][2]);

        if (wpMap[0] >= 0) grad[wpMap[0]] = dwpX;
        if (wpMap[1] >= 0) grad[wpMap[1]] = dwpY;
        if (wpMap[2] >= 0) grad[wpMap[2]] = dwpZ;
      }

      // Camera position gradient: dcam/dcp = -signFlip * R
      // dResidual/dcp = [dcamX, dcamY, dcamZ] * (-signFlip * R)
      if (cpMap[0] >= 0 || cpMap[1] >= 0 || cpMap[2] >= 0) {
        const dcpX = -signFlip * (dcamX * R[0][0] + dcamY * R[1][0] + dcamZ * R[2][0]);
        const dcpY = -signFlip * (dcamX * R[0][1] + dcamY * R[1][1] + dcamZ * R[2][1]);
        const dcpZ = -signFlip * (dcamX * R[0][2] + dcamY * R[1][2] + dcamZ * R[2][2]);

        if (cpMap[0] >= 0) grad[cpMap[0]] = dcpX;
        if (cpMap[1] >= 0) grad[cpMap[1]] = dcpY;
        if (cpMap[2] >= 0) grad[cpMap[2]] = dcpZ;
      }

      // Quaternion gradient: dcam/dq = signFlip * quatGrad
      // dResidual/dq = [dcamX, dcamY, dcamZ] · (signFlip * dcam/dq)
      if (qMap[0] >= 0) {
        grad[qMap[0]] = signFlip * (dcamX * quatGrad.dw.x + dcamY * quatGrad.dw.y + dcamZ * quatGrad.dw.z);
      }
      if (qMap[1] >= 0) {
        grad[qMap[1]] = signFlip * (dcamX * quatGrad.dx.x + dcamY * quatGrad.dx.y + dcamZ * quatGrad.dx.z);
      }
      if (qMap[2] >= 0) {
        grad[qMap[2]] = signFlip * (dcamX * quatGrad.dy.x + dcamY * quatGrad.dy.y + dcamZ * quatGrad.dy.z);
      }
      if (qMap[3] >= 0) {
        grad[qMap[3]] = signFlip * (dcamX * quatGrad.dz.x + dcamY * quatGrad.dz.y + dcamZ * quatGrad.dz.z);
      }

      // Intrinsics gradients (numerical differentiation)
      // Only compute for parameters we're actually optimizing
      const baseResidual = computeResidualWithIntrinsics(variables, currentIntrinsics);

      if (focalLengthMap >= 0 && intrinsicsIndices!.focalLength >= 0) {
        // Perturb focalLength
        const perturbedIntrinsics = { ...currentIntrinsics };
        const aspectRatio = currentIntrinsics.fy / currentIntrinsics.fx;
        perturbedIntrinsics.fx = currentIntrinsics.fx + NUM_GRAD_EPS;
        perturbedIntrinsics.fy = perturbedIntrinsics.fx * aspectRatio;
        const perturbedResidual = computeResidualWithIntrinsics(variables, perturbedIntrinsics);
        grad[focalLengthMap] = (perturbedResidual - baseResidual) / NUM_GRAD_EPS;
      }

      if (cxMap >= 0 && intrinsicsIndices!.cx >= 0) {
        // Perturb cx
        const perturbedIntrinsics = { ...currentIntrinsics };
        perturbedIntrinsics.cx = currentIntrinsics.cx + NUM_GRAD_EPS;
        const perturbedResidual = computeResidualWithIntrinsics(variables, perturbedIntrinsics);
        grad[cxMap] = (perturbedResidual - baseResidual) / NUM_GRAD_EPS;
      }

      if (cyMap >= 0 && intrinsicsIndices!.cy >= 0) {
        // Perturb cy
        const perturbedIntrinsics = { ...currentIntrinsics };
        perturbedIntrinsics.cy = currentIntrinsics.cy + NUM_GRAD_EPS;
        const perturbedResidual = computeResidualWithIntrinsics(variables, perturbedIntrinsics);
        grad[cyMap] = (perturbedResidual - baseResidual) / NUM_GRAD_EPS;
      }

      return grad;
    },
  };
}

/**
 * Creates a reprojection U residual provider.
 */
export function createReprojectionUProvider(
  worldPointIndices: readonly [number, number, number],
  cameraPosIndices: readonly [number, number, number],
  quatIndices: readonly [number, number, number, number],
  intrinsics: CameraIntrinsics,
  observedU: number,
  getWorldPoint: (variables: Float64Array) => Point3D,
  getCameraPos: (variables: Float64Array) => Point3D,
  getQuat: (variables: Float64Array) => Quaternion,
  intrinsicsIndices?: CameraIntrinsicsIndices,
  flags?: ReprojectionFlags
): AnalyticalResidualProvider {
  return createReprojectionComponentProvider(
    worldPointIndices,
    cameraPosIndices,
    quatIndices,
    intrinsics,
    intrinsicsIndices,
    observedU,
    getWorldPoint,
    getCameraPos,
    getQuat,
    reprojection_u_dcam_grad,
    true, // isUComponent
    flags
  );
}

/**
 * Creates a reprojection V residual provider.
 */
export function createReprojectionVProvider(
  worldPointIndices: readonly [number, number, number],
  cameraPosIndices: readonly [number, number, number],
  quatIndices: readonly [number, number, number, number],
  intrinsics: CameraIntrinsics,
  observedV: number,
  getWorldPoint: (variables: Float64Array) => Point3D,
  getCameraPos: (variables: Float64Array) => Point3D,
  getQuat: (variables: Float64Array) => Quaternion,
  intrinsicsIndices?: CameraIntrinsicsIndices,
  flags?: ReprojectionFlags
): AnalyticalResidualProvider {
  return createReprojectionComponentProvider(
    worldPointIndices,
    cameraPosIndices,
    quatIndices,
    intrinsics,
    intrinsicsIndices,
    observedV,
    getWorldPoint,
    getCameraPos,
    getQuat,
    reprojection_v_dcam_grad,
    false, // isUComponent
    flags
  );
}

/**
 * Creates both U and V reprojection providers for a single image point.
 */
export function createReprojectionProviders(
  worldPointIndices: readonly [number, number, number],
  cameraPosIndices: readonly [number, number, number],
  quatIndices: readonly [number, number, number, number],
  intrinsics: CameraIntrinsics,
  observation: ReprojectionObservation,
  getWorldPoint: (variables: Float64Array) => Point3D,
  getCameraPos: (variables: Float64Array) => Point3D,
  getQuat: (variables: Float64Array) => Quaternion,
  intrinsicsIndices?: CameraIntrinsicsIndices,
  flags?: ReprojectionFlags
): [AnalyticalResidualProvider, AnalyticalResidualProvider] {
  return [
    createReprojectionUProvider(
      worldPointIndices,
      cameraPosIndices,
      quatIndices,
      intrinsics,
      observation.observedU,
      getWorldPoint,
      getCameraPos,
      getQuat,
      intrinsicsIndices,
      flags
    ),
    createReprojectionVProvider(
      worldPointIndices,
      cameraPosIndices,
      quatIndices,
      intrinsics,
      observation.observedV,
      getWorldPoint,
      getCameraPos,
      getQuat,
      intrinsicsIndices,
      flags
    ),
  ];
}
