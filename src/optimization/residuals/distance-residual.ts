/**
 * Distance constraint residual function.
 *
 * Residual: (actual_distance - target_distance)
 * Should be 0 when the distance between points equals the target.
 */

import { V, Value, Vec3 } from 'scalar-autograd';
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

  // Calculate actual distance using Vec3 API
  const diff = pointBVec.sub(pointAVec);
  const dist = diff.magnitude;

  // Residual = actual - target
  const residual = V.sub(dist, V.C(targetDistance));

  return [residual];
}
