// Perpendicular lines constraint

import * as vec3 from '../../utils/vec3'
import type { Line } from '../line/Line'
import type { ConstraintEvaluation } from './base-constraint'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { PerpendicularLinesConstraintDto } from './ConstraintDto'
import { LineRelationshipConstraint } from './line-relationship-constraint'

export class PerpendicularLinesConstraint extends LineRelationshipConstraint {
  private constructor(
    name: string,
    lineA: Line,
    lineB: Line,
    tolerance: number
  ) {
    super(name, lineA, lineB, tolerance)
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
      const dotProduct = vec3.dot(dir1, dir2)
      const value = Math.abs(dotProduct)
      return {
        value,
        satisfied: Math.abs(value - 0) <= this.tolerance
      }
    }
    return { value: 1, satisfied: false }
  }

  serialize(context: SerializationContext): PerpendicularLinesConstraintDto {
    return this.serializeBase(context) as PerpendicularLinesConstraintDto
  }

  static deserialize(dto: PerpendicularLinesConstraintDto, context: SerializationContext): PerpendicularLinesConstraint {
    return LineRelationshipConstraint.deserializeBase(
      dto,
      context,
      'PerpendicularLinesConstraint',
      (name, line1, line2, tolerance) => new PerpendicularLinesConstraint(name, line1, line2, tolerance)
    )
  }
}