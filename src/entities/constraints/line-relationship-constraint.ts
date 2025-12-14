// Base class for line relationship constraints (parallel, perpendicular)

import type { EntityValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import type { Value } from 'scalar-autograd'
import type { Line } from '../line/Line'
import {
  Constraint,
  type ConstraintEvaluation
} from './base-constraint'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { ConstraintDto } from './ConstraintDto'

export abstract class LineRelationshipConstraint extends Constraint {
  readonly lineA: Line
  readonly lineB: Line
  tolerance: number

  protected constructor(
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

  validateConstraintSpecific(): EntityValidationResult {
    return {
      isValid: true,
      errors: [],
      warnings: [],
      summary: `${this.getConstraintType()} constraint validation passed`
    }
  }

  computeResiduals(valueMap: ValueMap): Value[] {
    console.warn(`${this.getConstraintType()} constraint ${this.getName()}: not yet implemented - requires line support in valueMap`)
    return []
  }

  abstract serialize(context: SerializationContext): ConstraintDto

  protected serializeBase(context: SerializationContext): {
    id: string
    type: string
    name: string
    line1Id: string
    line2Id: string
    tolerance: number
  } {
    const id = context.getEntityId(this) || context.registerEntity(this)

    const line1Id = context.getEntityId(this.lineA)
    const line2Id = context.getEntityId(this.lineB)

    if (!line1Id || !line2Id) {
      throw new Error(
        `${this.getConstraintType()} "${this.name}": Cannot serialize - lines must be serialized first`
      )
    }

    return {
      id,
      type: this.getConstraintType(),
      name: this.name,
      line1Id,
      line2Id,
      tolerance: this.tolerance
    }
  }

  protected static deserializeBase<T extends LineRelationshipConstraint>(
    dto: {
      id: string
      name: string
      line1Id: string
      line2Id: string
      tolerance: number
    },
    context: SerializationContext,
    constraintType: string,
    createFn: (name: string, line1: Line, line2: Line, tolerance: number) => T
  ): T {
    const line1 = context.getEntity<Line>(dto.line1Id)
    const line2 = context.getEntity<Line>(dto.line2Id)

    if (!line1 || !line2) {
      throw new Error(
        `${constraintType} "${dto.name}": Cannot deserialize - lines not found in context`
      )
    }

    const constraint = createFn(dto.name, line1, line2, dto.tolerance)
    context.registerEntity(constraint, dto.id)
    return constraint
  }
}
