// WorldPoint DTO interfaces and types

import type { PointId } from '../../types/ids'
import type { ValueProvenance } from '../../optimization/IOptimizable'

/**
 * Per-axis locking configuration.
 * If undefined, all axes are unlocked.
 * If defined, only specified axes are locked (true = locked, false/undefined = unlocked).
 */
export interface AxisLock {
  x?: boolean
  y?: boolean
  z?: boolean
}

// DTO for frontend storage (rich metadata)
export interface WorldPointDto {
  id: PointId
  name: string
  xyz?: [number | null, number | null, number | null]

  /** Provenance tracking for xyz coordinates */
  xyzProvenance?: ValueProvenance

  color: string
  isVisible: boolean
  isOrigin: boolean

  /**
   * @deprecated Use lockedAxes instead for per-axis control
   * Kept for backward compatibility - if true, locks all axes
   */
  isLocked: boolean

  /** Per-axis locking. If undefined, uses isLocked for backward compatibility */
  lockedAxes?: AxisLock

  group?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}