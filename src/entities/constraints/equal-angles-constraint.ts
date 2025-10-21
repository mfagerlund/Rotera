// Equal angles constraint

import type { ValidationResult, ValidationError } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { V, Vec3, type Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point/WorldPoint'
import {
  Constraint,
  type ConstraintEvaluation
} from './base-constraint'

export class EqualAnglesConstraint extends Constraint {
  readonly angleTriplets: [WorldPoint, WorldPoint, WorldPoint][]
  tolerance: number

  private constructor(
    name: string,
    angleTriplets: [WorldPoint, WorldPoint, WorldPoint][],
    tolerance: number
  ) {
    super(name)
    this.angleTriplets = angleTriplets
    this.tolerance = tolerance

    // Register with all points
    const allPoints = new Set<WorldPoint>()
    angleTriplets.forEach(triplet => {
      allPoints.add(triplet[0])
      allPoints.add(triplet[1])
      allPoints.add(triplet[2])
    })
    allPoints.forEach(point => point.addReferencingConstraint(this))
  }

  static create(
    name: string,
    angleTriplets: [WorldPoint, WorldPoint, WorldPoint][],
    options: {
      tolerance?: number
    } = {}
  ): EqualAnglesConstraint {
    if (angleTriplets.length < 2) {
      throw new Error('EqualAnglesConstraint requires at least 2 angle triplets')
    }

    return new EqualAnglesConstraint(
      name,
      angleTriplets,
      options.tolerance ?? 0.001
    )
  }

  getConstraintType(): string {
    return 'equal_angles'
  }

  evaluate(): ConstraintEvaluation {
    const angles: number[] = []

    // Calculate all angles
    for (const triplet of this.angleTriplets) {
      const [pointA, vertex, pointC] = triplet
      if (pointA.hasCoordinates() && vertex.hasCoordinates() && pointC.hasCoordinates()) {
        const angle = this.calculateAngleBetweenPoints(pointA, vertex, pointC)
        angles.push(angle)
      }
    }

    if (angles.length < 2) {
      return { value: Infinity, satisfied: false }
    }

    // Calculate the variance of angles (measure of how different they are)
    const mean = angles.reduce((sum, a) => sum + a, 0) / angles.length
    const variance = angles.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / angles.length
    const standardDeviation = Math.sqrt(variance)

    return {
      value: standardDeviation,
      satisfied: Math.abs(standardDeviation - 0) <= this.tolerance
    }
  }

  validateConstraintSpecific(): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    if (this.angleTriplets.length < 2) {
      errors.push(ValidationHelpers.createError(
        'INSUFFICIENT_ANGLE_TRIPLETS',
        'Equal angles constraint requires at least 2 angle triplets',
        this.getName(),
        'constraint',
        'angleTriplets'
      ))
    }

    // Validate each angle triplet
    for (let i = 0; i < this.angleTriplets.length; i++) {
      const triplet = this.angleTriplets[i]
      if (!triplet || triplet.length !== 3) {
        errors.push(ValidationHelpers.createError(
          'INVALID_ANGLE_TRIPLET',
          `Angle triplet ${i} must contain exactly 3 points`,
          this.getName(),
          'constraint',
          `angleTriplets[${i}]`
        ))
      } else {
        // Check for duplicate points within the triplet
        const uniquePoints = new Set(triplet)
        if (uniquePoints.size !== 3) {
          errors.push(ValidationHelpers.createError(
            'DUPLICATE_POINTS_IN_TRIPLET',
            `Angle triplet ${i} cannot have duplicate points`,
            this.getName(),
            'constraint',
            `angleTriplets[${i}]`
          ))
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Equal angles constraint validation passed' : `Equal angles constraint validation failed: ${errors.length} errors`
    }
  }

  /**
   * Compute residuals for equal angles constraint.
   * Residual: All angles should be equal.
   * Returns (n-1) residuals where n is the number of angle triplets,
   * each residual = angle_i - angle_0 in radians.
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    if (this.angleTriplets.length < 2) {
      console.warn('Equal angles constraint requires at least 2 triplets')
      return []
    }

    // Calculate angle for a triplet [pointA, vertex, pointC] using Vec3 API
    const calculateAngle = (triplet: [WorldPoint, WorldPoint, WorldPoint]): Value | undefined => {
      const [pointA, vertex, pointC] = triplet

      const pointAVec = valueMap.points.get(pointA)
      const vertexVec = valueMap.points.get(vertex)
      const pointCVec = valueMap.points.get(pointC)

      if (!pointAVec || !vertexVec || !pointCVec) return undefined

      // Calculate vectors from vertex using Vec3 API
      const v1 = pointAVec.sub(vertexVec)
      const v2 = pointCVec.sub(vertexVec)

      // Calculate angle using Vec3.angleBetween
      return Vec3.angleBetween(v1, v2)
    }

    // Calculate all angles
    const angles: Value[] = []
    for (const triplet of this.angleTriplets) {
      const angle = calculateAngle(triplet)
      if (angle) {
        angles.push(angle)
      }
    }

    if (angles.length < 2) {
      console.warn(`Equal angles constraint ${this.getName()}: not enough valid triplets found`)
      return []
    }

    // Create residuals: angle_i - angle_0 should all be 0
    const residuals: Value[] = []
    const referenceAngle = angles[0]

    for (let i = 1; i < angles.length; i++) {
      residuals.push(V.sub(angles[i], referenceAngle))
    }

    return residuals
  }
}