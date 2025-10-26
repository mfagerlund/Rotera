import { initializeWorldPoints as unifiedInitialize } from './unified-initialization'
import type { WorldPoint } from '../entities/world-point'
import type { Line } from '../entities/line'
import type { Constraint } from '../entities/constraints'

export function initializeWorldPoints(
  points: WorldPoint[],
  lines: Line[],
  constraints: Constraint[]
): void {
  unifiedInitialize(points, lines, constraints, {
    sceneScale: 10.0,
    verbose: true
  })
}
