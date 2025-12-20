import type { WorldPoint } from '../../entities/world-point'
import { log } from '../optimization-logger'

/**
 * Phase 1: Initialize points that are fully constrained (locked or inferred coordinates)
 * Also preserves points that already have optimizedXyz from previous optimization
 */
export function step1_setLockedPoints(
  points: WorldPoint[],
  initialized: Set<WorldPoint>,
  verbose: boolean
): void {
  let constrainedCount = 0
  let presetCount = 0

  for (const point of points) {
    // Use isFullyConstrained() to include both locked AND inferred coordinates
    if (point.isFullyConstrained()) {
      const effective = point.getEffectiveXyz()
      point.optimizedXyz = [effective[0]!, effective[1]!, effective[2]!]
      initialized.add(point)
      constrainedCount++
    } else if (point.optimizedXyz !== undefined && point.optimizedXyz !== null) {
      // Point already has optimizedXyz set (e.g., from previous optimization)
      // Mark as initialized to prevent overwriting with incorrect values
      initialized.add(point)
      presetCount++
    }
  }

  if (verbose) {
    log(`[Step 1] Set ${constrainedCount} constrained points (locked or inferred), preserved ${presetCount} pre-initialized points`)
  }
}
