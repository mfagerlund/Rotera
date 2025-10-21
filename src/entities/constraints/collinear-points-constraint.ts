// Collinear points constraint

import type { ValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { Vec3, type Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point/WorldPoint'
import {
  Constraint,
  type ConstraintEvaluation,
  getPointCoordinates
} from './base-constraint'

export class CollinearPointsConstraint extends Constraint {
  readonly points: WorldPoint[]
  tolerance: number

  private constructor(
    name: string,
    points: WorldPoint[],
    tolerance: number
  ) {
    super(name)
    this.points = points
    this.tolerance = tolerance

    // Register with all points
    points.forEach(p => p.addReferencingConstraint(this))
  }

  static create(
    name: string,
    points: WorldPoint[], // At least 3 points
    options: {
      tolerance?: number
    } = {}
  ): CollinearPointsConstraint {
    if (points.length < 3) {
      throw new Error('CollinearPointsConstraint requires at least 3 points')
    }

    return new CollinearPointsConstraint(
      name,
      points,
      options.tolerance ?? 0.001
    )
  }

  getConstraintType(): string {
    return 'collinear_points'
  }

  evaluate(): ConstraintEvaluation {
    const coordsList = this.points.map(p => getPointCoordinates(p)).filter((c): c is [number, number, number] => c !== undefined)

    if (coordsList.length >= 3 && coordsList.length === this.points.length) {
      // Check collinearity using cross product method
      // For three points to be collinear, the cross product of vectors should be zero
      const p1 = coordsList[0]
      const p2 = coordsList[1]

      let maxDeviation = 0

      // Check each additional point against the line defined by the first two points
      for (let i = 2; i < coordsList.length; i++) {
        const p3 = coordsList[i]

        // Create vectors
        const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]
        const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]

        // Cross product magnitude represents the deviation from collinearity
        const cross = [
          v1[1] * v2[2] - v1[2] * v2[1],
          v1[2] * v2[0] - v1[0] * v2[2],
          v1[0] * v2[1] - v1[1] * v2[0]
        ]

        const crossMagnitude = Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2)
        const v1Magnitude = Math.sqrt(v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2)

        // Normalize by the length of the base vector to get a relative measure
        const deviation = v1Magnitude > 0 ? crossMagnitude / v1Magnitude : crossMagnitude
        maxDeviation = Math.max(maxDeviation, deviation)
      }

      return {
        value: maxDeviation,
        satisfied: Math.abs(maxDeviation - 0) <= this.tolerance // Target is 0 for perfect collinearity
      }
    }
    return { value: 1, satisfied: false }
  }

  validateConstraintSpecific(): ValidationResult {
    const errors = []

    if (this.points.length < 3) {
      errors.push(ValidationHelpers.createError(
        'INSUFFICIENT_POINTS',
        'Collinear points constraint requires at least 3 points',
        this.getName(),
        'constraint',
        'points'
      ))
    }

    // Check for duplicate points
    const uniquePoints = new Set(this.points)
    if (uniquePoints.size !== this.points.length) {
      errors.push(ValidationHelpers.createError(
        'DUPLICATE_POINTS',
        'Collinear points constraint cannot have duplicate points',
        this.getName(),
        'constraint',
        'points'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'Collinear points constraint validation passed' : `Collinear points constraint validation failed: ${errors.length} errors`
    }
  }

  /**
   * Compute residuals for collinear points constraint.
   * Residual: For 3+ points to be collinear, the cross product of vectors
   * from point 0 to point 1 and point 0 to point 2 should be zero.
   * Returns 3 residuals (x, y, z components of cross product).
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    if (this.points.length < 3) {
      console.warn('Collinear constraint requires at least 3 points')
      return []
    }

    const p0 = valueMap.points.get(this.points[0])
    const p1 = valueMap.points.get(this.points[1])
    const p2 = valueMap.points.get(this.points[2])

    if (!p0 || !p1 || !p2) {
      console.warn(`Collinear constraint ${this.getName()}: not enough points found in valueMap`)
      return []
    }

    // Calculate vectors from p0 using Vec3 API
    const v1 = p1.sub(p0)
    const v2 = p2.sub(p0)

    // Cross product should be (0, 0, 0) for collinear points
    const cross = Vec3.cross(v1, v2)

    return [cross.x, cross.y, cross.z]
  }
}