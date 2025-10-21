// Fixed point constraint

import type { ValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { V, type Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point'
import {
  Constraint,
  type ConstraintRepository,
  type ConstraintEvaluation,
  getPointCoordinates
} from './base-constraint'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { FixedPointConstraintDto } from './ConstraintDto'

export class FixedPointConstraint extends Constraint {
  readonly point: WorldPoint
  targetXyz: [number, number, number]
  tolerance: number

  private constructor(
    name: string,
    point: WorldPoint,
    targetXyz: [number, number, number],
    tolerance: number
  ) {
    super(name)
    this.point = point
    this.targetXyz = targetXyz
    this.tolerance = tolerance

    // Register with point
    point.addReferencingConstraint(this)
  }

  static create(
    name: string,
    point: WorldPoint,
    targetXyz: [number, number, number],
    options: {
      tolerance?: number
    } = {}
  ): FixedPointConstraint {
    return new FixedPointConstraint(
      name,
      point,
      targetXyz,
      options.tolerance ?? 0.001
    )
  }

  getConstraintType(): string {
    return 'fixed_point'
  }

  evaluate(): ConstraintEvaluation {
    const currentPos = getPointCoordinates(this.point)
    if (currentPos) {
      const targetPos = this.targetXyz

      // Calculate distance from current position to target position
      const value = Math.sqrt(
        Math.pow(currentPos[0] - targetPos[0], 2) +
        Math.pow(currentPos[1] - targetPos[1], 2) +
        Math.pow(currentPos[2] - targetPos[2], 2)
      )

      return {
        value,
        satisfied: value <= this.tolerance
      }
    }
    return { value: Infinity, satisfied: false }
  }

  validateConstraintSpecific(): ValidationResult {
    const errors = []

    if (!this.targetXyz || this.targetXyz.length !== 3) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TARGET_XYZ',
        'targetXyz must be an array of exactly 3 numbers',
        this.getName(),
        'constraint',
        'targetXyz'
      ))
    } else {
      for (let i = 0; i < 3; i++) {
        if (typeof this.targetXyz[i] !== 'number' || !isFinite(this.targetXyz[i])) {
          errors.push(ValidationHelpers.createError(
            'INVALID_TARGET_COORDINATE',
            `targetXyz[${i}] must be a finite number`,
            this.getName(),
            'constraint',
            `targetXyz[${i}]`
          ))
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'Fixed point constraint validation passed' : `Fixed point constraint validation failed: ${errors.length} errors`
    }
  }

  /**
   * Compute residuals for fixed point constraint.
   * Residual: Distance from point to target position should be zero.
   * Returns [dx, dy, dz] where each component should be 0 when constraint is satisfied.
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    const pointVec = valueMap.points.get(this.point)

    if (!pointVec) {
      console.warn(`Fixed point constraint ${this.getName()}: point not found in valueMap`)
      return []
    }

    const targetXyz = this.targetXyz

    // Residual = current position - target position
    // Each component should be 0 when point is at target
    const dx = V.sub(pointVec.x, V.C(targetXyz[0]))
    const dy = V.sub(pointVec.y, V.C(targetXyz[1]))
    const dz = V.sub(pointVec.z, V.C(targetXyz[2]))

    return [dx, dy, dz]
  }

  serialize(context: SerializationContext): FixedPointConstraintDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    const pointId = context.getEntityId(this.point)

    if (!pointId) {
      throw new Error(
        `FixedPointConstraint "${this.name}": Cannot serialize - point must be serialized first`
      )
    }

    return {
      id,
      type: 'fixed_point',
      name: this.name,
      pointId,
      targetPosition: this.targetXyz,
      tolerance: this.tolerance
    }
  }

  static deserialize(dto: FixedPointConstraintDto, context: SerializationContext): FixedPointConstraint {
    const point = context.getEntity<WorldPoint>(dto.pointId)

    if (!point) {
      throw new Error(
        `FixedPointConstraint "${dto.name}": Cannot deserialize - point not found in context`
      )
    }

    const constraint = FixedPointConstraint.create(
      dto.name,
      point,
      dto.targetPosition,
      { tolerance: dto.tolerance }
    )

    context.registerEntity(constraint, dto.id)
    return constraint
  }
}