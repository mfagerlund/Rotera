// Angle constraint between three points

import type { ConstraintId, PointId } from '../../types/ids'
import type { ValidationResult, ValidationError } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { V, Vec3, type Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point/WorldPoint'
import {
  Constraint,
  type ConstraintRepository,
  type BaseConstraintDto,
  type ConstraintDto,
  type AngleConstraintDto,
  type ConstraintEvaluation
} from './base-constraint'

export interface AngleConstraintData extends BaseConstraintDto {
  entities: {
    points: [PointId, PointId, PointId] // [pointA, vertex, pointC]
    lines?: undefined
    planes?: undefined
  }
  parameters: BaseConstraintDto['parameters'] & {
    targetAngle: number // In degrees
  }
}

export class AngleConstraint extends Constraint {
  protected data: AngleConstraintData

  private constructor(repo: ConstraintRepository, data: AngleConstraintData) {
    super(repo, data)
    this.data = data
  }

  static create(
    id: ConstraintId,
    name: string,
    pointA: WorldPoint,
    vertex: WorldPoint,
    pointC: WorldPoint,
    targetAngle: number,
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
  ): AngleConstraint {
    const now = new Date().toISOString()
    const data: AngleConstraintData = {
      id,
      name,
      type: 'angle_point_point_point',
      status: 'satisfied',
      entities: {
        points: [pointA.id as PointId, vertex.id as PointId, pointC.id as PointId]
      },
      parameters: {
        targetAngle,
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
    const constraint = new AngleConstraint(repo, data)
    constraint._points.add(pointA)
    constraint._points.add(vertex)
    constraint._points.add(pointC)
    constraint._entitiesPreloaded = true
    return constraint
  }

  static fromDto(dto: ConstraintDto, repo: ConstraintRepository): AngleConstraint {
    if (!dto.angleConstraint) {
      throw new Error('Invalid AngleConstraint DTO: missing angleConstraint data')
    }

    if (!dto.entities.points || dto.entities.points.length !== 3) {
      throw new Error('AngleConstraint requires exactly 3 points')
    }

    const data: AngleConstraintData = {
      ...dto,
      entities: {
        points: [dto.entities.points[0], dto.entities.points[1], dto.entities.points[2]]
      },
      parameters: {
        ...dto.parameters,
        targetAngle: dto.angleConstraint.targetAngle
      }
    }

    return new AngleConstraint(repo, data)
  }

  getConstraintType(): string {
    return 'angle_point_point_point'
  }

  evaluate(): ConstraintEvaluation {
    const points = this.points
    if (points.length >= 3 && points.every(p => p.hasCoordinates())) {
      const value = this.calculateAngleBetweenPoints(points[0], points[1], points[2])
      return {
        value,
        satisfied: this.checkSatisfaction(value, this.targetAngle)
      }
    }
    return { value: 0, satisfied: false }
  }

  validateConstraintSpecific(): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    if (this.data.parameters.targetAngle < 0 || this.data.parameters.targetAngle > 360) {
      warnings.push(ValidationHelpers.createError(
        'UNUSUAL_ANGLE_VALUE',
        'targetAngle should typically be between 0 and 360 degrees',
        this.data.id,
        'constraint',
        'parameters.targetAngle'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Angle constraint validation passed' : `Angle constraint validation failed: ${errors.length} errors`
    }
  }

  getRequiredEntityCounts(): { points: number } {
    return { points: 3 }
  }

  toConstraintDto(): ConstraintDto {
    const baseDto: ConstraintDto = {
      ...this.data,
      entities: {
        points: [...this.data.entities.points]
      },
      parameters: { ...this.data.parameters },
      distanceConstraint: undefined,
      angleConstraint: {
        targetAngle: this.data.parameters.targetAngle
      },
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

  clone(newId: ConstraintId, newName?: string): AngleConstraint {
    const clonedData: AngleConstraintData = {
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
    return new AngleConstraint(this.repo, clonedData)
  }

  // Specific getters/setters
  get targetAngle(): number {
    return this.data.parameters.targetAngle
  }

  set targetAngle(value: number) {
    this.data.parameters.targetAngle = value
    this.updateTimestamp()
  }

  get pointA(): WorldPoint {
    return this.points[0]
  }

  get vertex(): WorldPoint {
    return this.points[1]
  }

  get pointC(): WorldPoint {
    return this.points[2]
  }

  protected getTargetValue(): number {
    return this.targetAngle
  }

  /**
   * Compute residuals for angle constraint.
   * Residual: (actual_angle - target_angle) in radians
   * Should be 0 when the angle at the vertex equals the target.
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    const pointAVec = valueMap.points.get(this.pointA)
    const vertexVec = valueMap.points.get(this.vertex)
    const pointCVec = valueMap.points.get(this.pointC)

    if (!pointAVec || !vertexVec || !pointCVec) {
      console.warn(`Angle constraint ${this.data.id}: points not found in valueMap`)
      return []
    }

    const targetAngleRadians = (this.targetAngle * Math.PI) / 180

    // Calculate vectors from vertex using Vec3 API
    const v1 = pointAVec.sub(vertexVec)
    const v2 = pointCVec.sub(vertexVec)

    // Calculate angle using Vec3.angleBetween
    const actualAngle = Vec3.angleBetween(v1, v2)

    // Residual = actual - target
    const residual = V.sub(actualAngle, V.C(targetAngleRadians))

    return [residual]
  }
}