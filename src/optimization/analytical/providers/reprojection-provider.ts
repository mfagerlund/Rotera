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
 * Variables affected: world point (3), camera position (3), quaternion (4) = 10 total
 */

import { AnalyticalResidualProvider } from '../types';
import { reprojection_u_dcam_grad } from '../../residuals/gradients/reprojection-u-dcam-gradient';
import { reprojection_v_dcam_grad } from '../../residuals/gradients/reprojection-v-dcam-gradient';

type Point3D = { x: number; y: number; z: number };
type Quaternion = { w: number; x: number; y: number; z: number };

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

export interface ReprojectionObservation {
  observedU: number;
  observedV: number;
}

/**
 * Rotate a vector by a quaternion: v' = q * v * q^(-1)
 * Using the formula: v' = v + 2*w*(q_xyz × v) + 2*(q_xyz × (q_xyz × v))
 */
function quatRotate(q: Quaternion, v: Point3D): Point3D {
  // Cross product: c = q_xyz × v
  const cx = q.y * v.z - q.z * v.y;
  const cy = q.z * v.x - q.x * v.z;
  const cz = q.x * v.y - q.y * v.x;

  // Cross product: d = q_xyz × c
  const dx = q.y * cz - q.z * cy;
  const dy = q.z * cx - q.x * cz;
  const dz = q.x * cy - q.y * cx;

  // Result: v + 2*w*c + 2*d
  return {
    x: v.x + 2 * q.w * cx + 2 * dx,
    y: v.y + 2 * q.w * cy + 2 * dy,
    z: v.z + 2 * q.w * cz + 2 * dz,
  };
}

/**
 * Compute dcam/dt where cam = quatRotate(q, t) and t = worldPoint - cameraPos
 * This is the rotation matrix corresponding to quaternion q
 */
function quatRotationMatrix(q: Quaternion): number[][] {
  const w = q.w, x = q.x, y = q.y, z = q.z;
  const w2 = w * w, x2 = x * x, y2 = y * y, z2 = z * z;

  // Rotation matrix from quaternion
  return [
    [w2 + x2 - y2 - z2, 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), w2 - x2 + y2 - z2, 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), w2 - x2 - y2 + z2],
  ];
}

/**
 * Compute dcam/dq where cam = quatRotate(q, t)
 * Returns [dcam/dw, dcam/dx, dcam/dy, dcam/dz] each as Point3D
 *
 * cam = t + 2*w*c + 2*d where:
 *   c = q_xyz × t
 *   d = q_xyz × c
 */
function quatRotateGradient(q: Quaternion, t: Point3D): { dw: Point3D; dx: Point3D; dy: Point3D; dz: Point3D } {
  const { w, x, y, z } = q;

  // c = q_xyz × t
  const cx = y * t.z - z * t.y;
  const cy = z * t.x - x * t.z;
  const cz = x * t.y - y * t.x;

  // d/dw(cam) = 2 * c
  const dw: Point3D = {
    x: 2 * cx,
    y: 2 * cy,
    z: 2 * cz,
  };

  // d(cam)/d(q.x) = 2*w*(d(c)/d(q.x)) + 2*(d(d)/d(q.x))
  // d(cx)/d(q.x) = 0
  // d(cy)/d(q.x) = -t.z
  // d(cz)/d(q.x) = t.y
  //
  // d(dx)/d(q.x) = y*(d(cz)/d(q.x)) - z*(d(cy)/d(q.x)) = y*t.y + z*t.z
  // d(dy)/d(q.x) = z*(d(cx)/d(q.x)) - cz - x*(d(cz)/d(q.x)) = -cz - x*t.y
  // d(dz)/d(q.x) = cy + x*(d(cy)/d(q.x)) - y*(d(cx)/d(q.x)) = cy - x*t.z
  //
  // d(cam.x)/d(q.x) = 2*w*0 + 2*(y*t.y + z*t.z)
  // d(cam.y)/d(q.x) = 2*w*(-t.z) + 2*(-cz - x*t.y)
  // d(cam.z)/d(q.x) = 2*w*t.y + 2*(cy - x*t.z)
  const dx: Point3D = {
    x: 2 * (y * t.y + z * t.z),
    y: 2 * (w * (-t.z) + (-cz - x * t.y)),
    z: 2 * (w * t.y + (cy - x * t.z)),
  };

  // d(cam)/d(q.y) = 2*w*(d(c)/d(q.y)) + 2*(d(d)/d(q.y))
  // d(cx)/d(q.y) = t.z
  // d(cy)/d(q.y) = 0
  // d(cz)/d(q.y) = -t.x
  //
  // d(dx)/d(q.y) = cz + y*(d(cz)/d(q.y)) - z*(d(cy)/d(q.y)) = cz - y*t.x
  // d(dy)/d(q.y) = z*(d(cx)/d(q.y)) - x*(d(cz)/d(q.y)) = z*t.z + x*t.x
  // d(dz)/d(q.y) = x*(d(cy)/d(q.y)) - cx - y*(d(cx)/d(q.y)) = -cx - y*t.z
  //
  // d(cam.x)/d(q.y) = 2*w*t.z + 2*(cz - y*t.x)
  // d(cam.y)/d(q.y) = 2*w*0 + 2*(z*t.z + x*t.x)
  // d(cam.z)/d(q.y) = 2*w*(-t.x) + 2*(-cx - y*t.z)
  const dy: Point3D = {
    x: 2 * (w * t.z + (cz - y * t.x)),
    y: 2 * (z * t.z + x * t.x),
    z: 2 * (w * (-t.x) + (-cx - y * t.z)),
  };

  // d(cam)/d(q.z) = 2*w*(d(c)/d(q.z)) + 2*(d(d)/d(q.z))
  // d(cx)/d(q.z) = -t.y
  // d(cy)/d(q.z) = t.x
  // d(cz)/d(q.z) = 0
  //
  // d(dx)/d(q.z) = y*(d(cz)/d(q.z)) - cy - z*(d(cy)/d(q.z)) = -cy - z*t.x
  // d(dy)/d(q.z) = cx + z*(d(cx)/d(q.z)) - x*(d(cz)/d(q.z)) = cx - z*t.y
  // d(dz)/d(q.z) = x*(d(cy)/d(q.z)) - y*(d(cx)/d(q.z)) = x*t.x + y*t.y
  //
  // d(cam.x)/d(q.z) = 2*w*(-t.y) + 2*(-cy - z*t.x)
  // d(cam.y)/d(q.z) = 2*w*t.x + 2*(cx - z*t.y)
  // d(cam.z)/d(q.z) = 2*w*0 + 2*(x*t.x + y*t.y)
  const dz: Point3D = {
    x: 2 * (w * (-t.y) + (-cy - z * t.x)),
    y: 2 * (w * t.x + (cx - z * t.y)),
    z: 2 * (x * t.x + y * t.y),
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

/**
 * Creates a single reprojection residual provider (U or V component) using chain rule.
 */
function createReprojectionComponentProvider(
  worldPointIndices: readonly [number, number, number],
  cameraPosIndices: readonly [number, number, number],
  quatIndices: readonly [number, number, number, number],
  fx: number,
  cx: number,
  k1: number,
  k2: number,
  k3: number,
  p1: number,
  p2: number,
  observed: number,
  getWorldPoint: (variables: Float64Array) => Point3D,
  getCameraPos: (variables: Float64Array) => Point3D,
  getQuat: (variables: Float64Array) => Quaternion,
  dcamGradFn: DcamGradFn
): AnalyticalResidualProvider {
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

  return {
    variableIndices: activeIndices,

    computeResidual(variables: Float64Array): number {
      const wp = getWorldPoint(variables);
      const cp = getCameraPos(variables);
      const q = getQuat(variables);

      // Transform to camera frame
      const t = { x: wp.x - cp.x, y: wp.y - cp.y, z: wp.z - cp.z };
      const cam = quatRotate(q, t);

      const { value } = dcamGradFn(cam.x, cam.y, cam.z, fx, cx, k1, k2, k3, p1, p2, observed);
      return value;
    },

    computeGradient(variables: Float64Array): Float64Array {
      const wp = getWorldPoint(variables);
      const cp = getCameraPos(variables);
      const q = getQuat(variables);

      // Transform to camera frame
      const t = { x: wp.x - cp.x, y: wp.y - cp.y, z: wp.z - cp.z };
      const cam = quatRotate(q, t);

      // Get dcam gradient
      const { dcamX, dcamY, dcamZ } = dcamGradFn(cam.x, cam.y, cam.z, fx, cx, k1, k2, k3, p1, p2, observed);

      // Rotation matrix: dcam/dt
      const R = quatRotationMatrix(q);

      // dcam/dq
      const quatGrad = quatRotateGradient(q, t);

      const grad = new Float64Array(activeIndices.length);

      // World point gradient: dR/dwp = R (since cam = R * (wp - cp))
      // dResidual/dwp = [dcamX, dcamY, dcamZ] * R
      if (wpMap[0] >= 0 || wpMap[1] >= 0 || wpMap[2] >= 0) {
        const dwpX = dcamX * R[0][0] + dcamY * R[1][0] + dcamZ * R[2][0];
        const dwpY = dcamX * R[0][1] + dcamY * R[1][1] + dcamZ * R[2][1];
        const dwpZ = dcamX * R[0][2] + dcamY * R[1][2] + dcamZ * R[2][2];

        if (wpMap[0] >= 0) grad[wpMap[0]] = dwpX;
        if (wpMap[1] >= 0) grad[wpMap[1]] = dwpY;
        if (wpMap[2] >= 0) grad[wpMap[2]] = dwpZ;
      }

      // Camera position gradient: dcam/dcp = -R
      // dResidual/dcp = [dcamX, dcamY, dcamZ] * (-R)
      if (cpMap[0] >= 0 || cpMap[1] >= 0 || cpMap[2] >= 0) {
        const dcpX = -(dcamX * R[0][0] + dcamY * R[1][0] + dcamZ * R[2][0]);
        const dcpY = -(dcamX * R[0][1] + dcamY * R[1][1] + dcamZ * R[2][1]);
        const dcpZ = -(dcamX * R[0][2] + dcamY * R[1][2] + dcamZ * R[2][2]);

        if (cpMap[0] >= 0) grad[cpMap[0]] = dcpX;
        if (cpMap[1] >= 0) grad[cpMap[1]] = dcpY;
        if (cpMap[2] >= 0) grad[cpMap[2]] = dcpZ;
      }

      // Quaternion gradient: dResidual/dq = [dcamX, dcamY, dcamZ] · dcam/dq
      if (qMap[0] >= 0) {
        grad[qMap[0]] = dcamX * quatGrad.dw.x + dcamY * quatGrad.dw.y + dcamZ * quatGrad.dw.z;
      }
      if (qMap[1] >= 0) {
        grad[qMap[1]] = dcamX * quatGrad.dx.x + dcamY * quatGrad.dx.y + dcamZ * quatGrad.dx.z;
      }
      if (qMap[2] >= 0) {
        grad[qMap[2]] = dcamX * quatGrad.dy.x + dcamY * quatGrad.dy.y + dcamZ * quatGrad.dy.z;
      }
      if (qMap[3] >= 0) {
        grad[qMap[3]] = dcamX * quatGrad.dz.x + dcamY * quatGrad.dz.y + dcamZ * quatGrad.dz.z;
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
  getQuat: (variables: Float64Array) => Quaternion
): AnalyticalResidualProvider {
  const { fx, cx, k1, k2, k3, p1, p2 } = intrinsics;
  return createReprojectionComponentProvider(
    worldPointIndices,
    cameraPosIndices,
    quatIndices,
    fx,
    cx,
    k1,
    k2,
    k3,
    p1,
    p2,
    observedU,
    getWorldPoint,
    getCameraPos,
    getQuat,
    reprojection_u_dcam_grad
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
  getQuat: (variables: Float64Array) => Quaternion
): AnalyticalResidualProvider {
  const { fy, cy, k1, k2, k3, p1, p2 } = intrinsics;
  return createReprojectionComponentProvider(
    worldPointIndices,
    cameraPosIndices,
    quatIndices,
    fy,
    cy,
    k1,
    k2,
    k3,
    p1,
    p2,
    observedV,
    getWorldPoint,
    getCameraPos,
    getQuat,
    reprojection_v_dcam_grad
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
  getQuat: (variables: Float64Array) => Quaternion
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
      getQuat
    ),
    createReprojectionVProvider(
      worldPointIndices,
      cameraPosIndices,
      quatIndices,
      intrinsics,
      observation.observedV,
      getWorldPoint,
      getCameraPos,
      getQuat
    ),
  ];
}
