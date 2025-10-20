// Consolidated Line domain class
import type { ISelectable, SelectableType } from '../../types/selectable'
import type { IResidualProvider, ValueMap } from '../../optimization/IOptimizable'
import { V, Value } from 'scalar-autograd'
import type { WorldPoint } from '../world-point'
import type { IConstraint, ILine, IWorldPoint } from '../interfaces'

// Direction constraint enum for lines
export type LineDirection =
  | 'free'           // No directional constraint
  | 'horizontal'     // Constrained to horizontal (XY plane, Z=0 direction)
  | 'vertical'       // Constrained to vertical (Z-axis direction, same as Y-axis)
  | 'x-aligned'      // Constrained to X-axis direction
  | 'z-aligned'      // Constrained to Z-axis direction

// Line implements ILine interface for WorldPoint compatibility
export class Line implements ISelectable, ILine, IResidualProvider {
  lastResiduals: number[] = []
  selected = false
  referencingConstraints: Set<IConstraint> = new Set()

  name: string
  pointA: WorldPoint
  pointB: WorldPoint
  color: string
  isVisible: boolean
  isConstruction: boolean
  lineStyle: 'solid' | 'dashed' | 'dotted'
  thickness: number
  direction: LineDirection
  targetLength?: number
  tolerance?: number   

  public constructor(
    name: string,
    pointA: WorldPoint,
    pointB: WorldPoint,
    color: string,
    isVisible: boolean,
    isConstruction: boolean,
    lineStyle: 'solid' | 'dashed' | 'dotted',
    thickness: number,
    direction: LineDirection,
    targetLength?: number,
    tolerance?: number
) {
    this.name = name
    this.pointA = pointA
    this.pointB = pointB
    this.color = color
    this.isVisible = isVisible
    this.isConstruction = isConstruction
    this.lineStyle = lineStyle
    this.thickness = thickness
    this.direction = direction
    this.targetLength = targetLength
    this.tolerance = tolerance

    this.pointA.addConnectedLine(this)
    this.pointB.addConnectedLine(this)
  }

  static create(
    name: string,
    pointA: WorldPoint,
    pointB: WorldPoint,
    options: {
      color?: string
      isVisible?: boolean
      isConstruction?: boolean
      lineStyle?: 'solid' | 'dashed' | 'dotted'
      thickness?: number
      direction?: LineDirection
      targetLength?: number
      tolerance?: number
    } = {}
  ): Line {
    return new Line(
      name,
      pointA,
      pointB,
      options.color || '#ffffff',
      options.isVisible ?? true,
      options.isConstruction ?? false,
      options.lineStyle || 'solid',
      options.thickness || 1,
      options.direction || 'free',
      options.targetLength, 
      options.tolerance
    )
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
    return this.direction !== 'free'
  }

  isDistanceConstrained(): boolean {
    return this.targetLength !== undefined
  }

  isHorizontal(): boolean {
    return this.direction === 'horizontal'
  }

  isVertical(): boolean {
    return this.direction === 'vertical'
  }

  isXAligned(): boolean {
    return this.direction === 'x-aligned'
  }

  isZAligned(): boolean {
    return this.direction === 'z-aligned'
  }

  isAxisAligned(): boolean {
    return this.direction !== 'free'
  }

  hasFixedLength(): boolean {
    return this.targetLength !== undefined
  }

  satisfiesConstraints(tolerance?: number): { satisfied: boolean; violations: string[] } {
    const violations: string[] = []
    const tol = tolerance ?? this.tolerance ?? 0.01

    if (this.isDirectionConstrained()) {
      const dir = this.getDirection()
      if (dir) {
        const [dx, dy, dz] = dir

        switch (this.direction) {
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
      if (currentLength !== null && this.targetLength !== undefined) {
        const lengthDiff = Math.abs(currentLength - this.targetLength)
        if (lengthDiff > tol) {
          violations.push(`Line length ${currentLength.toFixed(3)} does not match target ${this.targetLength.toFixed(3)}`)
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
    const aCoords = pointA.optimizedXyz
    const bCoords = pointB.optimizedXyz

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
    const aCoords = pointA.optimizedXyz
    const bCoords = pointB.optimizedXyz

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
    const aCoords = pointA.optimizedXyz
    const bCoords = pointB.optimizedXyz

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
    const aCoords = pointA.optimizedXyz
    const bCoords = pointB.optimizedXyz

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
    const aCoords = pointA.optimizedXyz
    const bCoords = pointB.optimizedXyz

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

  setVisible(visible: boolean): void {
    this.isVisible = visible
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
      console.warn(`Line: endpoints not found in valueMap`)
      return residuals
    }

    const direction = vecB.sub(vecA)

    switch (this.direction) {
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

    if (this.hasFixedLength() && this.targetLength !== undefined) {
      const dist = direction.magnitude
      const targetLength = this.targetLength
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
      targetLength: this.targetLength,
      direction: this.direction,

      residuals: residuals,
      totalResidual: totalResidual,
      rmsResidual: residuals.length > 0 ? totalResidual / Math.sqrt(residuals.length) : 0,

      hasLengthConstraint: this.hasFixedLength(),
      hasDirectionConstraint: this.direction !== undefined,
      lengthError: currentLength !== null && this.targetLength !== undefined
        ? Math.abs(currentLength - this.targetLength)
        : null,
    }
  }
}
