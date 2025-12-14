/**
 * Compute residuals for a constraint.
 * Returns array of Value objects (residuals) that should be zero when constraint is satisfied.
 *
 * All constraints now implement computeResiduals() method, so we directly delegate to it.
 */

import type { Value } from 'scalar-autograd';
import type { Constraint } from '../../entities/constraints/base-constraint';
import type { ValueMap } from '../IOptimizable';

export function computeConstraintResiduals(
  constraint: Constraint,
  valueMap: ValueMap
): Value[] {
  return constraint.computeResiduals(valueMap);
}
