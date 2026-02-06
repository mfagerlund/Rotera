/**
 * Plain-number camera projection (no autodiff).
 *
 * Used for computing reprojected positions after optimization completes.
 */

import { reprojection_u_dcam } from '../residuals/gradients/reprojection-u-dcam-gradient';
import { reprojection_v_dcam } from '../residuals/gradients/reprojection-v-dcam-gradient';
import { quatRotate } from './quat-rotate';

type Point3D = { x: number; y: number; z: number };
type Quaternion = { w: number; x: number; y: number; z: number };

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
