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
  // Not yet implemented: Lines are not tracked in valueMap
  // Would need to:
  // 1. Add lines Map to ValueMap
  // 2. Compute line direction vectors from endpoint Values
  // 3. Enforce parallelism via dot product constraint
  if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
    console.warn('Parallel lines constraint not yet implemented - requires line support in valueMap');
  }
  return [];
}
