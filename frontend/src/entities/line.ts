// Line entity with DTO and domain class co-located

import type { LineId, PointId, EntityId } from '../types/ids'
import type { ISelectable, SelectableType } from '../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../validation/validator'
import { ValidationHelpers } from '../validation/validator'
import type { WorldPoint } from './world-point'

// Forward declarations to avoid circular imports
interface IConstraint extends ISelectable {
  getId(): EntityId
}

interface IPlane extends ISelectable {
  getId(): EntityId
}

// DTO for frontend storage (rich metadata)
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

// DTO for backend communication (minimal mathematical data)
export interface LineSolverDto {
  id: LineId
  pointA: PointId
  pointB: PointId
}

// Domain class with runtime behavior
export class Line implements ISelectable, IValidatable {
  private _selected = false
  private _referencingConstraints: Set<IConstraint> = new Set()
  private _referencingPlanes: Set<IPlane> = new Set()

  private constructor(
    private _id: LineId,
    private _name: string,
    private _pointA: WorldPoint,
    private _pointB: WorldPoint,
    private _color: string,
    private _isVisible: boolean,
    private _isConstruction: boolean,
    private _lineStyle: 'solid' | 'dashed' | 'dotted',
    private _thickness: number,
    private _group: string | undefined,
    private _tags: string[],
    private _createdAt: string,
    private _updatedAt: string
  ) {
    // Establish bidirectional relationships
    this._pointA.addConnectedLine(this)
    this._pointB.addConnectedLine(this)
  }

  // Factory methods
  static fromDTO(dto: LineDto, pointA: WorldPoint, pointB: WorldPoint): Line {
    const validation = Line.validateDto(dto)
    if (!validation.isValid) {
      throw new Error(`Invalid Line DTO: ${validation.errors.map(e => e.message).join(', ')}`)
    }
    return new Line(
      dto.id,
      dto.name,
      pointA,
      pointB,
      dto.color,
      dto.isVisible,
      dto.isConstruction,
      dto.lineStyle,
      dto.thickness,
      dto.group,
      dto.tags || [],
      dto.createdAt,
      dto.updatedAt
    )
  }

  static create(
    id: LineId,
    name: string,
    pointA: WorldPoint,
    pointB: WorldPoint,
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
    return new Line(
      id,
      name,
      pointA,
      pointB,
      options.color || '#ffffff',
      options.isVisible ?? true,
      options.isConstruction ?? false,
      options.lineStyle || 'solid',
      options.thickness || 1,
      options.group,
      options.tags || [],
      now,
      now
    )
  }

  // Serialization
  toDTO(): LineDto {
    return {
      id: this._id,
      name: this._name,
      pointA: this._pointA.getId(),
      pointB: this._pointB.getId(),
      color: this._color,
      isVisible: this._isVisible,
      isConstruction: this._isConstruction,
      lineStyle: this._lineStyle,
      thickness: this._thickness,
      group: this._group,
      tags: [...this._tags],
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    }
  }

  // Backend solver DTO (minimal mathematical data)
  toSolverDTO(): LineSolverDto {
    return {
      id: this._id,
      pointA: this._pointA.getId(),
      pointB: this._pointB.getId()
    }
  }

  // ISelectable implementation
  getId(): LineId {
    return this._id
  }

  getType(): SelectableType {
    return 'line'
  }

  getName(): string {
    return this._name
  }

  isVisible(): boolean {
    return this._isVisible
  }

  isLocked(): boolean {
    // Lines are locked if either point is locked
    return this._pointA.isLocked() || this._pointB.isLocked()
  }

  getDependencies(): EntityId[] {
    // Lines depend on their two points
    return [this._pointA.getId(), this._pointB.getId()]
  }

  getDependents(): EntityId[] {
    // Return IDs of dependent entities
    const dependents: EntityId[] = []
    this._referencingConstraints.forEach(constraint => dependents.push(constraint.getId()))
    this._referencingPlanes.forEach(plane => dependents.push(plane.getId()))
    return dependents
  }

  isSelected(): boolean {
    return this._selected
  }

  setSelected(selected: boolean): void {
    this._selected = selected
  }

  canDelete(): boolean {
    // Can delete if no other entities depend on this line
    return this._referencingConstraints.size === 0 && this._referencingPlanes.size === 0
  }

  getDeleteWarning(): string | null {
    if (this._referencingConstraints.size === 0 && this._referencingPlanes.size === 0) {
      return null
    }

    const parts: string[] = []
    if (this._referencingConstraints.size > 0) {
      parts.push(`${this._referencingConstraints.size} constraint${this._referencingConstraints.size === 1 ? '' : 's'}`)
    }
    if (this._referencingPlanes.size > 0) {
      parts.push(`${this._referencingPlanes.size} plane${this._referencingPlanes.size === 1 ? '' : 's'}`)
    }

    return `Deleting line "${this._name}" will also delete ${parts.join(' and ')}`
  }

  // Internal methods for managing relationships
  addReferencingConstraint(constraint: IConstraint): void {
    this._referencingConstraints.add(constraint)
  }

  removeReferencingConstraint(constraint: IConstraint): void {
    this._referencingConstraints.delete(constraint)
  }

  addReferencingPlane(plane: IPlane): void {
    this._referencingPlanes.add(plane)
  }

  removeReferencingPlane(plane: IPlane): void {
    this._referencingPlanes.delete(plane)
  }

  // Cleanup method called when line is deleted
  cleanup(): void {
    // Remove self from points
    this._pointA.removeConnectedLine(this)
    this._pointB.removeConnectedLine(this)
  }

  // IValidatable implementation
  validate(context: ValidationContext): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Required field validation
    const nameError = ValidationHelpers.validateRequiredField(
      this._name,
      'name',
      this._id,
      'line'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(this._id, 'line')
    if (idError) errors.push(idError)

    // Point validation (objects must exist)
    if (!this._pointA) {
      errors.push(ValidationHelpers.createError(
        'MISSING_POINT',
        'pointA is required',
        this._id,
        'line',
        'pointA'
      ))
    }

    if (!this._pointB) {
      errors.push(ValidationHelpers.createError(
        'MISSING_POINT',
        'pointB is required',
        this._id,
        'line',
        'pointB'
      ))
    }

    // Check for self-referencing line
    if (this._pointA === this._pointB) {
      errors.push(ValidationHelpers.createError(
        'SELF_REFERENCING_LINE',
        'Line cannot reference the same point twice',
        this._id,
        'line'
      ))
    }

    // Color validation
    if (this._color && !/^#[0-9A-Fa-f]{6}$/.test(this._color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        this._id,
        'line',
        'color'
      ))
    }

    // Thickness validation
    if (this._thickness <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_THICKNESS',
        'thickness must be greater than 0',
        this._id,
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
    return this._name
  }

  set name(value: string) {
    this._name = value
    this.updateTimestamp()
  }

  // Direct object access (primary interface)
  get pointA(): WorldPoint {
    return this._pointA
  }

  get pointB(): WorldPoint {
    return this._pointB
  }

  // Direct object access (no caching needed)
  get points(): [WorldPoint, WorldPoint] {
    return [this._pointA, this._pointB]
  }

  get referencingConstraints(): IConstraint[] {
    return Array.from(this._referencingConstraints)
  }

  get referencingPlanes(): IPlane[] {
    return Array.from(this._referencingPlanes)
  }

  get color(): string {
    return this._color
  }

  set color(value: string) {
    this._color = value
    this.updateTimestamp()
  }

  get isConstruction(): boolean {
    return this._isConstruction
  }

  set isConstruction(value: boolean) {
    this._isConstruction = value
    this.updateTimestamp()
  }

  get lineStyle(): 'solid' | 'dashed' | 'dotted' {
    return this._lineStyle
  }

  set lineStyle(value: 'solid' | 'dashed' | 'dotted') {
    this._lineStyle = value
    this.updateTimestamp()
  }

  get thickness(): number {
    return this._thickness
  }

  set thickness(value: number) {
    if (value <= 0) {
      throw new Error('Thickness must be greater than 0')
    }
    this._thickness = value
    this.updateTimestamp()
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

  get createdAt(): string {
    return this._createdAt
  }

  get updatedAt(): string {
    return this._updatedAt
  }

  // Enhanced utility methods using direct references
  length(): number | null {
    if (!this._pointA.xyz || !this._pointB.xyz) {
      return null
    }

    const [x1, y1, z1] = this._pointA.xyz
    const [x2, y2, z2] = this._pointB.xyz

    return Math.sqrt(
      Math.pow(x2 - x1, 2) +
      Math.pow(y2 - y1, 2) +
      Math.pow(z2 - z1, 2)
    )
  }

  getDirection(): [number, number, number] | null {
    if (!this._pointA.xyz || !this._pointB.xyz) {
      return null
    }

    const [x1, y1, z1] = this._pointA.xyz
    const [x2, y2, z2] = this._pointB.xyz

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
    if (!this._pointA.xyz || !this._pointB.xyz) {
      return null
    }

    const [x1, y1, z1] = this._pointA.xyz
    const [x2, y2, z2] = this._pointB.xyz

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
    if (!this._pointA.xyz || !this._pointB.xyz) {
      return false
    }

    const [x, y, z] = point
    const [x1, y1, z1] = this._pointA.xyz
    const [x2, y2, z2] = this._pointB.xyz

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
    const now = new Date().toISOString()
    return new Line(
      newId,
      newName || `${this._name} (copy)`,
      this._pointA,
      this._pointB,
      this._color,
      this._isVisible,
      this._isConstruction,
      this._lineStyle,
      this._thickness,
      this._group,
      [...this._tags],
      now,
      now
    )
  }

  private updateTimestamp(): void {
    this._updatedAt = new Date().toISOString()
  }

  // Override visibility
  setVisible(visible: boolean): void {
    this._isVisible = visible
    this.updateTimestamp()
  }

  // Check if line connects to a specific point
  connectsTo(point: WorldPoint): boolean {
    return this._pointA === point || this._pointB === point
  }

  // Get the other endpoint
  getOtherPoint(point: WorldPoint): WorldPoint | null {
    if (this._pointA === point) {
      return this._pointB
    } else if (this._pointB === point) {
      return this._pointA
    }
    return null
  }
}