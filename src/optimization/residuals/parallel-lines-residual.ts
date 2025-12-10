/**
 * Parallel lines constraint residual function.
 *
 * Residual: cross product magnitude should be 0 for parallel lines.
 * Uses normalized cross product for scale independence.
 */

import { V, Value, Vec3 } from 'scalar-autograd';
import type { ParallelLinesConstraint } from '../../entities/constraints/parallel-lines-constraint';
import type { ValueMap } from '../IOptimizable';

export function computeParallelLinesResiduals(
  constraint: ParallelLinesConstraint,
  valueMap: ValueMap
): Value[] {
  // Lines are defined by their start and end points
  // We need to find the points for each line
  // For now, we'll need to extend the system to track lines in valueMap
  // TODO: Add line support to valueMap

  if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
    console.warn('Parallel lines constraint not yet implemented - requires line support in valueMap');
    }
  return [];
}
