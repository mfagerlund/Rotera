import type { ISelectable, SelectableType } from '../../types/selectable'
import type { IResidualProvider, ValueMap } from '../../optimization/IOptimizable'
import { V, Value } from 'scalar-autograd'
import * as vec3 from '../../utils/vec3'
import type { WorldPoint } from '../world-point'
import type { IConstraint, ILine, IWorldPoint } from '../interfaces'
import type { ISerializable } from '../serialization/ISerializable'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { LineDto } from './LineDto'
import {makeAutoObservable} from 'mobx'

// Direction constraint for lines
// Axis-aligned: line is parallel to that axis (1 DoF)
// Plane-constrained: line lies in that plane (2 DoF)
export type LineDirection =
  | 'free'  // No constraint (3 DoF)
  | 'x'     // Parallel to X axis
  | 'y'     // Parallel to Y axis (vertical)
  | 'z'     // Parallel to Z axis
  | 'xy'    // Lies in XY plane (Z=0)
  | 'xz'    // Lies in XZ plane (Y=0, horizontal ground plane)
  | 'yz'    // Lies in YZ plane (X=0)

export class Line implements ISelectable, ILine, IResidualProvider, ISerializable<LineDto> {
  lastResiduals: number[] = []
  selected = false
  referencingConstraints: Set<IConstraint> = new Set()

  name: string
  pointA: WorldPoint
  pointB: WorldPoint
  color: string
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
    return this.direction === 'xz'
  }

  isVertical(): boolean {
    return this.direction === 'y'
  }

  isXAligned(): boolean {
    return this.direction === 'x'
  }

  isYAligned(): boolean {
    return this.direction === 'y'
  }

  isZAligned(): boolean {
    return this.direction === 'z'
  }

  isAxisAligned(): boolean {
    return this.direction === 'x' || this.direction === 'y' || this.direction === 'z'
  }

  isPlaneConstrained(): boolean {
    return this.direction === 'xy' || this.direction === 'xz' || this.direction === 'yz'
  }

  isConstrained(): boolean {
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
          case 'x':
            // X-aligned: dy and dz should be 0
            if (Math.abs(dy) > tol || Math.abs(dz) > tol) {
              violations.push('Line is not X-axis aligned')
            }
            break
          case 'y':
            // Y-aligned (vertical): dx and dz should be 0
            if (Math.abs(dx) > tol || Math.abs(dz) > tol) {
              violations.push('Line is not Y-axis aligned (vertical)')
            }
            break
          case 'z':
            // Z-aligned: dx and dy should be 0
            if (Math.abs(dx) > tol || Math.abs(dy) > tol) {
              violations.push('Line is not Z-axis aligned')
            }
            break
          case 'xy':
            // XY plane: dz should be 0
            if (Math.abs(dz) > tol) {
              violations.push('Line is not in XY plane')
            }
            break
          case 'xz':
            // XZ plane (horizontal): dy should be 0
            if (Math.abs(dy) > tol) {
              violations.push('Line is not in XZ plane (horizontal)')
            }
            break
          case 'yz':
            // YZ plane: dx should be 0
            if (Math.abs(dx) > tol) {
              violations.push('Line is not in YZ plane')
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

    return vec3.distance(aCoords, bCoords)
  }

  static getDirectionVector(pointA: WorldPoint, pointB: WorldPoint): [number, number, number] | null {
    const aCoords = pointA.optimizedXyz
    const bCoords = pointB.optimizedXyz

    if (!aCoords || !bCoords) {
      return null
    }

    const direction = vec3.subtract(bCoords, aCoords)
    return vec3.isZero(direction) ? null : vec3.normalize(direction)
  }

  static getMidpoint(pointA: WorldPoint, pointB: WorldPoint): [number, number, number] | null {
    const aCoords = pointA.optimizedXyz
    const bCoords = pointB.optimizedXyz

    if (!aCoords || !bCoords) {
      return null
    }

    return vec3.midpoint(aCoords, bCoords)
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

    const lineVec = vec3.subtract(bCoords, aCoords)
    const pointVec = vec3.subtract(testPoint, aCoords)
    const crossProduct = vec3.cross(pointVec, lineVec)

    return vec3.magnitude(crossProduct) < tolerance
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

    return vec3.distanceToLineSegment(testPoint, aCoords, bCoords)
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

    const angleRad = vec3.angleBetween(dir1, dir2)
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

    // Scale direction residuals to be comparable to pixel-level reprojection errors
    // A 1-meter offset from the constraint direction should be weighted similarly to ~100 pixels
    const GEOMETRIC_SCALE = 100.0
    const geoScale = V.C(GEOMETRIC_SCALE)

    switch (this.direction) {
      case 'x':
        // X-aligned: penalize Y and Z components
        residuals.push(V.mul(direction.y, geoScale), V.mul(direction.z, geoScale))
        break

      case 'y':
        // Y-aligned (vertical): penalize X and Z components
        residuals.push(V.mul(direction.x, geoScale), V.mul(direction.z, geoScale))
        break

      case 'z':
        // Z-aligned: penalize X and Y components
        residuals.push(V.mul(direction.x, geoScale), V.mul(direction.y, geoScale))
        break

      case 'xy':
        // XY plane: penalize Z component
        residuals.push(V.mul(direction.z, geoScale))
        break

      case 'xz':
        // XZ plane (horizontal): penalize Y component
        residuals.push(V.mul(direction.y, geoScale))
        break

      case 'yz':
        // YZ plane: penalize X component
        residuals.push(V.mul(direction.x, geoScale))
        break

      case 'free':
        break
    }

    if (this.hasFixedLength() && this.targetLength !== undefined) {
      const dist = direction.magnitude
      const targetLength = this.targetLength
      const lengthResidual = V.mul(V.sub(dist, V.C(targetLength)), geoScale)
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
