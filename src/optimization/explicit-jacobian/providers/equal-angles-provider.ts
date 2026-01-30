/**
 * Equal Angles Residual Provider
 *
 * Constrains multiple angle triplets to have equal angles.
 * Each triplet defines an angle: vertex at middle point, arms to endpoints.
 * Residual: angle1 - angle2 = 0 (for each triplet after the first)
 */

import type { ResidualWithJacobian } from '../types';
import { angle_residual, angle_residual_grad } from '../../residuals/gradients/angle-gradient';

type Idx3 = [number, number, number];

/**
 * Create an equal angles residual provider.
 * For n angle triplets, returns n-1 residuals.
 *
 * @param id Unique identifier
 * @param triplets Array of point triplet indices [[pointA, vertex, pointC], ...]
 *                 where vertex is the angle vertex
 */
export function createEqualAnglesProvider(
  id: string,
  triplets: Array<[Idx3, Idx3, Idx3]>
): ResidualWithJacobian | null {
  if (triplets.length < 2) return null;

  // Collect all variable indices
  const allIndices: number[] = [];
  for (const [pA, vertex, pC] of triplets) {
    allIndices.push(...pA, ...vertex, ...pC);
  }

  const residualCount = triplets.length - 1;

  return {
    id,
    name: 'EqualAngles',
    residualCount,
    variableIndices: allIndices,

    computeResiduals(variables: number[]): number[] {
      const angles: number[] = [];

      for (const [pA, vertex, pC] of triplets) {
        const pointA = { x: variables[pA[0]], y: variables[pA[1]], z: variables[pA[2]] };
        const vertexPt = { x: variables[vertex[0]], y: variables[vertex[1]], z: variables[vertex[2]] };
        const pointC = { x: variables[pC[0]], y: variables[pC[1]], z: variables[pC[2]] };

        // angle_residual returns angle - target, we want just the angle
        // So we pass target = 0 and add it back
        const residual = angle_residual(pointA, vertexPt, pointC, 0);
        angles.push(residual); // This is angle - 0 = angle
      }

      // Each residual is angle[i+1] - angle[0]
      const residuals: number[] = [];
      const refAngle = angles[0];

      for (let i = 1; i < angles.length; i++) {
        residuals.push(angles[i] - refAngle);
      }

      return residuals;
    },

    computeJacobian(variables: number[]): number[][] {
      const jacobian: number[][] = [];

      // Compute angle gradients for each triplet
      type GradResult = {
        dpointA: { x: number; y: number; z: number };
        dvertex: { x: number; y: number; z: number };
        dpointC: { x: number; y: number; z: number };
      };
      const gradients: GradResult[] = [];

      for (const [pA, vertex, pC] of triplets) {
        const pointA = { x: variables[pA[0]], y: variables[pA[1]], z: variables[pA[2]] };
        const vertexPt = { x: variables[vertex[0]], y: variables[vertex[1]], z: variables[vertex[2]] };
        const pointC = { x: variables[pC[0]], y: variables[pC[1]], z: variables[pC[2]] };

        const result = angle_residual_grad(pointA, vertexPt, pointC, 0);
        gradients.push(result);
      }

      // Build jacobian for each residual r_i = angle[i+1] - angle[0]
      for (let i = 1; i < triplets.length; i++) {
        const row = new Array(allIndices.length).fill(0);

        // Gradient from angle[0] (reference) - subtracted
        const refGrad = gradients[0];
        const refOffset = 0; // First triplet starts at index 0
        // pA: 0,1,2; vertex: 3,4,5; pC: 6,7,8
        row[refOffset + 0] = -refGrad.dpointA.x;
        row[refOffset + 1] = -refGrad.dpointA.y;
        row[refOffset + 2] = -refGrad.dpointA.z;
        row[refOffset + 3] = -refGrad.dvertex.x;
        row[refOffset + 4] = -refGrad.dvertex.y;
        row[refOffset + 5] = -refGrad.dvertex.z;
        row[refOffset + 6] = -refGrad.dpointC.x;
        row[refOffset + 7] = -refGrad.dpointC.y;
        row[refOffset + 8] = -refGrad.dpointC.z;

        // Gradient from angle[i] - added
        const curGrad = gradients[i];
        const curOffset = i * 9; // Each triplet adds 9 indices
        row[curOffset + 0] = curGrad.dpointA.x;
        row[curOffset + 1] = curGrad.dpointA.y;
        row[curOffset + 2] = curGrad.dpointA.z;
        row[curOffset + 3] = curGrad.dvertex.x;
        row[curOffset + 4] = curGrad.dvertex.y;
        row[curOffset + 5] = curGrad.dvertex.z;
        row[curOffset + 6] = curGrad.dpointC.x;
        row[curOffset + 7] = curGrad.dpointC.y;
        row[curOffset + 8] = curGrad.dpointC.z;

        jacobian.push(row);
      }

      return jacobian;
    },
  };
}
