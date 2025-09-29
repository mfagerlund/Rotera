// Parallel lines constraint

import type { ConstraintId, EntityId } from '../../types/ids'
import type { ValidationContext, ValidationResult } from '../../validation/validator'
import { ValidationHelpers } from '../../validation/validator'
import type { Line } from '../line'
import { BaseConstraint } from './BaseConstraint'
import type { ConstraintEvaluationResult, ConstraintOptions } from './IConstraint'
import type { ParallelLinesDto } from './dtos/ConstraintDto'

export class ParallelLinesConstraint extends BaseConstraint {
  constructor(
    id: ConstraintId,
    name: string,
    private _lineA: Line,
    private _lineB: Line,
    options: ConstraintOptions = {}
  ) {
    super(
      id,
      name,
      'parallel_lines',
      options.priority,
      options.tolerance,
      options.isEnabled,
      options.isDriving,
      options.group,
      options.tags,
      options.notes
    )

    // Establish bidirectional relationships
    this._lineA.addReferencingConstraint(this)
    this._lineB.addReferencingConstraint(this)
  }

  // Accessors
  get lineA(): Line {
    return this._lineA
  }

  get lineB(): Line {
    return this._lineB
  }

  // IConstraint implementation
  evaluate(): ConstraintEvaluationResult {
    const dir1 = this._lineA.getDirection()
    const dir2 = this._lineB.getDirection()

    if (!dir1 || !dir2) {
      return {
        value: 0,
        satisfied: false,
        error: undefined
      }
    }

    // Calculate dot product to check parallelism
    // For parallel lines, the absolute dot product should be close to 1
    const dotProduct = Math.abs(dir1[0] * dir2[0] + dir1[1] * dir2[1] + dir1[2] * dir2[2])
    const angleDeviation = Math.acos(Math.min(1, dotProduct)) * (180 / Math.PI) // Convert to degrees

    // For parallel lines, angle should be 0 degrees (or very close)
    const satisfied = angleDeviation <= this.tolerance

    return {
      value: angleDeviation,
      satisfied,
      error: angleDeviation,
      residual: angleDeviation
    }
  }

  getReferencedEntityIds(): EntityId[] {
    return [this._lineA.getId(), this._lineB.getId()]
  }

  hasTarget(): boolean {
    return false // Parallel constraint doesn't have a target value
  }

  toDTO(): ParallelLinesDto {
    return {
      id: this._id,
      name: this._name,
      type: 'parallel_lines',
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
      lineA: this._lineA.getId(),
      lineB: this._lineB.getId()
    }
  }

  clone(newId: ConstraintId, newName?: string): ParallelLinesConstraint {
    return new ParallelLinesConstraint(
      newId,
      newName || `${this._name} (copy)`,
      this._lineA,
      this._lineB,
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

    // Check if lines exist
    if (!this._lineA) {
      errors.push(ValidationHelpers.createError(
        'MISSING_LINE',
        'lineA is required',
        this._id,
        'constraint',
        'lineA'
      ))
    }

    if (!this._lineB) {
      errors.push(ValidationHelpers.createError(
        'MISSING_LINE',
        'lineB is required',
        this._id,
        'constraint',
        'lineB'
      ))
    }

    // Check for self-referencing constraint
    if (this._lineA === this._lineB) {
      errors.push(ValidationHelpers.createError(
        'SELF_REFERENCING_CONSTRAINT',
        'Parallel constraint cannot reference the same line twice',
        this._id,
        'constraint'
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
    this._lineA.removeReferencingConstraint(this)
    this._lineB.removeReferencingConstraint(this)
  }

  // Factory method for creating from DTO
  static fromDTO(
    dto: ParallelLinesDto,
    lineA: Line,
    lineB: Line
  ): ParallelLinesConstraint {
    return new ParallelLinesConstraint(
      dto.id,
      dto.name,
      lineA,
      lineB,
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