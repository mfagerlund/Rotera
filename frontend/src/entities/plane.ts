// Plane entity with DTO and domain class co-located

import type { PlaneId, PointId, EntityId } from '../types/ids'
import type { ISelectable, SelectableType } from '../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../validation/validator'
import { ValidationHelpers } from '../validation/validator'

// DTO for storage (clean, no legacy)
export interface PlaneDto {
  id: PlaneId
  name: string
  pointIds: PointId[] // At least 3 points to define a plane
  color: string
  isVisible: boolean
  opacity: number // 0-1 for transparency
  fillStyle: 'solid' | 'wireframe' | 'transparent'
  group?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

// Repository interface (to avoid circular dependency)
export interface PlaneRepository {
  getPoint(pointId: PointId): EntityId | undefined
  getConstraintsByPlane(planeId: PlaneId): EntityId[]
  entityExists(id: EntityId): boolean
  pointExists(pointId: PointId): boolean
}

// Domain class with runtime behavior
export class Plane implements ISelectable, IValidatable {
  private selected = false

  private constructor(
    private repo: PlaneRepository,
    private data: PlaneDto
  ) {}

  // Factory methods
  static fromDTO(dto: PlaneDto, repo: PlaneRepository): Plane {
    const validation = Plane.validateDto(dto)
    if (!validation.isValid) {
      throw new Error(`Invalid Plane DTO: ${validation.errors.map(e => e.message).join(', ')}`)
    }
    return new Plane(repo, { ...dto })
  }

  static create(
    id: PlaneId,
    name: string,
    pointIds: PointId[],
    repo: PlaneRepository,
    options: {
      color?: string
      isVisible?: boolean
      opacity?: number
      fillStyle?: 'solid' | 'wireframe' | 'transparent'
      group?: string
      tags?: string[]
    } = {}
  ): Plane {
    if (pointIds.length < 3) {
      throw new Error('Plane requires at least 3 points')
    }

    const now = new Date().toISOString()
    const dto: PlaneDto = {
      id,
      name,
      pointIds: [...pointIds],
      color: options.color || '#cccccc',
      isVisible: options.isVisible ?? true,
      opacity: options.opacity ?? 0.5,
      fillStyle: options.fillStyle || 'transparent',
      group: options.group,
      tags: options.tags,
      createdAt: now,
      updatedAt: now
    }
    return new Plane(repo, dto)
  }

  // Serialization
  toDTO(): PlaneDto {
    return {
      ...this.data,
      pointIds: [...this.data.pointIds]
    }
  }

  // ISelectable implementation
  getId(): PlaneId {
    return this.data.id
  }

  getType(): SelectableType {
    return 'plane'
  }

  getName(): string {
    return this.data.name
  }

  isVisible(): boolean {
    return this.data.isVisible
  }

  isLocked(): boolean {
    // Planes aren't directly lockable, but depend on their points
    return false
  }

  getDependencies(): EntityId[] {
    // Planes depend on their points
    return this.data.pointIds.map(id => id as EntityId)
  }

  getDependents(): EntityId[] {
    // Constraints that depend on this plane
    const dependents: EntityId[] = []
    dependents.push(...this.repo.getConstraintsByPlane(this.data.id))
    return dependents
  }

  isSelected(): boolean {
    return this.selected
  }

  setSelected(selected: boolean): void {
    this.selected = selected
  }

  canDelete(): boolean {
    // Can delete if no other entities depend on this plane
    return this.getDependents().length === 0
  }

  getDeleteWarning(): string | null {
    const dependents = this.getDependents()
    if (dependents.length === 0) {
      return null
    }

    const constraints = this.repo.getConstraintsByPlane(this.data.id)

    return `Deleting plane "${this.data.name}" will also delete ${constraints.length} constraint${constraints.length === 1 ? '' : 's'}`
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
      'plane'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(this.data.id, 'plane')
    if (idError) errors.push(idError)

    // Point validation
    if (!this.data.pointIds || this.data.pointIds.length < 3) {
      errors.push(ValidationHelpers.createError(
        'INSUFFICIENT_POINTS',
        'Plane requires at least 3 points',
        this.data.id,
        'plane',
        'pointIds'
      ))
    } else {
      // Check that all points exist
      for (let i = 0; i < this.data.pointIds.length; i++) {
        const pointId = this.data.pointIds[i]
        if (!context.pointExists(pointId as EntityId)) {
          errors.push(ValidationHelpers.createError(
            'INVALID_POINT_REFERENCE',
            `pointIds[${i}] references non-existent point: ${pointId}`,
            this.data.id,
            'plane',
            'pointIds'
          ))
        }
      }

      // Check for duplicate points
      const uniquePoints = new Set(this.data.pointIds)
      if (uniquePoints.size !== this.data.pointIds.length) {
        errors.push(ValidationHelpers.createError(
          'DUPLICATE_POINTS',
          'Plane contains duplicate point references',
          this.data.id,
          'plane',
          'pointIds'
        ))
      }
    }

    // Color validation
    if (this.data.color && !/^#[0-9A-Fa-f]{6}$/.test(this.data.color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        this.data.id,
        'plane',
        'color'
      ))
    }

    // Opacity validation
    if (this.data.opacity < 0 || this.data.opacity > 1) {
      errors.push(ValidationHelpers.createError(
        'INVALID_OPACITY',
        'opacity must be between 0 and 1',
        this.data.id,
        'plane',
        'opacity'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Plane validation passed' : `Plane validation failed: ${errors.length} errors`
    }
  }

  // Static DTO validation
  private static validateDto(dto: PlaneDto): ValidationResult {
    const errors: ValidationError[] = []

    if (!dto.id) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'id is required',
        dto.id,
        'plane',
        'id'
      ))
    }

    if (!dto.name) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'name is required',
        dto.id,
        'plane',
        'name'
      ))
    }

    if (!dto.pointIds || !Array.isArray(dto.pointIds) || dto.pointIds.length < 3) {
      errors.push(ValidationHelpers.createError(
        'INSUFFICIENT_POINTS',
        'Plane requires at least 3 points',
        dto.id,
        'plane',
        'pointIds'
      ))
    }

    if (dto.opacity !== undefined && (dto.opacity < 0 || dto.opacity > 1)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_OPACITY',
        'opacity must be between 0 and 1',
        dto.id,
        'plane',
        'opacity'
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

  get pointIds(): PointId[] {
    return [...this.data.pointIds]
  }

  get color(): string {
    return this.data.color
  }

  set color(value: string) {
    this.data.color = value
    this.updateTimestamp()
  }

  get opacity(): number {
    return this.data.opacity
  }

  set opacity(value: number) {
    if (value < 0 || value > 1) {
      throw new Error('Opacity must be between 0 and 1')
    }
    this.data.opacity = value
    this.updateTimestamp()
  }

  get fillStyle(): 'solid' | 'wireframe' | 'transparent' {
    return this.data.fillStyle
  }

  set fillStyle(value: 'solid' | 'wireframe' | 'transparent') {
    this.data.fillStyle = value
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
  getPointCount(): number {
    return this.data.pointIds.length
  }

  addPoint(pointId: PointId): void {
    if (!this.data.pointIds.includes(pointId)) {
      this.data.pointIds.push(pointId)
      this.updateTimestamp()
    }
  }

  removePoint(pointId: PointId): void {
    const index = this.data.pointIds.indexOf(pointId)
    if (index !== -1) {
      this.data.pointIds.splice(index, 1)
      this.updateTimestamp()
    }
  }

  hasPoint(pointId: PointId): boolean {
    return this.data.pointIds.includes(pointId)
  }

  clone(newId: PlaneId, newName?: string): Plane {
    const clonedData: PlaneDto = {
      ...this.data,
      id: newId,
      name: newName || `${this.data.name} (copy)`,
      pointIds: [...this.data.pointIds],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    return new Plane(this.repo, clonedData)
  }

  private updateTimestamp(): void {
    this.data.updatedAt = new Date().toISOString()
  }

  // Override visibility
  setVisible(visible: boolean): void {
    this.data.isVisible = visible
    this.updateTimestamp()
  }

  // Geometric operations (placeholders - would need point coordinates)
  getNormal(): [number, number, number] | null {
    // Would need access to point coordinates through repository
    return null
  }

  getArea(): number | null {
    // Would need access to point coordinates through repository
    return null
  }

  isCoplanar(): boolean {
    // Would need to check if all points are actually coplanar
    return true // Placeholder
  }
}