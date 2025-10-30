import type { Project } from '../../entities/project'
import type { WorldPoint } from '../../entities/world-point/WorldPoint'
import type { Line } from '../../entities/line/Line'
import type { ProjectedPoint } from './types'

export function findPointAt(
  x: number,
  y: number,
  project: Project,
  project3DTo2D: (point: [number, number, number]) => ProjectedPoint
): WorldPoint | null {
  for (const point of project.worldPoints) {
    const coords = point.optimizedXyz
    if (!coords) continue

    const projected = project3DTo2D(coords)
    const distance = Math.sqrt(
      Math.pow(projected.x - x, 2) + Math.pow(projected.y - y, 2)
    )

    if (distance <= 8) return point
  }
  return null
}

export function findLineAt(
  x: number,
  y: number,
  project: Project,
  project3DTo2D: (point: [number, number, number]) => ProjectedPoint
): Line | null {
  for (const line of project.lines) {
    const coordsA = line.pointA.optimizedXyz
    const coordsB = line.pointB.optimizedXyz
    if (!coordsA || !coordsB) continue

    const projA = project3DTo2D(coordsA)
    const projB = project3DTo2D(coordsB)

    // Calculate distance from point to line segment
    const A = x - projA.x
    const B = y - projA.y
    const C = projB.x - projA.x
    const D = projB.y - projA.y

    const dot = A * C + B * D
    const lenSq = C * C + D * D

    if (lenSq === 0) {
      // Line is a point
      const distance = Math.sqrt(A * A + B * B)
      if (distance <= 5) return line
      continue
    }

    let param = dot / lenSq

    // All lines are segments, clamp parameter to [0, 1]
    param = Math.max(0, Math.min(1, param))

    const closestX = projA.x + param * C
    const closestY = projA.y + param * D

    const distance = Math.sqrt(
      Math.pow(x - closestX, 2) + Math.pow(y - closestY, 2)
    )

    // Increase hit tolerance for lines (larger buffer for easier clicking)
    if (distance <= 8) return line
  }
  return null
}
