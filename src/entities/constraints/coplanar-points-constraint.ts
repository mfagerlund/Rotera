// Coplanar points constraint

import type { EntityValidationResult } from '../../validation/validator'
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
      let maxDeviation = 0

      // Use rotating base triangles, same as computeResiduals
      for (let i = 3; i < coordsList.length; i++) {
        const pBase0 = coordsList[i - 3]
        const pBase1 = coordsList[i - 2]
        const pBase2 = coordsList[i - 1]
        const pTest = coordsList[i]

        const v1 = vec3.subtract(pBase1, pBase0)
        const v2 = vec3.subtract(pBase2, pBase0)

        const normal = vec3.cross(v1, v2)
        const normalMagnitude = vec3.magnitude(normal)

        if (normalMagnitude === 0) {
          // Degenerate triangle - points are collinear
          continue
        }

        const unitNormal = vec3.normalize(normal)
        const v = vec3.subtract(pTest, pBase0)
        const distance = Math.abs(vec3.dot(v, unitNormal))
        maxDeviation = Math.max(maxDeviation, distance)
      }

      return {
        value: maxDeviation,
        satisfied: maxDeviation <= this.tolerance
      }
    }
    return { value: 1, satisfied: false }
  }

  validateConstraintSpecific(): EntityValidationResult {
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
      tolerance: this.tolerance,
      lastResiduals: this.lastResiduals.length > 0 ? [...this.lastResiduals] : undefined
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

    if (dto.lastResiduals) {
      constraint.lastResiduals = [...dto.lastResiduals]
    }

    context.registerEntity(constraint, dto.id)
    return constraint
  }
}