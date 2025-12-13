// Type guards for constraint types
// Eliminates need for 'as any' casts when working with constraints

import type { Constraint } from './base-constraint'
import { DistanceConstraint } from './distance-constraint'
import { AngleConstraint } from './angle-constraint'
import { ParallelLinesConstraint } from './parallel-lines-constraint'
import { PerpendicularLinesConstraint } from './perpendicular-lines-constraint'
import { FixedPointConstraint } from './fixed-point-constraint'
import { CollinearPointsConstraint } from './collinear-points-constraint'
import { CoplanarPointsConstraint } from './coplanar-points-constraint'
import { EqualDistancesConstraint } from './equal-distances-constraint'
import { EqualAnglesConstraint } from './equal-angles-constraint'
import { ProjectionConstraint } from './projection-constraint'

export function isDistanceConstraint(c: Constraint | unknown): c is DistanceConstraint {
  return c instanceof DistanceConstraint
}

export function isAngleConstraint(c: Constraint | unknown): c is AngleConstraint {
  return c instanceof AngleConstraint
}

export function isParallelLinesConstraint(c: Constraint | unknown): c is ParallelLinesConstraint {
  return c instanceof ParallelLinesConstraint
}

export function isPerpendicularLinesConstraint(c: Constraint | unknown): c is PerpendicularLinesConstraint {
  return c instanceof PerpendicularLinesConstraint
}

export function isFixedPointConstraint(c: Constraint | unknown): c is FixedPointConstraint {
  return c instanceof FixedPointConstraint
}

export function isCollinearPointsConstraint(c: Constraint | unknown): c is CollinearPointsConstraint {
  return c instanceof CollinearPointsConstraint
}

export function isCoplanarPointsConstraint(c: Constraint | unknown): c is CoplanarPointsConstraint {
  return c instanceof CoplanarPointsConstraint
}

export function isEqualDistancesConstraint(c: Constraint | unknown): c is EqualDistancesConstraint {
  return c instanceof EqualDistancesConstraint
}

export function isEqualAnglesConstraint(c: Constraint | unknown): c is EqualAnglesConstraint {
  return c instanceof EqualAnglesConstraint
}

export function isProjectionConstraint(c: Constraint | unknown): c is ProjectionConstraint {
  return c instanceof ProjectionConstraint
}
