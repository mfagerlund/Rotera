/**
 * Distance constraint residual function.
 *
 * Residual: (actual_distance - target_distance) / target_distance
 * Uses relative error so constraints of different scales are weighted equally.
 * A 10% error on a 10m constraint has the same weight as 10% error on a 1m constraint.
 */

import { V, Value } from 'scalar-autograd';
import type { DistanceConstraint } from '../../entities/constraints/distance-constraint';
import type { ValueMap } from '../IOptimizable';

export function computeDistanceResiduals(
  constraint: DistanceConstraint,
  valueMap: ValueMap
): Value[] {
  const pointAVec = valueMap.points.get(constraint.pointA);
  const pointBVec = valueMap.points.get(constraint.pointB);

  if (!pointAVec || !pointBVec) {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      console.warn(`Distance constraint: points not found in valueMap`);
    }
    return [];
  }

  const targetDistance = constraint.targetDistance;

  // Guard against zero target (would cause division by zero)
  if (targetDistance === 0) {
    return [];
  }

  // Calculate actual distance using Vec3 API
  const diff = pointBVec.sub(pointAVec);
  const dist = diff.magnitude;

  // Relative residual = (actual - target) / target
  // This normalizes errors so 10% error has same weight regardless of scale
  const residual = V.div(V.sub(dist, V.C(targetDistance)), V.C(targetDistance));

  return [residual];
}
