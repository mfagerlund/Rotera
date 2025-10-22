// Perpendicular lines constraint

import type { ValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import type { Value } from 'scalar-autograd'
import { Vec3Utils } from 'scalar-autograd'
import type { Line } from '../line/Line'
import {
  Constraint,
  type ConstraintRepository,
  type ConstraintEvaluation
} from './base-constraint'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { PerpendicularLinesConstraintDto } from './ConstraintDto'

export class PerpendicularLinesConstraint extends Constraint {
  readonly lineA: Line
  readonly lineB: Line
  tolerance: number

  private constructor(
    name: string,
    lineA: Line,
    lineB: Line,
    tolerance: number
  ) {
    super(name)
    this.lineA = lineA
    this.lineB = lineB
    this.tolerance = tolerance

    // Register with lines
    lineA.addReferencingConstraint(this)
    lineB.addReferencingConstraint(this)
  }

  static create(
    name: string,
    lineA: Line,
    lineB: Line,
    options: {
      tolerance?: number
    } = {}
  ): PerpendicularLinesConstraint {
    return new PerpendicularLinesConstraint(
      name,
      lineA,
      lineB,
      options.tolerance ?? 0.001
    )
  }

  getConstraintType(): string {
    return 'perpendicular_lines'
  }

  evaluate(): ConstraintEvaluation {
    const dir1 = this.lineA.getDirection()
    const dir2 = this.lineB.getDirection()
    if (dir1 && dir2) {
      const dotProduct = Vec3Utils.dot(dir1, dir2)
      const value = Math.abs(dotProduct)
      return {
        value,
        satisfied: Math.abs(value - 0) <= this.tolerance
      }
    }
    return { value: 1, satisfied: false }
  }

  validateConstraintSpecific(): ValidationResult {
    return {
      isValid: true,
      errors: [],
      warnings: [],
      summary: 'Perpendicular lines constraint validation passed'
    }
  }

  /**
   * Compute residuals for perpendicular lines constraint.
   * TODO: Requires line support in valueMap.
   * For now, returns empty array as lines are not yet supported in optimization.
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    console.warn(`Perpendicular lines constraint ${this.getName()}: not yet implemented - requires line support in valueMap`)
    return []
  }

  serialize(context: SerializationContext): PerpendicularLinesConstraintDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    const line1Id = context.getEntityId(this.lineA)
    const line2Id = context.getEntityId(this.lineB)

    if (!line1Id || !line2Id) {
      throw new Error(
        `PerpendicularLinesConstraint "${this.name}": Cannot serialize - lines must be serialized first`
      )
    }

    return {
      id,
      type: 'perpendicular_lines',
      name: this.name,
      line1Id,
      line2Id,
      tolerance: this.tolerance
    }
  }

  static deserialize(dto: PerpendicularLinesConstraintDto, context: SerializationContext): PerpendicularLinesConstraint {
    const line1 = context.getEntity<Line>(dto.line1Id)
    const line2 = context.getEntity<Line>(dto.line2Id)

    if (!line1 || !line2) {
      throw new Error(
        `PerpendicularLinesConstraint "${dto.name}": Cannot deserialize - lines not found in context`
      )
    }

    const constraint = PerpendicularLinesConstraint.create(
      dto.name,
      line1,
      line2,
      { tolerance: dto.tolerance }
    )

    context.registerEntity(constraint, dto.id)
    return constraint
  }
}