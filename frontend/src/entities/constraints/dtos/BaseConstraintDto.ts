// Base DTO interfaces for constraint serialization

import type { ConstraintId } from '../../../types/ids'
import type { ConstraintType, ConstraintStatus } from '../IConstraint'

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