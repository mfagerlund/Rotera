// Line entity with DTO and domain class co-located

import type { LineId, PointId, EntityId } from '../types/ids'
import type { ISelectable, SelectableType } from '../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../validation/validator'
import { ValidationHelpers } from '../validation/validator'

// DTO for storage (clean, no legacy)
export interface LineDto {
  id: LineId
  name: string
  pointA: PointId
  pointB: PointId
  color: string
  isVisible: boolean
  isConstruction: boolean
  lineStyle: 'solid' | 'dashed' | 'dotted'
  thickness: number
  group?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

// Repository interface (to avoid circular dependency)
export interface LineRepository {
  getPoint(pointId: PointId): EntityId | undefined
  getConstraintsByLine(lineId: LineId): EntityId[]
  getPlanesByLine(lineId: LineId): EntityId[]
  entityExists(id: EntityId): boolean
  pointExists(pointId: PointId): boolean
  // Enhanced methods for smart references
  getReferenceManager?(): { resolve<T extends ISelectable>(id: EntityId, type: string): T | undefined }
}

// Domain class with runtime behavior
export class Line implements ISelectable, IValidatable {
  private selected = false

  // Smart reference caching for performance optimization
  private _pointARef?: any // WorldPoint reference cache
  private _pointBRef?: any // WorldPoint reference cache

  private constructor(
    private repo: LineRepository,
    private data: LineDto
  ) {}

  // Factory methods
  static fromDTO(dto: LineDto, repo: LineRepository): Line {
    const validation = Line.validateDto(dto)
    if (!validation.isValid) {
      throw new Error(`Invalid Line DTO: ${validation.errors.map(e => e.message).join(', ')}`)
    }
    return new Line(repo, { ...dto })
  }

  static create(
    id: LineId,
    name: string,
    pointA: PointId,
    pointB: PointId,
    repo: LineRepository,
    options: {
      color?: string
      isVisible?: boolean
      isConstruction?: boolean
      lineStyle?: 'solid' | 'dashed' | 'dotted'
      thickness?: number
      group?: string
      tags?: string[]
    } = {}
  ): Line {
    const now = new Date().toISOString()
    const dto: LineDto = {
      id,
      name,
      pointA,
      pointB,
      color: options.color || '#ffffff',
      isVisible: options.isVisible ?? true,
      isConstruction: options.isConstruction ?? false,
      lineStyle: options.lineStyle || 'solid',
      thickness: options.thickness || 1,
      group: options.group,
      tags: options.tags,
      createdAt: now,
      updatedAt: now
    }
    return new Line(repo, dto)
  }

  // Serialization
  toDTO(): LineDto {
    return { ...this.data }
  }

  // ISelectable implementation
  getId(): LineId {
    return this.data.id
  }

  getType(): SelectableType {
    return 'line'
  }

  getName(): string {
    return this.data.name
  }

  isVisible(): boolean {
    return this.data.isVisible
  }

  isLocked(): boolean {
    // Lines aren't directly lockable, but depend on their points
    return false
  }

  getDependencies(): EntityId[] {
    // Lines depend on their two points
    return [this.data.pointA as EntityId, this.data.pointB as EntityId]
  }

  getDependents(): EntityId[] {
    // Constraints and planes that depend on this line
    const dependents: EntityId[] = []
    dependents.push(...this.repo.getConstraintsByLine(this.data.id))
    dependents.push(...this.repo.getPlanesByLine(this.data.id))
    return dependents
  }

  isSelected(): boolean {
    return this.selected
  }

  setSelected(selected: boolean): void {
    this.selected = selected
  }

  canDelete(): boolean {
    // Can delete if no other entities depend on this line
    return this.getDependents().length === 0
  }

  getDeleteWarning(): string | null {
    const dependents = this.getDependents()
    if (dependents.length === 0) {
      return null
    }

    const constraints = this.repo.getConstraintsByLine(this.data.id)
    const planes = this.repo.getPlanesByLine(this.data.id)

    const parts: string[] = []
    if (constraints.length > 0) {
      parts.push(`${constraints.length} constraint${constraints.length === 1 ? '' : 's'}`)
    }
    if (planes.length > 0) {
      parts.push(`${planes.length} plane${planes.length === 1 ? '' : 's'}`)
    }

    return `Deleting line "${this.data.name}" will also delete ${parts.join(' and ')}`
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
      'line'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(this.data.id, 'line')
    if (idError) errors.push(idError)

    // Point validation
    if (!this.data.pointA) {
      errors.push(ValidationHelpers.createError(
        'MISSING_POINT',
        'pointA is required',
        this.data.id,
        'line',
        'pointA'
      ))
    } else if (!context.pointExists(this.data.pointA as EntityId)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_POINT_REFERENCE',
        `pointA references non-existent point: ${this.data.pointA}`,
        this.data.id,
        'line',
        'pointA'
      ))
    }

    if (!this.data.pointB) {
      errors.push(ValidationHelpers.createError(
        'MISSING_POINT',
        'pointB is required',
        this.data.id,
        'line',
        'pointB'
      ))
    } else if (!context.pointExists(this.data.pointB as EntityId)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_POINT_REFERENCE',
        `pointB references non-existent point: ${this.data.pointB}`,
        this.data.id,
        'line',
        'pointB'
      ))
    }

    // Check for self-referencing line
    if (this.data.pointA === this.data.pointB) {
      errors.push(ValidationHelpers.createError(
        'SELF_REFERENCING_LINE',
        'Line cannot reference the same point twice',
        this.data.id,
        'line'
      ))
    }

    // Color validation
    if (this.data.color && !/^#[0-9A-Fa-f]{6}$/.test(this.data.color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        this.data.id,
        'line',
        'color'
      ))
    }

    // Thickness validation
    if (this.data.thickness <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_THICKNESS',
        'thickness must be greater than 0',
        this.data.id,
        'line',
        'thickness'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Line validation passed' : `Line validation failed: ${errors.length} errors`
    }
  }

  // Static DTO validation
  private static validateDto(dto: LineDto): ValidationResult {
    const errors: ValidationError[] = []

    if (!dto.id) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'id is required',
        dto.id,
        'line',
        'id'
      ))
    }

    if (!dto.name) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'name is required',
        dto.id,
        'line',
        'name'
      ))
    }

    if (!dto.pointA) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'pointA is required',
        dto.id,
        'line',
        'pointA'
      ))
    }

    if (!dto.pointB) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'pointB is required',
        dto.id,
        'line',
        'pointB'
      ))
    }

    if (dto.pointA === dto.pointB) {
      errors.push(ValidationHelpers.createError(
        'SELF_REFERENCING_LINE',
        'Line cannot reference the same point twice',
        dto.id,
        'line'
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

  get pointA(): PointId {
    return this.data.pointA
  }

  get pointB(): PointId {
    return this.data.pointB
  }

  // Smart reference getters for performance optimization
  // Direct object access instead of ID-based repository lookups

  /**
   * Get the first point as a WorldPoint object (direct reference)
   * Uses smart caching to avoid repeated repository lookups
   */
  get pointAEntity(): any {
    if (!this._pointARef) {
      const refManager = this.repo.getReferenceManager?.()
      if (refManager) {
        this._pointARef = refManager.resolve(this.data.pointA as EntityId, 'point')
      }
    }
    return this._pointARef
  }

  /**
   * Get the second point as a WorldPoint object (direct reference)
   * Uses smart caching to avoid repeated repository lookups
   */
  get pointBEntity(): any {
    if (!this._pointBRef) {
      const refManager = this.repo.getReferenceManager?.()
      if (refManager) {
        this._pointBRef = refManager.resolve(this.data.pointB as EntityId, 'point')
      }
    }
    return this._pointBRef
  }

  /**
   * Get both points as an array of WorldPoint objects
   * More efficient than individual lookups for operations needing both points
   */
  get points(): [any, any] {
    return [this.pointAEntity, this.pointBEntity]
  }

  /**
   * Get both point IDs (backward compatibility)
   * Legacy method - prefer pointA/pointB for ID access or pointAEntity/pointBEntity for objects
   */
  getPointIds(): [PointId, PointId] {
    return [this.data.pointA, this.data.pointB]
  }

  /**
   * Invalidate cached references when underlying data changes
   * Called automatically on updates that might affect relationships
   */
  private invalidateReferences(): void {
    this._pointARef = undefined
    this._pointBRef = undefined
  }

  get color(): string {
    return this.data.color
  }

  set color(value: string) {
    this.data.color = value
    this.updateTimestamp()
  }

  get isConstruction(): boolean {
    return this.data.isConstruction
  }

  set isConstruction(value: boolean) {
    this.data.isConstruction = value
    this.updateTimestamp()
  }

  get lineStyle(): 'solid' | 'dashed' | 'dotted' {
    return this.data.lineStyle
  }

  set lineStyle(value: 'solid' | 'dashed' | 'dotted') {
    this.data.lineStyle = value
    this.updateTimestamp()
  }

  get thickness(): number {
    return this.data.thickness
  }

  set thickness(value: number) {
    if (value <= 0) {
      throw new Error('Thickness must be greater than 0')
    }
    this.data.thickness = value
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

  // Enhanced utility methods using smart references
  length(): number | null {
    const pointA = this.pointAEntity
    const pointB = this.pointBEntity

    if (!pointA?.xyz || !pointB?.xyz) {
      return null
    }

    const [x1, y1, z1] = pointA.xyz
    const [x2, y2, z2] = pointB.xyz

    return Math.sqrt(
      Math.pow(x2 - x1, 2) +
      Math.pow(y2 - y1, 2) +
      Math.pow(z2 - z1, 2)
    )
  }

  getDirection(): [number, number, number] | null {
    const pointA = this.pointAEntity
    const pointB = this.pointBEntity

    if (!pointA?.xyz || !pointB?.xyz) {
      return null
    }

    const [x1, y1, z1] = pointA.xyz
    const [x2, y2, z2] = pointB.xyz

    // Calculate direction vector
    const dx = x2 - x1
    const dy = y2 - y1
    const dz = z2 - z1

    // Normalize the vector
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (length === 0) return null

    return [dx / length, dy / length, dz / length]
  }

  /**
   * Get the midpoint of the line
   */
  getMidpoint(): [number, number, number] | null {
    const pointA = this.pointAEntity
    const pointB = this.pointBEntity

    if (!pointA?.xyz || !pointB?.xyz) {
      return null
    }

    const [x1, y1, z1] = pointA.xyz
    const [x2, y2, z2] = pointB.xyz

    return [
      (x1 + x2) / 2,
      (y1 + y2) / 2,
      (z1 + z2) / 2
    ]
  }

  /**
   * Check if a point lies on this line (within tolerance)
   */
  containsPoint(point: [number, number, number], tolerance: number = 1e-6): boolean {
    const pointA = this.pointAEntity
    const pointB = this.pointBEntity

    if (!pointA?.xyz || !pointB?.xyz) {
      return false
    }

    const [x, y, z] = point
    const [x1, y1, z1] = pointA.xyz
    const [x2, y2, z2] = pointB.xyz

    // Calculate cross product to check if point is collinear
    const crossProduct = [
      (y - y1) * (z2 - z1) - (z - z1) * (y2 - y1),
      (z - z1) * (x2 - x1) - (x - x1) * (z2 - z1),
      (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
    ]

    const crossMagnitude = Math.sqrt(
      crossProduct[0] * crossProduct[0] +
      crossProduct[1] * crossProduct[1] +
      crossProduct[2] * crossProduct[2]
    )

    return crossMagnitude < tolerance
  }

  clone(newId: LineId, newName?: string): Line {
    const clonedData: LineDto = {
      ...this.data,
      id: newId,
      name: newName || `${this.data.name} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    return new Line(this.repo, clonedData)
  }

  private updateTimestamp(): void {
    this.data.updatedAt = new Date().toISOString()
  }

  // Override visibility
  setVisible(visible: boolean): void {
    this.data.isVisible = visible
    this.updateTimestamp()
  }

  // Check if line connects to a specific point
  connectsTo(pointId: PointId): boolean {
    return this.data.pointA === pointId || this.data.pointB === pointId
  }

  // Get the other endpoint
  getOtherPoint(pointId: PointId): PointId | null {
    if (this.data.pointA === pointId) {
      return this.data.pointB
    } else if (this.data.pointB === pointId) {
      return this.data.pointA
    }
    return null
  }
}