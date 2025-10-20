// Parallel lines constraint

import type { ConstraintId, LineId } from '../../types/ids'
import type { ValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import type { Value } from 'scalar-autograd'
import {
  Constraint,
  type ConstraintRepository,
  type BaseConstraintDto,
  type ConstraintDto,
  type ParallelLinesConstraintDto,
  type ConstraintEvaluation
} from './base-constraint'

export interface ParallelLinesConstraintData extends BaseConstraintDto {
  entities: {
    points?: undefined
    lines: [LineId, LineId]
    planes?: undefined
  }
}

export class ParallelLinesConstraint extends Constraint {
  protected data: ParallelLinesConstraintData

  private constructor(repo: ConstraintRepository, data: ParallelLinesConstraintData) {
    super(repo, data)
    this.data = data
  }

  static create(
    id: ConstraintId,
    name: string,
    lineAId: LineId,
    lineBId: LineId,
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
  ): ParallelLinesConstraint {
    const now = new Date().toISOString()
    const data: ParallelLinesConstraintData = {
      id,
      name,
      type: 'parallel_lines',
      status: 'satisfied',
      entities: {
        lines: [lineAId, lineBId]
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
    return new ParallelLinesConstraint(repo, data)
  }

  static fromDto(dto: ConstraintDto, repo: ConstraintRepository): ParallelLinesConstraint {
    if (!dto.parallelLinesConstraint) {
      throw new Error('Invalid ParallelLinesConstraint DTO: missing parallelLinesConstraint data')
    }

    if (!dto.entities.lines || dto.entities.lines.length !== 2) {
      throw new Error('ParallelLinesConstraint requires exactly 2 lines')
    }

    const data: ParallelLinesConstraintData = {
      ...dto,
      entities: {
        lines: [dto.entities.lines[0], dto.entities.lines[1]]
      }
    }

    return new ParallelLinesConstraint(repo, data)
  }

  getConstraintType(): string {
    return 'parallel_lines'
  }

  evaluate(): ConstraintEvaluation {
    const lines = this.lines
    if (lines.length >= 2) {
      const dir1 = lines[0].getDirection()
      const dir2 = lines[1].getDirection()
      if (dir1 && dir2) {
        // Calculate dot product to check parallelism
        // For parallel lines, the absolute dot product should be close to 1
        const dotProduct = Math.abs(dir1[0] * dir2[0] + dir1[1] * dir2[1] + dir1[2] * dir2[2])
        const value = Math.acos(Math.min(1, dotProduct)) * (180 / Math.PI) // Angle in degrees
        return {
          value,
          satisfied: this.checkSatisfaction(value, 0) // Target is 0 degrees for parallel lines
        }
      }
    }
    return { value: 90, satisfied: false } // Default to perpendicular if can't evaluate
  }

  validateConstraintSpecific(): ValidationResult {
    // No specific validation for parallel lines constraint
    return {
      isValid: true,
      errors: [],
      warnings: [],
      summary: 'Parallel lines constraint validation passed'
    }
  }

  getRequiredEntityCounts(): { lines: number } {
    return { lines: 2 }
  }

  toConstraintDto(): ConstraintDto {
    const baseDto: ConstraintDto = {
      ...this.data,
      entities: {
        lines: [...this.data.entities.lines]
      },
      parameters: { ...this.data.parameters },
      distanceConstraint: undefined,
      angleConstraint: undefined,
      parallelLinesConstraint: {}, // No additional data
      perpendicularLinesConstraint: undefined,
      fixedPointConstraint: undefined,
      collinearPointsConstraint: undefined,
      coplanarPointsConstraint: undefined,
      equalDistancesConstraint: undefined,
      equalAnglesConstraint: undefined
    }
    return baseDto
  }

  clone(newId: ConstraintId, newName?: string): ParallelLinesConstraint {
    const clonedData: ParallelLinesConstraintData = {
      ...this.data,
      id: newId,
      name: newName || `${this.data.name} (copy)`,
      entities: {
        lines: [...this.data.entities.lines]
      },
      parameters: { ...this.data.parameters },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    return new ParallelLinesConstraint(this.repo, clonedData)
  }

  // Specific getters
  get lineAId(): LineId {
    return this.data.entities.lines[0]
  }

  get lineBId(): LineId {
    return this.data.entities.lines[1]
  }

  protected getTargetValue(): number {
    return 0 // Parallel lines should have 0 degrees between them
  }

  /**
   * Compute residuals for parallel lines constraint.
   * TODO: Requires line support in valueMap.
   * For now, returns empty array as lines are not yet supported in optimization.
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    console.warn(`Parallel lines constraint ${this.data.id}: not yet implemented - requires line support in valueMap`)
    return []
  }
}