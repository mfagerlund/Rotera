/**
 * Compute residuals for a constraint.
 * Returns array of Value objects (residuals) that should be zero when constraint is satisfied.
 *
 * This is the main dispatcher that routes each constraint type to its residual function.
 */

import { Value } from 'scalar-autograd';
import type { Constraint } from '../../entities/constraints/base-constraint';
import type { FixedPointConstraint } from '../../entities/constraints/fixed-point-constraint';
import type { DistanceConstraint } from '../../entities/constraints/distance-constraint';
import type { AngleConstraint } from '../../entities/constraints/angle-constraint';
import type { ParallelLinesConstraint } from '../../entities/constraints/parallel-lines-constraint';
import type { PerpendicularLinesConstraint } from '../../entities/constraints/perpendicular-lines-constraint';
import type { CollinearPointsConstraint } from '../../entities/constraints/collinear-points-constraint';
import type { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint';
import type { EqualDistancesConstraint } from '../../entities/constraints/equal-distances-constraint';
import type { EqualAnglesConstraint } from '../../entities/constraints/equal-angles-constraint';
import type { ValueMap } from '../IOptimizable';
import { computeFixedPointResiduals } from './fixed-point-residual';
import { computeDistanceResiduals } from './distance-residual';
import { computeAngleResiduals } from './angle-residual';
import { computeParallelLinesResiduals } from './parallel-lines-residual';
import { computePerpendicularLinesResiduals } from './perpendicular-lines-residual';
import { computeCollinearPointsResiduals } from './collinear-points-residual';
import { computeCoplanarPointsResiduals } from './coplanar-points-residual';
import { computeEqualDistancesResiduals } from './equal-distances-residual';
import { computeEqualAnglesResiduals } from './equal-angles-residual';

export function computeConstraintResiduals(
  constraint: Constraint,
  valueMap: ValueMap
): Value[] {
  const constraintType = constraint.getConstraintType();

  switch (constraintType) {
    case 'fixed_point':
      return computeFixedPointResiduals(constraint as FixedPointConstraint, valueMap);

    case 'distance_point_point':
      return computeDistanceResiduals(constraint as DistanceConstraint, valueMap);

    case 'angle_point_point_point':
      return computeAngleResiduals(constraint as AngleConstraint, valueMap);

    case 'parallel_lines':
      return computeParallelLinesResiduals(constraint as ParallelLinesConstraint, valueMap);

    case 'perpendicular_lines':
      return computePerpendicularLinesResiduals(constraint as PerpendicularLinesConstraint, valueMap);

    case 'collinear_points':
      return computeCollinearPointsResiduals(constraint as CollinearPointsConstraint, valueMap);

    case 'coplanar_points':
      return computeCoplanarPointsResiduals(constraint as CoplanarPointsConstraint, valueMap);

    case 'equal_distances':
      return computeEqualDistancesResiduals(constraint as EqualDistancesConstraint, valueMap);

    case 'equal_angles':
      return computeEqualAnglesResiduals(constraint as EqualAnglesConstraint, valueMap);

    default:
      console.warn(`Unknown constraint type: ${constraintType}`);
      return [];
  }
}
