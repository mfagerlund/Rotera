// Consolidated Line domain class

import type { LineId, EntityId } from '../../types/ids'
import type { ISelectable, SelectableType } from '../../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult, ValidationError } from '../../validation/validator'
import type { IResidualProvider, ValueMap } from '../../optimization/IOptimizable'
import { ValidationHelpers } from '../../validation/validator'
import { V, Value } from 'scalar-autograd'
import type { WorldPoint, IConstraint, ILine } from '../world-point'

// Direction constraint enum for lines
export type LineDirection =
  | 'free'           // No directional constraint
  | 'horizontal'     // Constrained to horizontal (XY plane, Z=0 direction)
  | 'vertical'       // Constrained to vertical (Z-axis direction, same as Y-axis)
  | 'x-aligned'      // Constrained to X-axis direction
  | 'z-aligned'      // Constrained to Z-axis direction

// Line constraint settings
export interface LineConstraintSettings {
  direction: LineDirection
  targetLength?: number  // Fixed length constraint (if undefined, length is free)
  tolerance?: number     // Tolerance for constraint satisfaction
}

// Line implements ILine interface for WorldPoint compatibility
export class Line implements ISelectable, IValidatable, ILine, IResidualProvider {
  lastResiduals: number[] = []
  selected = false
  referencingConstraints: Set<IConstraint> = new Set()

  readonly id: LineId
  name: string
  pointA: WorldPoint
  pointB: WorldPoint
  color: string
  isVisible: boolean
  isConstruction: boolean
  lineStyle: 'solid' | 'dashed' | 'dotted'
  thickness: number
  constraints: LineConstraintSettings
  group: string | undefined
  tags: string[]
  createdAt: string
  updatedAt: string

  private constructor(
    id: LineId,
    name: string,
    pointA: WorldPoint,
    pointB: WorldPoint,
    color: string,
    isVisible: boolean,
    isConstruction: boolean,
    lineStyle: 'solid' | 'dashed' | 'dotted',
    thickness: number,
    constraints: LineConstraintSettings,
    group: string | undefined,
    tags: string[],
    createdAt: string,
    updatedAt: string
  ) {
    this.id = id
    this.name = name
    this.pointA = pointA
    this.pointB = pointB
    this.color = color
    this.isVisible = isVisible
    this.isConstruction = isConstruction
    this.lineStyle = lineStyle
    this.thickness = thickness
    this.constraints = constraints
    this.group = group
    this.tags = tags
    this.createdAt = createdAt
    this.updatedAt = updatedAt

    this.pointA.addConnectedLine(this)
    this.pointB.addConnectedLine(this)
  }

  // ============================================================================
  // Factory methods
  // ============================================================================

  /**
   * @internal Used only by Serialization class - do not use directly
   */
  static createFromSerialized(
    id: LineId,
    name: string,
    pointA: WorldPoint,
    pointB: WorldPoint,
    color: string,
    isVisible: boolean,
    isConstruction: boolean,
    lineStyle: 'solid' | 'dashed' | 'dotted',
    thickness: number,
    constraints: LineConstraintSettings,
    group: string | undefined,
    tags: string[],
    createdAt: string,
    updatedAt: string
  ): Line {
    return new Line(
      id,
      name,
      pointA,
      pointB,
      color,
      isVisible,
      isConstruction,
      lineStyle,
      thickness,
      constraints,
      group,
      tags,
      createdAt,
      updatedAt
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
  // ISelectable implementation
  // ============================================================================

  getId(): LineId {
    return this.id
  }

  getType(): SelectableType {
    return 'line'
  }

  getName(): string {
    return this.name
  }

  isLocked(): boolean {
    return this.pointA.isLocked() || this.pointB.isLocked()
  }

  isSelected(): boolean {
    return this.selected
  }

  setSelected(selected: boolean): void {
    this.selected = selected
  }

  canDelete(): boolean {
    return this.referencingConstraints.size === 0
  }

  getDeleteWarning(): string | null {
    if (this.referencingConstraints.size === 0) {
      return null
    }
    return `Deleting this line will also delete ${this.referencingConstraints.size} constraint${this.referencingConstraints.size === 1 ? '' : 's'}`
  }

  // ============================================================================
  // IValidatable implementation
  // ============================================================================

  validate(context: ValidationContext): ValidationResult {
    return Line.validateLine(
      this.id,
      this.name,
      this.pointA,
      this.pointB,
      this.color,
      this.thickness
    )
  }

  // ============================================================================
  // Validation methods (inlined from LineValidator)
  // ============================================================================

  static validateDto(dto: any): ValidationResult {
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
  // Computed properties
  // ============================================================================

  // Removed getter/setter wrappers - access fields directly:
  // - Use line.constraints.direction instead of line.direction
  // - Use line.constraints.targetLength instead of line.targetLength
  // - Use line.constraints.tolerance instead of line.constraints.tolerance

  // ============================================================================
  // Constraint evaluation methods
  // ============================================================================

  isDirectionConstrained(): boolean {
    return this.constraints.direction !== 'free'
  }

  isDistanceConstrained(): boolean {
    return this.constraints.targetLength !== undefined
  }

  isHorizontal(): boolean {
    return this.constraints.direction === 'horizontal'
  }

  isVertical(): boolean {
    return this.constraints.direction === 'vertical'
  }

  isXAligned(): boolean {
    return this.constraints.direction === 'x-aligned'
  }

  isZAligned(): boolean {
    return this.constraints.direction === 'z-aligned'
  }

  isAxisAligned(): boolean {
    return this.constraints.direction !== 'free'
  }

  hasFixedLength(): boolean {
    return this.constraints.targetLength !== undefined
  }

  satisfiesConstraints(tolerance?: number): { satisfied: boolean; violations: string[] } {
    const violations: string[] = []
    const tol = tolerance ?? this.constraints.tolerance ?? 0.01

    if (this.isDirectionConstrained()) {
      const dir = this.getDirection()
      if (dir) {
        const [dx, dy, dz] = dir

        switch (this.constraints.direction) {
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
      if (currentLength !== null && this.constraints.targetLength !== undefined) {
        const lengthDiff = Math.abs(currentLength - this.constraints.targetLength)
        if (lengthDiff > tol) {
          violations.push(`Line length ${currentLength.toFixed(3)} does not match target ${this.constraints.targetLength.toFixed(3)}`)
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
    return Line.calculateLength(this.pointA, this.pointB)
  }

  getDirection(): [number, number, number] | null {
    return Line.getDirectionVector(this.pointA, this.pointB)
  }

  getMidpoint(): [number, number, number] | null {
    return Line.getMidpoint(this.pointA, this.pointB)
  }

  containsPoint(point: [number, number, number], tolerance: number = 1e-6): boolean {
    return Line.containsPoint(this.pointA, this.pointB, point, tolerance)
  }

  distanceToPoint(point: [number, number, number]): number | null {
    return Line.distanceToPoint(this.pointA, this.pointB, point)
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
    this.referencingConstraints.add(constraint)
  }

  removeReferencingConstraint(constraint: IConstraint): void {
    this.referencingConstraints.delete(constraint)
  }

  connectsTo(point: WorldPoint): boolean {
    return this.pointA === point || this.pointB === point
  }

  getOtherPoint(point: WorldPoint): WorldPoint | null {
    if (this.pointA === point) {
      return this.pointB
    } else if (this.pointB === point) {
      return this.pointA
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
      newName || `${this.name} (copy)`,
      this.pointA,
      this.pointB,
      this.color,
      this.isVisible,
      this.isConstruction,
      this.lineStyle,
      this.thickness,
      { ...this.constraints },
      this.group,
      [...this.tags],
      now,
      now
    )
  }

  setVisible(visible: boolean): void {
    this.isVisible = visible
    this.updatedAt = new Date().toISOString()
  }

  cleanup(): void {
    this.pointA.removeConnectedLine(this)
    this.pointB.removeConnectedLine(this)
  }

  // ============================================================================
  // IResidualProvider implementation (optimization system)
  // ============================================================================

  /**
   * Compute residuals for this line's intrinsic constraints (direction and length).
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    const residuals: Value[] = []

    const vecA = valueMap.points.get(this.pointA)
    const vecB = valueMap.points.get(this.pointB)

    if (!vecA || !vecB) {
      console.warn(`Line ${this.id}: endpoints not found in valueMap`)
      return residuals
    }

    const direction = vecB.sub(vecA)

    switch (this.constraints.direction) {
      case 'horizontal':
        residuals.push(direction.y, direction.z)
        break

      case 'vertical':
        residuals.push(direction.x, direction.z)
        break

      case 'x-aligned':
        residuals.push(direction.y, direction.z)
        break

      case 'z-aligned':
        residuals.push(direction.x, direction.y)
        break

      case 'free':
        break
    }

    if (this.hasFixedLength() && this.constraints.targetLength !== undefined) {
      const dist = direction.magnitude
      const targetLength = this.constraints.targetLength
      const lengthResidual = V.sub(dist, V.C(targetLength))
      residuals.push(lengthResidual)
    }

    return residuals
  }

  evaluateAndStoreResiduals(valueMap: ValueMap): void {
    const residualValues = this.computeResiduals(valueMap)
    this.lastResiduals = residualValues.map(r => r.data)
  }

  getOptimizationInfo() {
    const residuals = this.lastResiduals
    const totalResidual = residuals.length > 0
      ? Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0))
      : 0

    const currentLength = this.length()

    return {
      length: currentLength,
      targetLength: this.constraints.targetLength,
      direction: this.constraints.direction,

      residuals: residuals,
      totalResidual: totalResidual,
      rmsResidual: residuals.length > 0 ? totalResidual / Math.sqrt(residuals.length) : 0,

      hasLengthConstraint: this.hasFixedLength(),
      hasDirectionConstraint: this.constraints.direction !== undefined,
      lengthError: currentLength !== null && this.constraints.targetLength !== undefined
        ? Math.abs(currentLength - this.constraints.targetLength)
        : null,
    }
  }
}
