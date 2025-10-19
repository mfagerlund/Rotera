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
  // Get the point ID from the constraint
  const pointId = constraint.pointId;

  // Find the point in the valueMap by comparing IDs
  let pointVec: Vec3 | undefined;
  for (const [point, vec] of valueMap.points) {
    if (point.getId() === pointId) {
      pointVec = vec;
      break;
    }
  }

  if (!pointVec) {
    // Point not in valueMap
    console.warn(`Point ${pointId} not found in valueMap`);
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
