import * as vec3 from '../utils/vec3'
import type { WorldPoint } from '../entities/world-point'
import type { Line } from '../entities/line'
import type { Constraint } from '../entities/constraints'
import { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint'

/**
 * Initialize optimizedXyz for world points using smart strategies
 */
export function initializeWorldPoints(
  points: WorldPoint[],
  lines: Line[],
  constraints: Constraint[]
): void {
  const sceneScale = 10.0 // Reasonable default scene scale

  // 1. Find coplanar groups and initialize them
  const initialized = new Set<WorldPoint>()
  const coplanarGroups = findCoplanarGroups(constraints)
  initializeCoplanarGroups(points, coplanarGroups, sceneScale, initialized)

  // 2. Propagate through line graph
  propagateViaLineGraph(points, lines, initialized, sceneScale)

  // 3. Random initialization for any remaining points
  points.forEach(point => {
    if (!point.optimizedXyz) {
      point.optimizedXyz = [
        (Math.random() - 0.5) * sceneScale,
        (Math.random() - 0.5) * sceneScale,
        (Math.random() - 0.5) * sceneScale
      ]
    }
  })
}

/**
 * Find groups of coplanar points from constraints
 */
function findCoplanarGroups(constraints: Constraint[]): WorldPoint[][] {
  const groups: WorldPoint[][] = []

  constraints.forEach(constraint => {
    if (constraint instanceof CoplanarPointsConstraint) {
      if (constraint.points.length >= 4) {
        groups.push(constraint.points)
      }
    }
  })

  return groups
}

/**
 * Initialize points on planes for coplanar groups
 */
function initializeCoplanarGroups(
  points: WorldPoint[],
  groups: WorldPoint[][],
  sceneScale: number,
  initialized: Set<WorldPoint>
): void {
  groups.forEach((group, planeIdx) => {
    // Each plane at a different z-level
    const planeZ = (planeIdx - groups.length / 2) * sceneScale * 0.3

    // Create a grid on the plane
    const gridSize = Math.ceil(Math.sqrt(group.length))
    const spacing = sceneScale / gridSize

    group.forEach((point, idx) => {
      const row = Math.floor(idx / gridSize)
      const col = idx % gridSize

      const x = (col - gridSize / 2) * spacing
      const y = (row - gridSize / 2) * spacing

      point.optimizedXyz = [x, y, planeZ]
      initialized.add(point)
    })
  })
}

/**
 * Propagate positions through line graph using BFS
 */
function propagateViaLineGraph(
  points: WorldPoint[],
  lines: Line[],
  initialized: Set<WorldPoint>,
  sceneScale: number
): void {
  // If no points initialized yet, start with first point at origin
  if (initialized.size === 0 && points.length > 0) {
    points[0].optimizedXyz = [0, 0, 0]
    initialized.add(points[0])
  }

  // BFS to propagate positions
  const queue = Array.from(initialized)

  while (queue.length > 0) {
    const currentPoint = queue.shift()!
    const currentXyz = currentPoint.optimizedXyz
    if (!currentXyz) continue

    // Find lines connected to this point
    lines.forEach(line => {
      let otherPoint: WorldPoint | null = null

      if (line.pointA === currentPoint && !initialized.has(line.pointB)) {
        otherPoint = line.pointB
      } else if (line.pointB === currentPoint && !initialized.has(line.pointA)) {
        otherPoint = line.pointA
      }

      if (otherPoint) {
        // Use target length if available, otherwise use scene scale
        const distance = line.targetLength ?? sceneScale * 0.2

        // Random direction (could be improved with more constraints)
        const direction = randomUnitVector()
        const currentXyz = currentPoint.optimizedXyz!

        otherPoint.optimizedXyz = [
          currentXyz[0] + direction[0] * distance,
          currentXyz[1] + direction[1] * distance,
          currentXyz[2] + direction[2] * distance
        ]

        initialized.add(otherPoint)
        queue.push(otherPoint)
      }
    })
  }
}

function randomUnitVector(): [number, number, number] {
  let vec: [number, number, number]
  let len: number
  do {
    vec = [
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ]
    len = vec3.magnitude(vec)
  } while (len === 0 || len > 1)

  return vec3.normalize(vec)
}
