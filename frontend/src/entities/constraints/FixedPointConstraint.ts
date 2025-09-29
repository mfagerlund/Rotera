// Fixed point position constraint

import type { ConstraintId, EntityId } from '../../types/ids'
import type { ValidationContext, ValidationResult } from '../../validation/validator'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point'
import { BaseConstraint } from './BaseConstraint'
import type { ConstraintEvaluationResult, ConstraintOptions } from './IConstraint'
import type { FixedPointDto } from './dtos/ConstraintDto'

export class FixedPointConstraint extends BaseConstraint {
  constructor(
    id: ConstraintId,
    name: string,
    private _point: WorldPoint,
    private _targetPosition: [number, number, number],
    options: ConstraintOptions = {}
  ) {
    super(
      id,
      name,
      'fixed_point',
      options.priority,
      options.tolerance,
      options.isEnabled,
      options.isDriving,
      options.group,
      options.tags,
      options.notes
    )

    // Establish bidirectional relationship
    this._point.addReferencingConstraint(this)
  }

  // Accessors
  get point(): WorldPoint {
    return this._point
  }

  get targetPosition(): [number, number, number] {
    return [...this._targetPosition]
  }

  set targetPosition(value: [number, number, number]) {
    this._targetPosition = [...value]
    this.updateTimestamp()
  }

  // IConstraint implementation
  evaluate(): ConstraintEvaluationResult {
    if (!this._point.hasCoordinates()) {
      return {
        value: 0,
        satisfied: false,
        error: undefined
      }
    }

    const currentPos = this._point.xyz!
    const [tx, ty, tz] = this._targetPosition
    const [cx, cy, cz] = currentPos

    // Calculate distance from current position to target position
    const distance = Math.sqrt(
      Math.pow(cx - tx, 2) +
      Math.pow(cy - ty, 2) +
      Math.pow(cz - tz, 2)
    )

    const satisfied = distance <= this.tolerance

    return {
      value: distance,
      satisfied,
      error: distance,
      residual: distance
    }
  }

  getReferencedEntityIds(): EntityId[] {
    return [this._point.getId()]
  }

  toDTO(): FixedPointDto {
    return {
      id: this._id,
      name: this._name,
      type: 'fixed_point',
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
      point: this._point.getId(),
      targetPosition: this._targetPosition
    }
  }

  clone(newId: ConstraintId, newName?: string): FixedPointConstraint {
    return new FixedPointConstraint(
      newId,
      newName || `${this._name} (copy)`,
      this._point,
      [...this._targetPosition],
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

    // Check if point exists
    if (!this._point) {
      errors.push(ValidationHelpers.createError(
        'MISSING_POINT',
        'point is required',
        this._id,
        'constraint',
        'point'
      ))
    }

    // Validate target position
    if (!Array.isArray(this._targetPosition) || this._targetPosition.length !== 3) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TARGET_POSITION',
        'targetPosition must be an array of 3 numbers',
        this._id,
        'constraint',
        'targetPosition'
      ))
    } else if (!this._targetPosition.every(coord => typeof coord === 'number' && !isNaN(coord))) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TARGET_POSITION',
        'targetPosition coordinates must be valid numbers',
        this._id,
        'constraint',
        'targetPosition'
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
    this._point.removeReferencingConstraint(this)
  }

  // Factory method for creating from DTO
  static fromDTO(
    dto: FixedPointDto,
    point: WorldPoint
  ): FixedPointConstraint {
    return new FixedPointConstraint(
      dto.id,
      dto.name,
      point,
      dto.targetPosition,
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