import { VanishingLineAxis } from '../../entities/vanishing-line'
import { Viewpoint } from '../../entities/viewpoint'
import { WorldPoint } from '../../entities/world-point'
import { logDebug } from '../optimization-logger'
import { collectDirectionConstrainedLines } from './detection'
import { computeVanishingPoint, computeAngleBetweenVPs } from './detection'
import { VPLineData, ValidationResult, LineQualityIssue, VanishingPoint } from './types'

/**
 * Validate vanishing points from a viewpoint
 */
export function validateVanishingPoints(viewpoint: Viewpoint): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const vanishingPoints: {
    x?: VanishingPoint
    y?: VanishingPoint
    z?: VanishingPoint
  } = {}

  // Use a generic type that works for both explicit VanishingLines and virtual lines from direction constraints
  type VPLineData = { p1: { u: number; v: number }; p2: { u: number; v: number } }
  const linesByAxis: Record<VanishingLineAxis, VPLineData[]> = {
    x: [],
    y: [],
    z: []
  }

  // 1. Collect explicit VanishingLines
  Array.from(viewpoint.vanishingLines).forEach(line => {
    linesByAxis[line.axis].push(line)
  })

  // 2. Collect direction-constrained Lines as virtual vanishing lines
  const virtualLines = collectDirectionConstrainedLines(viewpoint)
  let virtualLineCount = 0
  virtualLines.forEach(vl => {
    linesByAxis[vl.axis].push(vl)
    virtualLineCount++
  })

  if (virtualLineCount > 0) {
    logDebug(`[validateVanishingPoints] Added ${virtualLineCount} virtual VP lines from direction-constrained Lines`)
  }

  const axes: VanishingLineAxis[] = ['x', 'y', 'z']
  axes.forEach(axis => {
    const axisLines = linesByAxis[axis]
    if (axisLines.length === 0) {
      return
    }

    if (axisLines.length === 1) {
      warnings.push(`${axis.toUpperCase()}-axis has only 1 line (need 2+ for vanishing point)`)
      return
    }

    const vp = computeVanishingPoint(axisLines)
    if (!vp) {
      errors.push(`${axis.toUpperCase()}-axis lines do not converge to a valid vanishing point`)
      return
    }

    // Check if VP is too far from origin (indicates nearly parallel lines - unreliable)
    // VPs at extreme distances produce unstable focal length and camera pose estimates
    const vpDistance = Math.sqrt(vp.u * vp.u + vp.v * vp.v)
    const MAX_RELIABLE_VP_DISTANCE = 50000 // pixels - beyond this, VP-based init is unreliable
    if (vpDistance > MAX_RELIABLE_VP_DISTANCE) {
      warnings.push(
        `${axis.toUpperCase()}-axis VP very distant (${vpDistance.toFixed(0)}px from origin) - ` +
        `vanishing lines nearly parallel, camera pose may be unreliable`
      )
      // Don't add this VP - it will fail the 2 VP requirement if no other valid VPs exist
      return
    }

    vanishingPoints[axis] = { u: vp.u, v: vp.v, axis }
  })

  const vpCount = Object.keys(vanishingPoints).length
  if (vpCount < 2) {
    errors.push(`Need at least 2 vanishing points (have ${vpCount})`)
  }

  const anglesBetweenVPs: {
    xy?: number
    xz?: number
    yz?: number
  } = {}

  const principalPoint = {
    u: viewpoint.principalPointX,
    v: viewpoint.principalPointY
  }

  if (vanishingPoints.x && vanishingPoints.y) {
    const angle = computeAngleBetweenVPs(vanishingPoints.x, vanishingPoints.y, principalPoint)
    anglesBetweenVPs.xy = angle

    if (angle < 85 || angle > 95) {
      warnings.push(
        `X-Y vanishing points not perpendicular (${angle.toFixed(1)}°, expected ~90°)`
      )
    }
  }

  if (vanishingPoints.x && vanishingPoints.z) {
    const angle = computeAngleBetweenVPs(vanishingPoints.x, vanishingPoints.z, principalPoint)
    anglesBetweenVPs.xz = angle

    if (angle < 85 || angle > 95) {
      warnings.push(
        `X-Z vanishing points not perpendicular (${angle.toFixed(1)}°, expected ~90°)`
      )
    }
  }

  if (vanishingPoints.y && vanishingPoints.z) {
    const angle = computeAngleBetweenVPs(vanishingPoints.y, vanishingPoints.z, principalPoint)
    anglesBetweenVPs.yz = angle

    if (angle < 85 || angle > 95) {
      warnings.push(
        `Y-Z vanishing points not perpendicular (${angle.toFixed(1)}°, expected ~90°)`
      )
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    vanishingPoints,
    anglesBetweenVPs
  }
}

/**
 * Check if VP initialization is possible with available data
 */
export function canInitializeWithVanishingPoints(
  viewpoint: Viewpoint,
  worldPoints: Set<WorldPoint>,
  options: { allowSinglePoint?: boolean } = {}
): boolean {
  const { allowSinglePoint = false } = options

  // Check if we have valid vanishing points
  const validation = validateVanishingPoints(viewpoint)
  if (!validation.isValid || !validation.vanishingPoints) {
    return false
  }

  const vpCount = Object.keys(validation.vanishingPoints).length
  if (vpCount < 2) {
    return false
  }

  // Count fully constrained points (all 3 coordinates known via locking or inference)
  const constrainedCount = Array.from(worldPoints).filter(wp => wp.isFullyConstrained()).length

  // Strict mode: require 2+ constrained points
  if (!allowSinglePoint && constrainedCount >= 2) {
    return true
  }

  // Relaxed mode: allow 1+ constrained points
  if (allowSinglePoint && constrainedCount >= 1) {
    return true
  }

  return false
}

/**
 * Compute line length in pixels
 */
export function computeLineLength(line: VPLineData): number {
  const dx = line.p2.u - line.p1.u
  const dy = line.p2.v - line.p1.v
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Compute angle between two lines (in degrees)
 */
export function computeAngleBetweenLines(
  line1: VPLineData,
  line2: VPLineData
): number {
  const dx1 = line1.p2.u - line1.p1.u
  const dy1 = line1.p2.v - line1.p1.v
  const dx2 = line2.p2.u - line2.p1.u
  const dy2 = line2.p2.v - line2.p1.v

  const dot = dx1 * dx2 + dy1 * dy2
  const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)
  const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)

  if (len1 < 1e-10 || len2 < 1e-10) {
    return 0
  }

  const cosAngle = dot / (len1 * len2)
  const angleRad = Math.acos(Math.max(-1, Math.min(1, Math.abs(cosAngle))))
  const angleDeg = (angleRad * 180) / Math.PI

  return angleDeg
}

/**
 * Validate quality of a single vanishing line
 */
export function validateLineQuality(
  line: VPLineData,
  allLinesForAxis: VPLineData[]
): LineQualityIssue[] {
  const issues: LineQualityIssue[] = []

  const length = computeLineLength(line)
  if (length < 50) {
    issues.push({
      type: 'warning',
      message: `Line too short (${length.toFixed(0)}px). Draw longer lines for better accuracy.`
    })
  }

  // Only check parallel lines when there are exactly 2 lines on axis.
  // With 3+ lines, overdetermined least-squares handles parallel pairs well.
  if (allLinesForAxis.length === 2) {
    const otherLines = allLinesForAxis.filter(l => l !== line)
    if (otherLines.length > 0) {
      const minAngle = Math.min(...otherLines.map(other => computeAngleBetweenLines(line, other)))

      if (minAngle < 2) {
        issues.push({
          type: 'error',
          message: `Line nearly parallel to another (${minAngle.toFixed(1)}°). Lines should spread out.`
        })
      } else if (minAngle < 5) {
        issues.push({
          type: 'warning',
          message: `Line close to parallel with another (${minAngle.toFixed(1)}°). More spread recommended.`
        })
      }
    }
  }

  return issues
}

/**
 * Validate distribution of lines for an axis
 */
export function validateAxisLineDistribution(
  lines: VPLineData[]
): LineQualityIssue[] {
  const issues: LineQualityIssue[] = []

  if (lines.length < 2) {
    return issues
  }

  const centerPoints = lines.map(line => ({
    u: (line.p1.u + line.p2.u) / 2,
    v: (line.p1.v + line.p2.v) / 2
  }))

  const avgU = centerPoints.reduce((sum, p) => sum + p.u, 0) / centerPoints.length
  const avgV = centerPoints.reduce((sum, p) => sum + p.v, 0) / centerPoints.length

  const maxDistFromCenter = Math.max(...centerPoints.map(p => {
    const du = p.u - avgU
    const dv = p.v - avgV
    return Math.sqrt(du * du + dv * dv)
  }))

  if (maxDistFromCenter < 100) {
    issues.push({
      type: 'warning',
      message: 'Lines clustered in one area. Spread them across the image for better accuracy.'
    })
  }

  return issues
}
