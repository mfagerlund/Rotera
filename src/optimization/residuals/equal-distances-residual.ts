/**
 * Equal distances constraint residual function.
 *
 * Residual: All pairwise distances should be equal.
 * Returns (n-1) residuals where n is the number of point pairs,
 * each residual = distance_i - distance_0.
 */

import { V, Value, Vec3 } from 'scalar-autograd';
import type { EqualDistancesConstraint } from '../../entities/constraints/equal-distances-constraint';
import type { ValueMap } from '../IOptimizable';
import type { PointId } from '../../types/ids';

export function computeEqualDistancesResiduals(
  constraint: EqualDistancesConstraint,
  valueMap: ValueMap
): Value[] {
  const distancePairs = constraint.distancePairs;

  if (distancePairs.length < 2) {
    console.warn('Equal distances constraint requires at least 2 pairs');
    return [];
  }

  // Helper to find point in valueMap
  const findPoint = (pointId: PointId): Vec3 | undefined => {
    for (const [point, vec] of valueMap.points) {
      if (point.getId() === pointId) return vec;
    }
    return undefined;
  };

  // Calculate distance for a pair using Vec3 API
  const calculateDistance = (pair: [PointId, PointId]): Value | undefined => {
    const p1 = findPoint(pair[0]);
    const p2 = findPoint(pair[1]);

    if (!p1 || !p2) return undefined;

    const diff = p2.sub(p1);
    return diff.magnitude;
  };

  // Calculate all distances
  const distances: Value[] = [];
  for (const pair of distancePairs) {
    const dist = calculateDistance(pair);
    if (dist) {
      distances.push(dist);
    }
  }

  if (distances.length < 2) {
    console.warn('Equal distances constraint: not enough valid pairs found');
    return [];
  }

  // Create residuals: distance_i - distance_0 should all be 0
  const residuals: Value[] = [];
  const referenceDist = distances[0];

  for (let i = 1; i < distances.length; i++) {
    residuals.push(V.sub(distances[i], referenceDist));
  }

  return residuals;
}
