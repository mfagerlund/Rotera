// Base class for equality constraints (equal angles, equal distances)

import { Constraint, type ConstraintEvaluation } from './base-constraint'

export abstract class EqualityConstraintBase<T> extends Constraint {
  tolerance: number

  protected constructor(name: string, tolerance: number) {
    super(name)
    this.tolerance = tolerance
  }

  protected abstract getItems(): T[]
  protected abstract computeValue(item: T): number | null

  evaluate(): ConstraintEvaluation {
    const values: number[] = []

    for (const item of this.getItems()) {
      const value = this.computeValue(item)
      if (value !== null) {
        values.push(value)
      }
    }

    if (values.length < 2) {
      return { value: Infinity, satisfied: false }
    }

    // Calculate the variance (measure of how different values are)
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    const standardDeviation = Math.sqrt(variance)

    return {
      value: standardDeviation,
      satisfied: Math.abs(standardDeviation - 0) <= this.tolerance
    }
  }
}
