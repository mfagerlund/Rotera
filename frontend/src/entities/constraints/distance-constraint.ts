// Distance constraint between two points

import type { ConstraintId, PointId } from '../../types/ids'
import type { ValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { V, type Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import {
  Constraint,
  type ConstraintRepository,
  type BaseConstraintDto,
  type ConstraintDto,
  type DistanceConstraintDto,
  type ConstraintEvaluation
} from './base-constraint'

export interface DistanceConstraintData extends BaseConstraintDto {
  entities: {
    points: [PointId, PointId]
    lines?: undefined
    planes?: undefined
  }
  parameters: BaseConstraintDto['parameters'] & {
    targetDistance: number
  }
}

export class DistanceConstraint extends Constraint {
  protected data: DistanceConstraintData

  private constructor(repo: ConstraintRepository, data: DistanceConstraintData) {
    super(repo, data)
    this.data = data
  }

  static create(
    id: ConstraintId,
    name: string,
    pointAId: PointId,
    pointBId: PointId,
    targetDistance: number,
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
  ): DistanceConstraint {
    const now = new Date().toISOString()
    const data: DistanceConstraintData = {
      id,
      name,
      type: 'distance_point_point',
      status: 'satisfied',
      entities: {
        points: [pointAId, pointBId]
      },
      parameters: {
        targetDistance,
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
    return new DistanceConstraint(repo, data)
  }

  static fromDto(dto: ConstraintDto, repo: ConstraintRepository): DistanceConstraint {
    if (!dto.distanceConstraint) {
      throw new Error('Invalid DistanceConstraint DTO: missing distanceConstraint data')
    }

    if (!dto.entities.points || dto.entities.points.length !== 2) {
      throw new Error('DistanceConstraint requires exactly 2 points')
    }

    const data: DistanceConstraintData = {
      ...dto,
      entities: {
        points: [dto.entities.points[0], dto.entities.points[1]]
      },
      parameters: {
        ...dto.parameters,
        targetDistance: dto.distanceConstraint.targetDistance
      }
    }

    return new DistanceConstraint(repo, data)
  }

  getConstraintType(): string {
    return 'distance_point_point'
  }

  evaluate(): ConstraintEvaluation {
    const points = this.points
    if (points.length >= 2 && points[0].hasCoordinates() && points[1].hasCoordinates()) {
      const value = points[0].distanceTo(points[1]) ?? 0
      return {
        value,
        satisfied: this.checkSatisfaction(value, this.targetDistance)
      }
    }
    return { value: 0, satisfied: false }
  }

  validateConstraintSpecific(): ValidationResult {
    const errors = []

    if (this.data.parameters.targetDistance < 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TARGET_DISTANCE',
        'targetDistance must be non-negative',
        this.data.id,
        'constraint',
        'parameters.targetDistance'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'Distance constraint validation passed' : `Distance constraint validation failed: ${errors.length} errors`
    }
  }

  getRequiredEntityCounts(): { points: number } {
    return { points: 2 }
  }

  toConstraintDto(): ConstraintDto {
    const baseDto: ConstraintDto = {
      ...this.data,
      entities: {
        points: [...this.data.entities.points]
      },
      parameters: { ...this.data.parameters },
      distanceConstraint: {
        targetDistance: this.data.parameters.targetDistance
      },
      angleConstraint: undefined,
      parallelLinesConstraint: undefined,
      perpendicularLinesConstraint: undefined,
      fixedPointConstraint: undefined,
      collinearPointsConstraint: undefined,
      coplanarPointsConstraint: undefined,
      equalDistancesConstraint: undefined,
      equalAnglesConstraint: undefined
    }
    return baseDto
  }

  clone(newId: ConstraintId, newName?: string): DistanceConstraint {
    const clonedData: DistanceConstraintData = {
      ...this.data,
      id: newId,
      name: newName || `${this.data.name} (copy)`,
      entities: {
        points: [...this.data.entities.points]
      },
      parameters: { ...this.data.parameters },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    return new DistanceConstraint(this.repo, clonedData)
  }

  // Specific getters/setters
  get targetDistance(): number {
    return this.data.parameters.targetDistance
  }

  set targetDistance(value: number) {
    if (value < 0) {
      throw new Error('Target distance must be non-negative')
    }
    this.data.parameters.targetDistance = value
    this.updateTimestamp()
  }

  get pointAId(): PointId {
    return this.data.entities.points[0]
  }

  get pointBId(): PointId {
    return this.data.entities.points[1]
  }

  protected getTargetValue(): number {
    return this.targetDistance
  }

  /**
   * Compute residuals for distance constraint.
   * Residual: (actual_distance - target_distance)
   * Should be 0 when the distance between points equals the target.
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    // Find points in valueMap by ID
    let pointA: ReturnType<typeof valueMap.points.get> | undefined
    let pointB: ReturnType<typeof valueMap.points.get> | undefined

    for (const [point, vec] of valueMap.points) {
      if (point.getId() === this.pointAId) pointA = vec
      if (point.getId() === this.pointBId) pointB = vec
    }

    if (!pointA || !pointB) {
      console.warn(`Distance constraint ${this.data.id}: points not found in valueMap`)
      return []
    }

    // Calculate actual distance using Vec3 API
    const diff = pointB.sub(pointA)
    const dist = diff.magnitude

    // Residual = actual - target
    const residual = V.sub(dist, V.C(this.targetDistance))

    return [residual]
  }
}