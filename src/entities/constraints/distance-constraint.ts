// Distance constraint between two points

import type { ValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { V, type Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point'
import {
  Constraint,
  type ConstraintRepository,
  type ConstraintEvaluation
} from './base-constraint'

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

  validateConstraintSpecific(): ValidationResult {
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
}
