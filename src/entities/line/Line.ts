import type { ISelectable, SelectableType } from '../../types/selectable'
import type { IResidualProvider, ValueMap } from '../../optimization/IOptimizable'
import { V, Value, Vec3Utils } from 'scalar-autograd'
import type { WorldPoint } from '../world-point'
import type { IConstraint, ILine, IWorldPoint } from '../interfaces'
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { LineDto } from './LineDto'
import {makeAutoObservable} from 'mobx'

// Direction constraint enum for lines
export type LineDirection =
  | 'free'           // No directional constraint
  | 'horizontal'     // Constrained to horizontal (XY plane, Z=0 direction)
  | 'vertical'       // Constrained to vertical (Z-axis direction, same as Y-axis)
  | 'x-aligned'      // Constrained to X-axis direction
  | 'z-aligned'      // Constrained to Z-axis direction

export class Line implements ISelectable, ILine, IResidualProvider, ISerializable<LineDto> {
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

    makeAutoObservable(this, {}, { autoBind: true })

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

    return Vec3Utils.distance(aCoords, bCoords)
  }

  static getDirectionVector(pointA: WorldPoint, pointB: WorldPoint): [number, number, number] | null {
    const aCoords = pointA.optimizedXyz
    const bCoords = pointB.optimizedXyz

    if (!aCoords || !bCoords) {
      return null
    }

    const direction = Vec3Utils.subtract(bCoords, aCoords)
    return Vec3Utils.isZero(direction) ? null : Vec3Utils.normalize(direction)
  }

  static getMidpoint(pointA: WorldPoint, pointB: WorldPoint): [number, number, number] | null {
    const aCoords = pointA.optimizedXyz
    const bCoords = pointB.optimizedXyz

    if (!aCoords || !bCoords) {
      return null
    }

    return Vec3Utils.midpoint(aCoords, bCoords)
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

    const lineVec = Vec3Utils.subtract(bCoords, aCoords)
    const pointVec = Vec3Utils.subtract(testPoint, aCoords)
    const crossProduct = Vec3Utils.cross(pointVec, lineVec)

    return Vec3Utils.magnitude(crossProduct) < tolerance
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

    return Vec3Utils.distanceToLineSegment(testPoint, aCoords, bCoords)
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

    const angleRad = Vec3Utils.angleBetween(dir1, dir2)
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

  serialize(context: SerializationContext): LineDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    const pointAId = context.getEntityId(this.pointA)
    const pointBId = context.getEntityId(this.pointB)

    if (!pointAId || !pointBId) {
      throw new Error(
        `Line "${this.name}": Cannot serialize - endpoints must be serialized first. ` +
        `Missing: ${!pointAId ? this.pointA.name : ''}${!pointAId && !pointBId ? ', ' : ''}${!pointBId ? this.pointB.name : ''}`
      )
    }

    return {
      id,
      name: this.name,
      pointAId,
      pointBId,
      color: this.color,
      isVisible: this.isVisible,
      isConstruction: this.isConstruction,
      lineStyle: this.lineStyle,
      thickness: this.thickness,
      direction: this.direction,
      targetLength: this.targetLength,
      tolerance: this.tolerance
    }
  }

  static deserialize(dto: LineDto, context: SerializationContext): Line {
    const pointA = context.getEntity<WorldPoint>(dto.pointAId)
    const pointB = context.getEntity<WorldPoint>(dto.pointBId)

    if (!pointA || !pointB) {
      throw new Error(`Line "${dto.name}": endpoints not found in context (${dto.pointAId}, ${dto.pointBId})`)
    }

    const line = Line.create(dto.name, pointA, pointB, {
      color: dto.color,
      isVisible: dto.isVisible,
      isConstruction: dto.isConstruction,
      lineStyle: dto.lineStyle,
      thickness: dto.thickness,
      direction: dto.direction,
      targetLength: dto.targetLength,
      tolerance: dto.tolerance
    })

    context.registerEntity(line, dto.id)
    return line
  }
}
