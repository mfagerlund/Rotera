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

export function getSnappedCanvasPosition(
  wp: WorldPoint,
  imagePoint: ImagePoint,
  viewpoint: Viewpoint,
  scale: number,
  offset: { x: number; y: number }
): { x: number; y: number } {
  const pos = imagePointToCanvas(imagePoint, scale, offset)
  if (wp.coincidentWithLines.size === 0) return pos

  let best: { x: number; y: number } | null = null
  let bestDist = Infinity

  for (const lineRef of wp.coincidentWithLines) {
    const line = lineRef as Line
    const ipsA = viewpoint.getImagePointsForWorldPoint(line.pointA)
    const ipsB = viewpoint.getImagePointsForWorldPoint(line.pointB)
    if (ipsA.length === 0 || ipsB.length === 0) continue

    const a = imagePointToCanvas(ipsA[0], scale, offset)
    const b = imagePointToCanvas(ipsB[0], scale, offset)
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
