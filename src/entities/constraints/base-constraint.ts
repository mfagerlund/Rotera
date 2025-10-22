import type { ISelectable, SelectableType } from '../../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../../validation/validator'
import type { ValueMap, IResidualProvider } from '../../optimization/IOptimizable'
import type { Value } from 'scalar-autograd'
import { Vec3Utils } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point'
import type { Line } from '../line'
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { ConstraintDto } from './ConstraintDto'
import {makeObservable, observable} from 'mobx'

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

export abstract class Constraint implements ISelectable, IValidatable, IResidualProvider, ISerializable<ConstraintDto> {
  lastResiduals: number[] = []
  selected = false
  isVisible = true
  isEnabled = true
  name: string

  protected constructor(name: string) {
    this.name = name

    makeObservable(this, {
      lastResiduals: observable,
      selected: observable,
      isVisible: observable,
      isEnabled: observable,
      name: observable,
    })
  }

  abstract getConstraintType(): string
  abstract evaluate(): ConstraintEvaluation
  abstract validateConstraintSpecific(): ValidationResult
  abstract computeResiduals(valueMap: ValueMap): Value[]
  abstract serialize(context: SerializationContext): ConstraintDto

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

  protected calculateAngleBetweenPoints(pointA: WorldPoint, vertex: WorldPoint, pointC: WorldPoint): number {
    const aCoords = getPointCoordinates(pointA)
    const vCoords = getPointCoordinates(vertex)
    const cCoords = getPointCoordinates(pointC)

    if (!aCoords || !vCoords || !cCoords) {
      return 0
    }

    const vec1 = Vec3Utils.subtract(aCoords, vCoords)
    const vec2 = Vec3Utils.subtract(cCoords, vCoords)

    const angleRadians = Vec3Utils.angleBetween(vec1, vec2)
    return (angleRadians * 180) / Math.PI
  }
}
