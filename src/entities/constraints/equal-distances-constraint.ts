// Equal distances constraint

import type { ConstraintId, PointId } from '../../types/ids'
import type { ValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { V, Vec3, type Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point/WorldPoint'
import {
  Constraint,
  type ConstraintRepository,
  type BaseConstraintDto,
  type ConstraintDto,
  type EqualDistancesConstraintDto,
  type ConstraintEvaluation
} from './base-constraint'

export interface EqualDistancesConstraintData extends BaseConstraintDto {
  entities: {
    points: PointId[]
    lines?: undefined
    planes?: undefined
  }
  parameters: BaseConstraintDto['parameters'] & {
    distancePairs: [PointId, PointId][]
  }
}

export class EqualDistancesConstraint extends Constraint {
  protected data: EqualDistancesConstraintData

  private constructor(repo: ConstraintRepository, data: EqualDistancesConstraintData) {
    super(repo, data)
    this.data = data
  }

  static create(
    id: ConstraintId,
    name: string,
    distancePairs: [WorldPoint, WorldPoint][], // At least 2 pairs
    repo: ConstraintRepository,
    options: {
      tolerance?: number
      priority?: number
      isEnabled?: boolean
      isDriving?: boolean
      group?: string
      tags?: string[]
      notes?: string
    } = {}
  ): EqualDistancesConstraint {
    if (distancePairs.length < 2) {
      throw new Error('EqualDistancesConstraint requires at least 2 distance pairs')
    }

    // Extract all unique points
    const allPoints = new Set<WorldPoint>()
    distancePairs.forEach(pair => {
      allPoints.add(pair[0])
      allPoints.add(pair[1])
    })

    const now = new Date().toISOString()
    const data: EqualDistancesConstraintData = {
      id,
      name,
      type: 'equal_distances',
      status: 'satisfied',
      entities: {
        points: Array.from(allPoints).map(p => p.id as PointId)
      },
      parameters: {
        distancePairs: distancePairs.map(pair => [
          pair[0].id as PointId,
          pair[1].id as PointId
        ]),
        tolerance: options.tolerance ?? 0.001,
        priority: options.priority ?? 5
      },
      isEnabled: options.isEnabled ?? true,
      isDriving: options.isDriving ?? false,
      group: options.group,
      tags: options.tags,
      notes: options.notes,
      createdAt: now,
      updatedAt: now
    }
    const constraint = new EqualDistancesConstraint(repo, data)
    allPoints.forEach(p => constraint._points.add(p))
    constraint._entitiesPreloaded = true
    return constraint
  }

  static fromDto(dto: ConstraintDto, repo: ConstraintRepository): EqualDistancesConstraint {
    if (!dto.equalDistancesConstraint) {
      throw new Error('Invalid EqualDistancesConstraint DTO: missing equalDistancesConstraint data')
    }

    const data: EqualDistancesConstraintData = {
      ...dto,
      entities: {
        points: dto.entities.points ? [...dto.entities.points] : []
      },
      parameters: {
        ...dto.parameters,
        distancePairs: dto.equalDistancesConstraint.distancePairs
      }
    }

    return new EqualDistancesConstraint(repo, data)
  }

  getConstraintType(): string {
    return 'equal_distances'
  }

  evaluate(): ConstraintEvaluation {
    const points = this.points
    const pointMap = new Map<PointId, typeof points[0]>()

    // Create a map for quick point lookup
    points.forEach(point => {
      pointMap.set(point.id as PointId, point)
    })

    const distances: number[] = []

    // Calculate all distances
    for (const pair of this.data.parameters.distancePairs) {
      const point1 = pointMap.get(pair[0])
      const point2 = pointMap.get(pair[1])

      if (point1 && point2 && point1.hasCoordinates() && point2.hasCoordinates()) {
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
      satisfied: this.checkSatisfaction(standardDeviation, 0) // Target is 0 for equal distances
    }
  }

  validateConstraintSpecific(): ValidationResult {
    const errors = []

    if (this.data.parameters.distancePairs.length < 2) {
      errors.push(ValidationHelpers.createError(
        'INSUFFICIENT_DISTANCE_PAIRS',
        'Equal distances constraint requires at least 2 distance pairs',
        this.data.id,
        'constraint',
        'parameters.distancePairs'
      ))
    }

    // Validate each distance pair
    for (let i = 0; i < this.data.parameters.distancePairs.length; i++) {
      const pair = this.data.parameters.distancePairs[i]
      if (!pair || pair.length !== 2) {
        errors.push(ValidationHelpers.createError(
          'INVALID_DISTANCE_PAIR',
          `Distance pair ${i} must contain exactly 2 point IDs`,
          this.data.id,
          'constraint',
          `parameters.distancePairs[${i}]`
        ))
      } else if (pair[0] === pair[1]) {
        errors.push(ValidationHelpers.createError(
          'IDENTICAL_POINTS_IN_PAIR',
          `Distance pair ${i} cannot have identical points`,
          this.data.id,
          'constraint',
          `parameters.distancePairs[${i}]`
        ))
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'Equal distances constraint validation passed' : `Equal distances constraint validation failed: ${errors.length} errors`
    }
  }

  getRequiredEntityCounts(): { points?: number } {
    return {} // Variable number of points
  }

  toConstraintDto(): ConstraintDto {
    const baseDto: ConstraintDto = {
      ...this.data,
      entities: {
        points: [...this.data.entities.points]
      },
      parameters: { ...this.data.parameters },
      distanceConstraint: undefined,
      angleConstraint: undefined,
      parallelLinesConstraint: undefined,
      perpendicularLinesConstraint: undefined,
      fixedPointConstraint: undefined,
      collinearPointsConstraint: undefined,
      coplanarPointsConstraint: undefined,
      equalDistancesConstraint: {
        distancePairs: this.data.parameters.distancePairs.map(pair => [...pair] as [PointId, PointId])
      },
      equalAnglesConstraint: undefined
    }
    return baseDto
  }

  clone(newId: ConstraintId, newName?: string): EqualDistancesConstraint {
    const clonedData: EqualDistancesConstraintData = {
      ...this.data,
      id: newId,
      name: newName || `${this.data.name} (copy)`,
      entities: {
        points: [...this.data.entities.points]
      },
      parameters: {
        ...this.data.parameters,
        distancePairs: this.data.parameters.distancePairs.map(pair => [...pair] as [PointId, PointId])
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    return new EqualDistancesConstraint(this.repo, clonedData)
  }

  // Specific methods
  addDistancePair(pointA: WorldPoint, pointB: WorldPoint): void {
    if (pointA === pointB) {
      throw new Error('Cannot add distance pair with identical points')
    }

    const pointAId = pointA.id as PointId
    const pointBId = pointB.id as PointId

    this.data.parameters.distancePairs.push([pointAId, pointBId])

    // Update points list and set
    if (!this.data.entities.points.includes(pointAId)) {
      this.data.entities.points.push(pointAId)
      this._points.add(pointA)
    }
    if (!this.data.entities.points.includes(pointBId)) {
      this.data.entities.points.push(pointBId)
      this._points.add(pointB)
    }

    this.updateTimestamp()
  }

  removeDistancePair(index: number): void {
    if (index >= 0 && index < this.data.parameters.distancePairs.length) {
      this.data.parameters.distancePairs.splice(index, 1)

      // Rebuild points list from remaining pairs
      const allPointIds = new Set<PointId>()
      this.data.parameters.distancePairs.forEach(pair => {
        allPointIds.add(pair[0])
        allPointIds.add(pair[1])
      })
      this.data.entities.points = Array.from(allPointIds)

      // Clear and rebuild point set
      this._points.clear()
      this._entitiesPreloaded = false

      this.updateTimestamp()
    }
  }

  protected getTargetValue(): number {
    return 0 // Equal distances should have 0 standard deviation
  }

  /**
   * Compute residuals for equal distances constraint.
   * Residual: All pairwise distances should be equal.
   * Returns (n-1) residuals where n is the number of point pairs,
   * each residual = distance_i - distance_0.
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    const distancePairs = this.data.parameters.distancePairs

    if (distancePairs.length < 2) {
      console.warn('Equal distances constraint requires at least 2 pairs')
      return []
    }

    const points = this.points
    const pointMap = new Map<PointId, WorldPoint>()
    points.forEach(p => pointMap.set(p.id as PointId, p))

    // Calculate distance for a pair using Vec3 API
    const calculateDistance = (pair: [PointId, PointId]): Value | undefined => {
      const p1 = pointMap.get(pair[0])
      const p2 = pointMap.get(pair[1])

      if (!p1 || !p2) return undefined

      const p1Vec = valueMap.points.get(p1)
      const p2Vec = valueMap.points.get(p2)

      if (!p1Vec || !p2Vec) return undefined

      const diff = p2Vec.sub(p1Vec)
      return diff.magnitude
    }

    // Calculate all distances
    const distances: Value[] = []
    for (const pair of distancePairs) {
      const dist = calculateDistance(pair)
      if (dist) {
        distances.push(dist)
      }
    }

    if (distances.length < 2) {
      console.warn(`Equal distances constraint ${this.data.id}: not enough valid pairs found`)
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
}