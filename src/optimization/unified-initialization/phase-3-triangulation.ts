import type { WorldPoint } from '../../entities/world-point'
import type { ImagePoint } from '../../entities/imagePoint'
import type { Viewpoint } from '../../entities/viewpoint'
import { triangulateRayRay } from '../triangulation'
import { log } from '../optimization-logger'

/**
 * Phase 3: Triangulate points from multiple image observations
 * Requires at least 2 cameras with initialized poses
 */
export function step3_triangulateFromImages(
  points: WorldPoint[],
  initialized: Set<WorldPoint>,
  fallbackDepth: number,
  verbose: boolean,
  initializedViewpoints?: Set<Viewpoint>,
  vpInitializedViewpoints?: Set<Viewpoint>
): void {
  let triangulatedCount = 0
  let failedCount = 0
  let skippedCount = 0

  for (const point of points) {
    const wasAlreadyInitialized = initialized.has(point)

    if (wasAlreadyInitialized) {
      skippedCount++
      continue
    }

    const imagePoints = Array.from(point.imagePoints) as ImagePoint[]
    if (imagePoints.length < 2) {
      failedCount++
      continue
    }

    let triangulated = false

    for (let i = 0; i < imagePoints.length && !triangulated; i++) {
      for (let j = i + 1; j < imagePoints.length && !triangulated; j++) {
        const ip1 = imagePoints[i]
        const ip2 = imagePoints[j]

        if (ip1.viewpoint === ip2.viewpoint) continue

        const vp1 = ip1.viewpoint as Viewpoint
        const vp2 = ip2.viewpoint as Viewpoint

        const vp1HasPose = initializedViewpoints
          ? initializedViewpoints.has(vp1)
          : (vp1.position[0] !== 0 || vp1.position[1] !== 0 || vp1.position[2] !== 0)
        const vp2HasPose = initializedViewpoints
          ? initializedViewpoints.has(vp2)
          : (vp2.position[0] !== 0 || vp2.position[1] !== 0 || vp2.position[2] !== 0)

        if (!vp1HasPose || !vp2HasPose) continue

        const result = triangulateRayRay(ip1, ip2, vp1, vp2, fallbackDepth)
        if (result) {
          point.optimizedXyz = result.worldPoint
          initialized.add(point)
          triangulatedCount++
          triangulated = true
        }
      }
    }

    if (!triangulated) {
      failedCount++
    }
  }

  // Always log a compact summary of triangulated points
  if (triangulatedCount > 0) {
    const triPoints = points
      .filter(p => initialized.has(p) && p.optimizedXyz)
      .map(p => {
        const pos = p.optimizedXyz!
        return `${p.name}:[${pos.map(v => v.toFixed(1)).join(',')}]`
      })
    log(`[Tri] ${triangulatedCount} pts: ${triPoints.join(' ')}`)
  }

  if (verbose) {
    if (skippedCount > 0) {
      log(`[Step 3] Triangulated ${triangulatedCount} new points, skipped ${skippedCount} constraint-inferred points, ${failedCount} failed`)
    } else {
      log(`[Step 3] Triangulated ${triangulatedCount} points from images (${failedCount} failed)`)
    }
  }
}
