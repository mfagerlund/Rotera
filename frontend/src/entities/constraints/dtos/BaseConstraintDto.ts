// Base DTO interfaces for constraint serialization

import type { ConstraintId } from '../../../types/ids'
import type { ConstraintStatus } from '../base-constraint'

// Union type for all constraint types
export type ConstraintType =
  | 'distance_point_point'
  | 'distance_point_line'
  | 'distance_point_plane'
  | 'angle_point_point_point'
  | 'angle_line_line'
  | 'parallel_lines'
  | 'perpendicular_lines'
  | 'fixed_point'
  | 'collinear_points'
  | 'coplanar_points'
  | 'equal_distances'
  | 'equal_angles'

export interface BaseConstraintDto {
  id: ConstraintId
  name: string
  type: ConstraintType
  status: ConstraintStatus
  priority: number
  tolerance: number
  isEnabled: boolean
  isDriving: boolean
  group?: string
  tags?: string[]
  notes?: string
  createdAt: string
  updatedAt: string
  currentValue?: number
  error?: number
}