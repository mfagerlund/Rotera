/**
 * Angle constraint residual function.
 *
 * Residual: (actual_angle - target_angle) in radians
 * Should be 0 when the angle at the vertex equals the target.
 */

import { V, Value, Vec3 } from 'scalar-autograd';
import type { AngleConstraint } from '../../entities/constraints/angle-constraint';
import type { ValueMap } from '../IOptimizable';

export function computeAngleResiduals(
  constraint: AngleConstraint,
  valueMap: ValueMap
): Value[] {
  const pointAId = constraint.pointAId;
  const vertexId = constraint.vertexId;
  const pointCId = constraint.pointCId;

  // Find points in valueMap
  let pointA: Vec3 | undefined;
  let vertex: Vec3 | undefined;
  let pointC: Vec3 | undefined;

  for (const [point, vec] of valueMap.points) {
    if (point.getId() === pointAId) pointA = vec;
    if (point.getId() === vertexId) vertex = vec;
    if (point.getId() === pointCId) pointC = vec;
  }

  if (!pointA || !vertex || !pointC) {
    console.warn(`Angle constraint: points not found in valueMap`);
    return [];
  }

  const targetAngleDegrees = constraint.targetAngle;
  const targetAngleRadians = (targetAngleDegrees * Math.PI) / 180;

  // Calculate vectors from vertex using Vec3 API
  const v1 = pointA.sub(vertex);
  const v2 = pointC.sub(vertex);

  // Calculate angle using Vec3.angleBetween
  const actualAngle = Vec3.angleBetween(v1, v2);

  // Residual = actual - target
  const residual = V.sub(actualAngle, V.C(targetAngleRadians));

  return [residual];
}
