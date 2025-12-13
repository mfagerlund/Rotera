// Equal distances constraint

import type { EntityValidationResult, EntityValidationError } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { V, type Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point/WorldPoint'
import type { Line } from '../line/Line'
import {
  Constraint,
  type ConstraintEvaluation
} from './base-constraint'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { EqualDistancesConstraintDto } from './ConstraintDto'

export class EqualDistancesConstraint extends Constraint {
  readonly distancePairs: [WorldPoint, WorldPoint][]
  tolerance: number

  private constructor(
    name: string,
    distancePairs: [WorldPoint, WorldPoint][],
    tolerance: number
  ) {
    super(name)
    this.distancePairs = distancePairs
    this.tolerance = tolerance

    // Register with all points
    const allPoints = new Set<WorldPoint>()
    distancePairs.forEach(pair => {
      allPoints.add(pair[0])
      allPoints.add(pair[1])
    })
    allPoints.forEach(point => point.addReferencingConstraint(this))
  }

  static create(
    name: string,
    distancePairs: [WorldPoint, WorldPoint][],
    options: {
      tolerance?: number
    } = {}
  ): EqualDistancesConstraint {
    if (distancePairs.length < 2) {
      throw new Error('EqualDistancesConstraint requires at least 2 distance pairs')
    }

    return new EqualDistancesConstraint(
      name,
      distancePairs,
      options.tolerance ?? 0.001
    )
  }

  getConstraintType(): string {
    return 'equal_distances'
  }

  evaluate(): ConstraintEvaluation {
    const distances: number[] = []

    // Calculate all distances
    for (const pair of this.distancePairs) {
      const [point1, point2] = pair
      if (point1.hasCoordinates() && point2.hasCoordinates()) {
        const distance = point1.distanceTo(point2)
        if (distance !== null) {
          distances.push(distance)
        }
      }
    }

    if (distances.length < 2) {
      return { value: Infinity, satisfied: false }
    }

    // Calculate the variance of distances (measure of how different they are)
    const mean = distances.reduce((sum, d) => sum + d, 0) / distances.length
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / distances.length
    const standardDeviation = Math.sqrt(variance)

    return {
      value: standardDeviation,
      satisfied: Math.abs(standardDeviation - 0) <= this.tolerance
    }
  }

  validateConstraintSpecific(): EntityValidationResult {
    const errors: EntityValidationError[] = []
    const warnings: EntityValidationError[] = []

    if (this.distancePairs.length < 2) {
      errors.push(ValidationHelpers.createError(
        'INSUFFICIENT_DISTANCE_PAIRS',
        'Equal distances constraint requires at least 2 distance pairs',
        this.getName(),
        'constraint',
        'distancePairs'
      ))
    }

    // Validate each distance pair
    for (let i = 0; i < this.distancePairs.length; i++) {
      const pair = this.distancePairs[i]
      if (!pair || pair.length !== 2) {
        errors.push(ValidationHelpers.createError(
          'INVALID_DISTANCE_PAIR',
          `Distance pair ${i} must contain exactly 2 points`,
          this.getName(),
          'constraint',
          `distancePairs[${i}]`
        ))
      } else if (pair[0] === pair[1]) {
        errors.push(ValidationHelpers.createError(
          'IDENTICAL_POINTS_IN_PAIR',
          `Distance pair ${i} cannot have identical points`,
          this.getName(),
          'constraint',
          `distancePairs[${i}]`
        ))
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Equal distances constraint validation passed' : `Equal distances constraint validation failed: ${errors.length} errors`
    }
  }

  /**
   * Compute residuals for equal distances constraint.
   * Residual: All pairwise distances should be equal.
   * Returns (n-1) residuals where n is the number of point pairs,
   * each residual = distance_i - distance_0.
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    if (this.distancePairs.length < 2) {
      console.warn('Equal distances constraint requires at least 2 pairs')
      return []
    }

    // Calculate distance for a pair using Vec3 API
    const calculateDistance = (pair: [WorldPoint, WorldPoint]): Value | undefined => {
      const [p1, p2] = pair

      const p1Vec = valueMap.points.get(p1)
      const p2Vec = valueMap.points.get(p2)

      if (!p1Vec || !p2Vec) return undefined

      const diff = p2Vec.sub(p1Vec)
      return diff.magnitude
    }

    // Calculate all distances
    const distances: Value[] = []
    for (const pair of this.distancePairs) {
      const dist = calculateDistance(pair)
      if (dist) {
        distances.push(dist)
      }
    }

    if (distances.length < 2) {
      console.warn(`Equal distances constraint ${this.getName()}: not enough valid pairs found`)
      return []
    }

    // Create residuals: distance_i - distance_0 should all be 0
    const residuals: Value[] = []
    const referenceDist = distances[0]

    for (let i = 1; i < distances.length; i++) {
      residuals.push(V.sub(distances[i], referenceDist))
    }

    return residuals
  }

  serialize(context: SerializationContext): EqualDistancesConstraintDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    if (this.distancePairs.length !== 2) {
      throw new Error(
        `EqualDistancesConstraint "${this.name}": Cannot serialize - DTO only supports exactly 2 distance pairs, but constraint has ${this.distancePairs.length}`
      )
    }

    const findLineForPair = (pointA: WorldPoint, pointB: WorldPoint): string | null => {
      for (const line of pointA.connectedLines) {
        if ((line.pointA === pointA && line.pointB === pointB) ||
            (line.pointA === pointB && line.pointB === pointA)) {
          const lineId = context.getEntityId(line as Line)
          if (lineId) return lineId
        }
      }
      return null
    }

    const line1Id = findLineForPair(this.distancePairs[0][0], this.distancePairs[0][1])
    const line2Id = findLineForPair(this.distancePairs[1][0], this.distancePairs[1][1])

    if (!line1Id || !line2Id) {
      throw new Error(
        `EqualDistancesConstraint "${this.name}": Cannot serialize - distance pairs must correspond to Line entities that have been serialized`
      )
    }

    return {
      id,
      type: 'equal_distances',
      name: this.name,
      line1Id,
      line2Id,
      tolerance: this.tolerance
    }
  }

  static deserialize(dto: EqualDistancesConstraintDto, context: SerializationContext): EqualDistancesConstraint {
    const line1 = context.getEntity<Line>(dto.line1Id)
    const line2 = context.getEntity<Line>(dto.line2Id)

    if (!line1 || !line2) {
      throw new Error(
        `EqualDistancesConstraint "${dto.name}": Cannot deserialize - lines not found in context`
      )
    }

    const constraint = EqualDistancesConstraint.create(
      dto.name,
      [
        [line1.pointA, line1.pointB],
        [line2.pointA, line2.pointB]
      ],
      { tolerance: dto.tolerance }
    )

    context.registerEntity(constraint, dto.id)
    return constraint
  }
}