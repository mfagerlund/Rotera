/**
 * Equal Angles Provider
 *
 * Creates residual providers for equal angles constraint.
 * For N angle triplets, creates N-1 residuals: angle[i] - angle[i+1]
 */

import { AnalyticalResidualProvider } from '../types';

type Point3D = { x: number; y: number; z: number };

/**
 * Compute angle at vertex (in radians) and its gradient with respect to all three points.
 * Uses atan2(cross magnitude, dot product) for numerical stability.
 */
function computeAngleAndGradient(
  pointA: Point3D,
  vertex: Point3D,
  pointC: Point3D
): {
  angle: number;
  dpointA: Point3D;
  dvertex: Point3D;
  dpointC: Point3D;
} {
  // v1 = pointA - vertex
  const v1x = pointA.x - vertex.x;
  const v1y = pointA.y - vertex.y;
  const v1z = pointA.z - vertex.z;

  // v2 = pointC - vertex
  const v2x = pointC.x - vertex.x;
  const v2y = pointC.y - vertex.y;
  const v2z = pointC.z - vertex.z;

  // dot = v1 · v2
  const dot = v1x * v2x + v1y * v2y + v1z * v2z;

  // cross = v1 × v2
  const cx = v1y * v2z - v1z * v2y;
  const cy = v1z * v2x - v1x * v2z;
  const cz = v1x * v2y - v1y * v2x;
  const crossMag = Math.sqrt(cx * cx + cy * cy + cz * cz);

  // angle = atan2(crossMag, dot)
  const angle = Math.atan2(crossMag, dot);

  // Gradients using chain rule
  // d(angle)/d(v1) and d(angle)/d(v2)
  // atan2(y, x) gradient: d/dy = x/(x²+y²), d/dx = -y/(x²+y²)
  const denom = dot * dot + crossMag * crossMag;
  const denomSafe = denom > 1e-20 ? denom : 1e-20;

  const dAngle_dCrossMag = dot / denomSafe;
  const dAngle_dDot = -crossMag / denomSafe;

  // d(crossMag)/d(v1) and d(crossMag)/d(v2)
  const invCrossMag = crossMag > 1e-10 ? 1 / crossMag : 0;

  // d(crossMag)/d(v1x) = (cy * (-v2z) + cz * v2y) / crossMag (via chain rule)
  // This gets complex, let me use a more direct approach

  // d(cx)/d(v1y) = v2z, d(cx)/d(v1z) = -v2y
  // d(cy)/d(v1z) = v2x, d(cy)/d(v1x) = -v2z
  // d(cz)/d(v1x) = v2y, d(cz)/d(v1y) = -v2x

  // d(crossMag)/d(v1x) = (cy * d(cy)/d(v1x) + cz * d(cz)/d(v1x)) * invCrossMag
  //                    = (cy * (-v2z) + cz * v2y) * invCrossMag
  const dCrossMag_dv1x = (cy * (-v2z) + cz * v2y) * invCrossMag;
  const dCrossMag_dv1y = (cx * v2z + cz * (-v2x)) * invCrossMag;
  const dCrossMag_dv1z = (cx * (-v2y) + cy * v2x) * invCrossMag;

  const dCrossMag_dv2x = (cy * v1z + cz * (-v1y)) * invCrossMag;
  const dCrossMag_dv2y = (cx * (-v1z) + cz * v1x) * invCrossMag;
  const dCrossMag_dv2z = (cx * v1y + cy * (-v1x)) * invCrossMag;

  // d(dot)/d(v1) = v2, d(dot)/d(v2) = v1
  const dDot_dv1x = v2x;
  const dDot_dv1y = v2y;
  const dDot_dv1z = v2z;

  const dDot_dv2x = v1x;
  const dDot_dv2y = v1y;
  const dDot_dv2z = v1z;

  // d(angle)/d(v1) = d(angle)/d(crossMag) * d(crossMag)/d(v1) + d(angle)/d(dot) * d(dot)/d(v1)
  const dAngle_dv1x = dAngle_dCrossMag * dCrossMag_dv1x + dAngle_dDot * dDot_dv1x;
  const dAngle_dv1y = dAngle_dCrossMag * dCrossMag_dv1y + dAngle_dDot * dDot_dv1y;
  const dAngle_dv1z = dAngle_dCrossMag * dCrossMag_dv1z + dAngle_dDot * dDot_dv1z;

  const dAngle_dv2x = dAngle_dCrossMag * dCrossMag_dv2x + dAngle_dDot * dDot_dv2x;
  const dAngle_dv2y = dAngle_dCrossMag * dCrossMag_dv2y + dAngle_dDot * dDot_dv2y;
  const dAngle_dv2z = dAngle_dCrossMag * dCrossMag_dv2z + dAngle_dDot * dDot_dv2z;

  // v1 = pointA - vertex, so d(angle)/d(pointA) = d(angle)/d(v1)
  // and d(angle)/d(vertex) = -d(angle)/d(v1) - d(angle)/d(v2)
  return {
    angle,
    dpointA: { x: dAngle_dv1x, y: dAngle_dv1y, z: dAngle_dv1z },
    dvertex: {
      x: -dAngle_dv1x - dAngle_dv2x,
      y: -dAngle_dv1y - dAngle_dv2y,
      z: -dAngle_dv1z - dAngle_dv2z,
    },
    dpointC: { x: dAngle_dv2x, y: dAngle_dv2y, z: dAngle_dv2z },
  };
}

interface AngleTripletInfo {
  pointAIndices: readonly [number, number, number];
  vertexIndices: readonly [number, number, number];
  pointCIndices: readonly [number, number, number];
  getPointA: (variables: Float64Array) => Point3D;
  getVertex: (variables: Float64Array) => Point3D;
  getPointC: (variables: Float64Array) => Point3D;
}

/**
 * Creates providers for equal angles constraint.
 * For N angle triplets, creates N-1 residuals representing angle[i] - angle[i+1].
 *
 * @param triplets Array of angle triplet info (indices and getters)
 * @returns Array of providers (one for each consecutive triplet difference)
 */
export function createEqualAnglesProviders(
  triplets: AngleTripletInfo[]
): AnalyticalResidualProvider[] {
  if (triplets.length < 2) {
    return [];
  }

  const providers: AnalyticalResidualProvider[] = [];

  // Create a residual for each consecutive pair: angle[i] - angle[i+1]
  for (let i = 0; i < triplets.length - 1; i++) {
    const triplet1 = triplets[i];
    const triplet2 = triplets[i + 1];

    // Build active indices for both triplets
    const activeIndices: number[] = [];
    const indexMap = new Map<number, number>(); // global index -> local index

    const addIndex = (idx: number) => {
      if (idx >= 0 && !indexMap.has(idx)) {
        indexMap.set(idx, activeIndices.length);
        activeIndices.push(idx);
      }
    };

    // Add indices from triplet 1
    for (let j = 0; j < 3; j++) {
      addIndex(triplet1.pointAIndices[j]);
      addIndex(triplet1.vertexIndices[j]);
      addIndex(triplet1.pointCIndices[j]);
    }
    // Add indices from triplet 2
    for (let j = 0; j < 3; j++) {
      addIndex(triplet2.pointAIndices[j]);
      addIndex(triplet2.vertexIndices[j]);
      addIndex(triplet2.pointCIndices[j]);
    }

    // Create maps for gradient assignment
    const pA1Map = triplet1.pointAIndices.map(idx => idx >= 0 ? indexMap.get(idx)! : -1);
    const v1Map = triplet1.vertexIndices.map(idx => idx >= 0 ? indexMap.get(idx)! : -1);
    const pC1Map = triplet1.pointCIndices.map(idx => idx >= 0 ? indexMap.get(idx)! : -1);
    const pA2Map = triplet2.pointAIndices.map(idx => idx >= 0 ? indexMap.get(idx)! : -1);
    const v2Map = triplet2.vertexIndices.map(idx => idx >= 0 ? indexMap.get(idx)! : -1);
    const pC2Map = triplet2.pointCIndices.map(idx => idx >= 0 ? indexMap.get(idx)! : -1);

    providers.push({
      variableIndices: activeIndices,

      computeResidual(variables: Float64Array): number {
        const pA1 = triplet1.getPointA(variables);
        const v1 = triplet1.getVertex(variables);
        const pC1 = triplet1.getPointC(variables);
        const pA2 = triplet2.getPointA(variables);
        const v2 = triplet2.getVertex(variables);
        const pC2 = triplet2.getPointC(variables);

        const { angle: angle1 } = computeAngleAndGradient(pA1, v1, pC1);
        const { angle: angle2 } = computeAngleAndGradient(pA2, v2, pC2);

        return angle1 - angle2;
      },

      computeGradient(variables: Float64Array): Float64Array {
        const pA1 = triplet1.getPointA(variables);
        const v1 = triplet1.getVertex(variables);
        const pC1 = triplet1.getPointC(variables);
        const pA2 = triplet2.getPointA(variables);
        const v2 = triplet2.getVertex(variables);
        const pC2 = triplet2.getPointC(variables);

        const { dpointA: dpA1, dvertex: dv1, dpointC: dpC1 } = computeAngleAndGradient(pA1, v1, pC1);
        const { dpointA: dpA2, dvertex: dv2, dpointC: dpC2 } = computeAngleAndGradient(pA2, v2, pC2);

        const grad = new Float64Array(activeIndices.length);

        // Gradient of angle1 (positive contribution)
        if (pA1Map[0] >= 0) grad[pA1Map[0]] += dpA1.x;
        if (pA1Map[1] >= 0) grad[pA1Map[1]] += dpA1.y;
        if (pA1Map[2] >= 0) grad[pA1Map[2]] += dpA1.z;
        if (v1Map[0] >= 0) grad[v1Map[0]] += dv1.x;
        if (v1Map[1] >= 0) grad[v1Map[1]] += dv1.y;
        if (v1Map[2] >= 0) grad[v1Map[2]] += dv1.z;
        if (pC1Map[0] >= 0) grad[pC1Map[0]] += dpC1.x;
        if (pC1Map[1] >= 0) grad[pC1Map[1]] += dpC1.y;
        if (pC1Map[2] >= 0) grad[pC1Map[2]] += dpC1.z;

        // Gradient of -angle2 (negative contribution)
        if (pA2Map[0] >= 0) grad[pA2Map[0]] -= dpA2.x;
        if (pA2Map[1] >= 0) grad[pA2Map[1]] -= dpA2.y;
        if (pA2Map[2] >= 0) grad[pA2Map[2]] -= dpA2.z;
        if (v2Map[0] >= 0) grad[v2Map[0]] -= dv2.x;
        if (v2Map[1] >= 0) grad[v2Map[1]] -= dv2.y;
        if (v2Map[2] >= 0) grad[v2Map[2]] -= dv2.z;
        if (pC2Map[0] >= 0) grad[pC2Map[0]] -= dpC2.x;
        if (pC2Map[1] >= 0) grad[pC2Map[1]] -= dpC2.y;
        if (pC2Map[2] >= 0) grad[pC2Map[2]] -= dpC2.z;

        return grad;
      },
    });
  }

  return providers;
}
