// Consolidated Line domain class

import type { LineId, EntityId } from '../../types/ids'
import type { ISelectable, SelectableType } from '../../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../../validation/validator'
import type { IResidualProvider, ValueMap } from '../../optimization/IOptimizable'
import { ValidationHelpers } from '../../validation/validator'
import { V, Value } from 'scalar-autograd'
import type { WorldPoint, IConstraint, ILine } from '../world-point'
import type { LineDto, LineDirection, LineConstraintSettings } from './LineDto'

// Line implements ILine interface for WorldPoint compatibility
export class Line implements ISelectable, IValidatable, ILine, IResidualProvider {
  // Store residuals from last optimization
  private _lastResiduals: number[] = []
  private _selected = false

  // Relationship tracking (inlined from LineRelationshipManager)
  private _referencingConstraints: Set<IConstraint> = new Set()

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
    private _constraints: LineConstraintSettings,
    private _group: string | undefined,
    private _tags: string[],
    private _createdAt: string,
    private _updatedAt: string
  ) {
    // Establish bidirectional relationships with points
    this._pointA.addConnectedLine(this)
    this._pointB.addConnectedLine(this)
  }

  // ============================================================================
  // Factory methods
  // ============================================================================

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
      dto.constraints,
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
      constraints?: LineConstraintSettings
      group?: string
      tags?: string[]
    } = {}
  ): Line {
    const now = new Date().toISOString()
    const defaultConstraints: LineConstraintSettings = {
      direction: 'free',
      tolerance: 0.001
    }
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
      options.constraints || defaultConstraints,
      options.group,
      options.tags || [],
      now,
      now
    )
  }

  // ============================================================================
  // Serialization
  // ============================================================================

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
      constraints: { ...this._constraints },
      group: this._group,
      tags: [...this._tags],
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    }
  }

  // ============================================================================
  // ISelectable implementation
  // ============================================================================

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
    return [this._pointA.getId(), this._pointB.getId()] as EntityId[]
  }

  getDependents(): EntityId[] {
    const dependents: string[] = []
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
    return this._referencingConstraints.size === 0
  }

  getDeleteWarning(): string | null {
    if (this._referencingConstraints.size === 0) {
      return null
    }
    return `Deleting this line will also delete ${this._referencingConstraints.size} constraint${this._referencingConstraints.size === 1 ? '' : 's'}`
  }

  // ============================================================================
  // IValidatable implementation
  // ============================================================================

  validate(context: ValidationContext): ValidationResult {
    return Line.validateLine(
      this._id,
      this._name,
      this._pointA,
      this._pointB,
      this._color,
      this._thickness
    )
  }

  // ============================================================================
  // Validation methods (inlined from LineValidator)
  // ============================================================================

  static validateDto(dto: LineDto): ValidationResult {
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

    if (dto.color && !/^#[0-9A-Fa-f]{6}$/.test(dto.color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        dto.id,
        'line',
        'color'
      ))
    }

    if (dto.thickness <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_THICKNESS',
        'thickness must be greater than 0',
        dto.id,
        'line',
        'thickness'
      ))
    }

    if (!dto.constraints) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'constraints is required',
        dto.id,
        'line',
        'constraints'
      ))
    } else {
      const constraintErrors = Line.validateConstraints(dto.constraints, dto.id)
      errors.push(...constraintErrors)
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'DTO validation passed' : `DTO validation failed: ${errors.length} errors`
    }
  }

  static validateLine(
    id: string,
    name: string,
    pointA: WorldPoint,
    pointB: WorldPoint,
    color: string,
    thickness: number
  ): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    const nameError = ValidationHelpers.validateRequiredField(name, 'name', id, 'line')
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(id, 'line')
    if (idError) errors.push(idError)

    if (!pointA) {
      errors.push(ValidationHelpers.createError(
        'MISSING_POINT',
        'pointA is required',
        id,
        'line',
        'pointA'
      ))
    }

    if (!pointB) {
      errors.push(ValidationHelpers.createError(
        'MISSING_POINT',
        'pointB is required',
        id,
        'line',
        'pointB'
      ))
    }

    if (pointA === pointB) {
      errors.push(ValidationHelpers.createError(
        'SELF_REFERENCING_LINE',
        'Line cannot reference the same point twice',
        id,
        'line'
      ))
    }

    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        id,
        'line',
        'color'
      ))
    }

    if (thickness <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_THICKNESS',
        'thickness must be greater than 0',
        id,
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

  private static validateConstraints(constraints: LineConstraintSettings, lineId: string): ValidationError[] {
    const errors: ValidationError[] = []

    if (!constraints.direction) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'constraints.direction is required',
        lineId,
        'line',
        'constraints.direction'
      ))
    } else {
      const validDirections: LineDirection[] = ['free', 'horizontal', 'vertical', 'x-aligned', 'z-aligned']
      if (!validDirections.includes(constraints.direction)) {
        errors.push(ValidationHelpers.createError(
          'INVALID_DIRECTION',
          `constraints.direction must be one of: ${validDirections.join(', ')}`,
          lineId,
          'line',
          'constraints.direction'
        ))
      }
    }

    if (constraints.targetLength !== undefined && constraints.targetLength <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TARGET_LENGTH',
        'constraints.targetLength must be greater than 0',
        lineId,
        'line',
        'constraints.targetLength'
      ))
    }

    if (constraints.tolerance !== undefined && constraints.tolerance < 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TOLERANCE',
        'constraints.tolerance must be non-negative',
        lineId,
        'line',
        'constraints.tolerance'
      ))
    }

    return errors
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

  get pointA(): WorldPoint {
    return this._pointA
  }

  get pointB(): WorldPoint {
    return this._pointB
  }

  get points(): [WorldPoint, WorldPoint] {
    return [this._pointA, this._pointB]
  }

  get referencingConstraints(): IConstraint[] {
    return Array.from(this._referencingConstraints)
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

  // Constraint properties
  get constraints(): LineConstraintSettings {
    return { ...this._constraints }
  }

  set constraints(value: LineConstraintSettings) {
    this._constraints = { ...value }
    this.updateTimestamp()
  }

  get direction(): LineDirection {
    return this._constraints.direction
  }

  set direction(value: LineDirection) {
    this._constraints.direction = value
    this.updateTimestamp()
  }

  get hasDistanceConstraint(): boolean {
    return this._constraints.targetLength !== undefined
  }

  get targetLength(): number | undefined {
    return this._constraints.targetLength
  }

  set targetLength(value: number | undefined) {
    this._constraints.targetLength = value
    this.updateTimestamp()
  }

  get constraintTolerance(): number {
    return this._constraints.tolerance ?? 0.001
  }

  set constraintTolerance(value: number) {
    if (value < 0) {
      throw new Error('Constraint tolerance must be non-negative')
    }
    this._constraints.tolerance = value
    this.updateTimestamp()
  }

  // ============================================================================
  // Constraint evaluation methods
  // ============================================================================

  isDirectionConstrained(): boolean {
    return this._constraints.direction !== 'free'
  }

  isDistanceConstrained(): boolean {
    return this._constraints.targetLength !== undefined
  }

  isHorizontal(): boolean {
    return this._constraints.direction === 'horizontal'
  }

  isVertical(): boolean {
    return this._constraints.direction === 'vertical'
  }

  isXAligned(): boolean {
    return this._constraints.direction === 'x-aligned'
  }

  isZAligned(): boolean {
    return this._constraints.direction === 'z-aligned'
  }

  isAxisAligned(): boolean {
    return this._constraints.direction !== 'free'
  }

  hasFixedLength(): boolean {
    return this._constraints.targetLength !== undefined
  }

  satisfiesConstraints(tolerance?: number): { satisfied: boolean; violations: string[] } {
    const violations: string[] = []
    const tol = tolerance ?? this.constraintTolerance

    if (this.isDirectionConstrained()) {
      const dir = this.getDirection()
      if (dir) {
        const [dx, dy, dz] = dir

        switch (this._constraints.direction) {
          case 'horizontal':
            if (Math.abs(dy) > tol || Math.abs(dz) > tol) {
              violations.push('Line is not horizontal')
            }
            break
          case 'vertical':
            if (Math.abs(dx) > tol || Math.abs(dz) > tol) {
              violations.push('Line is not vertical')
            }
            break
          case 'x-aligned':
            if (Math.abs(dy) > tol || Math.abs(dz) > tol) {
              violations.push('Line is not X-axis aligned')
            }
            break
          case 'z-aligned':
            if (Math.abs(dx) > tol || Math.abs(dy) > tol) {
              violations.push('Line is not Z-axis aligned')
            }
            break
        }
      }
    }

    if (this.hasFixedLength()) {
      const currentLength = this.length()
      if (currentLength !== null && this._constraints.targetLength !== undefined) {
        const lengthDiff = Math.abs(currentLength - this._constraints.targetLength)
        if (lengthDiff > tol) {
          violations.push(`Line length ${currentLength.toFixed(3)} does not match target ${this._constraints.targetLength.toFixed(3)}`)
        }
      }
    }

    return {
      satisfied: violations.length === 0,
      violations
    }
  }

  // ============================================================================
  // Geometric methods (inlined from LineGeometry)
  // ============================================================================

  length(): number | null {
    return Line.calculateLength(this._pointA, this._pointB)
  }

  getDirection(): [number, number, number] | null {
    return Line.getDirectionVector(this._pointA, this._pointB)
  }

  getMidpoint(): [number, number, number] | null {
    return Line.getMidpoint(this._pointA, this._pointB)
  }

  containsPoint(point: [number, number, number], tolerance: number = 1e-6): boolean {
    return Line.containsPoint(this._pointA, this._pointB, point, tolerance)
  }

  distanceToPoint(point: [number, number, number]): number | null {
    return Line.distanceToPoint(this._pointA, this._pointB, point)
  }

  // ============================================================================
  // Static geometry utility methods
  // ============================================================================

  static calculateLength(pointA: WorldPoint, pointB: WorldPoint): number | null {
    const aCoords = pointA.getDefinedCoordinates()
    const bCoords = pointB.getDefinedCoordinates()

    if (!aCoords || !bCoords) {
      return null
    }

    const [x1, y1, z1] = aCoords
    const [x2, y2, z2] = bCoords

    return Math.sqrt(
      Math.pow(x2 - x1, 2) +
      Math.pow(y2 - y1, 2) +
      Math.pow(z2 - z1, 2)
    )
  }

  static getDirectionVector(pointA: WorldPoint, pointB: WorldPoint): [number, number, number] | null {
    const aCoords = pointA.getDefinedCoordinates()
    const bCoords = pointB.getDefinedCoordinates()

    if (!aCoords || !bCoords) {
      return null
    }

    const [x1, y1, z1] = aCoords
    const [x2, y2, z2] = bCoords

    const dx = x2 - x1
    const dy = y2 - y1
    const dz = z2 - z1

    const length = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (length === 0) return null

    return [dx / length, dy / length, dz / length]
  }

  static getMidpoint(pointA: WorldPoint, pointB: WorldPoint): [number, number, number] | null {
    const aCoords = pointA.getDefinedCoordinates()
    const bCoords = pointB.getDefinedCoordinates()

    if (!aCoords || !bCoords) {
      return null
    }

    const [x1, y1, z1] = aCoords
    const [x2, y2, z2] = bCoords

    return [
      (x1 + x2) / 2,
      (y1 + y2) / 2,
      (z1 + z2) / 2
    ]
  }

  static containsPoint(
    pointA: WorldPoint,
    pointB: WorldPoint,
    testPoint: [number, number, number],
    tolerance: number = 1e-6
  ): boolean {
    const aCoords = pointA.getDefinedCoordinates()
    const bCoords = pointB.getDefinedCoordinates()

    if (!aCoords || !bCoords) {
      return false
    }

    const [x, y, z] = testPoint
    const [x1, y1, z1] = aCoords
    const [x2, y2, z2] = bCoords

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

  static distanceToPoint(
    pointA: WorldPoint,
    pointB: WorldPoint,
    testPoint: [number, number, number]
  ): number | null {
    const aCoords = pointA.getDefinedCoordinates()
    const bCoords = pointB.getDefinedCoordinates()

    if (!aCoords || !bCoords) {
      return null
    }

    const [px, py, pz] = testPoint
    const [x1, y1, z1] = aCoords
    const [x2, y2, z2] = bCoords

    const lineVector = [x2 - x1, y2 - y1, z2 - z1]
    const pointVector = [px - x1, py - y1, pz - z1]

    const lineLengthSquared = lineVector[0] ** 2 + lineVector[1] ** 2 + lineVector[2] ** 2

    if (lineLengthSquared === 0) {
      return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2 + (pz - z1) ** 2)
    }

    const projection = (
      pointVector[0] * lineVector[0] +
      pointVector[1] * lineVector[1] +
      pointVector[2] * lineVector[2]
    ) / lineLengthSquared

    const closestPoint = [
      x1 + projection * lineVector[0],
      y1 + projection * lineVector[1],
      z1 + projection * lineVector[2]
    ]

    return Math.sqrt(
      (px - closestPoint[0]) ** 2 +
      (py - closestPoint[1]) ** 2 +
      (pz - closestPoint[2]) ** 2
    )
  }

  static angleBetweenLines(
    line1PointA: WorldPoint,
    line1PointB: WorldPoint,
    line2PointA: WorldPoint,
    line2PointB: WorldPoint
  ): number | null {
    const dir1 = this.getDirectionVector(line1PointA, line1PointB)
    const dir2 = this.getDirectionVector(line2PointA, line2PointB)

    if (!dir1 || !dir2) {
      return null
    }

    const dotProduct = dir1[0] * dir2[0] + dir1[1] * dir2[1] + dir1[2] * dir2[2]
    const clampedDotProduct = Math.max(-1, Math.min(1, dotProduct))
    const angleRad = Math.acos(Math.abs(clampedDotProduct))
    return angleRad * (180 / Math.PI)
  }

  static areParallel(
    line1PointA: WorldPoint,
    line1PointB: WorldPoint,
    line2PointA: WorldPoint,
    line2PointB: WorldPoint,
    tolerance: number = 1e-6
  ): boolean {
    const angle = this.angleBetweenLines(line1PointA, line1PointB, line2PointA, line2PointB)
    return angle !== null && angle < tolerance
  }

  static arePerpendicular(
    line1PointA: WorldPoint,
    line1PointB: WorldPoint,
    line2PointA: WorldPoint,
    line2PointB: WorldPoint,
    tolerance: number = 1e-6
  ): boolean {
    const angle = this.angleBetweenLines(line1PointA, line1PointB, line2PointA, line2PointB)
    return angle !== null && Math.abs(angle - 90) < tolerance
  }

  // ============================================================================
  // Relationship management (inlined from LineRelationshipManager)
  // ============================================================================

  addReferencingConstraint(constraint: IConstraint): void {
    this._referencingConstraints.add(constraint)
  }

  removeReferencingConstraint(constraint: IConstraint): void {
    this._referencingConstraints.delete(constraint)
  }

  connectsTo(point: WorldPoint): boolean {
    return this._pointA === point || this._pointB === point
  }

  getOtherPoint(point: WorldPoint): WorldPoint | null {
    if (this._pointA === point) {
      return this._pointB
    } else if (this._pointB === point) {
      return this._pointA
    }
    return null
  }

  // ============================================================================
  // Utility methods
  // ============================================================================

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
      { ...this._constraints },
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

  cleanup(): void {
    // Remove self from points
    this._pointA.removeConnectedLine(this)
    this._pointB.removeConnectedLine(this)
  }

  private updateTimestamp(): void {
    this._updatedAt = new Date().toISOString()
  }

  // ============================================================================
  // IResidualProvider implementation (optimization system)
  // ============================================================================

  /**
   * Compute residuals for this line's intrinsic constraints (direction and length).
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    const residuals: Value[] = []

    const vecA = valueMap.points.get(this._pointA)
    const vecB = valueMap.points.get(this._pointB)

    if (!vecA || !vecB) {
      console.warn(`Line ${this._id}: endpoints not found in valueMap`)
      return residuals
    }

    // Direction vector using Vec3 API
    const direction = vecB.sub(vecA)

    // 1. DIRECTION CONSTRAINTS
    switch (this._constraints.direction) {
      case 'horizontal':
        // Horizontal: dy = 0, dz = 0
        residuals.push(direction.y, direction.z)
        break

      case 'vertical':
        // Vertical (Y-axis): dx = 0, dz = 0
        residuals.push(direction.x, direction.z)
        break

      case 'x-aligned':
        // X-axis aligned: dy = 0, dz = 0
        residuals.push(direction.y, direction.z)
        break

      case 'z-aligned':
        // Z-axis aligned: dx = 0, dy = 0
        residuals.push(direction.x, direction.y)
        break

      case 'free':
        // No direction constraint
        break
    }

    // 2. LENGTH CONSTRAINT
    if (this.hasFixedLength() && this._constraints.targetLength !== undefined) {
      const dist = direction.magnitude
      const targetLength = this._constraints.targetLength
      const lengthResidual = V.sub(dist, V.C(targetLength))
      residuals.push(lengthResidual)
    }

    return residuals
  }

  /**
   * Evaluate and store residuals from intrinsic constraints.
   */
  evaluateAndStoreResiduals(valueMap: ValueMap): void {
    const residualValues = this.computeResiduals(valueMap)
    this._lastResiduals = residualValues.map(r => r.data)
  }

  /**
   * Get the last computed residuals from intrinsic constraints.
   */
  getLastResiduals(): number[] {
    return [...this._lastResiduals]
  }

  /**
   * Get optimization information for this line.
   */
  getOptimizationInfo() {
    const residuals = this.getLastResiduals()
    const totalResidual = residuals.length > 0
      ? Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0))
      : 0

    const currentLength = this.length()

    return {
      // Optimized values
      length: currentLength,
      targetLength: this._constraints.targetLength,
      direction: this._constraints.direction,

      // Residuals
      residuals: residuals,
      totalResidual: totalResidual,
      rmsResidual: residuals.length > 0 ? totalResidual / Math.sqrt(residuals.length) : 0,

      // Constraint satisfaction
      hasLengthConstraint: this.hasFixedLength(),
      hasDirectionConstraint: this._constraints.direction !== undefined,
      lengthError: currentLength !== null && this._constraints.targetLength !== undefined
        ? Math.abs(currentLength - this._constraints.targetLength)
        : null,
    }
  }
}
