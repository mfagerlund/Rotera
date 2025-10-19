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
  const lineAId = constraint.lineAId;
  const lineBId = constraint.lineBId;

  // Lines are defined by their start and end points
  // We need to find the points for each line
  // For now, we'll need to extend the system to track lines in valueMap
  // TODO: Add line support to valueMap

  console.warn('Perpendicular lines constraint not yet implemented - requires line support in valueMap');
  return [];
}
