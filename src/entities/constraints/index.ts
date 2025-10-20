// Export all constraint types and factory functions

export * from './base-constraint'
export * from './distance-constraint'
export * from './angle-constraint'
export * from './parallel-lines-constraint'
export * from './perpendicular-lines-constraint'
export * from './fixed-point-constraint'
export * from './collinear-points-constraint'
export * from './coplanar-points-constraint'
export * from './equal-distances-constraint'
export * from './equal-angles-constraint'

import type { ConstraintRepository, ConstraintDto, Constraint } from './base-constraint'
import { DistanceConstraint } from './distance-constraint'
import { AngleConstraint } from './angle-constraint'
import { ParallelLinesConstraint } from './parallel-lines-constraint'
import { PerpendicularLinesConstraint } from './perpendicular-lines-constraint'
import { FixedPointConstraint } from './fixed-point-constraint'
import { CollinearPointsConstraint } from './collinear-points-constraint'
import { CoplanarPointsConstraint } from './coplanar-points-constraint'
import { EqualDistancesConstraint } from './equal-distances-constraint'
import { EqualAnglesConstraint } from './equal-angles-constraint'

// Factory function to create constraint instances from DTOs
export function createConstraintFromDto(dto: ConstraintDto, repo: ConstraintRepository): Constraint {
  switch (dto.type) {
    case 'distance_point_point':
      return DistanceConstraint.fromDto(dto, repo)
    case 'angle_point_point_point':
      return AngleConstraint.fromDto(dto, repo)
    case 'parallel_lines':
      return ParallelLinesConstraint.fromDto(dto, repo)
    case 'perpendicular_lines':
      return PerpendicularLinesConstraint.fromDto(dto, repo)
    case 'fixed_point':
      return FixedPointConstraint.fromDto(dto, repo)
    case 'collinear_points':
      return CollinearPointsConstraint.fromDto(dto, repo)
    case 'coplanar_points':
      return CoplanarPointsConstraint.fromDto(dto, repo)
    case 'equal_distances':
      return EqualDistancesConstraint.fromDto(dto, repo)
    case 'equal_angles':
      return EqualAnglesConstraint.fromDto(dto, repo)
    default:
      throw new Error(`Unknown constraint type: ${dto.type}`)
  }
}

// Utility function to convert old frontend constraint format to new DTO format
export function convertFrontendConstraintToDto(frontendConstraint: any): ConstraintDto {
  const baseDto: ConstraintDto = {
    id: frontendConstraint.id,
    name: frontendConstraint.name || `${frontendConstraint.type} constraint`,
    type: frontendConstraint.type,
    status: frontendConstraint.status || 'satisfied',
    entities: {
      points: frontendConstraint.entities?.points,
      lines: frontendConstraint.entities?.lines,
      planes: frontendConstraint.entities?.planes
    },
    parameters: {
      tolerance: frontendConstraint.parameters?.tolerance ?? 0.001,
      priority: frontendConstraint.parameters?.priority ?? 5,
      ...frontendConstraint.parameters
    },
    currentValue: frontendConstraint.currentValue,
    error: frontendConstraint.error,
    isEnabled: frontendConstraint.isEnabled ?? true,
    isDriving: frontendConstraint.isDriving ?? false,
    group: frontendConstraint.group,
    tags: frontendConstraint.tags,
    notes: frontendConstraint.notes,
    createdAt: frontendConstraint.createdAt || new Date().toISOString(),
    updatedAt: frontendConstraint.updatedAt || new Date().toISOString(),
    // Initialize all constraint-specific data as undefined
    distanceConstraint: undefined,
    angleConstraint: undefined,
    parallelLinesConstraint: undefined,
    perpendicularLinesConstraint: undefined,
    fixedPointConstraint: undefined,
    collinearPointsConstraint: undefined,
    coplanarPointsConstraint: undefined,
    equalDistancesConstraint: undefined,
    equalAnglesConstraint: undefined
  }

  // Set the appropriate constraint-specific data based on type
  switch (frontendConstraint.type) {
    case 'distance_point_point':
      baseDto.distanceConstraint = {
        targetDistance: frontendConstraint.parameters?.targetValue ?? frontendConstraint.parameters?.targetDistance ?? 1.0
      }
      break

    case 'angle_point_point_point':
      baseDto.angleConstraint = {
        targetAngle: frontendConstraint.parameters?.targetValue ?? frontendConstraint.parameters?.targetAngle ?? 90.0
      }
      break

    case 'parallel_lines':
      baseDto.parallelLinesConstraint = {}
      break

    case 'perpendicular_lines':
      baseDto.perpendicularLinesConstraint = {}
      break

    case 'fixed_point':
      baseDto.fixedPointConstraint = {
        targetXyz: frontendConstraint.parameters?.targetXyz ?? [
          frontendConstraint.parameters?.x ?? 0,
          frontendConstraint.parameters?.y ?? 0,
          frontendConstraint.parameters?.z ?? 0
        ]
      }
      break

    case 'collinear_points':
      baseDto.collinearPointsConstraint = {}
      break

    case 'coplanar_points':
      baseDto.coplanarPointsConstraint = {}
      break

    case 'equal_distances':
      baseDto.equalDistancesConstraint = {
        distancePairs: frontendConstraint.parameters?.distancePairs ?? []
      }
      break

    case 'equal_angles':
      baseDto.equalAnglesConstraint = {
        angleTriplets: frontendConstraint.parameters?.angleTriplets ?? []
      }
      break
  }

  return baseDto
}