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
  const pointAId = constraint.pointAId;
  const pointBId = constraint.pointBId;

  // Find points in valueMap
  let pointA: Vec3 | undefined;
  let pointB: Vec3 | undefined;

  for (const [point, vec] of valueMap.points) {
    if (point.getId() === pointAId) pointA = vec;
    if (point.getId() === pointBId) pointB = vec;
  }

  if (!pointA || !pointB) {
    console.warn(`Distance constraint: points not found in valueMap`);
    return [];
  }

  const targetDistance = constraint.targetDistance;

  // Calculate actual distance using Vec3 API
  const diff = pointB.sub(pointA);
  const dist = diff.magnitude;

  // Residual = actual - target
  const residual = V.sub(dist, V.C(targetDistance));

  return [residual];
}
