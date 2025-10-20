// Collinear points constraint

import type { ConstraintId, PointId } from '../../types/ids'
import type { ValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { Vec3, type Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point/WorldPoint'
import {
  Constraint,
  type ConstraintRepository,
  type BaseConstraintDto,
  type ConstraintDto,
  type CollinearPointsConstraintDto,
  type ConstraintEvaluation
} from './base-constraint'

export interface CollinearPointsConstraintData extends BaseConstraintDto {
  entities: {
    points: PointId[] // At least 3 points
    lines?: undefined
    planes?: undefined
  }
}

export class CollinearPointsConstraint extends Constraint {
  protected data: CollinearPointsConstraintData

  private constructor(repo: ConstraintRepository, data: CollinearPointsConstraintData) {
    super(repo, data)
    this.data = data
  }

  static create(
    id: ConstraintId,
    name: string,
    points: WorldPoint[], // At least 3 points
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
  ): CollinearPointsConstraint {
    if (points.length < 3) {
      throw new Error('CollinearPointsConstraint requires at least 3 points')
    }

    const now = new Date().toISOString()
    const data: CollinearPointsConstraintData = {
      id,
      name,
      type: 'collinear_points',
      status: 'satisfied',
      entities: {
        points: points.map(p => p.id as PointId)
      },
      parameters: {
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
    const constraint = new CollinearPointsConstraint(repo, data)
    points.forEach(p => constraint._points.add(p))
    constraint._entitiesPreloaded = true
    return constraint
  }

  static fromDto(dto: ConstraintDto, repo: ConstraintRepository): CollinearPointsConstraint {
    if (!dto.collinearPointsConstraint) {
      throw new Error('Invalid CollinearPointsConstraint DTO: missing collinearPointsConstraint data')
    }

    if (!dto.entities.points || dto.entities.points.length < 3) {
      throw new Error('CollinearPointsConstraint requires at least 3 points')
    }

    const data: CollinearPointsConstraintData = {
      ...dto,
      entities: {
        points: [...dto.entities.points]
      }
    }

    return new CollinearPointsConstraint(repo, data)
  }

  getConstraintType(): string {
    return 'collinear_points'
  }

  evaluate(): ConstraintEvaluation {
    const points = this.points
    const coordsList = points.map(p => p.getDefinedCoordinates()).filter((c): c is [number, number, number] => c !== undefined)

    if (coordsList.length >= 3 && coordsList.length === points.length) {
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
        satisfied: this.checkSatisfaction(maxDeviation, 0) // Target is 0 for perfect collinearity
      }
    }
    return { value: 1, satisfied: false }
  }

  validateConstraintSpecific(): ValidationResult {
    const errors = []

    if (this.data.entities.points.length < 3) {
      errors.push(ValidationHelpers.createError(
        'INSUFFICIENT_POINTS',
        'Collinear points constraint requires at least 3 points',
        this.data.id,
        'constraint',
        'entities.points'
      ))
    }

    // Check for duplicate points
    const uniquePoints = new Set(this.data.entities.points)
    if (uniquePoints.size !== this.data.entities.points.length) {
      errors.push(ValidationHelpers.createError(
        'DUPLICATE_POINTS',
        'Collinear points constraint cannot have duplicate points',
        this.data.id,
        'constraint',
        'entities.points'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'Collinear points constraint validation passed' : `Collinear points constraint validation failed: ${errors.length} errors`
    }
  }

  getRequiredEntityCounts(): { points?: number } {
    return {} // Variable number of points (at least 3)
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
      collinearPointsConstraint: {}, // No additional data
      coplanarPointsConstraint: undefined,
      equalDistancesConstraint: undefined,
      equalAnglesConstraint: undefined
    }
    return baseDto
  }

  clone(newId: ConstraintId, newName?: string): CollinearPointsConstraint {
    const clonedData: CollinearPointsConstraintData = {
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
    return new CollinearPointsConstraint(this.repo, clonedData)
  }

  // Specific methods
  addPoint(point: WorldPoint): void {
    const pointId = point.id as PointId
    if (!this.data.entities.points.includes(pointId)) {
      this.data.entities.points.push(pointId)
      this._points.add(point)
      this.updateTimestamp()
    }
  }

  removePoint(point: WorldPoint): void {
    const pointId = point.id as PointId
    const index = this.data.entities.points.indexOf(pointId)
    if (index !== -1) {
      this.data.entities.points.splice(index, 1)
      this._points.delete(point)
      this.updateTimestamp()
    }
  }

  protected getTargetValue(): number {
    return 0 // Collinear points should have 0 deviation
  }

  /**
   * Compute residuals for collinear points constraint.
   * Residual: For 3+ points to be collinear, the cross product of vectors
   * from point 0 to point 1 and point 0 to point 2 should be zero.
   * Returns 3 residuals (x, y, z components of cross product).
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    const points = this.points

    if (points.length < 3) {
      console.warn('Collinear constraint requires at least 3 points')
      return []
    }

    const p0 = valueMap.points.get(points[0])
    const p1 = valueMap.points.get(points[1])
    const p2 = valueMap.points.get(points[2])

    if (!p0 || !p1 || !p2) {
      console.warn(`Collinear constraint ${this.data.id}: not enough points found in valueMap`)
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