import type { WorldPoint } from '../../entities/world-point'
import type { Line } from '../../entities/line'
import type { Viewpoint } from '../../entities/viewpoint'
import type { ImagePoint } from '../../entities/imagePoint'
import { log } from '../optimization-logger'
import { randomUnitVector } from './helpers'

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
  const startSize = initialized.size

  if (initialized.size === 0 && points.length > 0) {
    points[0].optimizedXyz = [0, 0, 0]
    initialized.add(points[0])
  }

  const queue = Array.from(initialized)

  while (queue.length > 0) {
    const currentPoint = queue.shift()!
    if (!currentPoint.optimizedXyz) continue

    for (const line of lines) {
      let otherPoint: WorldPoint | null = null

      if (line.pointA === currentPoint && !initialized.has(line.pointB)) {
        otherPoint = line.pointB
      } else if (line.pointB === currentPoint && !initialized.has(line.pointA)) {
        otherPoint = line.pointA
      }

      if (otherPoint) {
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
            // Free direction - use random unit vector
            const dir = randomUnitVector()
            newPos = [
              currentXyz[0] + dir[0] * distance,
              currentXyz[1] + dir[1] * distance,
              currentXyz[2] + dir[2] * distance
            ]
          }
        }

        // For axis-aligned lines with SINGLE camera (VP initialization), use camera ray to determine correct sign
        // This resolves ambiguity when a point's coordinate could be +/-
        // Only apply for single-camera cases - for multi-camera (Essential Matrix), poses are approximate
        // and the solver should determine the correct sign during bundle adjustment
        if (line.direction && ['x', 'y', 'z'].includes(line.direction) && vpInitializedViewpoints && vpInitializedViewpoints.size === 1) {
          const raySign = determineSignFromCameraRay(otherPoint, currentXyz, line.direction as 'x' | 'y' | 'z', distance, vpInitializedViewpoints)
          if (raySign !== null) {
            switch (line.direction) {
              case 'x':
                newPos = [currentXyz[0] + raySign * Math.abs(distance), currentXyz[1], currentXyz[2]]
                break
              case 'y':
                newPos = [currentXyz[0], currentXyz[1] + raySign * Math.abs(distance), currentXyz[2]]
                break
              case 'z':
                newPos = [currentXyz[0], currentXyz[1], currentXyz[2] + raySign * Math.abs(distance)]
                break
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
 * Use camera ray to determine the correct sign for an axis-aligned propagation.
 * Returns +1 or -1 for the direction, or null if we can't determine.
 */
function determineSignFromCameraRay(
  targetPoint: WorldPoint,
  startXyz: [number, number, number],
  axis: 'x' | 'y' | 'z',
  distance: number,
  initializedViewpoints: Set<Viewpoint>
): number | null {
  // Find an image point for the target on an initialized camera
  const imagePoints = Array.from(targetPoint.imagePoints) as ImagePoint[]

  for (const ip of imagePoints) {
    const vp = ip.viewpoint as Viewpoint
    if (!initializedViewpoints.has(vp)) continue

    // Check camera has valid position (not at origin)
    if (vp.position[0] === 0 && vp.position[1] === 0 && vp.position[2] === 0) continue

    // Compute ray from camera through image point
    const ray = computeCameraRay(vp, ip.u, ip.v)
    if (!ray) continue

    // Find where ray intersects the axis line from startXyz
    // The axis line is startXyz + t * axisDir where axisDir is unit vector in x, y, or z
    const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2

    // Parametric ray: camPos + s * rayDir
    // We want to find s where the ray comes closest to the axis line
    // For axis-aligned lines, this simplifies to finding where the other two coords match

    // Use ray to determine if point is in + or - direction from startXyz
    // Project both candidate positions onto the ray and see which is closer
    const posPlus: [number, number, number] = [...startXyz]
    const posMinus: [number, number, number] = [...startXyz]
    posPlus[axisIndex] += Math.abs(distance)
    posMinus[axisIndex] -= Math.abs(distance)

    // Compute reprojection error for each candidate
    const errorPlus = computeReprojectionError(vp, posPlus, ip.u, ip.v)
    const errorMinus = computeReprojectionError(vp, posMinus, ip.u, ip.v)

    // If one is significantly better than the other, use it
    if (errorPlus < errorMinus * 0.8) {
      return 1
    } else if (errorMinus < errorPlus * 0.8) {
      return -1
    }
    // If they're similar, try next camera
  }

  return null // Couldn't determine
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
  const dirWorld = rotateVectorByQuaternion(dirCam, [qw, qx, qy, qz])

  return dirWorld
}

/**
 * Rotate a vector by a quaternion
 */
function rotateVectorByQuaternion(
  v: [number, number, number],
  q: [number, number, number, number]
): [number, number, number] {
  const [qw, qx, qy, qz] = q
  const [vx, vy, vz] = v

  // v' = q * v * q^-1
  // Using the formula: v' = v + 2*w*(cross(q_xyz, v)) + 2*(cross(q_xyz, cross(q_xyz, v)))
  const cx = qy * vz - qz * vy
  const cy = qz * vx - qx * vz
  const cz = qx * vy - qy * vx

  const cx2 = qy * cz - qz * cy
  const cy2 = qz * cx - qx * cz
  const cz2 = qx * cy - qy * cx

  return [
    vx + 2 * (qw * cx + cx2),
    vy + 2 * (qw * cy + cy2),
    vz + 2 * (qw * cz + cz2)
  ]
}

/**
 * Compute reprojection error for a 3D point
 */
function computeReprojectionError(
  vp: Viewpoint,
  worldPos: [number, number, number],
  targetU: number,
  targetV: number
): number {
  const f = vp.focalLength
  const cx = vp.principalPointX
  const cy = vp.principalPointY
  const [qw, qx, qy, qz] = vp.rotation
  const camPos = vp.position

  // Transform world point to camera frame
  // P_cam = R^T * (P_world - cam_pos)
  const dx = worldPos[0] - camPos[0]
  const dy = worldPos[1] - camPos[1]
  const dz = worldPos[2] - camPos[2]

  // Rotate by inverse quaternion (conjugate for unit quaternion)
  const pCam = rotateVectorByQuaternion([dx, dy, dz], [qw, -qx, -qy, -qz])

  // Project to image plane
  if (pCam[2] <= 0) {
    return Infinity // Point behind camera
  }

  const projU = cx + f * pCam[0] / pCam[2]
  const projV = cy + f * pCam[1] / pCam[2]

  // Compute error
  const errU = projU - targetU
  const errV = projV - targetV

  return Math.sqrt(errU * errU + errV * errV)
}
