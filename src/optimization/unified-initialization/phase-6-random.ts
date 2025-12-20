import type { WorldPoint } from '../../entities/world-point'
import { random } from '../seeded-random'
import { log } from '../optimization-logger'

/**
 * Phase 6: Random fallback for any remaining uninitialized points
 * Places points randomly within a cube of size sceneScale
 */
export function step6_randomFallback(
  points: WorldPoint[],
  initialized: Set<WorldPoint>,
  sceneScale: number,
  verbose: boolean
): void {
  let randomCount = 0

  for (const point of points) {
    if (!initialized.has(point)) {
      point.optimizedXyz = [
        (random() - 0.5) * sceneScale,
        (random() - 0.5) * sceneScale,
        (random() - 0.5) * sceneScale
      ]
      initialized.add(point)
      randomCount++
    }
  }

  if (verbose) {
    log(`[Step 6] Random fallback for ${randomCount} points`)
  }
}
