// Factory for deserializing constraints from DTOs
// Separate file to avoid circular imports with base-constraint.ts

import type { ConstraintDto } from './ConstraintDto'
import type { SerializationContext } from '../serialization/SerializationContext'
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

export function deserializeConstraint(dto: ConstraintDto, context: SerializationContext): Constraint {
  switch (dto.type) {
    case 'distance_point_point':
      return DistanceConstraint.deserialize(dto, context)
    case 'angle_point_point_point':
      return AngleConstraint.deserialize(dto, context)
    case 'parallel_lines':
      return ParallelLinesConstraint.deserialize(dto, context)
    case 'perpendicular_lines':
      return PerpendicularLinesConstraint.deserialize(dto, context)
    case 'fixed_point':
      return FixedPointConstraint.deserialize(dto, context)
    case 'collinear_points':
      return CollinearPointsConstraint.deserialize(dto, context)
    case 'coplanar_points':
      return CoplanarPointsConstraint.deserialize(dto, context)
    case 'equal_distances':
      return EqualDistancesConstraint.deserialize(dto, context)
    case 'equal_angles':
      return EqualAnglesConstraint.deserialize(dto, context)
    case 'projection':
      return ProjectionConstraint.deserialize(dto, context)
    default: {
      const exhaustiveCheck: never = dto
      throw new Error(`Unknown constraint type: ${(exhaustiveCheck as ConstraintDto).type}`)
    }
  }
}
