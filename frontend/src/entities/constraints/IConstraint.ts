// Base constraint interface for polymorphic constraint architecture

import type { ConstraintId, EntityId } from '../../types/ids'
import type { ISelectable, SelectableType } from '../../types/selectable'
import type { IValidatable, ValidationContext, ValidationResult } from '../../validation/validator'
import type { BaseConstraintDto } from './dtos/BaseConstraintDto'

// NOTE: horizontal_line, vertical_line, and distance constraints have been moved to Line entity properties
export type ConstraintType =
  | 'distance_point_point'
  | 'distance_point_line'
  | 'distance_point_plane'
  | 'angle_point_point_point'
  | 'angle_line_line'
  | 'parallel_lines'
  | 'perpendicular_lines'
  | 'collinear_points'
  | 'coplanar_points'
  | 'fixed_point'
  | 'equal_distances'
  | 'equal_angles'

export type ConstraintStatus = 'satisfied' | 'violated' | 'warning' | 'disabled'

export interface ConstraintEvaluationResult {
  value: number
  satisfied: boolean
  error?: number
  residual?: number
}

export interface ConstraintOptions {
  priority?: number
  tolerance?: number
  isEnabled?: boolean
  isDriving?: boolean
  group?: string
  tags?: string[]
  notes?: string
}

// Base constraint interface
export interface IConstraint extends ISelectable, IValidatable {
  readonly type: ConstraintType
  readonly status: ConstraintStatus
  readonly priority: number
  readonly tolerance: number
  readonly isEnabled: boolean
  readonly isDriving: boolean

  // Core constraint behavior
  evaluate(): ConstraintEvaluationResult
  updateFromEvaluation(result: ConstraintEvaluationResult): void

  // Metadata
  readonly createdAt: string
  readonly updatedAt: string
  readonly group?: string
  readonly tags: string[]
  readonly notes?: string

  // Constraint-specific entity access
  getReferencedEntityIds(): EntityId[]

  // Serialization
  toDTO(): BaseConstraintDto // Will be refined in specific implementations

  // Utility methods
  isSatisfied(): boolean
  isViolated(): boolean
  hasTarget(): boolean
  clone(newId: ConstraintId, newName?: string): IConstraint
}