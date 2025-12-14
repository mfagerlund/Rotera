// Base class for equality constraints (equal angles, equal distances)

import type { Value } from 'scalar-autograd'
import { V } from 'scalar-autograd'
import { Constraint, type ConstraintEvaluation } from './base-constraint'
import type { ValueMap } from '../../optimization/IOptimizable'

export abstract class EqualityConstraintBase<T> extends Constraint {
  tolerance: number

  protected constructor(name: string, tolerance: number) {
    super(name)
    this.tolerance = tolerance
  }

  protected abstract getItems(): T[]
  protected abstract computeValue(item: T): number | null
  protected abstract computeAutogradValue(item: T, valueMap: ValueMap): Value | undefined

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

  protected computeResidualValues(valueMap: ValueMap): Value[] {
    const items = this.getItems()

    if (items.length < 2) {
      console.warn(`${this.getConstraintType()} constraint requires at least 2 items`)
      return []
    }

    // Calculate all values
    const values: Value[] = []
    for (const item of items) {
      const value = this.computeAutogradValue(item, valueMap)
      if (value) {
        values.push(value)
      }
    }

    if (values.length < 2) {
      console.warn(`${this.getConstraintType()} constraint ${this.getName()}: not enough valid items found`)
      return []
    }

    // Create residuals: value_i - value_0 should all be 0
    const residuals: Value[] = []
    const referenceValue = values[0]

    for (let i = 1; i < values.length; i++) {
      residuals.push(V.sub(values[i], referenceValue))
    }

    return residuals
  }
}
