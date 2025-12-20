import type { WorldPoint } from '../../entities/world-point'
import type { Constraint } from '../../entities/constraints'
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint'
import { log } from '../optimization-logger'

/**
 * Phase 5: Initialize coplanar point groups in a grid layout
 * Distributes points evenly across planes separated in Z
 */
export function step5_coplanarGroups(
  points: WorldPoint[],
  constraints: Constraint[],
  initialized: Set<WorldPoint>,
  sceneScale: number,
  verbose: boolean
): void {
  const groups: WorldPoint[][] = []

  for (const constraint of constraints) {
    if (constraint instanceof CoplanarPointsConstraint) {
      if (constraint.points.length >= 4) {
        groups.push(constraint.points)
      }
    }
  }

  let coplanarCount = 0

  groups.forEach((group, planeIdx) => {
    const planeZ = (planeIdx - groups.length / 2) * sceneScale * 0.3
    const gridSize = Math.ceil(Math.sqrt(group.length))
    const spacing = sceneScale / gridSize

    group.forEach((point, idx) => {
      if (!initialized.has(point)) {
        const row = Math.floor(idx / gridSize)
        const col = idx % gridSize

        const x = (col - gridSize / 2) * spacing
        const y = (row - gridSize / 2) * spacing

        point.optimizedXyz = [x, y, planeZ]
        initialized.add(point)
        coplanarCount++
      }
    })
  })

  if (verbose) {
    log(`[Step 5] Initialized ${coplanarCount} points in ${groups.length} coplanar groups`)
  }
}
