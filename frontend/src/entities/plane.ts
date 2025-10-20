import type { PlaneId, PointId, EntityId } from '../types/ids'
import type { ISelectable, SelectableType } from '../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../validation/validator'
import type { WorldPoint } from './world-point'
import { ValidationHelpers } from '../validation/validator'

export interface PlaneDto {
  id: PlaneId
  name: string
  pointIds: PointId[]
  color: string
  isVisible: boolean
  opacity: number
  fillStyle: 'solid' | 'wireframe' | 'transparent'
  group?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export class Plane implements ISelectable, IValidatable {
  selected = false

  id: PlaneId
  name: string
  points: Set<WorldPoint>
  color: string
  isVisible: boolean
  opacity: number
  fillStyle: 'solid' | 'wireframe' | 'transparent'
  group?: string
  tags?: string[]
  createdAt: string
  updatedAt: string

  private constructor(
    id: PlaneId,
    name: string,
    points: Set<WorldPoint>,
    color: string,
    isVisible: boolean,
    opacity: number,
    fillStyle: 'solid' | 'wireframe' | 'transparent',
    group: string | undefined,
    tags: string[] | undefined,
    createdAt: string,
    updatedAt: string
  ) {
    this.id = id
    this.name = name
    this.points = points
    this.color = color
    this.isVisible = isVisible
    this.opacity = opacity
    this.fillStyle = fillStyle
    this.group = group
    this.tags = tags
    this.createdAt = createdAt
    this.updatedAt = updatedAt
  }

  static create(
    id: PlaneId,
    name: string,
    points: WorldPoint[],
    options: {
      color?: string
      isVisible?: boolean
      opacity?: number
      fillStyle?: 'solid' | 'wireframe' | 'transparent'
      group?: string
      tags?: string[]
    } = {}
  ): Plane {
    if (points.length < 3) {
      throw new Error('Plane requires at least 3 points')
    }

    const now = new Date().toISOString()
    return new Plane(
      id,
      name,
      new Set(points),
      options.color || '#cccccc',
      options.isVisible ?? true,
      options.opacity ?? 0.5,
      options.fillStyle || 'transparent',
      options.group,
      options.tags,
      now,
      now
    )
  }

  getId(): PlaneId {
    return this.id
  }

  getType(): SelectableType {
    return 'plane'
  }

  getName(): string {
    return this.name
  }

  isLocked(): boolean {
    return false
  }

  getDependencies(): EntityId[] {
    return Array.from(this.points).map(p => p.getId() as EntityId)
  }

  getDependents(): EntityId[] {
    return []
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

  validate(context: ValidationContext): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    const nameError = ValidationHelpers.validateRequiredField(
      this.name,
      'name',
      this.id,
      'plane'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(this.id, 'plane')
    if (idError) errors.push(idError)

    if (this.points.size < 3) {
      errors.push(ValidationHelpers.createError(
        'INSUFFICIENT_POINTS',
        'Plane requires at least 3 points',
        this.id,
        'plane',
        'points'
      ))
    }

    if (this.color && !/^#[0-9A-Fa-f]{6}$/.test(this.color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        this.id,
        'plane',
        'color'
      ))
    }

    if (this.opacity < 0 || this.opacity > 1) {
      errors.push(ValidationHelpers.createError(
        'INVALID_OPACITY',
        'opacity must be between 0 and 1',
        this.id,
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

  getPointCount(): number {
    return this.points.size
  }

  addPoint(point: WorldPoint): void {
    this.points.add(point)
    this.updatedAt = new Date().toISOString()
  }

  removePoint(point: WorldPoint): void {
    this.points.delete(point)
    this.updatedAt = new Date().toISOString()
  }

  hasPoint(point: WorldPoint): boolean {
    return this.points.has(point)
  }

  getPoints(): WorldPoint[] {
    return Array.from(this.points)
  }

  clone(newId: PlaneId, newName?: string): Plane {
    const now = new Date().toISOString()
    return new Plane(
      newId,
      newName || `${this.name} (copy)`,
      new Set(this.points),
      this.color,
      this.isVisible,
      this.opacity,
      this.fillStyle,
      this.group,
      this.tags,
      now,
      now
    )
  }

  setVisible(visible: boolean): void {
    this.isVisible = visible
    this.updatedAt = new Date().toISOString()
  }

  getNormal(): [number, number, number] | null {
    return null
  }

  getArea(): number | null {
    return null
  }

  isCoplanar(): boolean {
    return true
  }
}
