// Perpendicular lines constraint

import type { ConstraintId, LineId } from '../../types/ids'
import type { ValidationResult } from '../../validation/validator'
import {
  Constraint,
  type ConstraintRepository,
  type BaseConstraintDto,
  type ConstraintDto,
  type PerpendicularLinesConstraintDto,
  type ConstraintEvaluation
} from './base-constraint'

export interface PerpendicularLinesConstraintData extends BaseConstraintDto {
  entities: {
    points?: undefined
    lines: [LineId, LineId]
    planes?: undefined
  }
}

export class PerpendicularLinesConstraint extends Constraint {
  protected data: PerpendicularLinesConstraintData

  private constructor(repo: ConstraintRepository, data: PerpendicularLinesConstraintData) {
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
  ): PerpendicularLinesConstraint {
    const now = new Date().toISOString()
    const data: PerpendicularLinesConstraintData = {
      id,
      name,
      type: 'perpendicular_lines',
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
    return new PerpendicularLinesConstraint(repo, data)
  }

  static fromDto(dto: ConstraintDto, repo: ConstraintRepository): PerpendicularLinesConstraint {
    if (!dto.perpendicularLinesConstraint) {
      throw new Error('Invalid PerpendicularLinesConstraint DTO: missing perpendicularLinesConstraint data')
    }

    if (!dto.entities.lines || dto.entities.lines.length !== 2) {
      throw new Error('PerpendicularLinesConstraint requires exactly 2 lines')
    }

    const data: PerpendicularLinesConstraintData = {
      ...dto,
      entities: {
        lines: [dto.entities.lines[0], dto.entities.lines[1]]
      }
    }

    return new PerpendicularLinesConstraint(repo, data)
  }

  getConstraintType(): string {
    return 'perpendicular_lines'
  }

  evaluate(): ConstraintEvaluation {
    const lines = this.lines
    if (lines.length >= 2) {
      const dir1 = lines[0].getDirection()
      const dir2 = lines[1].getDirection()
      if (dir1 && dir2) {
        // Calculate dot product - for perpendicular lines, dot product should be close to 0
        const dotProduct = dir1[0] * dir2[0] + dir1[1] * dir2[1] + dir1[2] * dir2[2]
        const value = Math.abs(dotProduct) // Absolute value of dot product
        return {
          value,
          satisfied: this.checkSatisfaction(value, 0) // Target is 0 for perpendicular lines
        }
      }
    }
    return { value: 1, satisfied: false } // Default to non-perpendicular if can't evaluate
  }

  validateConstraintSpecific(): ValidationResult {
    // No specific validation for perpendicular lines constraint
    return {
      isValid: true,
      errors: [],
      warnings: [],
      summary: 'Perpendicular lines constraint validation passed'
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
      parallelLinesConstraint: undefined,
      perpendicularLinesConstraint: {}, // No additional data
      fixedPointConstraint: undefined,
      collinearPointsConstraint: undefined,
      coplanarPointsConstraint: undefined,
      equalDistancesConstraint: undefined,
      equalAnglesConstraint: undefined
    }
    return baseDto
  }

  clone(newId: ConstraintId, newName?: string): PerpendicularLinesConstraint {
    const clonedData: PerpendicularLinesConstraintData = {
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
    return new PerpendicularLinesConstraint(this.repo, clonedData)
  }

  // Specific getters
  get lineAId(): LineId {
    return this.data.entities.lines[0]
  }

  get lineBId(): LineId {
    return this.data.entities.lines[1]
  }

  protected getTargetValue(): number {
    return 0 // Perpendicular lines should have 0 dot product
  }
}