// Distance constraint between two WorldPoints

import type { ConstraintId, EntityId } from '../../types/ids'
import type { ValidationContext, ValidationResult } from '../../validation/validator'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point'
import { BaseConstraint } from './BaseConstraint'
import type { ConstraintEvaluationResult, ConstraintOptions } from './IConstraint'
import type { DistancePointPointDto } from './dtos/ConstraintDto'

export class DistancePointPointConstraint extends BaseConstraint {
  constructor(
    id: ConstraintId,
    name: string,
    private _pointA: WorldPoint,
    private _pointB: WorldPoint,
    private _targetDistance: number,
    options: ConstraintOptions = {}
  ) {
    super(
      id,
      name,
      'distance_point_point',
      options.priority,
      options.tolerance,
      options.isEnabled,
      options.isDriving,
      options.group,
      options.tags,
      options.notes
    )

    // Establish bidirectional relationships
    this._pointA.addReferencingConstraint(this)
    this._pointB.addReferencingConstraint(this)
  }

  // Accessors
  get pointA(): WorldPoint {
    return this._pointA
  }

  get pointB(): WorldPoint {
    return this._pointB
  }

  get targetDistance(): number {
    return this._targetDistance
  }

  set targetDistance(value: number) {
    if (value < 0) {
      throw new Error('Target distance must be non-negative')
    }
    this._targetDistance = value
    this.updateTimestamp()
  }

  // IConstraint implementation
  evaluate(): ConstraintEvaluationResult {
    if (!this._pointA.hasCoordinates() || !this._pointB.hasCoordinates()) {
      return {
        value: 0,
        satisfied: false,
        error: undefined
      }
    }

    const actualDistance = this._pointA.distanceTo(this._pointB)
    if (actualDistance === null) {
      return {
        value: 0,
        satisfied: false,
        error: undefined
      }
    }

    const error = Math.abs(actualDistance - this._targetDistance)
    const satisfied = error <= this.tolerance

    return {
      value: actualDistance,
      satisfied,
      error,
      residual: error
    }
  }

  getReferencedEntityIds(): EntityId[] {
    return [this._pointA.getId(), this._pointB.getId()]
  }

  toDTO(): DistancePointPointDto {
    return {
      id: this._id,
      name: this._name,
      type: 'distance_point_point',
      status: this._status,
      priority: this._priority,
      tolerance: this._tolerance,
      isEnabled: this._isEnabled,
      isDriving: this._isDriving,
      group: this._group,
      tags: this._tags,
      notes: this._notes,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      currentValue: this._currentValue,
      error: this._error,
      pointA: this._pointA.getId(),
      pointB: this._pointB.getId(),
      targetDistance: this._targetDistance
    }
  }

  clone(newId: ConstraintId, newName?: string): DistancePointPointConstraint {
    return new DistancePointPointConstraint(
      newId,
      newName || `${this._name} (copy)`,
      this._pointA,
      this._pointB,
      this._targetDistance,
      {
        priority: this._priority,
        tolerance: this._tolerance,
        isEnabled: this._isEnabled,
        isDriving: this._isDriving,
        group: this._group,
        tags: this._tags,
        notes: this._notes
      }
    )
  }

  // Validation
  protected validateEntityReferences(context: ValidationContext): ValidationResult {
    const errors: ValidationResult['errors'] = []
    const warnings: ValidationResult['warnings'] = []

    // Check if points exist and have coordinates
    if (!this._pointA) {
      errors.push(ValidationHelpers.createError(
        'MISSING_POINT',
        'pointA is required',
        this._id,
        'constraint',
        'pointA'
      ))
    }

    if (!this._pointB) {
      errors.push(ValidationHelpers.createError(
        'MISSING_POINT',
        'pointB is required',
        this._id,
        'constraint',
        'pointB'
      ))
    }

    // Check for self-referencing constraint
    if (this._pointA === this._pointB) {
      errors.push(ValidationHelpers.createError(
        'SELF_REFERENCING_CONSTRAINT',
        'Distance constraint cannot reference the same point twice',
        this._id,
        'constraint'
      ))
    }

    // Target distance validation
    if (this._targetDistance < 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TARGET_DISTANCE',
        'targetDistance must be non-negative',
        this._id,
        'constraint',
        'targetDistance'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Entity validation passed' : `Entity validation failed: ${errors.length} errors`
    }
  }

  // Cleanup method called when constraint is deleted
  cleanup(): void {
    this._pointA.removeReferencingConstraint(this)
    this._pointB.removeReferencingConstraint(this)
  }

  // Factory method for creating from DTO
  static fromDTO(
    dto: DistancePointPointDto,
    pointA: WorldPoint,
    pointB: WorldPoint
  ): DistancePointPointConstraint {
    return new DistancePointPointConstraint(
      dto.id,
      dto.name,
      pointA,
      pointB,
      dto.targetDistance,
      {
        priority: dto.priority,
        tolerance: dto.tolerance,
        isEnabled: dto.isEnabled,
        isDriving: dto.isDriving,
        group: dto.group,
        tags: dto.tags,
        notes: dto.notes
      }
    )
  }
}