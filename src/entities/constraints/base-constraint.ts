// Abstract base constraint class for polymorphic constraint architecture

import type { ISelectable, SelectableType } from '../../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../../validation/validator'
import type { ValueMap, IResidualProvider } from '../../optimization/IOptimizable'
import type { Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point'
import type { Line } from '../line'

// Helper function to get coordinates from WorldPoint
// Returns optimizedXyz if available, otherwise undefined
export function getPointCoordinates(point: WorldPoint): [number, number, number] | undefined {
  return point.optimizedXyz
}

// Forward declaration for Plane
export interface IPlane extends ISelectable {
  getName(): string
}

export type ConstraintStatus = 'satisfied' | 'violated' | 'warning' | 'disabled'

export interface ConstraintEvaluation {
  value: number
  satisfied: boolean
}

// Repository interface (to avoid circular dependency)
export interface ConstraintRepository {
  // Empty for now - constraints use object references directly
}

// Abstract base constraint class
export abstract class Constraint implements ISelectable, IValidatable, IResidualProvider {
  lastResiduals: number[] = []
  selected = false
  isVisible = true
  isEnabled = true
  name: string

  protected constructor(name: string) {
    this.name = name
  }

  // Abstract methods that must be implemented by subclasses
  abstract getConstraintType(): string
  abstract evaluate(): ConstraintEvaluation
  abstract validateConstraintSpecific(): ValidationResult
  abstract computeResiduals(valueMap: ValueMap): Value[]

  // ISelectable implementation
  getType(): SelectableType {
    return 'constraint'
  }

  getName(): string {
    return this.name
  }

  isLocked(): boolean {
    return false
  }

  isSelected(): boolean {
    return this.selected
  }

  setSelected(selected: boolean): void {
    this.selected = selected
  }

  canDelete(): boolean {
    return true
  }

  getDeleteWarning(): string | null {
    return null
  }

  // IValidatable implementation
  validate(context: ValidationContext): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Common validation
    const nameError = ValidationHelpers.validateRequiredField(
      this.name,
      'name',
      this.name,
      'constraint'
    )
    if (nameError) errors.push(nameError)

    // Delegate to subclass-specific validation
    const specificValidation = this.validateConstraintSpecific()
    errors.push(...specificValidation.errors)
    warnings.push(...specificValidation.warnings)

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0
        ? 'Constraint validation passed'
        : `Constraint validation failed: ${errors.length} error(s), ${warnings.length} warning(s)`
    }
  }

  // Helper method for calculating angle between three points (in degrees)
  protected calculateAngleBetweenPoints(pointA: WorldPoint, vertex: WorldPoint, pointC: WorldPoint): number {
    const aCoords = getPointCoordinates(pointA)
    const vCoords = getPointCoordinates(vertex)
    const cCoords = getPointCoordinates(pointC)

    if (!aCoords || !vCoords || !cCoords) {
      return 0
    }

    const [x1, y1, z1] = aCoords
    const [x2, y2, z2] = vCoords
    const [x3, y3, z3] = cCoords

    // Calculate vectors from vertex to other points
    const vec1 = [x1 - x2, y1 - y2, z1 - z2]
    const vec2 = [x3 - x2, y3 - y2, z3 - z2]

    // Calculate magnitudes
    const mag1 = Math.sqrt(vec1[0] ** 2 + vec1[1] ** 2 + vec1[2] ** 2)
    const mag2 = Math.sqrt(vec2[0] ** 2 + vec2[1] ** 2 + vec2[2] ** 2)

    if (mag1 === 0 || mag2 === 0) return 0

    // Calculate dot product
    const dotProduct = vec1[0] * vec2[0] + vec1[1] * vec2[1] + vec1[2] * vec2[2]

    // Calculate angle in radians and convert to degrees
    const angleRadians = Math.acos(Math.max(-1, Math.min(1, dotProduct / (mag1 * mag2))))
    return (angleRadians * 180) / Math.PI
  }
}
