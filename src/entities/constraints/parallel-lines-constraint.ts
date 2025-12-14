// Parallel lines constraint

import * as vec3 from '../../utils/vec3'
import type { Line } from '../line'
import type { ConstraintEvaluation } from './base-constraint'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { ParallelLinesConstraintDto } from './ConstraintDto'
import { LineRelationshipConstraint } from './line-relationship-constraint'

export class ParallelLinesConstraint extends LineRelationshipConstraint {
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
  ): ParallelLinesConstraint {
    return new ParallelLinesConstraint(
      name,
      lineA,
      lineB,
      options.tolerance ?? 0.001
    )
  }

  getConstraintType(): string {
    return 'parallel_lines'
  }

  evaluate(): ConstraintEvaluation {
    const dir1 = this.lineA.getDirection()
    const dir2 = this.lineB.getDirection()
    if (dir1 && dir2) {
      const dotProduct = Math.abs(vec3.dot(dir1, dir2))
      const value = Math.acos(Math.min(1, dotProduct)) * (180 / Math.PI)
      return {
        value,
        satisfied: Math.abs(value - 0) <= this.tolerance
      }
    }
    return { value: 90, satisfied: false }
  }

  serialize(context: SerializationContext): ParallelLinesConstraintDto {
    return this.serializeBase(context) as ParallelLinesConstraintDto
  }

  static deserialize(dto: ParallelLinesConstraintDto, context: SerializationContext): ParallelLinesConstraint {
    return LineRelationshipConstraint.deserializeBase(
      dto,
      context,
      'ParallelLinesConstraint',
      (name, line1, line2, tolerance) => new ParallelLinesConstraint(name, line1, line2, tolerance)
    )
  }
}