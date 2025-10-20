/**
 * Fixed point constraint residual function.
 *
 * Residual: Distance from point to target position should be zero.
 * Returns [dx, dy, dz] where each component should be 0 when constraint is satisfied.
 */

import { V, Value, Vec3 } from 'scalar-autograd';
import type { FixedPointConstraint } from '../../entities/constraints/fixed-point-constraint';
import type { ValueMap } from '../IOptimizable';

export function computeFixedPointResiduals(
  constraint: FixedPointConstraint,
  valueMap: ValueMap
): Value[] {
  const pointVec = valueMap.points.get(constraint.point);

  if (!pointVec) {
    console.warn(`Fixed point constraint: point not found in valueMap`);
    return [];
  }

  const targetXyz = constraint.targetXyz;

  // Residual = current position - target position
  // Each component should be 0 when point is at target
  const dx = V.sub(pointVec.x, V.C(targetXyz[0]));
  const dy = V.sub(pointVec.y, V.C(targetXyz[1]));
  const dz = V.sub(pointVec.z, V.C(targetXyz[2]));

  return [dx, dy, dz];
}
