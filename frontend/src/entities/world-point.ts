// WorldPoint entity with DTO and domain class co-located

import type { PointId, EntityId } from '../types/ids'
import type { ISelectable, SelectableType } from '../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../validation/validator'
import { ValidationHelpers } from '../validation/validator'

// DTO for storage (clean, no legacy)
export interface WorldPointDto {
  id: PointId
  name: string
  xyz?: [number, number, number]
  color: string
  isVisible: boolean
  isOrigin: boolean
  isLocked: boolean
  group?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

// Repository interface (to avoid circular dependency)
export interface WorldPointRepository {
  getLinesByPoint(pointId: PointId): EntityId[]
  getConstraintsByPoint(pointId: PointId): EntityId[]
  entityExists(id: EntityId): boolean
}

// Domain class with runtime behavior
export class WorldPoint implements ISelectable, IValidatable {
  private selected = false

  private constructor(
    private repo: WorldPointRepository,
    private data: WorldPointDto
  ) {}

  // Factory methods
  static fromDTO(dto: WorldPointDto, repo: WorldPointRepository): WorldPoint {
    // Validate DTO structure
    const validation = WorldPoint.validateDto(dto)
    if (!validation.isValid) {
      throw new Error(`Invalid WorldPoint DTO: ${validation.errors.map(e => e.message).join(', ')}`)
    }
    return new WorldPoint(repo, { ...dto })
  }

  static create(
    id: PointId,
    name: string,
    repo: WorldPointRepository,
    options: {
      xyz?: [number, number, number]
      color?: string
      isVisible?: boolean
      isOrigin?: boolean
      isLocked?: boolean
      group?: string
      tags?: string[]
    } = {}
  ): WorldPoint {
    const now = new Date().toISOString()
    const dto: WorldPointDto = {
      id,
      name,
      xyz: options.xyz,
      color: options.color || '#ffffff',
      isVisible: options.isVisible ?? true,
      isOrigin: options.isOrigin ?? false,
      isLocked: options.isLocked ?? false,
      group: options.group,
      tags: options.tags,
      createdAt: now,
      updatedAt: now
    }
    return new WorldPoint(repo, dto)
  }

  // Serialization
  toDTO(): WorldPointDto {
    return { ...this.data }
  }

  // ISelectable implementation
  getId(): PointId {
    return this.data.id
  }

  getType(): SelectableType {
    return 'point'
  }

  getName(): string {
    return this.data.name
  }

  isVisible(): boolean {
    return this.data.isVisible
  }

  isLocked(): boolean {
    return this.data.isLocked
  }

  getDependencies(): EntityId[] {
    // Points don't depend on other entities (they're leaf nodes)
    return []
  }

  getDependents(): EntityId[] {
    // Lines and constraints that depend on this point
    const dependents: EntityId[] = []
    dependents.push(...this.repo.getLinesByPoint(this.data.id))
    dependents.push(...this.repo.getConstraintsByPoint(this.data.id))
    return dependents
  }

  isSelected(): boolean {
    return this.selected
  }

  setSelected(selected: boolean): void {
    this.selected = selected
  }

  canDelete(): boolean {
    // Can delete if no other entities depend on this point
    return this.getDependents().length === 0
  }

  getDeleteWarning(): string | null {
    const dependents = this.getDependents()
    if (dependents.length === 0) {
      return null
    }

    const lines = this.repo.getLinesByPoint(this.data.id)
    const constraints = this.repo.getConstraintsByPoint(this.data.id)

    const parts: string[] = []
    if (lines.length > 0) {
      parts.push(`${lines.length} line${lines.length === 1 ? '' : 's'}`)
    }
    if (constraints.length > 0) {
      parts.push(`${constraints.length} constraint${constraints.length === 1 ? '' : 's'}`)
    }

    return `Deleting point "${this.data.name}" will also delete ${parts.join(' and ')}`
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
      'point'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(this.data.id, 'point')
    if (idError) errors.push(idError)

    // Coordinate validation
    if (this.data.xyz) {
      if (!Array.isArray(this.data.xyz) || this.data.xyz.length !== 3) {
        errors.push(ValidationHelpers.createError(
          'INVALID_COORDINATES',
          'xyz must be an array of 3 numbers',
          this.data.id,
          'point',
          'xyz'
        ))
      } else if (!this.data.xyz.every(coord => typeof coord === 'number' && !isNaN(coord))) {
        errors.push(ValidationHelpers.createError(
          'INVALID_COORDINATES',
          'xyz coordinates must be valid numbers',
          this.data.id,
          'point',
          'xyz'
        ))
      }
    }

    // Color validation
    if (this.data.color && !/^#[0-9A-Fa-f]{6}$/.test(this.data.color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        this.data.id,
        'point',
        'color'
      ))
    }

    // Check dependent entities exist
    const dependents = this.getDependents()
    for (const depId of dependents) {
      if (!context.pointExists(depId) && !context.lineExists(depId) && !context.constraintExists(depId)) {
        warnings.push(ValidationHelpers.createWarning(
          'DEPENDENT_NOT_FOUND',
          `Dependent entity ${depId} not found`,
          this.data.id,
          'point'
        ))
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Point validation passed' : `Point validation failed: ${errors.length} errors`
    }
  }

  // Static DTO validation
  private static validateDto(dto: WorldPointDto): ValidationResult {
    const errors: ValidationError[] = []

    if (!dto.id) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'id is required',
        dto.id,
        'point',
        'id'
      ))
    }

    if (!dto.name) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'name is required',
        dto.id,
        'point',
        'name'
      ))
    }

    if (dto.color !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(dto.color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        dto.id,
        'point',
        'color'
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

  get xyz(): [number, number, number] | undefined {
    return this.data.xyz ? [...this.data.xyz] : undefined
  }

  set xyz(value: [number, number, number] | undefined) {
    this.data.xyz = value ? [...value] : undefined
    this.updateTimestamp()
  }

  get color(): string {
    return this.data.color
  }

  set color(value: string) {
    this.data.color = value
    this.updateTimestamp()
  }

  get isOrigin(): boolean {
    return this.data.isOrigin
  }

  set isOrigin(value: boolean) {
    this.data.isOrigin = value
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

  get createdAt(): string {
    return this.data.createdAt
  }

  get updatedAt(): string {
    return this.data.updatedAt
  }

  // Utility methods
  hasCoordinates(): boolean {
    return this.data.xyz !== undefined
  }

  distanceTo(other: WorldPoint): number | null {
    if (!this.hasCoordinates() || !other.hasCoordinates()) {
      return null
    }

    const [x1, y1, z1] = this.data.xyz!
    const [x2, y2, z2] = other.xyz!

    return Math.sqrt(
      Math.pow(x2 - x1, 2) +
      Math.pow(y2 - y1, 2) +
      Math.pow(z2 - z1, 2)
    )
  }

  clone(newId: PointId, newName?: string): WorldPoint {
    const clonedData: WorldPointDto = {
      ...this.data,
      id: newId,
      name: newName || `${this.data.name} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    return new WorldPoint(this.repo, clonedData)
  }

  private updateTimestamp(): void {
    this.data.updatedAt = new Date().toISOString()
  }

  // Override visibility and lock state
  setVisible(visible: boolean): void {
    this.data.isVisible = visible
    this.updateTimestamp()
  }

  setLocked(locked: boolean): void {
    this.data.isLocked = locked
    this.updateTimestamp()
  }
}