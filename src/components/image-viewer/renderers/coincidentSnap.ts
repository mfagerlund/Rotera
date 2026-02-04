import { imagePointToCanvas } from './renderUtils'
import type { Line } from '../../../entities/line'
import type { WorldPoint } from '../../../entities/world-point'
import type { Viewpoint } from '../../../entities/viewpoint'
import type { ImagePoint } from '../../../entities/imagePoint'

function snapToLine(px: number, py: number, ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
  const abx = bx - ax, aby = by - ay
  const apx = px - ax, apy = py - ay
  const t = (apx * abx + apy * aby) / (abx * abx + aby * aby)
  return { x: ax + t * abx, y: ay + t * aby }
}

/**
 * Compute intersection of two lines defined by points (a1,b1) and (a2,b2).
 * Returns null if lines are parallel (or nearly so).
 */
function lineIntersection(
  a1x: number, a1y: number, b1x: number, b1y: number,
  a2x: number, a2y: number, b2x: number, b2y: number
): { x: number; y: number } | null {
  const d1x = b1x - a1x, d1y = b1y - a1y
  const d2x = b2x - a2x, d2y = b2y - a2y

  const cross = d1x * d2y - d1y * d2x
  if (Math.abs(cross) < 1e-10) return null  // Parallel lines

  const dx = a2x - a1x, dy = a2y - a1y
  const t = (dx * d2y - dy * d2x) / cross

  return { x: a1x + t * d1x, y: a1y + t * d1y }
}

interface LineEndpoints {
  a: { x: number; y: number }
  b: { x: number; y: number }
}

export function getSnappedCanvasPosition(
  wp: WorldPoint,
  imagePoint: ImagePoint,
  viewpoint: Viewpoint,
  scale: number,
  offset: { x: number; y: number }
): { x: number; y: number } {
  const pos = imagePointToCanvas(imagePoint, scale, offset)
  if (wp.coincidentWithLines.size === 0) return pos

  // Collect valid line endpoints in canvas coordinates
  const lineEndpoints: LineEndpoints[] = []
  for (const lineRef of wp.coincidentWithLines) {
    const line = lineRef as Line
    const ipsA = viewpoint.getImagePointsForWorldPoint(line.pointA)
    const ipsB = viewpoint.getImagePointsForWorldPoint(line.pointB)
    if (ipsA.length === 0 || ipsB.length === 0) continue

    lineEndpoints.push({
      a: imagePointToCanvas(ipsA[0], scale, offset),
      b: imagePointToCanvas(ipsB[0], scale, offset)
    })
  }

  if (lineEndpoints.length === 0) return pos

  // If exactly 2 lines, snap to their intersection
  if (lineEndpoints.length === 2) {
    const l1 = lineEndpoints[0]
    const l2 = lineEndpoints[1]
    const intersection = lineIntersection(
      l1.a.x, l1.a.y, l1.b.x, l1.b.y,
      l2.a.x, l2.a.y, l2.b.x, l2.b.y
    )
    if (intersection) return intersection
    // Fall through to single-line snap if parallel
  }

  // If 3+ lines, find intersection closest to current position
  if (lineEndpoints.length >= 3) {
    let bestIntersection: { x: number; y: number } | null = null
    let bestDist = Infinity

    for (let i = 0; i < lineEndpoints.length; i++) {
      for (let j = i + 1; j < lineEndpoints.length; j++) {
        const l1 = lineEndpoints[i]
        const l2 = lineEndpoints[j]
        const intersection = lineIntersection(
          l1.a.x, l1.a.y, l1.b.x, l1.b.y,
          l2.a.x, l2.a.y, l2.b.x, l2.b.y
        )
        if (intersection) {
          const dx = intersection.x - pos.x, dy = intersection.y - pos.y
          const dist = dx * dx + dy * dy
          if (dist < bestDist) {
            bestDist = dist
            bestIntersection = intersection
          }
        }
      }
    }
    if (bestIntersection) return bestIntersection
  }

  // Fall back to snapping to closest line (for single line or parallel lines)
  let best: { x: number; y: number } | null = null
  let bestDist = Infinity

  for (const { a, b } of lineEndpoints) {
    const snapped = snapToLine(pos.x, pos.y, a.x, a.y, b.x, b.y)
    const dx = snapped.x - pos.x, dy = snapped.y - pos.y
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      bestDist = dist
      best = snapped
    }
  }

  return best ?? pos
}
