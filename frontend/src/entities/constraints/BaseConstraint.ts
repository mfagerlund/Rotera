// Abstract base class for all constraints

import type { ConstraintId, EntityId } from '../../types/ids'
import type { SelectableType } from '../../types/selectable'
import type { ValidationContext, ValidationResult, ValidationError } from '../../validation/validator'
import { ValidationHelpers } from '../../validation/validator'
import type {
  IConstraint,
  ConstraintType,
  ConstraintStatus,
  ConstraintEvaluationResult,
  ConstraintOptions
} from './IConstraint'
import type { BaseConstraintDto } from './dtos/BaseConstraintDto'

export abstract class BaseConstraint implements IConstraint {
  private _selected = false
  protected _status: ConstraintStatus = 'satisfied'
  protected _currentValue?: number
  protected _error?: number
  protected _updatedAt: string

  protected constructor(
    protected _id: ConstraintId,
    protected _name: string,
    protected _type: ConstraintType,
    protected _priority: number = 5,
    protected _tolerance: number = 0.001,
    protected _isEnabled: boolean = true,
    protected _isDriving: boolean = false,
    protected _group?: string,
    protected _tags: string[] = [],
    protected _notes?: string,
    protected _createdAt: string = new Date().toISOString()
  ) {
    this._updatedAt = this._createdAt
  }

  // ISelectable implementation
  getId(): ConstraintId {
    return this._id
  }

  getType(): SelectableType {
    return 'constraint'
  }

  getName(): string {
    return this._name
  }

  isVisible(): boolean {
    return this._isEnabled
  }

  isLocked(): boolean {
    return false
  }

  getDependencies(): EntityId[] {
    return this.getReferencedEntityIds()
  }

  getDependents(): EntityId[] {
    return []
  }

  isSelected(): boolean {
    return this._selected
  }

  setSelected(selected: boolean): void {
    this._selected = selected
  }

  canDelete(): boolean {
    return true
  }

  getDeleteWarning(): string | null {
    if (this._isDriving) {
      return `Constraint "${this._name}" is a driving constraint and affects optimization`
    }
    return null
  }

  // IConstraint implementation
  get type(): ConstraintType {
    return this._type
  }

  get status(): ConstraintStatus {
    return this._status
  }

  get priority(): number {
    return this._priority
  }

  set priority(value: number) {
    if (value < 1 || value > 10) {
      throw new Error('Priority must be between 1 and 10')
    }
    this._priority = value
    this.updateTimestamp()
  }

  get tolerance(): number {
    return this._tolerance
  }

  set tolerance(value: number) {
    if (value < 0) {
      throw new Error('Tolerance must be non-negative')
    }
    this._tolerance = value
    this.updateTimestamp()
  }

  get isEnabled(): boolean {
    return this._isEnabled
  }

  set isEnabled(value: boolean) {
    this._isEnabled = value
    this.updateTimestamp()
  }

  get isDriving(): boolean {
    return this._isDriving
  }

  set isDriving(value: boolean) {
    this._isDriving = value
    this.updateTimestamp()
  }

  get createdAt(): string {
    return this._createdAt
  }

  get updatedAt(): string {
    return this._updatedAt
  }

  get group(): string | undefined {
    return this._group
  }

  set group(value: string | undefined) {
    this._group = value
    this.updateTimestamp()
  }

  get tags(): string[] {
    return [...this._tags]
  }

  set tags(value: string[]) {
    this._tags = [...value]
    this.updateTimestamp()
  }

  get notes(): string | undefined {
    return this._notes
  }

  set notes(value: string | undefined) {
    this._notes = value
    this.updateTimestamp()
  }

  // Abstract methods that must be implemented by subclasses
  abstract evaluate(): ConstraintEvaluationResult
  abstract getReferencedEntityIds(): EntityId[]
  abstract toDTO(): BaseConstraintDto
  abstract clone(newId: ConstraintId, newName?: string): IConstraint

  // Common constraint behavior
  updateFromEvaluation(result: ConstraintEvaluationResult): void {
    this._currentValue = result.value
    this._error = result.error
    this._status = result.satisfied ? 'satisfied' : 'violated'
    this.updateTimestamp()
  }

  isSatisfied(): boolean {
    return this._status === 'satisfied'
  }

  isViolated(): boolean {
    return this._status === 'violated'
  }

  hasTarget(): boolean {
    // Default implementation - subclasses can override
    return true
  }

  // Common validation logic
  validate(context: ValidationContext): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Required field validation
    const nameError = ValidationHelpers.validateRequiredField(
      this._name,
      'name',
      this._id,
      'constraint'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(this._id, 'constraint')
    if (idError) errors.push(idError)

    // Priority validation
    if (this._priority < 1 || this._priority > 10) {
      errors.push(ValidationHelpers.createError(
        'INVALID_PRIORITY',
        'priority must be between 1 and 10',
        this._id,
        'constraint',
        'priority'
      ))
    }

    // Tolerance validation
    if (this._tolerance < 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TOLERANCE',
        'tolerance must be non-negative',
        this._id,
        'constraint',
        'tolerance'
      ))
    }

    // Entity reference validation - delegate to subclass
    const entityValidation = this.validateEntityReferences(context)
    errors.push(...entityValidation.errors)
    warnings.push(...entityValidation.warnings)

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Constraint validation passed' : `Constraint validation failed: ${errors.length} errors`
    }
  }

  // Template method for entity reference validation - subclasses override
  protected abstract validateEntityReferences(context: ValidationContext): ValidationResult

  // Utility methods
  protected updateTimestamp(): void {
    this._updatedAt = new Date().toISOString()
  }

  // Override visibility (constraint enabled state)
  setVisible(visible: boolean): void {
    this._isEnabled = visible
    this.updateTimestamp()
  }

  // Get current constraint value
  get currentValue(): number | undefined {
    return this._currentValue
  }

  // Get constraint error
  get error(): number | undefined {
    return this._error
  }
}