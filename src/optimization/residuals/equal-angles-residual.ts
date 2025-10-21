/**
 * Equal angles constraint residual function.
 *
 * Residual: All angles should be equal.
 * Returns (n-1) residuals where n is the number of angle triplets,
 * each residual = angle_i - angle_0 in radians.
 */

import type { Value } from 'scalar-autograd';
import type { EqualAnglesConstraint } from '../../entities/constraints/equal-angles-constraint';
import type { ValueMap } from '../IOptimizable';

export function computeEqualAnglesResiduals(
  constraint: EqualAnglesConstraint,
  valueMap: ValueMap
): Value[] {
  return constraint.computeResiduals(valueMap);
}
