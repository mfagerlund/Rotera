/**
 * Incremental triangulation for WorldPoints.
 * Triangulates a single WorldPoint when ImagePoints are added/moved,
 * without requiring a full optimization run.
 */

import { WorldPoint } from '../entities/world-point'
import { Viewpoint } from '../entities/viewpoint'
import { ImagePoint } from '../entities/imagePoint'
import { triangulateRayRay } from './triangulation'

/**
 * Check if a viewpoint has been initialized (has valid camera pose)
 */
function isViewpointInitialized(vp: Viewpoint): boolean {
  // Camera is initialized if it has non-zero position
  return vp.position[0] !== 0 || vp.position[1] !== 0 || vp.position[2] !== 0
}

/**
 * Try to triangulate a WorldPoint from its ImagePoint observations.
 * Only works if the point is visible in 2+ initialized cameras.
 *
 * @returns true if triangulation succeeded and optimizedXyz was set
 */
export function tryTriangulateWorldPoint(worldPoint: WorldPoint): boolean {
  // Skip if already fully constrained (has locked coordinates)
  if (worldPoint.isFullyConstrained()) {
    const effective = worldPoint.getEffectiveXyz()
    worldPoint.optimizedXyz = [effective[0]!, effective[1]!, effective[2]!]
    return true
  }

  // Get all image points for this world point
  const imagePoints = Array.from(worldPoint.imagePoints) as ImagePoint[]

  // Filter to those in initialized viewpoints
  const validObservations = imagePoints.filter(ip =>
    isViewpointInitialized(ip.viewpoint as Viewpoint)
  )

  // Need at least 2 observations to triangulate
  if (validObservations.length < 2) {
    return false
  }

  // Use first two valid observations
  const ip1 = validObservations[0]
  const ip2 = validObservations[1]
  const vp1 = ip1.viewpoint as Viewpoint
  const vp2 = ip2.viewpoint as Viewpoint

  const result = triangulateRayRay(ip1, ip2, vp1, vp2)

  if (!result) {
    return false
  }

  worldPoint.optimizedXyz = result.worldPoint
  return true
}
