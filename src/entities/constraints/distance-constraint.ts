import type { EntityValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { V, type Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point'
import {
  Constraint,
  type ConstraintRepository,
  type ConstraintEvaluation
} from './base-constraint'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { DistanceConstraintDto } from './ConstraintDto'
import {makeObservable, observable, override} from 'mobx'

export class DistanceConstraint extends Constraint {
  readonly pointA: WorldPoint
  readonly pointB: WorldPoint
  targetDistance: number
  tolerance: number

  private constructor(
    name: string,
    pointA: WorldPoint,
    pointB: WorldPoint,
    targetDistance: number,
    tolerance: number
  ) {
    super(name)
    this.pointA = pointA
    this.pointB = pointB
    this.targetDistance = targetDistance
    this.tolerance = tolerance

    makeObservable(this, {
      targetDistance: observable,
      tolerance: observable,
    })

    // Register with points
    pointA.addReferencingConstraint(this)
    pointB.addReferencingConstraint(this)
  }

  static create(
    name: string,
    pointA: WorldPoint,
    pointB: WorldPoint,
    targetDistance: number,
    options: {
      tolerance?: number
    } = {}
  ): DistanceConstraint {
    return new DistanceConstraint(
      name,
      pointA,
      pointB,
      targetDistance,
      options.tolerance ?? 0.001
    )
  }

  getConstraintType(): string {
    return 'distance_point_point'
  }

  evaluate(): ConstraintEvaluation {
    if (this.pointA.hasCoordinates() && this.pointB.hasCoordinates()) {
      const value = this.pointA.distanceTo(this.pointB) ?? 0
      return {
        value,
        satisfied: Math.abs(value - this.targetDistance) <= this.tolerance
      }
    }
    return { value: 0, satisfied: false }
  }

  validateConstraintSpecific(): EntityValidationResult {
    const errors = []

    if (this.targetDistance < 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TARGET_DISTANCE',
        'targetDistance must be non-negative',
        this.getName(),
        'constraint',
        'targetDistance'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'Distance constraint validation passed' : `Distance constraint validation failed: ${errors.length} errors`
    }
  }

  /**
   * Compute residuals for distance constraint.
   * Residual: (actual_distance - target_distance)
   * Should be 0 when the distance between points equals the target.
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    const pointAVec = valueMap.points.get(this.pointA)
    const pointBVec = valueMap.points.get(this.pointB)

    if (!pointAVec || !pointBVec) {
      console.warn(`Distance constraint ${this.getName()}: points not found in valueMap`)
      return []
    }

    // Calculate actual distance using Vec3 API
    const diff = pointBVec.sub(pointAVec)
    const dist = diff.magnitude

    // Residual = actual - target
    const residual = V.sub(dist, V.C(this.targetDistance))

    return [residual]
  }

  serialize(context: SerializationContext): DistanceConstraintDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    const pointAId = context.getEntityId(this.pointA)
    const pointBId = context.getEntityId(this.pointB)

    if (!pointAId || !pointBId) {
      throw new Error(
        `DistanceConstraint "${this.name}": Cannot serialize - points must be serialized first`
      )
    }

    return {
      id,
      type: 'distance_point_point',
      name: this.name,
      pointAId,
      pointBId,
      targetDistance: this.targetDistance,
      tolerance: this.tolerance
    }
  }

  static deserialize(dto: DistanceConstraintDto, context: SerializationContext): DistanceConstraint {
    const pointA = context.getEntity<WorldPoint>(dto.pointAId)
    const pointB = context.getEntity<WorldPoint>(dto.pointBId)

    if (!pointA || !pointB) {
      throw new Error(
        `DistanceConstraint "${dto.name}": Cannot deserialize - points not found in context`
      )
    }

    const constraint = DistanceConstraint.create(
      dto.name,
      pointA,
      pointB,
      dto.targetDistance,
      { tolerance: dto.tolerance }
    )

    context.registerEntity(constraint, dto.id)
    return constraint
  }
}
