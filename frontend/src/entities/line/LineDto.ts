// Line DTO interfaces and types

import type { LineId, PointId } from '../../types/ids'

// Direction constraint enum for lines
export type LineDirection =
  | 'free'           // No directional constraint
  | 'horizontal'     // Constrained to horizontal (XY plane, Z=0 direction)
  | 'vertical'       // Constrained to vertical (Z-axis direction)
  | 'x-aligned'      // Constrained to X-axis direction
  | 'y-aligned'      // Constrained to Y-axis direction
  | 'z-aligned'      // Constrained to Z-axis direction

// Line constraint settings
export interface LineConstraintSettings {
  direction: LineDirection
  targetLength?: number  // Fixed length constraint (if undefined, length is free)
  tolerance?: number     // Tolerance for constraint satisfaction
}

// DTO for frontend storage (rich metadata)
export interface LineDto {
  id: LineId
  name: string
  pointA: PointId
  pointB: PointId
  color: string
  isVisible: boolean
  isConstruction: boolean
  lineStyle: 'solid' | 'dashed' | 'dotted'
  thickness: number

  // NEW: Constraint settings embedded in line
  constraints: LineConstraintSettings

  group?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}