// WorldPoint DTO interfaces and types

import type { PointId } from '../../types/ids'

// DTO for frontend storage (rich metadata)
export interface WorldPointDto {
  id: PointId
  name: string
  xyz?: [number | null, number | null, number | null]
  color: string
  isVisible: boolean
  isOrigin: boolean
  isLocked: boolean
  group?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}