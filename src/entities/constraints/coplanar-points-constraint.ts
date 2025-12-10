// Coplanar points constraint

import type { ValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { V, Vec3, type Value } from 'scalar-autograd'
import * as vec3 from '../../utils/vec3'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point/WorldPoint'
import {
  Constraint,
  type ConstraintEvaluation,
  getPointCoordinates
} from './base-constraint'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { CoplanarPointsConstraintDto } from './ConstraintDto'

export class CoplanarPointsConstraint extends Constraint {
  points: WorldPoint[]
  tolerance: number

  private constructor(
    name: string,
    points: WorldPoint[],
    tolerance: number
  ) {
    super(name)
    this.points = points
    this.tolerance = tolerance

    // Register with all points
    points.forEach(p => p.addReferencingConstraint(this))
  }

  /**
   * Remove a point from this constraint.
   * Returns true if the constraint should be deleted (fewer than 4 points remaining).
   */
  removePoint(point: WorldPoint): boolean {
    const index = this.points.indexOf(point)
    if (index === -1) return false

    point.removeReferencingConstraint(this)
    this.points.splice(index, 1)

    // Constraint needs at least 4 points to be meaningful
    return this.points.length < 4
  }

  /**
   * Check if this constraint should be deleted due to insufficient points.
   */
  shouldDelete(): boolean {
    return this.points.length < 4
  }

  /**
   * Clean up all point references when deleting this constraint.
   */
  cleanup(): void {
    this.points.forEach(p => p.removeReferencingConstraint(this))
  }

  static create(
    name: string,
    points: WorldPoint[], // At least 4 points
    options: {
      tolerance?: number
    } = {}
  ): CoplanarPointsConstraint {
    if (points.length < 4) {
      throw new Error('CoplanarPointsConstraint requires at least 4 points')
    }

    return new CoplanarPointsConstraint(
      name,
      points,
      options.tolerance ?? 0.001
    )
  }

  getConstraintType(): string {
    return 'coplanar_points'
  }

  evaluate(): ConstraintEvaluation {
    const coordsList = this.points.map(p => getPointCoordinates(p)).filter((c): c is [number, number, number] => c !== undefined)

    if (coordsList.length >= 4 && coordsList.length === this.points.length) {
      const p1 = coordsList[0]
      const p2 = coordsList[1]
      const p3 = coordsList[2]

      const v1 = vec3.subtract(p2, p1)
      const v2 = vec3.subtract(p3, p1)

      const normal = vec3.cross(v1, v2)

      const normalMagnitude = vec3.magnitude(normal)
      if (normalMagnitude === 0) {
        return { value: Infinity, satisfied: false }
      }

      const unitNormal = vec3.normalize(normal)

      let maxDeviation = 0

      for (let i = 3; i < coordsList.length; i++) {
        const pi = coordsList[i]

        const v = vec3.subtract(pi, p1)

        const distance = Math.abs(vec3.dot(v, unitNormal))
        maxDeviation = Math.max(maxDeviation, distance)
      }

      return {
        value: maxDeviation,
        satisfied: Math.abs(maxDeviation - 0) <= this.tolerance
      }
    }
    return { value: 1, satisfied: false }
  }

  validateConstraintSpecific(): ValidationResult {
    const errors = []

    if (this.points.length < 4) {
      errors.push(ValidationHelpers.createError(
        'INSUFFICIENT_POINTS',
        'Coplanar points constraint requires at least 4 points',
        this.getName(),
        'constraint',
        'points'
      ))
    }

    // Check for duplicate points
    const uniquePoints = new Set(this.points)
    if (uniquePoints.size !== this.points.length) {
      errors.push(ValidationHelpers.createError(
        'DUPLICATE_POINTS',
        'Coplanar points constraint cannot have duplicate points',
        this.getName(),
        'constraint',
        'points'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'Coplanar points constraint validation passed' : `Coplanar points constraint validation failed: ${errors.length} errors`
    }
  }

  /**
   * Compute residuals for coplanar points constraint.
   *
   * For each point beyond the first 3, we compute its signed distance from the
   * plane defined by the first 3 points. This is done by:
   * 1. Computing the normal to the plane (cross product of two edge vectors)
   * 2. Computing the distance = (v · normal) / |normal|
   *
   * This gives a scale-independent residual representing actual distance from plane.
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    if (this.points.length < 4) {
      console.warn('Coplanar constraint requires at least 4 points')
      return []
    }

    const p0 = valueMap.points.get(this.points[0])
    const p1 = valueMap.points.get(this.points[1])
    const p2 = valueMap.points.get(this.points[2])

    if (!p0 || !p1 || !p2) {
      console.warn(`Coplanar constraint ${this.getName()}: not enough points found in valueMap`)
      return []
    }

    // Calculate edge vectors for the base triangle
    const edge1 = p1.sub(p0)  // p0 -> p1
    const edge2 = p2.sub(p0)  // p0 -> p2

    // Normal vector (not normalized) = edge1 × edge2
    const normal = Vec3.cross(edge1, edge2)

    // |normal| = 2 * area of base triangle
    const normalLengthSq = Vec3.dot(normal, normal)

    // For numerical stability, add small epsilon to avoid division by zero
    const epsilon = V.C(1e-10)
    const normalLength = V.sqrt(V.add(normalLengthSq, epsilon))

    // Compute residual for each point beyond the first 3
    const residuals: Value[] = []
    for (let i = 3; i < this.points.length; i++) {
      const pi = valueMap.points.get(this.points[i])
      if (!pi) {
        console.warn(`Coplanar constraint ${this.getName()}: point ${i} not found in valueMap`)
        continue
      }

      // Vector from p0 to pi
      const v = pi.sub(p0)

      // Signed distance from plane = (v · normal) / |normal|
      const dotProduct = Vec3.dot(v, normal)
      const signedDistance = V.div(dotProduct, normalLength)

      residuals.push(signedDistance)
    }

    return residuals
  }

  serialize(context: SerializationContext): CoplanarPointsConstraintDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    const pointIds = this.points.map(point => {
      const pointId = context.getEntityId(point)
      if (!pointId) {
        throw new Error(
          `CoplanarPointsConstraint "${this.name}": Cannot serialize - all points must be serialized first`
        )
      }
      return pointId
    })

    return {
      id,
      type: 'coplanar_points',
      name: this.name,
      pointIds,
      tolerance: this.tolerance
    }
  }

  static deserialize(dto: CoplanarPointsConstraintDto, context: SerializationContext): CoplanarPointsConstraint {
    const points = dto.pointIds.map(pointId => {
      const point = context.getEntity<WorldPoint>(pointId)
      if (!point) {
        throw new Error(
          `CoplanarPointsConstraint "${dto.name}": Cannot deserialize - point ${pointId} not found in context`
        )
      }
      return point
    })

    const constraint = CoplanarPointsConstraint.create(
      dto.name,
      points,
      { tolerance: dto.tolerance }
    )

    context.registerEntity(constraint, dto.id)
    return constraint
  }
}