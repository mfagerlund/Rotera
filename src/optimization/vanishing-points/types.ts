import { VanishingLineAxis } from '../../entities/vanishing-line'

/**
 * Generic line type for VP calculations - just needs p1 and p2 coordinates.
 */
export interface VPLineData {
  p1: { u: number; v: number }
  p2: { u: number; v: number }
}

export interface VanishingPoint {
  u: number
  v: number
  axis: VanishingLineAxis
}

export interface LineQualityIssue {
  type: 'warning' | 'error'
  message: string
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  vanishingPoints?: {
    x?: VanishingPoint
    y?: VanishingPoint
    z?: VanishingPoint
  }
  anglesBetweenVPs?: {
    xy?: number
    xz?: number
    yz?: number
  }
}
