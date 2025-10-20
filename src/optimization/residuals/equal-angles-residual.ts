/**
 * Equal angles constraint residual function.
 *
 * Residual: All angles should be equal.
 * Returns (n-1) residuals where n is the number of angle triplets,
 * each residual = angle_i - angle_0 in radians.
 */

import { V, Value, Vec3 } from 'scalar-autograd';
import type { EqualAnglesConstraint } from '../../entities/constraints/equal-angles-constraint';
import type { ValueMap } from '../IOptimizable';
import type { PointId } from '../../types/ids';

export function computeEqualAnglesResiduals(
  constraint: EqualAnglesConstraint,
  valueMap: ValueMap
): Value[] {
  const angleTriplets = constraint.angleTriplets;

  if (angleTriplets.length < 2) {
    console.warn('Equal angles constraint requires at least 2 triplets');
    return [];
  }

  // Helper to find point in valueMap
  const findPoint = (pointId: PointId): Vec3 | undefined => {
    for (const [point, vec] of valueMap.points) {
      if (point.getId() === pointId) return vec;
    }
    return undefined;
  };

  // Calculate angle for a triplet [pointA, vertex, pointC] using Vec3 API
  const calculateAngle = (triplet: [PointId, PointId, PointId]): Value | undefined => {
    const pointA = findPoint(triplet[0]);
    const vertex = findPoint(triplet[1]);
    const pointC = findPoint(triplet[2]);

    if (!pointA || !vertex || !pointC) return undefined;

    // Calculate vectors from vertex using Vec3 API
    const v1 = pointA.sub(vertex);
    const v2 = pointC.sub(vertex);

    // Calculate angle using Vec3.angleBetween
    return Vec3.angleBetween(v1, v2);
  };

  // Calculate all angles
  const angles: Value[] = [];
  for (const triplet of angleTriplets) {
    const angle = calculateAngle(triplet);
    if (angle) {
      angles.push(angle);
    }
  }

  if (angles.length < 2) {
    console.warn('Equal angles constraint: not enough valid triplets found');
    return [];
  }

  // Create residuals: angle_i - angle_0 should all be 0
  const residuals: Value[] = [];
  const referenceAngle = angles[0];

  for (let i = 1; i < angles.length; i++) {
    residuals.push(V.sub(angles[i], referenceAngle));
  }

  return residuals;
}
