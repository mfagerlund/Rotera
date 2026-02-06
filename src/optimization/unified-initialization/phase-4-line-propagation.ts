import type { WorldPoint } from '../../entities/world-point'
import type { Line } from '../../entities/line'
import type { Viewpoint } from '../../entities/viewpoint'
import type { ImagePoint } from '../../entities/imagePoint'
import { log } from '../optimization-logger'
import { randomUnitVector } from './helpers'
import { quaternionRotateVector } from '../coordinate-alignment/quaternion-utils'
import { createRng } from '../seeded-random'

/**
 * Phase 4: Propagate positions through the line graph
 * Uses BFS to spread from initialized points to connected points
 * For single-camera VP-initialized cases, uses camera rays to determine correct sign for axis-aligned lines
 */
export function step4_propagateThroughLineGraph(
  points: WorldPoint[],
  lines: Line[],
  initialized: Set<WorldPoint>,
  sceneScale: number,
  verbose: boolean,
  initializedViewpoints?: Set<Viewpoint>,
  vpInitializedViewpoints?: Set<Viewpoint>
): void {
  const rng = createRng(500)
  const startSize = initialized.size

  if (initialized.size === 0 && points.length > 0) {
    points[0].optimizedXyz = [0, 0, 0]
    initialized.add(points[0])
  }

  // Build adjacency map: point -> [{line, neighbor}] for O(N+L) BFS
  const adjacency = new Map<WorldPoint, { line: Line; neighbor: WorldPoint }[]>()
  for (const line of lines) {
    let listA = adjacency.get(line.pointA)
    if (!listA) { listA = []; adjacency.set(line.pointA, listA) }
    listA.push({ line, neighbor: line.pointB })

    let listB = adjacency.get(line.pointB)
    if (!listB) { listB = []; adjacency.set(line.pointB, listB) }
    listB.push({ line, neighbor: line.pointA })
  }

  const queue = Array.from(initialized)

  while (queue.length > 0) {
    const currentPoint = queue.shift()!
    if (!currentPoint.optimizedXyz) continue

    const edges = adjacency.get(currentPoint)
    if (!edges) continue

    for (const { line, neighbor: otherPoint } of edges) {
      if (initialized.has(otherPoint)) continue

      {
        const distance = line.targetLength ?? sceneScale * 0.5
        const currentXyz = currentPoint.optimizedXyz!
        let newPos: [number, number, number]

        // For direction-constrained lines, propagate along the constrained direction
        // For free lines, use a random direction
        switch (line.direction) {
          case 'x':
            newPos = [currentXyz[0] + distance, currentXyz[1], currentXyz[2]]
            break
          case 'y':
            newPos = [currentXyz[0], currentXyz[1] + distance, currentXyz[2]]
            break
          case 'z':
            newPos = [currentXyz[0], currentXyz[1], currentXyz[2] + distance]
            break
          case 'xy':
            newPos = [currentXyz[0] + distance * 0.707, currentXyz[1] + distance * 0.707, currentXyz[2]]
            break
          case 'xz':
            newPos = [currentXyz[0] + distance * 0.707, currentXyz[1], currentXyz[2] + distance * 0.707]
            break
          case 'yz':
            newPos = [currentXyz[0], currentXyz[1] + distance * 0.707, currentXyz[2] + distance * 0.707]
            break
          default: {
            const dir = randomUnitVector(rng)
            newPos = [
              currentXyz[0] + dir[0] * distance,
              currentXyz[1] + dir[1] * distance,
              currentXyz[2] + dir[2] * distance
            ]
          }
        }

        // For axis-aligned lines with VP-initialized camera, compute actual position by ray-line intersection
        // This gives BOTH the correct sign AND the correct distance (not just default sceneScale/2)
        if (line.direction && ['x', 'y', 'z'].includes(line.direction) && vpInitializedViewpoints && vpInitializedViewpoints.size >= 1) {
          const rayIntersection = computeRayLineIntersection(otherPoint, currentXyz, line.direction as 'x' | 'y' | 'z', vpInitializedViewpoints)
          if (rayIntersection !== null) {
            newPos = rayIntersection
            if (verbose) {
              log(`[Step 4] Ray intersection: ${otherPoint.name} pos=[${newPos.map(p => p.toFixed(2)).join(',')}]`)
            }
          }
        }

        // Also try to refine position using plane constraints from effective coordinates
        // For points with partial constraints (e.g., X=0 but unknown Y, Z), intersect ray with the constrained plane
        // NOTE: Only apply if we couldn't get a ray-line intersection (to avoid overwriting with different values)
        if (vpInitializedViewpoints && vpInitializedViewpoints.size >= 1) {
          const effective = otherPoint.getEffectiveXyz()
          const constrainedAxes = [0, 1, 2].filter(i => effective[i] !== null)

          // Only use plane intersection if:
          // 1. We have exactly 1 constrained axis (plane case), AND
          // 2. The line direction doesn't already constrain this via ray-line intersection
          const lineAlreadyConstrained = line.direction && ['x', 'y', 'z'].includes(line.direction)
          if (constrainedAxes.length === 1 && !lineAlreadyConstrained) {
            const refinedPos = computeRayPlaneIntersection(otherPoint, effective, vpInitializedViewpoints)
            if (refinedPos !== null) {
              newPos = refinedPos
            }
          }
        }

        otherPoint.optimizedXyz = newPos
        initialized.add(otherPoint)
        queue.push(otherPoint)
      }
    }
  }

  const propagatedCount = initialized.size - startSize

  if (verbose) {
    log(`[Step 4] Propagated ${propagatedCount} points through line graph`)
  }
}

/**
 * Compute 3D position by intersecting camera ray with a constrained plane or line.
 * For a point with X=0, finds where the ray intersects the YZ plane (X=0).
 * For a point with X=0, Y=0, finds where the ray intersects the Z-axis.
 */
function computeRayPlaneIntersection(
  targetPoint: WorldPoint,
  effective: (number | null)[],
  initializedViewpoints: Set<Viewpoint>
): [number, number, number] | null {
  const imagePoints = Array.from(targetPoint.imagePoints) as ImagePoint[]

  for (const ip of imagePoints) {
    const vp = ip.viewpoint as Viewpoint
    if (!initializedViewpoints.has(vp)) continue

    const camPos = vp.position
    if (camPos[0] === 0 && camPos[1] === 0 && camPos[2] === 0) continue

    const ray = computeCameraRay(vp, ip.u, ip.v)
    if (!ray) continue

    // Determine which coordinates are constrained
    const xFixed = effective[0] !== null
    const yFixed = effective[1] !== null
    const zFixed = effective[2] !== null

    let result: [number, number, number] | null = null

    if (xFixed && yFixed && zFixed) {
      // All coordinates known - no need to compute
      result = [effective[0]!, effective[1]!, effective[2]!]
    } else if (xFixed && yFixed) {
      // Intersect ray with line at X=x0, Y=y0
      // Find t where camX + t*rayX = x0 AND camY + t*rayY = y0
      const tX = Math.abs(ray[0]) > 0.001 ? (effective[0]! - camPos[0]) / ray[0] : null
      const tY = Math.abs(ray[1]) > 0.001 ? (effective[1]! - camPos[1]) / ray[1] : null
      const t = tX !== null ? tX : tY
      if (t !== null && t > 0) {
        const z = camPos[2] + t * ray[2]
        result = [effective[0]!, effective[1]!, z]
      }
    } else if (xFixed && zFixed) {
      // Intersect ray with line at X=x0, Z=z0
      const tX = Math.abs(ray[0]) > 0.001 ? (effective[0]! - camPos[0]) / ray[0] : null
      const tZ = Math.abs(ray[2]) > 0.001 ? (effective[2]! - camPos[2]) / ray[2] : null
      const t = tX !== null ? tX : tZ
      if (t !== null && t > 0) {
        const y = camPos[1] + t * ray[1]
        result = [effective[0]!, y, effective[2]!]
      }
    } else if (yFixed && zFixed) {
      // Intersect ray with line at Y=y0, Z=z0
      const tY = Math.abs(ray[1]) > 0.001 ? (effective[1]! - camPos[1]) / ray[1] : null
      const tZ = Math.abs(ray[2]) > 0.001 ? (effective[2]! - camPos[2]) / ray[2] : null
      const t = tY !== null ? tY : tZ
      if (t !== null && t > 0) {
        const x = camPos[0] + t * ray[0]
        result = [x, effective[1]!, effective[2]!]
      }
    } else if (xFixed) {
      // Intersect ray with plane X=x0
      const t = Math.abs(ray[0]) > 0.001 ? (effective[0]! - camPos[0]) / ray[0] : null
      if (t !== null && t > 0) {
        const y = camPos[1] + t * ray[1]
        const z = camPos[2] + t * ray[2]
        result = [effective[0]!, y, z]
      }
    } else if (yFixed) {
      // Intersect ray with plane Y=y0
      const t = Math.abs(ray[1]) > 0.001 ? (effective[1]! - camPos[1]) / ray[1] : null
      if (t !== null && t > 0) {
        const x = camPos[0] + t * ray[0]
        const z = camPos[2] + t * ray[2]
        result = [x, effective[1]!, z]
      }
    } else if (zFixed) {
      // Intersect ray with plane Z=z0
      const t = Math.abs(ray[2]) > 0.001 ? (effective[2]! - camPos[2]) / ray[2] : null
      if (t !== null && t > 0) {
        const x = camPos[0] + t * ray[0]
        const y = camPos[1] + t * ray[1]
        result = [x, y, effective[2]!]
      }
    }

    if (result) {
      return result
    }
  }

  return null
}

/**
 * Compute the actual 3D position of a point by intersecting camera ray with an axis-aligned line.
 * For an X-direction line from startXyz, finds where camera ray intersects the line Y=startY, Z=startZ.
 * Returns the intersection point, or null if can't compute.
 */
function computeRayLineIntersection(
  targetPoint: WorldPoint,
  startXyz: [number, number, number],
  axis: 'x' | 'y' | 'z',
  initializedViewpoints: Set<Viewpoint>
): [number, number, number] | null {
  // Find an image point for the target on an initialized camera
  const imagePoints = Array.from(targetPoint.imagePoints) as ImagePoint[]

  for (const ip of imagePoints) {
    const vp = ip.viewpoint as Viewpoint
    if (!initializedViewpoints.has(vp)) continue

    // Check camera has valid position (not at origin)
    const camPos = vp.position
    if (camPos[0] === 0 && camPos[1] === 0 && camPos[2] === 0) continue

    // Compute ray direction from camera through image point
    const ray = computeCameraRay(vp, ip.u, ip.v)
    if (!ray) continue

    // Intersect ray with the axis-aligned line
    // Ray: P = camPos + t * ray
    // For X-axis line: Y = startXyz[1], Z = startXyz[2]
    // Solve for t where ray intersects this line

    // For an X-direction line, the line is defined by Y = startY, Z = startZ
    // We need to find where the ray passes closest to this line

    // Simplified intersection for axis-aligned lines:
    // For X-line at (*, startY, startZ): solve for t where rayY = startY and rayZ = startZ
    // But this is overdetermined - we use least squares or find the point on the line closest to ray

    // Alternative: find parameter t where ray is closest to the axis line
    // The axis line is: L = startXyz + s * axisDir

    let result: [number, number, number] | null = null

    const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
    const otherIndices = [0, 1, 2].filter(i => i !== axisIdx)
    const tValues: number[] = []
    for (const idx of otherIndices) {
      if (Math.abs(ray[idx]) > 0.001) {
        tValues.push((startXyz[idx] - camPos[idx]) / ray[idx])
      }
    }
    if (tValues.length > 0) {
      const t = tValues.reduce((a, b) => a + b) / tValues.length
      const minT = Math.min(...tValues)
      const maxT = Math.max(...tValues)
      if (t > 0 && (tValues.length === 1 || maxT / Math.abs(minT + 0.001) < 10)) {
        const r: [number, number, number] = [startXyz[0], startXyz[1], startXyz[2]]
        r[axisIdx] = camPos[axisIdx] + t * ray[axisIdx]
        result = r
      }
    }

    if (result) {
      return result
    }
  }

  return null
}

/**
 * Compute camera ray direction for a pixel coordinate
 */
function computeCameraRay(vp: Viewpoint, u: number, v: number): [number, number, number] | null {
  const f = vp.focalLength
  const cx = vp.principalPointX
  const cy = vp.principalPointY

  // Direction in camera frame (right-handed, z forward)
  const dirCam: [number, number, number] = [
    (u - cx) / f,
    (v - cy) / f,
    1
  ]

  // Normalize
  const len = Math.sqrt(dirCam[0] ** 2 + dirCam[1] ** 2 + dirCam[2] ** 2)
  dirCam[0] /= len
  dirCam[1] /= len
  dirCam[2] /= len

  // Rotate to world frame using camera rotation quaternion
  const [qw, qx, qy, qz] = vp.rotation

  // Quaternion rotation: v' = q * v * q^-1
  // For unit quaternions, q^-1 = conjugate = [qw, -qx, -qy, -qz]
  const dirWorld = quaternionRotateVector([qw, qx, qy, qz], dirCam) as [number, number, number]

  return dirWorld
}

