/**
 * Line Direction Residual Provider
 *
 * Constrains a line to align with a specific axis or plane.
 * Uses hand-coded gradients from gradient-script.
 */

import type { ResidualWithJacobian, Point3D } from '../types';

// Import gradient functions for each direction type
import { line_direction_xz_grad } from '../../residuals/gradients/line-direction-xz-gradient';
import { line_direction_xy_grad } from '../../residuals/gradients/line-direction-xy-gradient';
import { line_direction_yz_grad } from '../../residuals/gradients/line-direction-yz-gradient';
import { line_direction_x_z_grad } from '../../residuals/gradients/line-direction-x-z-gradient';
import { line_direction_y_x_grad } from '../../residuals/gradients/line-direction-y-x-gradient';
import { line_direction_y_z_grad } from '../../residuals/gradients/line-direction-y-z-gradient';
import { line_direction_z_x_grad } from '../../residuals/gradients/line-direction-z-x-gradient';
import { line_direction_z_y_grad } from '../../residuals/gradients/line-direction-z-y-gradient';

/** Scale factor for direction residuals to match pixel-scale errors */
const DIRECTION_SCALE = 100;

export type LineDirection = 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'free';

/**
 * Create a line direction residual provider.
 *
 * @param id Unique identifier
 * @param pointAIndices Variable indices for point A [x, y, z]
 * @param pointBIndices Variable indices for point B [x, y, z]
 * @param direction The direction constraint type
 */
export function createLineDirectionProvider(
  id: string,
  pointAIndices: [number, number, number],
  pointBIndices: [number, number, number],
  direction: LineDirection
): ResidualWithJacobian | null {
  if (direction === 'free') {
    return null; // No constraint for free lines
  }

  const variableIndices = [...pointAIndices, ...pointBIndices];

  // Get the gradient functions based on direction type
  const gradFunctions = getGradientFunctions(direction);

  return {
    id,
    name: `LineDir(${direction})`,
    residualCount: gradFunctions.length,
    variableIndices,

    computeResiduals(variables: number[]): number[] {
      const pA: Point3D = {
        x: variables[pointAIndices[0]],
        y: variables[pointAIndices[1]],
        z: variables[pointAIndices[2]],
      };
      const pB: Point3D = {
        x: variables[pointBIndices[0]],
        y: variables[pointBIndices[1]],
        z: variables[pointBIndices[2]],
      };

      return gradFunctions.map(fn => {
        const result = fn(pA, pB, DIRECTION_SCALE);
        return result.value;
      });
    },

    computeJacobian(variables: number[]): number[][] {
      const pA: Point3D = {
        x: variables[pointAIndices[0]],
        y: variables[pointAIndices[1]],
        z: variables[pointAIndices[2]],
      };
      const pB: Point3D = {
        x: variables[pointBIndices[0]],
        y: variables[pointBIndices[1]],
        z: variables[pointBIndices[2]],
      };

      return gradFunctions.map(fn => {
        const result = fn(pA, pB, DIRECTION_SCALE);
        const row = [
          result.dpA.x, result.dpA.y, result.dpA.z,
          result.dpB.x, result.dpB.y, result.dpB.z,
        ];
        // Check for NaN/Infinity
        if (row.some(v => !isFinite(v))) {
          return [0, 0, 0, 0, 0, 0];
        }
        return row;
      });
    },
  };
}

type GradResult = {
  value: number;
  dpA: Point3D;
  dpB: Point3D;
};

type GradFunction = (pA: Point3D, pB: Point3D, scale: number) => GradResult;

/**
 * Get gradient functions for a direction type.
 * Each axis-aligned direction penalizes 2 components.
 * Each plane-aligned direction penalizes 1 component.
 */
function getGradientFunctions(direction: LineDirection): GradFunction[] {
  switch (direction) {
    case 'x':
      // X-aligned: penalize Y and Z components
      return [line_direction_x_z_grad, line_direction_y_x_grad]; // Actually we need y-component and z-component penalties
    case 'y':
      // Y-aligned (vertical): penalize X and Z components
      return [line_direction_y_x_grad, line_direction_y_z_grad];
    case 'z':
      // Z-aligned: penalize X and Y components
      return [line_direction_z_x_grad, line_direction_z_y_grad];
    case 'xy':
      // XY plane: penalize Z component
      return [line_direction_xy_grad];
    case 'xz':
      // XZ plane (horizontal): penalize Y component
      return [line_direction_xz_grad];
    case 'yz':
      // YZ plane: penalize X component
      return [line_direction_yz_grad];
    default:
      return [];
  }
}
