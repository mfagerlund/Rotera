// Parallel lines constraint

import type { ValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import type { Value } from 'scalar-autograd'
import type { Line } from '../line'
import {
  Constraint,
  type ConstraintRepository,
  type ConstraintEvaluation
} from './base-constraint'

export class ParallelLinesConstraint extends Constraint {
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
      // Calculate dot product to check parallelism
      // For parallel lines, the absolute dot product should be close to 1
      const dotProduct = Math.abs(dir1[0] * dir2[0] + dir1[1] * dir2[1] + dir1[2] * dir2[2])
      const value = Math.acos(Math.min(1, dotProduct)) * (180 / Math.PI) // Angle in degrees
      return {
        value,
        satisfied: Math.abs(value - 0) <= this.tolerance // Target is 0 degrees for parallel lines
      }
    }
    return { value: 90, satisfied: false }
  }

  validateConstraintSpecific(): ValidationResult {
    return {
      isValid: true,
      errors: [],
      warnings: [],
      summary: 'Parallel lines constraint validation passed'
    }
  }

  /**
   * Compute residuals for parallel lines constraint.
   * TODO: Requires line support in valueMap.
   * For now, returns empty array as lines are not yet supported in optimization.
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    console.warn(`Parallel lines constraint ${this.getName()}: not yet implemented - requires line support in valueMap`)
    return []
  }
}