/**
 * Perpendicular lines constraint residual function.
 *
 * Residual: dot product of directions should be 0 for perpendicular lines.
 */

import { V, Value, Vec3 } from 'scalar-autograd';
import type { PerpendicularLinesConstraint } from '../../entities/constraints/perpendicular-lines-constraint';
import type { ValueMap } from '../IOptimizable';

export function computePerpendicularLinesResiduals(
  constraint: PerpendicularLinesConstraint,
  valueMap: ValueMap
): Value[] {
  // Not yet implemented: Lines are not tracked in valueMap
  // Would need to:
  // 1. Add lines Map to ValueMap
  // 2. Compute line direction vectors from endpoint Values
  // 3. Enforce perpendicularity via dot product = 0 constraint
  if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
    console.warn('Perpendicular lines constraint not yet implemented - requires line support in valueMap');
  }
  return [];
}
