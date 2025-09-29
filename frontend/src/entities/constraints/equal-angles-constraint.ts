// Equal angles constraint

import type { ConstraintId, PointId } from '../../types/ids'
import type { ValidationResult } from '../../validation/validator'
import { ValidationHelpers } from '../../validation/validator'
import {
  Constraint,
  type ConstraintRepository,
  type BaseConstraintDto,
  type ConstraintDto,
  type EqualAnglesConstraintDto,
  type ConstraintEvaluation
} from './base-constraint'

export interface EqualAnglesConstraintData extends BaseConstraintDto {
  entities: {
    points: PointId[]
    lines?: undefined
    planes?: undefined
  }
  parameters: BaseConstraintDto['parameters'] & {
    angleTriplets: [PointId, PointId, PointId][] // [pointA, vertex, pointC] for each angle
  }
}

export class EqualAnglesConstraint extends Constraint {
  protected data: EqualAnglesConstraintData

  private constructor(repo: ConstraintRepository, data: EqualAnglesConstraintData) {
    super(repo, data)
    this.data = data
  }

  static create(
    id: ConstraintId,
    name: string,
    angleTriplets: [PointId, PointId, PointId][], // At least 2 triplets
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
  ): EqualAnglesConstraint {
    if (angleTriplets.length < 2) {
      throw new Error('EqualAnglesConstraint requires at least 2 angle triplets')
    }

    // Extract all unique point IDs
    const allPointIds = new Set<PointId>()
    angleTriplets.forEach(triplet => {
      allPointIds.add(triplet[0])
      allPointIds.add(triplet[1])
      allPointIds.add(triplet[2])
    })

    const now = new Date().toISOString()
    const data: EqualAnglesConstraintData = {
      id,
      name,
      type: 'equal_angles',
      status: 'satisfied',
      entities: {
        points: Array.from(allPointIds)
      },
      parameters: {
        angleTriplets: angleTriplets.map(triplet => [...triplet] as [PointId, PointId, PointId]),
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
    return new EqualAnglesConstraint(repo, data)
  }

  static fromDto(dto: ConstraintDto, repo: ConstraintRepository): EqualAnglesConstraint {
    if (!dto.equalAnglesConstraint) {
      throw new Error('Invalid EqualAnglesConstraint DTO: missing equalAnglesConstraint data')
    }

    const data: EqualAnglesConstraintData = {
      ...dto,
      entities: {
        points: dto.entities.points ? [...dto.entities.points] : []
      },
      parameters: {
        ...dto.parameters,
        angleTriplets: dto.equalAnglesConstraint.angleTriplets
      }
    }

    return new EqualAnglesConstraint(repo, data)
  }

  getConstraintType(): string {
    return 'equal_angles'
  }

  evaluate(): ConstraintEvaluation {
    const points = this.points
    const pointMap = new Map<PointId, typeof points[0]>()

    // Create a map for quick point lookup
    points.forEach(point => {
      pointMap.set(point.getId() as PointId, point)
    })

    const angles: number[] = []

    // Calculate all angles
    for (const triplet of this.data.parameters.angleTriplets) {
      const pointA = pointMap.get(triplet[0])
      const vertex = pointMap.get(triplet[1])
      const pointC = pointMap.get(triplet[2])

      if (pointA && vertex && pointC &&
          pointA.hasCoordinates() && vertex.hasCoordinates() && pointC.hasCoordinates()) {
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
      satisfied: this.checkSatisfaction(standardDeviation, 0) // Target is 0 for equal angles
    }
  }

  validateConstraintSpecific(): ValidationResult {
    const errors = []

    if (this.data.parameters.angleTriplets.length < 2) {
      errors.push(ValidationHelpers.createError(
        'INSUFFICIENT_ANGLE_TRIPLETS',
        'Equal angles constraint requires at least 2 angle triplets',
        this.data.id,
        'constraint',
        'parameters.angleTriplets'
      ))
    }

    // Validate each angle triplet
    for (let i = 0; i < this.data.parameters.angleTriplets.length; i++) {
      const triplet = this.data.parameters.angleTriplets[i]
      if (!triplet || triplet.length !== 3) {
        errors.push(ValidationHelpers.createError(
          'INVALID_ANGLE_TRIPLET',
          `Angle triplet ${i} must contain exactly 3 point IDs`,
          this.data.id,
          'constraint',
          `parameters.angleTriplets[${i}]`
        ))
      } else {
        // Check for duplicate points within the triplet
        const uniquePoints = new Set(triplet)
        if (uniquePoints.size !== 3) {
          errors.push(ValidationHelpers.createError(
            'DUPLICATE_POINTS_IN_TRIPLET',
            `Angle triplet ${i} cannot have duplicate points`,
            this.data.id,
            'constraint',
            `parameters.angleTriplets[${i}]`
          ))
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'Equal angles constraint validation passed' : `Equal angles constraint validation failed: ${errors.length} errors`
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
      equalDistancesConstraint: undefined,
      equalAnglesConstraint: {
        angleTriplets: this.data.parameters.angleTriplets.map(triplet => [...triplet] as [PointId, PointId, PointId])
      }
    }
    return baseDto
  }

  clone(newId: ConstraintId, newName?: string): EqualAnglesConstraint {
    const clonedData: EqualAnglesConstraintData = {
      ...this.data,
      id: newId,
      name: newName || `${this.data.name} (copy)`,
      entities: {
        points: [...this.data.entities.points]
      },
      parameters: {
        ...this.data.parameters,
        angleTriplets: this.data.parameters.angleTriplets.map(triplet => [...triplet] as [PointId, PointId, PointId])
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    return new EqualAnglesConstraint(this.repo, clonedData)
  }

  // Specific getters
  get angleTriplets(): [PointId, PointId, PointId][] {
    return this.data.parameters.angleTriplets.map(triplet => [...triplet] as [PointId, PointId, PointId])
  }

  addAngleTriplet(pointAId: PointId, vertexId: PointId, pointCId: PointId): void {
    const uniquePoints = new Set([pointAId, vertexId, pointCId])
    if (uniquePoints.size !== 3) {
      throw new Error('Cannot add angle triplet with duplicate points')
    }

    this.data.parameters.angleTriplets.push([pointAId, vertexId, pointCId])

    // Update points list
    for (const pointId of [pointAId, vertexId, pointCId]) {
      if (!this.data.entities.points.includes(pointId)) {
        this.data.entities.points.push(pointId)
      }
    }

    this.invalidateReferences()
    this.updateTimestamp()
  }

  removeAngleTriplet(index: number): void {
    if (index >= 0 && index < this.data.parameters.angleTriplets.length) {
      this.data.parameters.angleTriplets.splice(index, 1)

      // Rebuild points list from remaining triplets
      const allPointIds = new Set<PointId>()
      this.data.parameters.angleTriplets.forEach(triplet => {
        allPointIds.add(triplet[0])
        allPointIds.add(triplet[1])
        allPointIds.add(triplet[2])
      })
      this.data.entities.points = Array.from(allPointIds)

      this.invalidateReferences()
      this.updateTimestamp()
    }
  }

  protected getTargetValue(): number {
    return 0 // Equal angles should have 0 standard deviation
  }
}