// Equal distances constraint

import type { EntityValidationResult, EntityValidationError } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import type { Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point/WorldPoint'
import type { Line } from '../line/Line'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { EqualDistancesConstraintDto } from './ConstraintDto'
import { EqualityConstraintBase } from './equality-constraint-base'

export class EqualDistancesConstraint extends EqualityConstraintBase<[WorldPoint, WorldPoint]> {
  readonly distancePairs: [WorldPoint, WorldPoint][]

  private constructor(
    name: string,
    distancePairs: [WorldPoint, WorldPoint][],
    tolerance: number
  ) {
    super(name, tolerance)
    this.distancePairs = distancePairs

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

  protected getItems(): [WorldPoint, WorldPoint][] {
    return this.distancePairs
  }

  protected computeValue(pair: [WorldPoint, WorldPoint]): number | null {
    const [point1, point2] = pair
    if (point1.hasCoordinates() && point2.hasCoordinates()) {
      return point1.distanceTo(point2)
    }
    return null
  }

  protected computeAutogradValue(pair: [WorldPoint, WorldPoint], valueMap: ValueMap): Value | undefined {
    const [p1, p2] = pair

    const p1Vec = valueMap.points.get(p1)
    const p2Vec = valueMap.points.get(p2)

    if (!p1Vec || !p2Vec) return undefined

    const diff = p2Vec.sub(p1Vec)
    return diff.magnitude
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

  computeResiduals(valueMap: ValueMap): Value[] {
    return this.computeResidualValues(valueMap)
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
      tolerance: this.tolerance,
      lastResiduals: this.lastResiduals.length > 0 ? [...this.lastResiduals] : undefined
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

    if (dto.lastResiduals) {
      constraint.lastResiduals = [...dto.lastResiduals]
    }

    context.registerEntity(constraint, dto.id)
    return constraint
  }
}