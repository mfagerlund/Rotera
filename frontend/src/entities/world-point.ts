// WorldPoint entity with DTO and domain class co-located

import type { PointId, EntityId } from '../types/ids'
import type { ISelectable, SelectableType } from '../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../validation/validator'
import { ValidationHelpers } from '../validation/validator'

// DTO for frontend storage (rich metadata)
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

// DTO for backend communication (minimal mathematical data)
export interface WorldPointSolverDto {
  id: PointId
  xyz?: [number, number, number]
}

// Domain class with runtime behavior
export class WorldPoint implements ISelectable, IValidatable {
  private _selected = false
  private _connectedLines: Set<any> = new Set() // Will be typed as Line when Line class is ready
  private _referencingConstraints: Set<any> = new Set() // Will be typed as Constraint when ready

  private constructor(
    private _id: PointId,
    private _name: string,
    private _xyz: [number, number, number] | undefined,
    private _color: string,
    private _isVisible: boolean,
    private _isOrigin: boolean,
    private _isLocked: boolean,
    private _group: string | undefined,
    private _tags: string[],
    private _createdAt: string,
    private _updatedAt: string
  ) {}

  // Factory methods
  static fromDTO(dto: WorldPointDto): WorldPoint {
    // Validate DTO structure
    const validation = WorldPoint.validateDto(dto)
    if (!validation.isValid) {
      throw new Error(`Invalid WorldPoint DTO: ${validation.errors.map(e => e.message).join(', ')}`)
    }
    return new WorldPoint(
      dto.id,
      dto.name,
      dto.xyz,
      dto.color,
      dto.isVisible,
      dto.isOrigin,
      dto.isLocked,
      dto.group,
      dto.tags || [],
      dto.createdAt,
      dto.updatedAt
    )
  }

  static create(
    id: PointId,
    name: string,
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
    return new WorldPoint(
      id,
      name,
      options.xyz,
      options.color || '#ffffff',
      options.isVisible ?? true,
      options.isOrigin ?? false,
      options.isLocked ?? false,
      options.group,
      options.tags || [],
      now,
      now
    )
  }

  // Serialization
  toDTO(): WorldPointDto {
    return {
      id: this._id,
      name: this._name,
      xyz: this._xyz,
      color: this._color,
      isVisible: this._isVisible,
      isOrigin: this._isOrigin,
      isLocked: this._isLocked,
      group: this._group,
      tags: [...this._tags],
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    }
  }

  // Backend solver DTO (minimal mathematical data)
  toSolverDTO(): WorldPointSolverDto {
    return {
      id: this._id,
      xyz: this._xyz
    }
  }

  // ISelectable implementation
  getId(): PointId {
    return this._id
  }

  getType(): SelectableType {
    return 'point'
  }

  getName(): string {
    return this._name
  }

  isVisible(): boolean {
    return this._isVisible
  }

  isLocked(): boolean {
    return this._isLocked
  }

  getDependencies(): EntityId[] {
    // Points don't depend on other entities (they're leaf nodes)
    return []
  }

  getDependents(): EntityId[] {
    // Return IDs of connected entities for backwards compatibility
    const dependents: EntityId[] = []
    this._connectedLines.forEach(line => dependents.push(line.getId()))
    this._referencingConstraints.forEach(constraint => dependents.push(constraint.getId()))
    return dependents
  }

  isSelected(): boolean {
    return this._selected
  }

  setSelected(selected: boolean): void {
    this._selected = selected
  }

  canDelete(): boolean {
    // Can delete if no other entities depend on this point
    return this._connectedLines.size === 0 && this._referencingConstraints.size === 0
  }

  getDeleteWarning(): string | null {
    if (this._connectedLines.size === 0 && this._referencingConstraints.size === 0) {
      return null
    }

    const parts: string[] = []
    if (this._connectedLines.size > 0) {
      parts.push(`${this._connectedLines.size} line${this._connectedLines.size === 1 ? '' : 's'}`)
    }
    if (this._referencingConstraints.size > 0) {
      parts.push(`${this._referencingConstraints.size} constraint${this._referencingConstraints.size === 1 ? '' : 's'}`)
    }

    return `Deleting point "${this._name}" will also delete ${parts.join(' and ')}`
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
      'point'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(this._id, 'point')
    if (idError) errors.push(idError)

    // Coordinate validation
    if (this._xyz) {
      if (!Array.isArray(this._xyz) || this._xyz.length !== 3) {
        errors.push(ValidationHelpers.createError(
          'INVALID_COORDINATES',
          'xyz must be an array of 3 numbers',
          this._id,
          'point',
          'xyz'
        ))
      } else if (!this._xyz.every(coord => typeof coord === 'number' && !isNaN(coord))) {
        errors.push(ValidationHelpers.createError(
          'INVALID_COORDINATES',
          'xyz coordinates must be valid numbers',
          this._id,
          'point',
          'xyz'
        ))
      }
    }

    // Color validation
    if (this._color && !/^#[0-9A-Fa-f]{6}$/.test(this._color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        this._id,
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
          this._id,
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
    return this._name
  }

  set name(value: string) {
    this._name = value
    this.updateTimestamp()
  }

  get xyz(): [number, number, number] | undefined {
    return this._xyz ? [...this._xyz] : undefined
  }

  set xyz(value: [number, number, number] | undefined) {
    this._xyz = value ? [...value] : undefined
    this.updateTimestamp()
  }

  get color(): string {
    return this._color
  }

  set color(value: string) {
    this._color = value
    this.updateTimestamp()
  }

  get isOrigin(): boolean {
    return this._isOrigin
  }

  set isOrigin(value: boolean) {
    this._isOrigin = value
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

  // Direct object references (no repository needed)
  get connectedLines(): any[] {
    return Array.from(this._connectedLines)
  }

  get referencingConstraints(): any[] {
    return Array.from(this._referencingConstraints)
  }

  // Internal methods for managing relationships
  addConnectedLine(line: any): void {
    this._connectedLines.add(line)
  }

  removeConnectedLine(line: any): void {
    this._connectedLines.delete(line)
  }

  addReferencingConstraint(constraint: any): void {
    this._referencingConstraints.add(constraint)
  }

  removeReferencingConstraint(constraint: any): void {
    this._referencingConstraints.delete(constraint)
  }

  /**
   * Get all connected points through lines (direct object traversal)
   * Returns unique WorldPoint objects connected via lines
   */
  get connectedPoints(): any[] {
    const connectedPoints: any[] = []
    const seenPoints = new Set<any>()

    for (const line of this._connectedLines) {
      if (line.pointA !== this) {
        if (!seenPoints.has(line.pointA)) {
          connectedPoints.push(line.pointA)
          seenPoints.add(line.pointA)
        }
      }
      if (line.pointB !== this) {
        if (!seenPoints.has(line.pointB)) {
          connectedPoints.push(line.pointB)
          seenPoints.add(line.pointB)
        }
      }
    }

    return connectedPoints
  }

  /**
   * Get IDs of connected lines (backward compatibility)
   * Legacy method - prefer connectedLines for object access
   */
  getConnectedLineIds(): EntityId[] {
    return Array.from(this._connectedLines).map(line => line.getId())
  }

  /**
   * Get IDs of referencing constraints (backward compatibility)
   * Legacy method - prefer referencingConstraints for object access
   */
  getReferencingConstraintIds(): EntityId[] {
    return Array.from(this._referencingConstraints).map(constraint => constraint.getId())
  }


  // Enhanced utility methods using direct references
  hasCoordinates(): boolean {
    return this._xyz !== undefined
  }

  distanceTo(other: WorldPoint): number | null {
    if (!this.hasCoordinates() || !other.hasCoordinates()) {
      return null
    }

    const [x1, y1, z1] = this._xyz!
    const [x2, y2, z2] = other.xyz!

    return Math.sqrt(
      Math.pow(x2 - x1, 2) +
      Math.pow(y2 - y1, 2) +
      Math.pow(z2 - z1, 2)
    )
  }

  /**
   * Calculate the centroid of this point and all connected points
   * Uses direct references for efficient access
   */
  getCentroidWithConnected(): [number, number, number] | null {
    if (!this.hasCoordinates()) {
      return null
    }

    const points = [this, ...this.connectedPoints.filter(p => p.hasCoordinates())]
    if (points.length === 0) return null

    let sumX = 0, sumY = 0, sumZ = 0
    for (const point of points) {
      const [x, y, z] = point.xyz!
      sumX += x
      sumY += y
      sumZ += z
    }

    return [
      sumX / points.length,
      sumY / points.length,
      sumZ / points.length
    ]
  }

  /**
   * Check if this point is colinear with two other points
   */
  isColinearWith(pointA: WorldPoint, pointB: WorldPoint, tolerance: number = 1e-6): boolean {
    if (!this.hasCoordinates() || !pointA.hasCoordinates() || !pointB.hasCoordinates()) {
      return false
    }

    const [x1, y1, z1] = this._xyz!
    const [x2, y2, z2] = pointA.xyz!
    const [x3, y3, z3] = pointB.xyz!

    // Calculate cross product vectors
    const v1 = [x2 - x1, y2 - y1, z2 - z1]
    const v2 = [x3 - x1, y3 - y1, z3 - z1]

    // Cross product
    const cross = [
      v1[1] * v2[2] - v1[2] * v2[1],
      v1[2] * v2[0] - v1[0] * v2[2],
      v1[0] * v2[1] - v1[1] * v2[0]
    ]

    const magnitude = Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2)
    return magnitude < tolerance
  }

  /**
   * Get the degree (number of connected lines) of this point
   * More efficient than getting line IDs and counting
   */
  getDegree(): number {
    return this._connectedLines.size
  }

  /**
   * Check if this point is isolated (no connections)
   */
  isIsolated(): boolean {
    return this.getDegree() === 0
  }

  /**
   * Check if this point is a vertex (exactly 2 connections)
   */
  isVertex(): boolean {
    return this.getDegree() === 2
  }

  /**
   * Check if this point is a junction (3+ connections)
   */
  isJunction(): boolean {
    return this.getDegree() >= 3
  }

  clone(newId: PointId, newName?: string): WorldPoint {
    const now = new Date().toISOString()
    return new WorldPoint(
      newId,
      newName || `${this._name} (copy)`,
      this._xyz ? [...this._xyz] : undefined,
      this._color,
      this._isVisible,
      this._isOrigin,
      this._isLocked,
      this._group,
      [...this._tags],
      now,
      now
    )
  }

  private updateTimestamp(): void {
    this._updatedAt = new Date().toISOString()
  }

  // Override visibility and lock state
  setVisible(visible: boolean): void {
    this._isVisible = visible
    this.updateTimestamp()
  }

  setLocked(locked: boolean): void {
    this._isLocked = locked
    this.updateTimestamp()
  }

  // Update from optimization results
  applyOptimizationResult(result: { xyz: [number, number, number], residual?: number }): void {
    this._xyz = [...result.xyz]
    this.updateTimestamp()
  }
}