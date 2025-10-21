/**
 * Equal distances constraint residual function.
 *
 * Residual: All pairwise distances should be equal.
 * Returns (n-1) residuals where n is the number of point pairs,
 * each residual = distance_i - distance_0.
 */

import type { Value } from 'scalar-autograd';
import type { EqualDistancesConstraint } from '../../entities/constraints/equal-distances-constraint';
import type { ValueMap } from '../IOptimizable';

export function computeEqualDistancesResiduals(
  constraint: EqualDistancesConstraint,
  valueMap: ValueMap
): Value[] {
  return constraint.computeResiduals(valueMap);
}
