import { VanishingLine, VanishingLineAxis } from '../../entities/vanishing-line'
import { Viewpoint } from '../../entities/viewpoint'
import { WorldPoint } from '../../entities/world-point'
import { Line, LineDirection } from '../../entities/line'
import { log, logOnce } from '../optimization-logger'
import { computeVPFromSVD } from './math-utils'
import { VPLineData, VanishingPoint } from './types'

/**
 * Maps Line direction constraints to vanishing point axes.
 * Only axis-aligned directions (x, y, z) map to a single vanishing point.
 * Plane-constrained directions (xy, xz, yz) don't map to a single axis.
 */
function lineDirectionToVPAxis(direction: LineDirection): VanishingLineAxis | null {
  switch (direction) {
    case 'x': return 'x'
    case 'y': return 'y'
    case 'z': return 'z'
    // Plane constraints don't map to a single vanishing point
    case 'xy': return null
    case 'xz': return null
    case 'yz': return null
    case 'free': return null
    default: return null
  }
}

/**
 * Finds ImagePoint for a WorldPoint in a specific Viewpoint.
 */
function findImagePointInViewpoint(
  worldPoint: WorldPoint,
  viewpoint: Viewpoint
): { u: number; v: number } | null {
  for (const ip of worldPoint.imagePoints) {
    if (ip.viewpoint === viewpoint) {
      return { u: ip.u, v: ip.v }
    }
  }
  return null
}

/**
 * Collects direction-constrained Lines visible in a viewpoint as virtual vanishing lines.
 * A Line is "visible" if both endpoints have ImagePoints in the viewpoint.
 */
export function collectDirectionConstrainedLines(
  viewpoint: Viewpoint
): { axis: VanishingLineAxis; p1: { u: number; v: number }; p2: { u: number; v: number } }[] {
  const virtualLines: { axis: VanishingLineAxis; p1: { u: number; v: number }; p2: { u: number; v: number } }[] = []
  const processedLines = new Set<Line>()

  // Iterate through all imagePoints in this viewpoint
  for (const imagePoint of viewpoint.imagePoints) {
    const worldPoint = imagePoint.worldPoint as WorldPoint

    // Check each line connected to this world point
    for (const iline of worldPoint.connectedLines) {
      const line = iline as Line

      // Skip if already processed or no direction constraint
      if (processedLines.has(line)) continue
      processedLines.add(line)

      const axis = lineDirectionToVPAxis(line.direction)
      if (!axis) continue

      // Find image points for both endpoints
      const p1 = findImagePointInViewpoint(line.pointA as WorldPoint, viewpoint)
      const p2 = findImagePointInViewpoint(line.pointB as WorldPoint, viewpoint)

      if (p1 && p2) {
        virtualLines.push({ axis, p1, p2 })
      }
    }
  }

  return virtualLines
}

/**
 * Compute vanishing point from a set of lines.
 * Uses direct intersection for 2 lines, SVD for 3+ lines.
 */
export function computeVanishingPoint(
  lines: Array<{ p1: { u: number; v: number }; p2: { u: number; v: number } }>
): { u: number; v: number } | null {
  if (lines.length < 2) {
    return null
  }

  const homogeneousLines: Array<[number, number, number]> = lines.map(line => {
    const p1 = [line.p1.u, line.p1.v, 1]
    const p2 = [line.p2.u, line.p2.v, 1]

    const a = p1[1] * p2[2] - p1[2] * p2[1]
    const b = p1[2] * p2[0] - p1[0] * p2[2]
    const c = p1[0] * p2[1] - p1[1] * p2[0]

    return [a, b, c]
  })

  if (lines.length === 2) {
    const l1 = homogeneousLines[0]
    const l2 = homogeneousLines[1]

    const vp_x = l1[1] * l2[2] - l1[2] * l2[1]
    const vp_y = l1[2] * l2[0] - l1[0] * l2[2]
    const vp_w = l1[0] * l2[1] - l1[1] * l2[0]

    if (Math.abs(vp_w) < 1e-10) {
      return null
    }

    return {
      u: vp_x / vp_w,
      v: vp_y / vp_w
    }
  }

  const result = computeVPFromSVD(lines)
  if (!result) {
    return null
  }

  if (Math.abs(result.u) > 10000 || Math.abs(result.v) > 10000) {
    logOnce(`[VP] WARNING: VP very far from origin (u=${result.u.toFixed(0)}, v=${result.v.toFixed(0)})`)
  }

  return result
}

/**
 * Compute angle between two vanishing points (in degrees)
 */
export function computeAngleBetweenVPs(
  vp1: { u: number; v: number },
  vp2: { u: number; v: number },
  principalPoint: { u: number; v: number }
): number {
  const d1_u = vp1.u - principalPoint.u
  const d1_v = vp1.v - principalPoint.v
  const d2_u = vp2.u - principalPoint.u
  const d2_v = vp2.v - principalPoint.v

  const dot = d1_u * d2_u + d1_v * d2_v
  const norm1 = Math.sqrt(d1_u * d1_u + d1_v * d1_v)
  const norm2 = Math.sqrt(d2_u * d2_u + d2_v * d2_v)

  if (norm1 < 1e-10 || norm2 < 1e-10) {
    return 0
  }

  const cosAngle = dot / (norm1 * norm2)
  const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)))
  const angleDeg = (angleRad * 180) / Math.PI

  return angleDeg
}

/**
 * Estimate focal length from two orthogonal vanishing points
 */
export function estimateFocalLength(
  vp1: { u: number; v: number },
  vp2: { u: number; v: number },
  principalPoint: { u: number; v: number }
): number | null {
  const u1 = vp1.u - principalPoint.u
  const v1 = vp1.v - principalPoint.v
  const u2 = vp2.u - principalPoint.u
  const v2 = vp2.v - principalPoint.v

  const discriminant = -(u1 * u2 + v1 * v2)

  if (discriminant < 0) {
    return null
  }

  const f = Math.sqrt(discriminant)
  return f
}

/**
 * Estimate principal point from vanishing points.
 * Currently returns null to preserve user-set values.
 */
export function estimatePrincipalPoint(
  vanishingPoints: {
    x?: VanishingPoint
    y?: VanishingPoint
    z?: VanishingPoint
  },
  imageWidth: number,
  imageHeight: number
): { u: number; v: number } | null {
  // For most cameras, the principal point is very close to the image center.
  // Estimating PP from vanishing points is unreliable and can produce wildly wrong values.
  //
  // IMPORTANT: We return null here to preserve user-set principal point values.
  // This is critical for cropped images where the principal point is NOT at image center.
  // The Viewpoint already defaults cx/cy to image center when created, so returning
  // null here means we respect either the default or any user-specified values.
  //
  // If reliable PP estimation from 3+ orthogonal VPs is needed in the future,
  // implement it here - but for now, null is the safe choice.
  return null
}
