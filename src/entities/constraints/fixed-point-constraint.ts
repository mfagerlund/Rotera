// Fixed point constraint

import type { ConstraintId, PointId } from '../../types/ids'
import type { ValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { V, type Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point/WorldPoint'
import {
  Constraint,
  type ConstraintRepository,
  type BaseConstraintDto,
  type ConstraintDto,
  type FixedPointConstraintDto,
  type ConstraintEvaluation
} from './base-constraint'

export interface FixedPointConstraintData extends BaseConstraintDto {
  entities: {
    points: [PointId]
    lines?: undefined
    planes?: undefined
  }
  parameters: BaseConstraintDto['parameters'] & {
    targetXyz: [number, number, number]
  }
}

export class FixedPointConstraint extends Constraint {
  protected data: FixedPointConstraintData

  private constructor(repo: ConstraintRepository, data: FixedPointConstraintData) {
    super(repo, data)
    this.data = data
  }

  static create(
    id: ConstraintId,
    name: string,
    point: WorldPoint,
    targetXyz: [number, number, number],
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
  ): FixedPointConstraint {
    const now = new Date().toISOString()
    const data: FixedPointConstraintData = {
      id,
      name,
      type: 'fixed_point',
      status: 'satisfied',
      entities: {
        points: [point.id as PointId]
      },
      parameters: {
        targetXyz: [...targetXyz] as [number, number, number],
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
    const constraint = new FixedPointConstraint(repo, data)
    constraint._points.add(point)
    constraint._entitiesPreloaded = true
    return constraint
  }

  static fromDto(dto: ConstraintDto, repo: ConstraintRepository): FixedPointConstraint {
    if (!dto.fixedPointConstraint) {
      throw new Error('Invalid FixedPointConstraint DTO: missing fixedPointConstraint data')
    }

    if (!dto.entities.points || dto.entities.points.length !== 1) {
      throw new Error('FixedPointConstraint requires exactly 1 point')
    }

    const data: FixedPointConstraintData = {
      ...dto,
      entities: {
        points: [dto.entities.points[0]]
      },
      parameters: {
        ...dto.parameters,
        targetXyz: dto.fixedPointConstraint.targetXyz
      }
    }

    return new FixedPointConstraint(repo, data)
  }

  getConstraintType(): string {
    return 'fixed_point'
  }

  evaluate(): ConstraintEvaluation {
    const points = this.points
    const currentPos = points.length >= 1 ? points[0].getDefinedCoordinates() : undefined
    if (currentPos) {
      const targetPos = this.data.parameters.targetXyz

      // Calculate distance from current position to target position
      const value = Math.sqrt(
        Math.pow(currentPos[0] - targetPos[0], 2) +
        Math.pow(currentPos[1] - targetPos[1], 2) +
        Math.pow(currentPos[2] - targetPos[2], 2)
      )

      return {
        value,
        satisfied: this.checkSatisfaction(value, 0) // Target distance is 0 for fixed points
      }
    }
    return { value: Infinity, satisfied: false }
  }

  validateConstraintSpecific(): ValidationResult {
    const errors = []

    if (!this.data.parameters.targetXyz || this.data.parameters.targetXyz.length !== 3) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TARGET_XYZ',
        'targetXyz must be an array of exactly 3 numbers',
        this.data.id,
        'constraint',
        'parameters.targetXyz'
      ))
    } else {
      for (let i = 0; i < 3; i++) {
        if (typeof this.data.parameters.targetXyz[i] !== 'number' || !isFinite(this.data.parameters.targetXyz[i])) {
          errors.push(ValidationHelpers.createError(
            'INVALID_TARGET_COORDINATE',
            `targetXyz[${i}] must be a finite number`,
            this.data.id,
            'constraint',
            `parameters.targetXyz[${i}]`
          ))
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'Fixed point constraint validation passed' : `Fixed point constraint validation failed: ${errors.length} errors`
    }
  }

  getRequiredEntityCounts(): { points: number } {
    return { points: 1 }
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
      fixedPointConstraint: {
        targetXyz: [...this.data.parameters.targetXyz] as [number, number, number]
      },
      collinearPointsConstraint: undefined,
      coplanarPointsConstraint: undefined,
      equalDistancesConstraint: undefined,
      equalAnglesConstraint: undefined
    }
    return baseDto
  }

  clone(newId: ConstraintId, newName?: string): FixedPointConstraint {
    const clonedData: FixedPointConstraintData = {
      ...this.data,
      id: newId,
      name: newName || `${this.data.name} (copy)`,
      entities: {
        points: [...this.data.entities.points]
      },
      parameters: {
        ...this.data.parameters,
        targetXyz: [...this.data.parameters.targetXyz] as [number, number, number]
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    return new FixedPointConstraint(this.repo, clonedData)
  }

  // Specific getters/setters
  get targetXyz(): [number, number, number] {
    return [...this.data.parameters.targetXyz] as [number, number, number]
  }

  set targetXyz(value: [number, number, number]) {
    this.data.parameters.targetXyz = [...value] as [number, number, number]
    this.updateTimestamp()
  }

  get point(): WorldPoint {
    return this.points[0]
  }

  protected getTargetValue(): number {
    return 0 // Fixed point should have 0 distance from target
  }

  /**
   * Compute residuals for fixed point constraint.
   * Residual: Distance from point to target position should be zero.
   * Returns [dx, dy, dz] where each component should be 0 when constraint is satisfied.
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    const pointVec = valueMap.points.get(this.point)

    if (!pointVec) {
      console.warn(`Fixed point constraint ${this.data.id}: point not found in valueMap`)
      return []
    }

    const targetXyz = this.targetXyz

    // Residual = current position - target position
    // Each component should be 0 when point is at target
    const dx = V.sub(pointVec.x, V.C(targetXyz[0]))
    const dy = V.sub(pointVec.y, V.C(targetXyz[1]))
    const dz = V.sub(pointVec.z, V.C(targetXyz[2]))

    return [dx, dy, dz]
  }
}