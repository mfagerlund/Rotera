// Consolidated WorldPoint domain class

import type { PointId, EntityId } from '../../types/ids'
import type { ISelectable, SelectableType } from '../../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../../validation/validator'
import type { IValueMapContributor, ValueMap } from '../../optimization/IOptimizable'
import { ValidationHelpers } from '../../validation/validator'
import { V, Value, Vec3 } from 'scalar-autograd'
import type { WorldPointDto, AxisLock } from './WorldPointDto'

// Forward declarations to avoid circular dependencies
export interface IWorldPoint {
  getId(): string
  getName(): string
  hasCoordinates(): boolean
  getDefinedCoordinates(): [number, number, number] | undefined
  xyz?: [number | null, number | null, number | null]
}

export interface ILine {
  getId(): string
  pointA: IWorldPoint
  pointB: IWorldPoint
}

export interface IConstraint {
  getId(): string
}

export class WorldPoint implements ISelectable, IValidatable, IWorldPoint, IValueMapContributor {
  private _selected = false

  // Relationship tracking (inlined from WorldPointRelationshipManager)
  private _connectedLines: Set<ILine> = new Set()
  private _referencingConstraints: Set<IConstraint> = new Set()

  // Store residuals from intrinsic constraints
  private _lastResiduals: number[] = []

  private constructor(
    private _id: PointId,
    private _name: string,
    private _xyz: [number | null, number | null, number | null] | undefined,
    private _color: string,
    private _isVisible: boolean,
    private _isOrigin: boolean,
    private _lockedAxes: AxisLock | undefined,
    private _isOptimized: boolean,
    private _optimizedAt: Date | null,
    private _group: string | undefined,
    private _tags: string[],
    private _createdAt: string,
    private _updatedAt: string
  ) {}

  // ============================================================================
  // Factory methods
  // ============================================================================

  static fromDTO(dto: WorldPointDto): WorldPoint {
    const validation = WorldPoint.validateDto(dto)
    if (!validation.isValid) {
      throw new Error(`Invalid WorldPoint DTO: ${validation.errors.map(e => e.message).join(', ')}`)
    }

    // Convert legacy provenance to simplified flags
    const isOptimized = dto.xyzProvenance?.source === 'optimized'
    const optimizedAt = dto.xyzProvenance?.timestamp || null

    return new WorldPoint(
      dto.id,
      dto.name,
      dto.xyz,
      dto.color,
      dto.isVisible,
      dto.isOrigin,
      dto.lockedAxes || (dto.isLocked ? { x: true, y: true, z: true } : undefined),
      isOptimized,
      optimizedAt,
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
      xyz?: [number | null, number | null, number | null]
      color?: string
      isVisible?: boolean
      isOrigin?: boolean
      /** @deprecated Use lockedAxes instead */
      isLocked?: boolean
      lockedAxes?: AxisLock
      group?: string
      tags?: string[]
    } = {}
  ): WorldPoint {
    const now = new Date().toISOString()

    // Handle backward compatibility: convert isLocked to lockedAxes
    let finalLockedAxes = options.lockedAxes
    if (options.isLocked && !options.lockedAxes) {
      finalLockedAxes = { x: true, y: true, z: true }
    }

    return new WorldPoint(
      id,
      name,
      options.xyz,
      options.color || '#ffffff',
      options.isVisible ?? true,
      options.isOrigin ?? false,
      finalLockedAxes,
      false, // not optimized yet
      null,  // no optimization timestamp
      options.group,
      options.tags || [],
      now,
      now
    )
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  toDTO(): WorldPointDto {
    return {
      id: this._id,
      name: this._name,
      xyz: this._xyz,
      xyzProvenance: this._isOptimized ? {
        source: 'optimized',
        timestamp: this._optimizedAt || new Date(),
        metadata: {}
      } : undefined,
      color: this._color,
      isVisible: this._isVisible,
      isOrigin: this._isOrigin,
      isLocked: this.isLocked(), // backward compatibility
      lockedAxes: this._lockedAxes,
      group: this._group,
      tags: [...this._tags],
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    }
  }

  // ============================================================================
  // ISelectable implementation
  // ============================================================================

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

  /**
   * Check if point is locked (returns true if any axis is locked).
   */
  isLocked(): boolean {
    if (this._lockedAxes) {
      return this._lockedAxes.x === true || this._lockedAxes.y === true || this._lockedAxes.z === true
    }
    return false
  }

  /**
   * Check if X axis is locked.
   */
  isXLocked(): boolean {
    return this._lockedAxes?.x === true
  }

  /**
   * Check if Y axis is locked.
   */
  isYLocked(): boolean {
    return this._lockedAxes?.y === true
  }

  /**
   * Check if Z axis is locked.
   */
  isZLocked(): boolean {
    return this._lockedAxes?.z === true
  }

  getDependencies(): EntityId[] {
    // Points don't depend on other entities (they're leaf nodes)
    return []
  }

  getDependents(): EntityId[] {
    const dependents: string[] = []
    this._connectedLines.forEach(line => dependents.push(line.getId()))
    this._referencingConstraints.forEach(constraint => dependents.push(constraint.getId()))
    return dependents as EntityId[]
  }

  isSelected(): boolean {
    return this._selected
  }

  setSelected(selected: boolean): void {
    this._selected = selected
  }

  canDelete(): boolean {
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

    return `Deleting this point will also delete ${parts.join(' and ')}`
  }

  // ============================================================================
  // IValidatable implementation
  // ============================================================================

  validate(context: ValidationContext): ValidationResult {
    return WorldPoint.validateWorldPoint(this._id, this._name, this._xyz, this._color)
  }

  // ============================================================================
  // Validation methods (inlined from WorldPointValidator)
  // ============================================================================

  static validateDto(dto: WorldPointDto): ValidationResult {
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

    // Coordinate validation
    if (dto.xyz) {
      if (!Array.isArray(dto.xyz) || dto.xyz.length !== 3) {
        errors.push(ValidationHelpers.createError(
          'INVALID_COORDINATES',
          'xyz must be an array of 3 values',
          dto.id,
          'point',
          'xyz'
        ))
      } else if (!dto.xyz.every(coord => coord === null || (typeof coord === 'number' && !isNaN(coord)))) {
        errors.push(ValidationHelpers.createError(
          'INVALID_COORDINATES',
          'xyz coordinates must be null or valid numbers',
          dto.id,
          'point',
          'xyz'
        ))
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'DTO validation passed' : `DTO validation failed: ${errors.length} errors`
    }
  }

  static validateWorldPoint(
    id: string,
    name: string,
    xyz: [number | null, number | null, number | null] | undefined,
    color: string
  ): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Required field validation
    const nameError = ValidationHelpers.validateRequiredField(
      name,
      'name',
      id,
      'point'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(id, 'point')
    if (idError) errors.push(idError)

    // Coordinate validation
    if (xyz) {
      if (!Array.isArray(xyz) || xyz.length !== 3) {
        errors.push(ValidationHelpers.createError(
          'INVALID_COORDINATES',
          'xyz must be an array of 3 values',
          id,
          'point',
          'xyz'
        ))
      } else if (!xyz.every(coord => coord === null || (typeof coord === 'number' && !isNaN(coord)))) {
        errors.push(ValidationHelpers.createError(
          'INVALID_COORDINATES',
          'xyz coordinates must be null or valid numbers',
          id,
          'point',
          'xyz'
        ))
      }
    }

    // Color validation
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        id,
        'point',
        'color'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Point validation passed' : `Point validation failed: ${errors.length} errors`
    }
  }

  // ============================================================================
  // Domain getters/setters
  // ============================================================================

  get name(): string {
    return this._name
  }

  set name(value: string) {
    this._name = value
    this.updateTimestamp()
  }

  get xyz(): [number | null, number | null, number | null] | undefined {
    return this._xyz ? [...this._xyz] : undefined
  }

  set xyz(value: [number | null, number | null, number | null] | undefined) {
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

  get lockedAxes(): AxisLock | undefined {
    return this._lockedAxes ? { ...this._lockedAxes } : undefined
  }

  // ============================================================================
  // Relationship management (inlined from WorldPointRelationshipManager)
  // ============================================================================

  get connectedLines(): ILine[] {
    return Array.from(this._connectedLines)
  }

  get referencingConstraints(): IConstraint[] {
    return Array.from(this._referencingConstraints)
  }

  get connectedPoints(): IWorldPoint[] {
    const connectedPoints: IWorldPoint[] = []
    const seenPoints = new Set<IWorldPoint>()

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

  addConnectedLine(line: ILine): void {
    this._connectedLines.add(line)
  }

  removeConnectedLine(line: ILine): void {
    this._connectedLines.delete(line)
  }

  addReferencingConstraint(constraint: IConstraint): void {
    this._referencingConstraints.add(constraint)
  }

  removeReferencingConstraint(constraint: IConstraint): void {
    this._referencingConstraints.delete(constraint)
  }

  getConnectedLineIds(): EntityId[] {
    return Array.from(this._connectedLines).map(line => line.getId()) as EntityId[]
  }

  getReferencingConstraintIds(): EntityId[] {
    return Array.from(this._referencingConstraints).map(constraint => constraint.getId()) as EntityId[]
  }

  getDegree(): number {
    return this._connectedLines.size
  }

  isIsolated(): boolean {
    return this.getDegree() === 0
  }

  isVertex(): boolean {
    return this.getDegree() === 2
  }

  isJunction(): boolean {
    return this.getDegree() >= 3
  }

  // ============================================================================
  // Geometric methods (inlined from WorldPointGeometry)
  // ============================================================================

  hasCoordinates(): boolean {
    return this._xyz !== undefined &&
           this._xyz[0] !== null &&
           this._xyz[1] !== null &&
           this._xyz[2] !== null
  }

  getDefinedCoordinates(): [number, number, number] | undefined {
    if (!this.hasCoordinates()) {
      return undefined
    }
    return this._xyz as [number, number, number]
  }

  distanceTo(other: WorldPoint): number | null {
    const thisXyz = this.getDefinedCoordinates()
    const otherXyz = other.getDefinedCoordinates()
    if (!thisXyz || !otherXyz) {
      return null
    }
    return WorldPoint.distanceBetween(thisXyz, otherXyz)
  }

  getCentroidWithConnected(): [number, number, number] | null {
    const thisXyz = this.getDefinedCoordinates()
    if (!thisXyz) {
      return null
    }

    const connectedPoints = this.connectedPoints
      .map(p => p.getDefinedCoordinates())
      .filter((xyz): xyz is [number, number, number] => xyz !== undefined)

    const allPoints = [thisXyz, ...connectedPoints]

    return WorldPoint.calculateCentroid(allPoints)
  }

  isColinearWith(pointA: WorldPoint, pointB: WorldPoint, tolerance: number = 1e-6): boolean {
    const thisXyz = this.getDefinedCoordinates()
    const aXyz = pointA.getDefinedCoordinates()
    const bXyz = pointB.getDefinedCoordinates()

    if (!thisXyz || !aXyz || !bXyz) {
      return false
    }
    return WorldPoint.areCollinear(thisXyz, aXyz, bXyz, tolerance)
  }

  // ============================================================================
  // Static geometry utility methods
  // ============================================================================

  static distanceBetween(
    pointA: [number, number, number],
    pointB: [number, number, number]
  ): number {
    const [x1, y1, z1] = pointA
    const [x2, y2, z2] = pointB

    return Math.sqrt(
      Math.pow(x2 - x1, 2) +
      Math.pow(y2 - y1, 2) +
      Math.pow(z2 - z1, 2)
    )
  }

  static calculateCentroid(points: Array<[number, number, number]>): [number, number, number] | null {
    if (points.length === 0) return null

    let sumX = 0, sumY = 0, sumZ = 0
    for (const [x, y, z] of points) {
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

  static areCollinear(
    pointA: [number, number, number],
    pointB: [number, number, number],
    pointC: [number, number, number],
    tolerance: number = 1e-6
  ): boolean {
    const [x1, y1, z1] = pointA
    const [x2, y2, z2] = pointB
    const [x3, y3, z3] = pointC

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

  static calculateAngle(
    pointA: [number, number, number],
    vertex: [number, number, number],
    pointC: [number, number, number]
  ): number {
    const [x1, y1, z1] = pointA
    const [x2, y2, z2] = vertex
    const [x3, y3, z3] = pointC

    // Calculate vectors from vertex to other points
    const vec1 = [x1 - x2, y1 - y2, z1 - z2]
    const vec2 = [x3 - x2, y3 - y2, z3 - z2]

    // Calculate magnitudes
    const mag1 = Math.sqrt(vec1[0] ** 2 + vec1[1] ** 2 + vec1[2] ** 2)
    const mag2 = Math.sqrt(vec2[0] ** 2 + vec2[1] ** 2 + vec2[2] ** 2)

    if (mag1 === 0 || mag2 === 0) return 0

    // Calculate dot product
    const dotProduct = vec1[0] * vec2[0] + vec1[1] * vec2[1] + vec1[2] * vec2[2]

    // Calculate angle in radians then convert to degrees
    const angleRad = Math.acos(Math.max(-1, Math.min(1, dotProduct / (mag1 * mag2))))
    return angleRad * (180 / Math.PI)
  }

  static projectOntoPlane(
    point: [number, number, number],
    planePoint: [number, number, number],
    planeNormal: [number, number, number]
  ): [number, number, number] {
    const [px, py, pz] = point
    const [planePx, planePy, planePz] = planePoint
    const [nx, ny, nz] = planeNormal

    // Vector from plane point to the point
    const vec = [px - planePx, py - planePy, pz - planePz]

    // Dot product of vector with normal
    const dot = vec[0] * nx + vec[1] * ny + vec[2] * nz

    // Normal magnitude squared
    const normalMagSquared = nx * nx + ny * ny + nz * nz

    if (normalMagSquared === 0) {
      // Degenerate normal, return original point
      return point
    }

    // Project point onto plane
    const projectionFactor = dot / normalMagSquared
    return [
      px - projectionFactor * nx,
      py - projectionFactor * ny,
      pz - projectionFactor * nz
    ]
  }

  static distanceToPlane(
    point: [number, number, number],
    planePoint: [number, number, number],
    planeNormal: [number, number, number]
  ): number {
    const [px, py, pz] = point
    const [planePx, planePy, planePz] = planePoint
    const [nx, ny, nz] = planeNormal

    // Vector from plane point to the point
    const vec = [px - planePx, py - planePy, pz - planePz]

    // Dot product of vector with normal
    const dot = vec[0] * nx + vec[1] * ny + vec[2] * nz

    // Normal magnitude
    const normalMag = Math.sqrt(nx * nx + ny * ny + nz * nz)

    if (normalMag === 0) {
      return 0 // Degenerate normal
    }

    return Math.abs(dot) / normalMag
  }

  static areCoplanar(
    points: Array<[number, number, number]>,
    tolerance: number = 1e-6
  ): boolean {
    if (points.length < 4) {
      return true // Less than 4 points are always coplanar
    }

    // Use first 3 points to define the plane
    const [p1, p2, p3] = points

    // Calculate normal vector using cross product
    const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]
    const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]

    const normal: [number, number, number] = [
      v1[1] * v2[2] - v1[2] * v2[1],
      v1[2] * v2[0] - v1[0] * v2[2],
      v1[0] * v2[1] - v1[1] * v2[0]
    ]

    // Check if all other points lie on the same plane
    for (let i = 3; i < points.length; i++) {
      const distance = this.distanceToPlane(points[i], p1, normal)
      if (distance > tolerance) {
        return false
      }
    }

    return true
  }

  static getBoundingBox(points: Array<[number, number, number]>): {
    min: [number, number, number]
    max: [number, number, number]
    center: [number, number, number]
    size: [number, number, number]
  } | null {
    if (points.length === 0) return null

    let minX = points[0][0], maxX = points[0][0]
    let minY = points[0][1], maxY = points[0][1]
    let minZ = points[0][2], maxZ = points[0][2]

    for (const [x, y, z] of points) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }

    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
      size: [maxX - minX, maxY - minY, maxZ - minZ]
    }
  }

  // ============================================================================
  // Utility methods
  // ============================================================================

  clone(newId: PointId, newName?: string): WorldPoint {
    const now = new Date().toISOString()
    return new WorldPoint(
      newId,
      newName || `${this._name} (copy)`,
      this._xyz ? [...this._xyz] : undefined,
      this._color,
      this._isVisible,
      this._isOrigin,
      this._lockedAxes ? { ...this._lockedAxes } : undefined,
      this._isOptimized,
      this._optimizedAt,
      this._group,
      [...this._tags],
      now,
      now
    )
  }

  setVisible(visible: boolean): void {
    this._isVisible = visible
    this.updateTimestamp()
  }

  /**
   * Set locked state for all axes.
   */
  setLocked(locked: boolean): void {
    if (locked) {
      this._lockedAxes = { x: true, y: true, z: true }
    } else {
      this._lockedAxes = undefined
    }
    this.updateTimestamp()
  }

  /**
   * Set per-axis locking.
   */
  setLockedAxes(lockedAxes: AxisLock | undefined): void {
    this._lockedAxes = lockedAxes ? { ...lockedAxes } : undefined
    this.updateTimestamp()
  }

  /**
   * Apply optimization results and mark coordinates as optimized.
   */
  applyOptimizationResult(result: { xyz: [number, number, number], residual?: number }): void {
    this._xyz = [...result.xyz] as [number | null, number | null, number | null]
    this._isOptimized = true
    this._optimizedAt = new Date()
    this.updateTimestamp()
  }

  private updateTimestamp(): void {
    this._updatedAt = new Date().toISOString()
  }

  // ============================================================================
  // IValueMapContributor implementation (optimization system)
  // ============================================================================

  /**
   * Add this point to the ValueMap for optimization.
   * Locked axes become constants (V.C), unlocked axes become variables (V.W).
   */
  addToValueMap(valueMap: ValueMap): Value[] {
    const coords = this.getDefinedCoordinates()
    if (!coords) {
      return []
    }

    const variables: Value[] = []

    const xLocked = this.isXLocked()
    const yLocked = this.isYLocked()
    const zLocked = this.isZLocked()

    const x = xLocked ? V.C(coords[0]) : V.W(coords[0])
    const y = yLocked ? V.C(coords[1]) : V.W(coords[1])
    const z = zLocked ? V.C(coords[2]) : V.W(coords[2])

    const vec = new Vec3(x, y, z)
    valueMap.points.set(this, vec)

    if (!xLocked) variables.push(x)
    if (!yLocked) variables.push(y)
    if (!zLocked) variables.push(z)

    return variables
  }

  /**
   * Compute residuals for this point.
   * WorldPoint has no intrinsic constraints.
   */
  computeResiduals(_valueMap: ValueMap): Value[] {
    return []
  }

  /**
   * Apply optimization results from ValueMap.
   */
  applyOptimizationResultFromValueMap(valueMap: ValueMap): void {
    const vec = valueMap.points.get(this)
    if (!vec) {
      return
    }

    const xyz: [number, number, number] = [vec.x.data, vec.y.data, vec.z.data]
    const residuals = this.computeResiduals(valueMap)
    this._lastResiduals = residuals.map(r => r.data)
    this.applyOptimizationResult({ xyz })
  }

  /**
   * Get the last computed residuals from intrinsic constraints.
   */
  getLastResiduals(): number[] {
    return [...this._lastResiduals]
  }

  /**
   * Get optimization information for this point.
   */
  getOptimizationInfo() {
    const residuals = this.getLastResiduals()
    const totalResidual = residuals.length > 0
      ? Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0))
      : 0

    return {
      position: this.xyz,
      residuals: residuals,
      totalResidual: totalResidual,
      rmsResidual: residuals.length > 0 ? totalResidual / Math.sqrt(residuals.length) : 0,
      isOptimized: this._isOptimized,
      lastOptimizedAt: this._optimizedAt,
    }
  }
}
