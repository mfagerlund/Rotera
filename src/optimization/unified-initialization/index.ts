import type { WorldPoint } from '../../entities/world-point'
import type { Line } from '../../entities/line'
import type { Constraint } from '../../entities/constraints'
import { log } from '../optimization-logger'
import { step1_setLockedPoints } from './phase-1-locked-points'
import { step2_inferFromConstraints } from './phase-2-constraints'
import { step3_triangulateFromImages } from './phase-3-triangulation'
import { step4_propagateThroughLineGraph } from './phase-4-line-propagation'
import { step5_coplanarGroups } from './phase-5-coplanar'
import { step6_randomFallback } from './phase-6-random'

export type { InitializationOptions } from './types'

/**
 * Main entry point for unified initialization
 * Executes all 6 initialization phases in sequence
 */
export function initializeWorldPoints(
  points: WorldPoint[],
  lines: Line[],
  constraints: Constraint[],
  options: import('./types').InitializationOptions = {}
): void {
  const { sceneScale = 10.0, verbose = false, initializedViewpoints, vpInitializedViewpoints, skipLockedPoints = false } = options

  const initialized = new Set<WorldPoint>()

  if (verbose) {
    log('[Unified Initialization] Starting 6-step initialization...')
  }

  if (!skipLockedPoints) {
    step1_setLockedPoints(points, initialized, verbose)
  } else {
    log('[Step 1] SKIPPED (skipLockedPoints=true for Essential Matrix free solve)')
  }

  step2_inferFromConstraints(points, lines, initialized, sceneScale, verbose)

  step3_triangulateFromImages(points, initialized, sceneScale, verbose, initializedViewpoints)

  step4_propagateThroughLineGraph(points, lines, initialized, sceneScale, verbose, initializedViewpoints, vpInitializedViewpoints)

  step5_coplanarGroups(points, constraints, initialized, sceneScale, verbose)

  step6_randomFallback(points, initialized, sceneScale, verbose)

  if (verbose) {
    log(`[Unified Initialization] Complete: ${initialized.size}/${points.length} points initialized`)
  }
}
