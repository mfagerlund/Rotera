// Constraint validation service for geometric consistency

import type { Constraint } from '../../types/project'
import type { ValidationResult, WorldPointData } from './types'
import { validateDistanceConstraint } from './validators/distanceValidator'
import { validateAngleConstraint } from './validators/angleValidator'
import { validateParallelConstraint } from './validators/parallelValidator'
import { validatePerpendicularConstraint } from './validators/perpendicularValidator'
import { validateFixedConstraint, validateCollinearConstraint, validateRectangleConstraint, validateCircleConstraint } from './validators/fixedValidator'
import { validateSystem } from './validators/systemValidator'

export class ConstraintValidator {
  private worldPoints: Record<string, WorldPointData>
  private constraints: Constraint[]
  private tolerance: number

  constructor(worldPoints: Record<string, WorldPointData>, constraints: Constraint[], tolerance: number = 1e-6) {
    this.worldPoints = worldPoints
    this.constraints = constraints
    this.tolerance = tolerance
  }

  validate(): ValidationResult {
    const errors: any[] = []
    const warnings: any[] = []
    const suggestions: any[] = []

    // Validate individual constraints
    this.constraints.forEach(constraint => {
      const constraintResult = this.validateConstraint(constraint)
      errors.push(...constraintResult.errors)
      warnings.push(...constraintResult.warnings)
    })

    // System-wide validation
    const systemResult = validateSystem(this.worldPoints, this.constraints)
    errors.push(...systemResult.errors)
    warnings.push(...systemResult.warnings)
    suggestions.push(...systemResult.suggestions)

    return {
      isValid: errors.filter(e => e.severity === 'critical').length === 0,
      errors,
      warnings,
      suggestions
    }
  }

  private validateConstraint(constraint: Constraint): ValidationResult {
    const errors: any[] = []

    switch (constraint.type) {
      case 'points_distance':
        return validateDistanceConstraint(constraint, this.worldPoints, this.tolerance)
      case 'points_equal_distance':
        // This handles both angle and circle constraints - determine by parameters
        if (constraint.parameters.angle !== undefined || constraint.parameters.angle_degrees !== undefined) {
          return validateAngleConstraint(constraint, this.worldPoints)
        } else {
          return validateCircleConstraint(constraint)
        }
      case 'lines_perpendicular':
        return validatePerpendicularConstraint(constraint, this.worldPoints)
      case 'lines_parallel':
        return validateParallelConstraint(constraint, this.worldPoints)
      case 'points_colinear':
        return validateCollinearConstraint(constraint)
      case 'points_coplanar':
        return validateRectangleConstraint(constraint)
      case 'point_fixed_coord':
        return validateFixedConstraint(constraint, this.worldPoints)
      default:
        errors.push({
          id: crypto.randomUUID(),
          type: 'error',
          severity: 'medium',
          constraintId: constraint.id,
          message: 'Unknown constraint type',
          description: `Constraint type '${constraint.type}' is not recognized`,
          fixSuggestion: 'Remove this constraint or update to a valid type'
        })
    }

    return { isValid: errors.length === 0, errors, warnings: [], suggestions: [] }
  }
}
