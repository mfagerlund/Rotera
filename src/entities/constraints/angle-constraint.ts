// Angle constraint between three points

import type { EntityValidationResult, EntityValidationError } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { V, Vec3, type Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point/WorldPoint'
import {
  Constraint,
  type ConstraintEvaluation
} from './base-constraint'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { AngleConstraintDto } from './ConstraintDto'
import {makeObservable, observable} from 'mobx'

export class AngleConstraint extends Constraint {
  readonly pointA: WorldPoint
  readonly vertex: WorldPoint
  readonly pointC: WorldPoint
  targetAngle: number  // In degrees
  tolerance: number

  private constructor(
    name: string,
    pointA: WorldPoint,
    vertex: WorldPoint,
    pointC: WorldPoint,
    targetAngle: number,
    tolerance: number
  ) {
    super(name)
    this.pointA = pointA
    this.vertex = vertex
    this.pointC = pointC
    this.targetAngle = targetAngle
    this.tolerance = tolerance

    makeObservable(this, {
      targetAngle: observable,
      tolerance: observable,
    })

    // Register with points
    pointA.addReferencingConstraint(this)
    vertex.addReferencingConstraint(this)
    pointC.addReferencingConstraint(this)
  }

  static create(
    name: string,
    pointA: WorldPoint,
    vertex: WorldPoint,
    pointC: WorldPoint,
    targetAngle: number,
    options: {
      tolerance?: number
    } = {}
  ): AngleConstraint {
    return new AngleConstraint(
      name,
      pointA,
      vertex,
      pointC,
      targetAngle,
      options.tolerance ?? 0.001
    )
  }

  getConstraintType(): string {
    return 'angle_point_point_point'
  }

  evaluate(): ConstraintEvaluation {
    if (this.pointA.hasCoordinates() && this.vertex.hasCoordinates() && this.pointC.hasCoordinates()) {
      const value = this.calculateAngleBetweenPoints(this.pointA, this.vertex, this.pointC)
      return {
        value,
        satisfied: Math.abs(value - this.targetAngle) <= this.tolerance
      }
    }
    return { value: 0, satisfied: false }
  }

  validateConstraintSpecific(): EntityValidationResult {
    const errors: EntityValidationError[] = []
    const warnings: EntityValidationError[] = []

    if (this.targetAngle < 0 || this.targetAngle > 360) {
      warnings.push(ValidationHelpers.createError(
        'UNUSUAL_ANGLE_VALUE',
        'targetAngle should typically be between 0 and 360 degrees',
        this.getName(),
        'constraint',
        'targetAngle'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Angle constraint validation passed' : `Angle constraint validation failed: ${errors.length} errors`
    }
  }

  /**
   * Compute residuals for angle constraint.
   * Residual: (actual_angle - target_angle) in radians
   * Should be 0 when the angle at the vertex equals the target.
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    const pointAVec = valueMap.points.get(this.pointA)
    const vertexVec = valueMap.points.get(this.vertex)
    const pointCVec = valueMap.points.get(this.pointC)

    if (!pointAVec || !vertexVec || !pointCVec) {
      console.warn(`Angle constraint ${this.getName()}: points not found in valueMap`)
      return []
    }

    const targetAngleRadians = (this.targetAngle * Math.PI) / 180

    // Calculate vectors from vertex using Vec3 API
    const v1 = pointAVec.sub(vertexVec)
    const v2 = pointCVec.sub(vertexVec)

    // Calculate angle using Vec3.angleBetween
    const actualAngle = Vec3.angleBetween(v1, v2)

    // Residual = actual - target
    const residual = V.sub(actualAngle, V.C(targetAngleRadians))

    return [residual]
  }

  serialize(context: SerializationContext): AngleConstraintDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    const pointAId = context.getEntityId(this.pointA)
    const vertexId = context.getEntityId(this.vertex)
    const pointCId = context.getEntityId(this.pointC)

    if (!pointAId || !vertexId || !pointCId) {
      throw new Error(
        `AngleConstraint "${this.name}": Cannot serialize - points must be serialized first`
      )
    }

    return {
      id,
      type: 'angle_point_point_point',
      name: this.name,
      pointAId,
      vertexId,
      pointCId,
      targetAngle: this.targetAngle,
      tolerance: this.tolerance,
      lastResiduals: this.lastResiduals.length > 0 ? [...this.lastResiduals] : undefined
    }
  }

  static deserialize(dto: AngleConstraintDto, context: SerializationContext): AngleConstraint {
    const pointA = context.getEntity<WorldPoint>(dto.pointAId)
    const vertex = context.getEntity<WorldPoint>(dto.vertexId)
    const pointC = context.getEntity<WorldPoint>(dto.pointCId)

    if (!pointA || !vertex || !pointC) {
      throw new Error(
        `AngleConstraint "${dto.name}": Cannot deserialize - points not found in context`
      )
    }

    const constraint = AngleConstraint.create(
      dto.name,
      pointA,
      vertex,
      pointC,
      dto.targetAngle,
      { tolerance: dto.tolerance }
    )

    if (dto.lastResiduals) {
      constraint.lastResiduals = [...dto.lastResiduals]
    }

    context.registerEntity(constraint, dto.id)
    return constraint
  }
}
