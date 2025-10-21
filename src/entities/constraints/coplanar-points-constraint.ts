// Coplanar points constraint

import type { ValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { Vec3, type Value } from 'scalar-autograd'
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
  readonly points: WorldPoint[]
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
      // Use first three points to define the plane
      const p1 = coordsList[0]
      const p2 = coordsList[1]
      const p3 = coordsList[2]

      // Create vectors from p1 to p2 and p1 to p3
      const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]
      const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]

      // Calculate normal vector to the plane using cross product
      const normal = [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0]
      ]

      // Normalize the normal vector
      const normalMagnitude = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2)
      if (normalMagnitude === 0) {
        // First three points are collinear, cannot define a plane
        return { value: Infinity, satisfied: false }
      }

      const unitNormal = [
        normal[0] / normalMagnitude,
        normal[1] / normalMagnitude,
        normal[2] / normalMagnitude
      ]

      let maxDeviation = 0

      // Check distance of each remaining point from the plane
      for (let i = 3; i < coordsList.length; i++) {
        const pi = coordsList[i]

        // Vector from p1 to pi
        const v = [pi[0] - p1[0], pi[1] - p1[1], pi[2] - p1[2]]

        // Distance from point to plane = |dot product of v with unit normal|
        const distance = Math.abs(v[0] * unitNormal[0] + v[1] * unitNormal[1] + v[2] * unitNormal[2])
        maxDeviation = Math.max(maxDeviation, distance)
      }

      return {
        value: maxDeviation,
        satisfied: Math.abs(maxDeviation - 0) <= this.tolerance // Target is 0 for perfect coplanarity
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
   * Residual: For 4+ points to be coplanar, the scalar triple product
   * (v1 · (v2 × v3)) should be zero.
   * Returns 1 residual (the scalar triple product).
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    if (this.points.length < 4) {
      console.warn('Coplanar constraint requires at least 4 points')
      return []
    }

    const p0 = valueMap.points.get(this.points[0])
    const p1 = valueMap.points.get(this.points[1])
    const p2 = valueMap.points.get(this.points[2])
    const p3 = valueMap.points.get(this.points[3])

    if (!p0 || !p1 || !p2 || !p3) {
      console.warn(`Coplanar constraint ${this.getName()}: not enough points found in valueMap`)
      return []
    }

    // Calculate vectors from p0 using Vec3 API
    const v1 = p1.sub(p0)
    const v2 = p2.sub(p0)
    const v3 = p3.sub(p0)

    // Calculate cross product v2 × v3
    const cross = Vec3.cross(v2, v3)

    // Calculate scalar triple product: v1 · (v2 × v3)
    const scalarTripleProduct = Vec3.dot(v1, cross)

    // Should be 0 for coplanar points
    return [scalarTripleProduct]
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