/**
 * Plain-number camera projection (no autodiff).
 *
 * Used for computing reprojected positions after optimization completes.
 */

import { reprojection_u_dcam } from '../residuals/gradients/reprojection-u-dcam-gradient';
import { reprojection_v_dcam } from '../residuals/gradients/reprojection-v-dcam-gradient';

type Point3D = { x: number; y: number; z: number };
type Quaternion = { w: number; x: number; y: number; z: number };

/**
 * Rotate a vector by a quaternion: v' = q * v * q*
 * Uses the general formula (works for non-unit quaternions).
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
 * Camera intrinsics for plain-number projection.
 */
export interface PlainCameraIntrinsics {
  fx: number;  // focal length in x
  fy: number;  // focal length in y
  cx: number;  // principal point x
  cy: number;  // principal point y
  k1: number;  // radial distortion k1
  k2: number;  // radial distortion k2
  k3: number;  // radial distortion k3
  p1: number;  // tangential distortion p1
  p2: number;  // tangential distortion p2
}

/**
 * Project a world point to pixel coordinates using plain numbers.
 *
 * @param worldPoint - 3D world coordinates
 * @param cameraPos - Camera position in world coordinates
 * @param cameraRot - Camera rotation as quaternion [w, x, y, z]
 * @param intrinsics - Camera intrinsic parameters
 * @param isZReflected - If true, negate camera-frame coordinates
 * @returns [u, v] pixel coordinates, or null if point is behind camera
 */
export function projectPointToPixel(
  worldPoint: [number, number, number],
  cameraPos: [number, number, number],
  cameraRot: [number, number, number, number],
  intrinsics: PlainCameraIntrinsics,
  isZReflected: boolean = false
): [number, number] | null {
  // Transform to camera frame
  const t: Point3D = {
    x: worldPoint[0] - cameraPos[0],
    y: worldPoint[1] - cameraPos[1],
    z: worldPoint[2] - cameraPos[2],
  };

  const q: Quaternion = {
    w: cameraRot[0],
    x: cameraRot[1],
    y: cameraRot[2],
    z: cameraRot[3],
  };

  let cam = quatRotate(q, t);

  // When isZReflected, negate all camera-frame coordinates
  if (isZReflected) {
    cam = { x: -cam.x, y: -cam.y, z: -cam.z };
  }

  // Behind-camera check
  const NEAR_PLANE = 0.1;
  if (cam.z < NEAR_PLANE) {
    return null;
  }

  // Project to pixel using the dcam functions
  // reprojection_u_dcam returns (u - observedU), so u = result + observedU
  // We pass observedU=0 to get just the projected u
  const u = reprojection_u_dcam(
    cam.x, cam.y, cam.z,
    intrinsics.fx, intrinsics.cx,
    intrinsics.k1, intrinsics.k2, intrinsics.k3,
    intrinsics.p1, intrinsics.p2,
    0  // observedU = 0 to get projected u
  );

  const v = reprojection_v_dcam(
    cam.x, cam.y, cam.z,
    intrinsics.fy, intrinsics.cy,
    intrinsics.k1, intrinsics.k2, intrinsics.k3,
    intrinsics.p1, intrinsics.p2,
    0  // observedV = 0 to get projected v
  );

  return [u, v];
}
