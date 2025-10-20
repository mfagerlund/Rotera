// Coplanar points constraint

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
  type CoplanarPointsConstraintDto,
  type ConstraintEvaluation
} from './base-constraint'

export interface CoplanarPointsConstraintData extends BaseConstraintDto {
  entities: {
    points: PointId[] // At least 4 points
    lines?: undefined
    planes?: undefined
  }
}

export class CoplanarPointsConstraint extends Constraint {
  protected data: CoplanarPointsConstraintData

  private constructor(repo: ConstraintRepository, data: CoplanarPointsConstraintData) {
    super(repo, data)
    this.data = data
  }

  static create(
    id: ConstraintId,
    name: string,
    points: WorldPoint[], // At least 4 points
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
  ): CoplanarPointsConstraint {
    if (points.length < 4) {
      throw new Error('CoplanarPointsConstraint requires at least 4 points')
    }

    const now = new Date().toISOString()
    const data: CoplanarPointsConstraintData = {
      id,
      name,
      type: 'coplanar_points',
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
    const constraint = new CoplanarPointsConstraint(repo, data)
    points.forEach(p => constraint._points.add(p))
    constraint._entitiesPreloaded = true
    return constraint
  }

  static fromDto(dto: ConstraintDto, repo: ConstraintRepository): CoplanarPointsConstraint {
    if (!dto.coplanarPointsConstraint) {
      throw new Error('Invalid CoplanarPointsConstraint DTO: missing coplanarPointsConstraint data')
    }

    if (!dto.entities.points || dto.entities.points.length < 4) {
      throw new Error('CoplanarPointsConstraint requires at least 4 points')
    }

    const data: CoplanarPointsConstraintData = {
      ...dto,
      entities: {
        points: [...dto.entities.points]
      }
    }

    return new CoplanarPointsConstraint(repo, data)
  }

  getConstraintType(): string {
    return 'coplanar_points'
  }

  evaluate(): ConstraintEvaluation {
    const points = this.points
    const coordsList = points.map(p => p.getDefinedCoordinates()).filter((c): c is [number, number, number] => c !== undefined)

    if (coordsList.length >= 4 && coordsList.length === points.length) {
      // Use first three points to define the plane
      const p1 = coordsList[0]
      const p2 = coordsList[1]
      const p3 = coordsList[2]

      // Create vectors from p1 to p2 and p1 to p3
      const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]
      const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]

      // Calculate normal vector to the plane using cross product
      const normal = [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0]
      ]

      // Normalize the normal vector
      const normalMagnitude = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2)
      if (normalMagnitude === 0) {
        // First three points are collinear, cannot define a plane
        return { value: Infinity, satisfied: false }
      }

      const unitNormal = [
        normal[0] / normalMagnitude,
        normal[1] / normalMagnitude,
        normal[2] / normalMagnitude
      ]

      let maxDeviation = 0

      // Check distance of each remaining point from the plane
      for (let i = 3; i < coordsList.length; i++) {
        const pi = coordsList[i]

        // Vector from p1 to pi
        const v = [pi[0] - p1[0], pi[1] - p1[1], pi[2] - p1[2]]

        // Distance from point to plane = |dot product of v with unit normal|
        const distance = Math.abs(v[0] * unitNormal[0] + v[1] * unitNormal[1] + v[2] * unitNormal[2])
        maxDeviation = Math.max(maxDeviation, distance)
      }

      return {
        value: maxDeviation,
        satisfied: this.checkSatisfaction(maxDeviation, 0) // Target is 0 for perfect coplanarity
      }
    }
    return { value: 1, satisfied: false }
  }

  validateConstraintSpecific(): ValidationResult {
    const errors = []

    if (this.data.entities.points.length < 4) {
      errors.push(ValidationHelpers.createError(
        'INSUFFICIENT_POINTS',
        'Coplanar points constraint requires at least 4 points',
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
        'Coplanar points constraint cannot have duplicate points',
        this.data.id,
        'constraint',
        'entities.points'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'Coplanar points constraint validation passed' : `Coplanar points constraint validation failed: ${errors.length} errors`
    }
  }

  getRequiredEntityCounts(): { points?: number } {
    return {} // Variable number of points (at least 4)
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
      coplanarPointsConstraint: {}, // No additional data
      equalDistancesConstraint: undefined,
      equalAnglesConstraint: undefined
    }
    return baseDto
  }

  clone(newId: ConstraintId, newName?: string): CoplanarPointsConstraint {
    const clonedData: CoplanarPointsConstraintData = {
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
    return new CoplanarPointsConstraint(this.repo, clonedData)
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
    return 0 // Coplanar points should have 0 deviation from the plane
  }

  /**
   * Compute residuals for coplanar points constraint.
   * Residual: For 4+ points to be coplanar, the scalar triple product
   * (v1 · (v2 × v3)) should be zero.
   * Returns 1 residual (the scalar triple product).
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    const points = this.points

    if (points.length < 4) {
      console.warn('Coplanar constraint requires at least 4 points')
      return []
    }

    const p0 = valueMap.points.get(points[0])
    const p1 = valueMap.points.get(points[1])
    const p2 = valueMap.points.get(points[2])
    const p3 = valueMap.points.get(points[3])

    if (!p0 || !p1 || !p2 || !p3) {
      console.warn(`Coplanar constraint ${this.data.id}: not enough points found in valueMap`)
      return []
    }

    // Calculate vectors from p0 using Vec3 API
    const v1 = p1.sub(p0)
    const v2 = p2.sub(p0)
    const v3 = p3.sub(p0)

    // Calculate cross product v2 × v3
    const cross = Vec3.cross(v2, v3)

    // Calculate scalar triple product: v1 · (v2 × v3)
    const scalarTripleProduct = Vec3.dot(v1, cross)

    // Should be 0 for coplanar points
    return [scalarTripleProduct]
  }
}