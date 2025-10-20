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
  const pointAVec = valueMap.points.get(constraint.pointA);
  const vertexVec = valueMap.points.get(constraint.vertex);
  const pointCVec = valueMap.points.get(constraint.pointC);

  if (!pointAVec || !vertexVec || !pointCVec) {
    console.warn(`Angle constraint: points not found in valueMap`);
    return [];
  }

  const targetAngleDegrees = constraint.targetAngle;
  const targetAngleRadians = (targetAngleDegrees * Math.PI) / 180;

  // Calculate vectors from vertex using Vec3 API
  const v1 = pointAVec.sub(vertexVec);
  const v2 = pointCVec.sub(vertexVec);

  // Calculate angle using Vec3.angleBetween
  const actualAngle = Vec3.angleBetween(v1, v2);

  // Residual = actual - target
  const residual = V.sub(actualAngle, V.C(targetAngleRadians));

  return [residual];
}
