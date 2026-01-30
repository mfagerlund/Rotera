// Vanishing Line Gradient - Hand-coded analytical Jacobian
// Verified against numerical differentiation

import type { Point3D, Quaternion, QuaternionGrad } from './gradient-types';

/**
 * Compute vanishing line residual: weight * (1 - cos(angle))
 * where angle is between predicted and observed directions
 */
export function vanishing_line_residual(
  q: Quaternion,
  axis: Point3D,
  obsU: number,
  obsV: number,
  weight: number
): number {
  // Rotate world axis by quaternion: pred = axis + 2*qw*c + 2*d
  // where c = q.xyz × axis, d = q.xyz × c
  const cx = q.y * axis.z - q.z * axis.y;
  const cy = q.z * axis.x - q.x * axis.z;
  const cz = q.x * axis.y - q.y * axis.x;
  const dx = q.y * cz - q.z * cy;
  const dy = q.z * cx - q.x * cz;
  const dz = q.x * cy - q.y * cx;
  const predX = axis.x + 2 * q.w * cx + 2 * dx;
  const predY = axis.y + 2 * q.w * cy + 2 * dy;
  const predZ = axis.z + 2 * q.w * cz + 2 * dz;

  // Observed direction (obsZ = 1)
  const predLen = Math.sqrt(predX * predX + predY * predY + predZ * predZ);
  const obsLen = Math.sqrt(obsU * obsU + obsV * obsV + 1);
  const dotNum = predX * obsU + predY * obsV + predZ;
  const dot = dotNum / (predLen * obsLen);

  return weight * (1 - dot);
}

/**
 * Compute vanishing line residual with gradients for quaternion
 */
export function vanishing_line_residual_grad(
  q: Quaternion,
  axis: Point3D,
  obsU: number,
  obsV: number,
  weight: number
): { value: number; dq: QuaternionGrad } {
  // Compute intermediate values
  const cx = q.y * axis.z - q.z * axis.y;
  const cy = q.z * axis.x - q.x * axis.z;
  const cz = q.x * axis.y - q.y * axis.x;
  const dx = q.y * cz - q.z * cy;
  const dy = q.z * cx - q.x * cz;
  const dz = q.x * cy - q.y * cx;
  const qw2 = 2 * q.w;

  const predX = axis.x + qw2 * cx + 2 * dx;
  const predY = axis.y + qw2 * cy + 2 * dy;
  const predZ = axis.z + qw2 * cz + 2 * dz;

  const predLenSq = predX * predX + predY * predY + predZ * predZ;
  const obsLenSq = obsU * obsU + obsV * obsV + 1;
  const predLen = Math.sqrt(predLenSq);
  const obsLen = Math.sqrt(obsLenSq);
  const scale = predLen * obsLen;
  const dotNum = predX * obsU + predY * obsV + predZ;
  const dot = dotNum / scale;
  const value = weight * (1 - dot);

  // Gradient computation using chain rule
  // dr/dq = -weight * d(dot)/dq
  // d(dot)/dq = d(dotNum/scale)/dq = (d(dotNum)/dq * scale - dotNum * d(scale)/dq) / scale^2
  // d(scale)/dq = obsLen * d(predLen)/dq = obsLen * d(predLenSq)/dq / (2*predLen)
  // d(dotNum)/dq = d(predX)/dq * obsU + d(predY)/dq * obsV + d(predZ)/dq

  const scaleSq = scale * scale;
  const twoPredLen = 2 * predLen;

  // d(pred)/d(qw) = 2*c
  const dpredX_dqw = 2 * cx;
  const dpredY_dqw = 2 * cy;
  const dpredZ_dqw = 2 * cz;
  const dDotNum_dqw = dpredX_dqw * obsU + dpredY_dqw * obsV + dpredZ_dqw;
  const dPredLenSq_dqw = 2 * predX * dpredX_dqw + 2 * predY * dpredY_dqw + 2 * predZ * dpredZ_dqw;
  const dPredLen_dqw = dPredLenSq_dqw / twoPredLen;
  const dScale_dqw = obsLen * dPredLen_dqw;
  const dDot_dqw = (dDotNum_dqw * scale - dotNum * dScale_dqw) / scaleSq;

  // d(c)/d(qx) = [0, -az, ay], d(d)/d(qx) = ex × c + q.xyz × dc/dqx
  // dd/dqx = [qy*ay + qz*az, -cz - qx*ay, cy - qx*az]
  const ddx_dqx = q.y * axis.y + q.z * axis.z;
  const ddy_dqx = -cz - q.x * axis.y;
  const ddz_dqx = cy - q.x * axis.z;
  const dpredX_dqx = 2 * ddx_dqx;
  const dpredY_dqx = qw2 * (-axis.z) + 2 * ddy_dqx;
  const dpredZ_dqx = qw2 * axis.y + 2 * ddz_dqx;
  const dDotNum_dqx = dpredX_dqx * obsU + dpredY_dqx * obsV + dpredZ_dqx;
  const dPredLenSq_dqx = 2 * predX * dpredX_dqx + 2 * predY * dpredY_dqx + 2 * predZ * dpredZ_dqx;
  const dPredLen_dqx = dPredLenSq_dqx / twoPredLen;
  const dScale_dqx = obsLen * dPredLen_dqx;
  const dDot_dqx = (dDotNum_dqx * scale - dotNum * dScale_dqx) / scaleSq;

  // d(c)/d(qy) = [az, 0, -ax], d(d)/d(qy) = ey × c + q.xyz × dc/dqy
  // dd/dqy = [cz - qy*ax, qz*az + qx*ax, -cx - qy*az]
  const ddx_dqy = cz - q.y * axis.x;
  const ddy_dqy = q.z * axis.z + q.x * axis.x;
  const ddz_dqy = -cx - q.y * axis.z;
  const dpredX_dqy = qw2 * axis.z + 2 * ddx_dqy;
  const dpredY_dqy = 2 * ddy_dqy;
  const dpredZ_dqy = qw2 * (-axis.x) + 2 * ddz_dqy;
  const dDotNum_dqy = dpredX_dqy * obsU + dpredY_dqy * obsV + dpredZ_dqy;
  const dPredLenSq_dqy = 2 * predX * dpredX_dqy + 2 * predY * dpredY_dqy + 2 * predZ * dpredZ_dqy;
  const dPredLen_dqy = dPredLenSq_dqy / twoPredLen;
  const dScale_dqy = obsLen * dPredLen_dqy;
  const dDot_dqy = (dDotNum_dqy * scale - dotNum * dScale_dqy) / scaleSq;

  // d(c)/d(qz) = [-ay, ax, 0], d(d)/d(qz) = ez × c + q.xyz × dc/dqz
  // dd/dqz = [-cy - qz*ax, cx - qz*ay, qx*ax + qy*ay]
  const ddx_dqz = -cy - q.z * axis.x;
  const ddy_dqz = cx - q.z * axis.y;
  const ddz_dqz = q.x * axis.x + q.y * axis.y;
  const dpredX_dqz = qw2 * (-axis.y) + 2 * ddx_dqz;
  const dpredY_dqz = qw2 * axis.x + 2 * ddy_dqz;
  const dpredZ_dqz = 2 * ddz_dqz;
  const dDotNum_dqz = dpredX_dqz * obsU + dpredY_dqz * obsV + dpredZ_dqz;
  const dPredLenSq_dqz = 2 * predX * dpredX_dqz + 2 * predY * dpredY_dqz + 2 * predZ * dpredZ_dqz;
  const dPredLen_dqz = dPredLenSq_dqz / twoPredLen;
  const dScale_dqz = obsLen * dPredLen_dqz;
  const dDot_dqz = (dDotNum_dqz * scale - dotNum * dScale_dqz) / scaleSq;

  return {
    value,
    dq: {
      w: -weight * dDot_dqw,
      x: -weight * dDot_dqx,
      y: -weight * dDot_dqy,
      z: -weight * dDot_dqz,
    },
  };
}

/**
 * Compute vanishing line residual with gradients for quaternion AND focal length
 */
export function vanishing_line_with_focal_residual_grad(
  q: Quaternion,
  axis: Point3D,
  vpU: number,
  vpV: number,
  cx: number,
  cy: number,
  f: number,
  weight: number
): { value: number; dq: QuaternionGrad; df: number } {
  // Compute observed direction from VP coordinates
  const obsU = (vpU - cx) / f;
  const obsV = (cy - vpV) / f;

  // Get quaternion gradients using existing function
  const { value, dq } = vanishing_line_residual_grad(q, axis, obsU, obsV, weight);

  // Now compute df analytically
  // residual = weight * (1 - dot)
  // dot = dotNum / scale = (predX*obsU + predY*obsV + predZ) / (predLen * obsLen)
  // obsU = (vpU - cx) / f, obsV = (cy - vpV) / f
  // d(obsU)/df = -obsU/f, d(obsV)/df = -obsV/f
  //
  // d(dotNum)/df = predX * d(obsU)/df + predY * d(obsV)/df
  //              = -predX * obsU / f - predY * obsV / f
  //              = -(predX * obsU + predY * obsV) / f
  //
  // d(obsLen)/df = (obsU * d(obsU)/df + obsV * d(obsV)/df) / obsLen
  //              = -(obsU^2 + obsV^2) / (f * obsLen)
  //
  // d(scale)/df = predLen * d(obsLen)/df
  //
  // d(dot)/df = (d(dotNum)/df * scale - dotNum * d(scale)/df) / scale^2

  // Recompute needed values
  const cxq = q.y * axis.z - q.z * axis.y;
  const cyq = q.z * axis.x - q.x * axis.z;
  const czq = q.x * axis.y - q.y * axis.x;
  const dxq = q.y * czq - q.z * cyq;
  const dyq = q.z * cxq - q.x * czq;
  const dzq = q.x * cyq - q.y * cxq;
  const predX = axis.x + 2 * q.w * cxq + 2 * dxq;
  const predY = axis.y + 2 * q.w * cyq + 2 * dyq;
  const predZ = axis.z + 2 * q.w * czq + 2 * dzq;

  const predLen = Math.sqrt(predX * predX + predY * predY + predZ * predZ);
  const obsLen = Math.sqrt(obsU * obsU + obsV * obsV + 1);
  const scale = predLen * obsLen;
  const scaleSq = scale * scale;
  const dotNum = predX * obsU + predY * obsV + predZ;

  const dDotNum_df = -(predX * obsU + predY * obsV) / f;
  const dObsLen_df = -(obsU * obsU + obsV * obsV) / (f * obsLen);
  const dScale_df = predLen * dObsLen_df;
  const dDot_df = (dDotNum_df * scale - dotNum * dScale_df) / scaleSq;

  return {
    value,
    dq,
    df: -weight * dDot_df,
  };
}
