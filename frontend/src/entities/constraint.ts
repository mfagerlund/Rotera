// Constraint entity with DTO and domain class co-located (NO LEGACY)

import type { ConstraintId, PointId, LineId, PlaneId, EntityId } from '../types/ids'
import type { ISelectable, SelectableType } from '../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../validation/validator'
import { ValidationHelpers } from '../validation/validator'

// Clean constraint types (NO LEGACY)
export type ConstraintType =
  | 'distance_point_point'
  | 'distance_point_line'
  | 'distance_point_plane'
  | 'angle_point_point_point'
  | 'angle_line_line'
  | 'parallel_lines'
  | 'perpendicular_lines'
  | 'collinear_points'
  | 'coplanar_points'
  | 'fixed_point'
  | 'horizontal_line'
  | 'vertical_line'
  | 'equal_distances'
  | 'equal_angles'

export type ConstraintStatus = 'satisfied' | 'violated' | 'warning' | 'disabled'

// Constraint DTO for storage (clean, no legacy)
export interface ConstraintDto {
  id: ConstraintId
  name: string
  type: ConstraintType
  status: ConstraintStatus

  // Entity references (clean structure)
  entities: {
    points?: PointId[]
    lines?: LineId[]
    planes?: PlaneId[]
  }

  // Constraint parameters
  parameters: {
    targetValue?: number
    tolerance?: number
    priority?: number // 1-10, higher = more important
    [key: string]: any // Allow for constraint-specific parameters
  }

  // Runtime state
  currentValue?: number
  error?: number // difference from target
  isEnabled: boolean
  isDriving: boolean // true if this constraint drives optimization

  // Metadata
  group?: string
  tags?: string[]
  notes?: string
  createdAt: string
  updatedAt: string
}

// Repository interface (to avoid circular dependency)
export interface ConstraintRepository {
  getPoint(pointId: PointId): EntityId | undefined
  getLine(lineId: LineId): EntityId | undefined
  getPlane(planeId: PlaneId): EntityId | undefined
  entityExists(id: EntityId): boolean
  pointExists(pointId: PointId): boolean
  lineExists(lineId: LineId): boolean
  planeExists(planeId: PlaneId): boolean
}

// Domain class with runtime behavior
export class Constraint implements ISelectable, IValidatable {
  private selected = false

  private constructor(
    private repo: ConstraintRepository,
    private data: ConstraintDto
  ) {}

  // Factory methods
  static fromDTO(dto: ConstraintDto, repo: ConstraintRepository): Constraint {
    const validation = Constraint.validateDto(dto)
    if (!validation.isValid) {
      throw new Error(`Invalid Constraint DTO: ${validation.errors.map(e => e.message).join(', ')}`)
    }
    return new Constraint(repo, { ...dto })
  }

  static create(
    id: ConstraintId,
    name: string,
    type: ConstraintType,
    entities: ConstraintDto['entities'],
    repo: ConstraintRepository,
    options: {
      targetValue?: number
      tolerance?: number
      priority?: number
      isEnabled?: boolean
      isDriving?: boolean
      parameters?: Record<string, any>
      group?: string
      tags?: string[]
      notes?: string
    } = {}
  ): Constraint {
    const now = new Date().toISOString()
    const dto: ConstraintDto = {
      id,
      name,
      type,
      status: 'satisfied',
      entities: {
        points: entities.points ? [...entities.points] : undefined,
        lines: entities.lines ? [...entities.lines] : undefined,
        planes: entities.planes ? [...entities.planes] : undefined
      },
      parameters: {
        targetValue: options.targetValue,
        tolerance: options.tolerance ?? 0.001,
        priority: options.priority ?? 5,
        ...options.parameters
      },
      isEnabled: options.isEnabled ?? true,
      isDriving: options.isDriving ?? false,
      group: options.group,
      tags: options.tags,
      notes: options.notes,
      createdAt: now,
      updatedAt: now
    }
    return new Constraint(repo, dto)
  }

  // Serialization
  toDTO(): ConstraintDto {
    return {
      ...this.data,
      entities: {
        points: this.data.entities.points ? [...this.data.entities.points] : undefined,
        lines: this.data.entities.lines ? [...this.data.entities.lines] : undefined,
        planes: this.data.entities.planes ? [...this.data.entities.planes] : undefined
      },
      parameters: { ...this.data.parameters }
    }
  }

  // ISelectable implementation
  getId(): ConstraintId {
    return this.data.id
  }

  getType(): SelectableType {
    return 'constraint'
  }

  getName(): string {
    return this.data.name
  }

  isVisible(): boolean {
    // Constraints are visible if enabled
    return this.data.isEnabled
  }

  isLocked(): boolean {
    // Constraints aren't directly lockable
    return false
  }

  getDependencies(): EntityId[] {
    // Constraints depend on the entities they reference
    const dependencies: EntityId[] = []

    if (this.data.entities.points) {
      dependencies.push(...this.data.entities.points.map(id => id as EntityId))
    }
    if (this.data.entities.lines) {
      dependencies.push(...this.data.entities.lines.map(id => id as EntityId))
    }
    if (this.data.entities.planes) {
      dependencies.push(...this.data.entities.planes.map(id => id as EntityId))
    }

    return dependencies
  }

  getDependents(): EntityId[] {
    // Constraints typically don't have dependents (they're leaf nodes)
    return []
  }

  isSelected(): boolean {
    return this.selected
  }

  setSelected(selected: boolean): void {
    this.selected = selected
  }

  canDelete(): boolean {
    // Constraints can usually be deleted safely
    return true
  }

  getDeleteWarning(): string | null {
    if (this.data.isDriving) {
      return `Constraint "${this.data.name}" is a driving constraint and affects optimization`
    }
    return null
  }

  // IValidatable implementation
  validate(context: ValidationContext): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Required field validation
    const nameError = ValidationHelpers.validateRequiredField(
      this.data.name,
      'name',
      this.data.id,
      'constraint'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(this.data.id, 'constraint')
    if (idError) errors.push(idError)

    // Type-specific validation
    const typeValidation = this.validateConstraintType()
    errors.push(...typeValidation.errors)
    warnings.push(...typeValidation.warnings)

    // Entity reference validation
    if (this.data.entities.points) {
      for (const pointId of this.data.entities.points) {
        if (!context.pointExists(pointId as EntityId)) {
          errors.push(ValidationHelpers.createError(
            'INVALID_POINT_REFERENCE',
            `Constraint references non-existent point: ${pointId}`,
            this.data.id,
            'constraint',
            'entities.points'
          ))
        }
      }
    }

    if (this.data.entities.lines) {
      for (const lineId of this.data.entities.lines) {
        if (!context.lineExists(lineId as EntityId)) {
          errors.push(ValidationHelpers.createError(
            'INVALID_LINE_REFERENCE',
            `Constraint references non-existent line: ${lineId}`,
            this.data.id,
            'constraint',
            'entities.lines'
          ))
        }
      }
    }

    if (this.data.entities.planes) {
      for (const planeId of this.data.entities.planes) {
        if (!context.planeExists(planeId as EntityId)) {
          errors.push(ValidationHelpers.createError(
            'INVALID_PLANE_REFERENCE',
            `Constraint references non-existent plane: ${planeId}`,
            this.data.id,
            'constraint',
            'entities.planes'
          ))
        }
      }
    }

    // Parameters validation
    if (this.data.parameters.tolerance !== undefined && this.data.parameters.tolerance < 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TOLERANCE',
        'tolerance must be non-negative',
        this.data.id,
        'constraint',
        'parameters.tolerance'
      ))
    }

    if (this.data.parameters.priority !== undefined) {
      if (this.data.parameters.priority < 1 || this.data.parameters.priority > 10) {
        errors.push(ValidationHelpers.createError(
          'INVALID_PRIORITY',
          'priority must be between 1 and 10',
          this.data.id,
          'constraint',
          'parameters.priority'
        ))
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Constraint validation passed' : `Constraint validation failed: ${errors.length} errors`
    }
  }

  // Type-specific validation
  private validateConstraintType(): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    switch (this.data.type) {
      case 'distance_point_point':
        if (!this.data.entities.points || this.data.entities.points.length !== 2) {
          errors.push(ValidationHelpers.createError(
            'INVALID_ENTITY_COUNT',
            'distance_point_point requires exactly 2 points',
            this.data.id,
            'constraint'
          ))
        }
        if (this.data.parameters.targetValue === undefined) {
          errors.push(ValidationHelpers.createError(
            'MISSING_TARGET_VALUE',
            'distance_point_point requires targetValue parameter',
            this.data.id,
            'constraint'
          ))
        }
        break

      case 'angle_point_point_point':
        if (!this.data.entities.points || this.data.entities.points.length !== 3) {
          errors.push(ValidationHelpers.createError(
            'INVALID_ENTITY_COUNT',
            'angle_point_point_point requires exactly 3 points',
            this.data.id,
            'constraint'
          ))
        }
        if (this.data.parameters.targetValue === undefined) {
          errors.push(ValidationHelpers.createError(
            'MISSING_TARGET_VALUE',
            'angle_point_point_point requires targetValue parameter',
            this.data.id,
            'constraint'
          ))
        }
        break

      case 'parallel_lines':
      case 'perpendicular_lines':
        if (!this.data.entities.lines || this.data.entities.lines.length !== 2) {
          errors.push(ValidationHelpers.createError(
            'INVALID_ENTITY_COUNT',
            `${this.data.type} requires exactly 2 lines`,
            this.data.id,
            'constraint'
          ))
        }
        break

      case 'collinear_points':
        if (!this.data.entities.points || this.data.entities.points.length < 3) {
          errors.push(ValidationHelpers.createError(
            'INVALID_ENTITY_COUNT',
            'collinear_points requires at least 3 points',
            this.data.id,
            'constraint'
          ))
        }
        break

      case 'coplanar_points':
        if (!this.data.entities.points || this.data.entities.points.length < 4) {
          errors.push(ValidationHelpers.createError(
            'INVALID_ENTITY_COUNT',
            'coplanar_points requires at least 4 points',
            this.data.id,
            'constraint'
          ))
        }
        break

      case 'fixed_point':
        if (!this.data.entities.points || this.data.entities.points.length !== 1) {
          errors.push(ValidationHelpers.createError(
            'INVALID_ENTITY_COUNT',
            'fixed_point requires exactly 1 point',
            this.data.id,
            'constraint'
          ))
        }
        break

      case 'horizontal_line':
      case 'vertical_line':
        if (!this.data.entities.lines || this.data.entities.lines.length !== 1) {
          errors.push(ValidationHelpers.createError(
            'INVALID_ENTITY_COUNT',
            `${this.data.type} requires exactly 1 line`,
            this.data.id,
            'constraint'
          ))
        }
        break

      default:
        errors.push(ValidationHelpers.createError(
          'UNKNOWN_CONSTRAINT_TYPE',
          `Unknown constraint type: ${this.data.type}`,
          this.data.id,
          'constraint'
        ))
    }

    return { isValid: errors.length === 0, errors, warnings, summary: '' }
  }

  // Static DTO validation
  private static validateDto(dto: ConstraintDto): ValidationResult {
    const errors: ValidationError[] = []

    if (!dto.id) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'id is required',
        dto.id,
        'constraint',
        'id'
      ))
    }

    if (!dto.name) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'name is required',
        dto.id,
        'constraint',
        'name'
      ))
    }

    if (!dto.type) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'type is required',
        dto.id,
        'constraint',
        'type'
      ))
    }

    if (!dto.entities) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'entities is required',
        dto.id,
        'constraint',
        'entities'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'DTO validation passed' : `DTO validation failed: ${errors.length} errors`
    }
  }

  // Domain methods (getters/setters)
  get name(): string {
    return this.data.name
  }

  set name(value: string) {
    this.data.name = value
    this.updateTimestamp()
  }

  get constraintType(): ConstraintType {
    return this.data.type
  }

  get status(): ConstraintStatus {
    return this.data.status
  }

  set status(value: ConstraintStatus) {
    this.data.status = value
    this.updateTimestamp()
  }

  get entities(): ConstraintDto['entities'] {
    return {
      points: this.data.entities.points ? [...this.data.entities.points] : undefined,
      lines: this.data.entities.lines ? [...this.data.entities.lines] : undefined,
      planes: this.data.entities.planes ? [...this.data.entities.planes] : undefined
    }
  }

  get parameters(): ConstraintDto['parameters'] {
    return { ...this.data.parameters }
  }

  setParameter(key: string, value: any): void {
    this.data.parameters[key] = value
    this.updateTimestamp()
  }

  getParameter<T>(key: string): T | undefined {
    return this.data.parameters[key] as T
  }

  get targetValue(): number | undefined {
    return this.data.parameters.targetValue
  }

  set targetValue(value: number | undefined) {
    this.data.parameters.targetValue = value
    this.updateTimestamp()
  }

  get tolerance(): number {
    return this.data.parameters.tolerance ?? 0.001
  }

  set tolerance(value: number) {
    if (value < 0) {
      throw new Error('Tolerance must be non-negative')
    }
    this.data.parameters.tolerance = value
    this.updateTimestamp()
  }

  get priority(): number {
    return this.data.parameters.priority ?? 5
  }

  set priority(value: number) {
    if (value < 1 || value > 10) {
      throw new Error('Priority must be between 1 and 10')
    }
    this.data.parameters.priority = value
    this.updateTimestamp()
  }

  get currentValue(): number | undefined {
    return this.data.currentValue
  }

  set currentValue(value: number | undefined) {
    this.data.currentValue = value
    this.updateTimestamp()
  }

  get error(): number | undefined {
    return this.data.error
  }

  set error(value: number | undefined) {
    this.data.error = value
    this.updateTimestamp()
  }

  get isEnabled(): boolean {
    return this.data.isEnabled
  }

  set isEnabled(value: boolean) {
    this.data.isEnabled = value
    this.updateTimestamp()
  }

  get isDriving(): boolean {
    return this.data.isDriving
  }

  set isDriving(value: boolean) {
    this.data.isDriving = value
    this.updateTimestamp()
  }

  get group(): string | undefined {
    return this.data.group
  }

  set group(value: string | undefined) {
    this.data.group = value
    this.updateTimestamp()
  }

  get tags(): string[] {
    return this.data.tags ? [...this.data.tags] : []
  }

  set tags(value: string[]) {
    this.data.tags = [...value]
    this.updateTimestamp()
  }

  get notes(): string | undefined {
    return this.data.notes
  }

  set notes(value: string | undefined) {
    this.data.notes = value
    this.updateTimestamp()
  }

  get createdAt(): string {
    return this.data.createdAt
  }

  get updatedAt(): string {
    return this.data.updatedAt
  }

  // Utility methods
  isSatisfied(): boolean {
    return this.data.status === 'satisfied'
  }

  isViolated(): boolean {
    return this.data.status === 'violated'
  }

  hasTarget(): boolean {
    return this.data.parameters.targetValue !== undefined
  }

  getEntityIds(): EntityId[] {
    return this.getDependencies()
  }

  getPointIds(): PointId[] {
    return this.data.entities.points || []
  }

  getLineIds(): LineId[] {
    return this.data.entities.lines || []
  }

  getPlaneIds(): PlaneId[] {
    return this.data.entities.planes || []
  }

  clone(newId: ConstraintId, newName?: string): Constraint {
    const clonedData: ConstraintDto = {
      ...this.data,
      id: newId,
      name: newName || `${this.data.name} (copy)`,
      entities: {
        points: this.data.entities.points ? [...this.data.entities.points] : undefined,
        lines: this.data.entities.lines ? [...this.data.entities.lines] : undefined,
        planes: this.data.entities.planes ? [...this.data.entities.planes] : undefined
      },
      parameters: { ...this.data.parameters },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    return new Constraint(this.repo, clonedData)
  }

  private updateTimestamp(): void {
    this.data.updatedAt = new Date().toISOString()
  }

  // Override visibility (constraint enabled state)
  setVisible(visible: boolean): void {
    this.data.isEnabled = visible
    this.updateTimestamp()
  }

  // Constraint evaluation (placeholder - would be implemented with actual geometry)
  evaluate(): { value: number; satisfied: boolean } {
    // This would contain the actual constraint evaluation logic
    // For now, return placeholder values
    const value = this.data.currentValue ?? 0
    const target = this.data.parameters.targetValue ?? 0
    const tolerance = this.tolerance
    const satisfied = Math.abs(value - target) <= tolerance

    return { value, satisfied }
  }

  // Update constraint state after evaluation
  updateFromEvaluation(value: number, satisfied: boolean): void {
    this.data.currentValue = value
    this.data.error = this.data.parameters.targetValue !== undefined
      ? Math.abs(value - this.data.parameters.targetValue)
      : undefined
    this.data.status = satisfied ? 'satisfied' : 'violated'
    this.updateTimestamp()
  }
}

// Helper function for getting constraint point IDs (replaces the legacy version)
export function getConstraintPointIds(constraint: ConstraintDto): PointId[] {
  return constraint.entities.points || []
}

// Helper function for getting all constraint entity IDs
export function getConstraintEntityIds(constraint: ConstraintDto): EntityId[] {
  const ids: EntityId[] = []

  if (constraint.entities.points) {
    ids.push(...constraint.entities.points.map(id => id as EntityId))
  }
  if (constraint.entities.lines) {
    ids.push(...constraint.entities.lines.map(id => id as EntityId))
  }
  if (constraint.entities.planes) {
    ids.push(...constraint.entities.planes.map(id => id as EntityId))
  }

  return ids
}