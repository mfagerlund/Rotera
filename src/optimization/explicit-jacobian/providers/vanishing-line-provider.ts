/**
 * Vanishing Line Residual Provider
 *
 * Constrains the camera quaternion so that the predicted axis direction
 * (world axis rotated by camera quaternion) aligns with the observed
 * vanishing point direction from 2D lines.
 *
 * The residual is the angular error: 1 - cos(angle) between predicted
 * and observed directions. This is small (~0) when they align.
 *
 * Uses fully analytical Jacobian for both quaternion and focal length.
 */

import type { ResidualWithJacobian } from '../types';
import {
  vanishing_line_residual,
  vanishing_line_residual_grad,
  vanishing_line_with_focal_residual_grad,
} from '../../residuals/gradients/vanishing-line-gradient';

export type VanishingLineAxis = 'x' | 'y' | 'z';

export interface VanishingLineConfig {
  /** The world axis this vanishing point corresponds to */
  axis: VanishingLineAxis;
  /** Observed vanishing point u coordinate (pixels) */
  vpU: number;
  /** Observed vanishing point v coordinate (pixels) */
  vpV: number;
  /** Camera principal point X */
  cx: number;
  /** Camera principal point Y */
  cy: number;
  /** Weight for this constraint (default 0.02 for gentle nudge) */
  weight?: number;
}

/**
 * Create a vanishing line residual provider.
 * Returns 1 residual (weighted angular error).
 *
 * @param id Unique identifier
 * @param quaternionIndices Variable indices for camera rotation [w, x, y, z]
 * @param focalLengthIndex Variable index for focal length, or -1 if constant
 * @param constantFocalLength Focal length value if not optimized
 * @param config Vanishing line configuration
 */
export function createVanishingLineProvider(
  id: string,
  quaternionIndices: [number, number, number, number],
  focalLengthIndex: number,
  constantFocalLength: number,
  config: VanishingLineConfig
): ResidualWithJacobian {
  const { axis, vpU, vpV, cx, cy, weight = 0.02 } = config;

  // World axis direction
  const worldAxis = axis === 'x' ? { x: 1, y: 0, z: 0 } : axis === 'y' ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };

  // Build variable indices list
  const variableIndices =
    focalLengthIndex >= 0
      ? [...quaternionIndices, focalLengthIndex]
      : [...quaternionIndices];

  return {
    id,
    name: 'VanishingLine',
    residualCount: 1,
    variableIndices,

    computeResiduals(variables: number[]): number[] {
      const q = {
        w: variables[quaternionIndices[0]],
        x: variables[quaternionIndices[1]],
        y: variables[quaternionIndices[2]],
        z: variables[quaternionIndices[3]],
      };

      const f = focalLengthIndex >= 0 ? variables[focalLengthIndex] : constantFocalLength;

      // Observed VP direction (normalized camera coordinates)
      // Y is inverted because image Y points down, camera Y points up
      const obsU = (vpU - cx) / f;
      const obsV = (cy - vpV) / f;

      return [vanishing_line_residual(q, worldAxis, obsU, obsV, weight)];
    },

    computeJacobian(variables: number[]): number[][] {
      const q = {
        w: variables[quaternionIndices[0]],
        x: variables[quaternionIndices[1]],
        y: variables[quaternionIndices[2]],
        z: variables[quaternionIndices[3]],
      };

      const f = focalLengthIndex >= 0 ? variables[focalLengthIndex] : constantFocalLength;

      if (focalLengthIndex >= 0) {
        // Use the version with focal length gradient
        const { dq, df } = vanishing_line_with_focal_residual_grad(
          q,
          worldAxis,
          vpU,
          vpV,
          cx,
          cy,
          f,
          weight
        );
        return [[dq.w, dq.x, dq.y, dq.z, df]];
      } else {
        // Quaternion only
        const obsU = (vpU - cx) / f;
        const obsV = (cy - vpV) / f;
        const { dq } = vanishing_line_residual_grad(q, worldAxis, obsU, obsV, weight);
        return [[dq.w, dq.x, dq.y, dq.z]];
      }
    },
  };
}
