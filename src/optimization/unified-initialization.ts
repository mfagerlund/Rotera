import type { WorldPoint } from '../entities/world-point'
import type { Line } from '../entities/line'
import type { Constraint } from '../entities/constraints'
import type { Viewpoint } from '../entities/viewpoint'
import { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint'
import { triangulateRayRay } from './triangulation'
import type { ImagePoint } from '../entities/imagePoint'
import * as vec3 from '../utils/vec3'
import { log } from './optimization-logger'

export interface InitializationOptions {
  sceneScale?: number
  verbose?: boolean
  initializedViewpoints?: Set<Viewpoint>
  /** Cameras initialized via Vanishing Points (accurate poses for ray-based sign determination) */
  vpInitializedViewpoints?: Set<Viewpoint>
  /** If true, don't pre-set locked points to their target positions (for Essential Matrix free solve) */
  skipLockedPoints?: boolean
}

export function initializeWorldPoints(
  points: WorldPoint[],
  lines: Line[],
  constraints: Constraint[],
  options: InitializationOptions = {}
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

function step1_setLockedPoints(
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

function step2_inferFromConstraints(
  points: WorldPoint[],
  lines: Line[],
  initialized: Set<WorldPoint>,
  sceneScale: number,
  verbose: boolean
): void {
  let inferredCount = 0
  const maxIterations = 10

  for (let iter = 0; iter < maxIterations; iter++) {
    let madeProgress = false

    for (const line of lines) {
      const hasTargetLength = line.targetLength !== undefined
      const hasDirection = line.direction && line.direction !== 'free'

      if (!hasTargetLength || !hasDirection) {
        continue
      }

      const aInitialized = initialized.has(line.pointA)
      const bInitialized = initialized.has(line.pointB)

      if (aInitialized && !bInitialized) {
        const inferred = inferPointPosition(
          line.pointA,
          line.pointB,
          line.targetLength!,
          line.direction,
          sceneScale
        )
        if (inferred && verbose) {
          log(`  Inferred ${line.pointB.name} = [${line.pointB.optimizedXyz!.map(x => x.toFixed(3)).join(', ')}] from ${line.pointA.name}=[${line.pointA.optimizedXyz!.map(x => x.toFixed(3)).join(', ')}] via ${line.direction} line (length=${line.targetLength})`)
        }
        if (inferred) {
          initialized.add(line.pointB)
          inferredCount++
          madeProgress = true
        }
      } else if (bInitialized && !aInitialized) {
        const inferred = inferPointPosition(
          line.pointB,
          line.pointA,
          line.targetLength!,
          line.direction,
          sceneScale
        )
        if (inferred && verbose) {
          log(`  Inferred ${line.pointA.name} = [${line.pointA.optimizedXyz!.map(x => x.toFixed(3)).join(', ')}] from ${line.pointB.name}=[${line.pointB.optimizedXyz!.map(x => x.toFixed(3)).join(', ')}] via ${line.direction} line (length=${line.targetLength})`)
        }
        if (inferred) {
          initialized.add(line.pointA)
          inferredCount++
          madeProgress = true
        }
      }
    }

    if (!madeProgress) {
      break
    }
  }

  if (verbose) {
    log(`[Step 2] Inferred ${inferredCount} points from constraints`)
  }
}

function inferPointPosition(
  knownPoint: WorldPoint,
  unknownPoint: WorldPoint,
  targetLength: number,
  direction: string,
  sceneScale: number
): boolean {
  if (!knownPoint.optimizedXyz) {
    return false
  }

  const [x0, y0, z0] = knownPoint.optimizedXyz
  let position: [number, number, number] | null = null

  switch (direction) {
    case 'x':
      position = [x0 + targetLength, y0, z0]
      break

    case 'y':
      position = [x0, y0 + targetLength, z0]
      break

    case 'z':
      position = [x0, y0, z0 + targetLength]
      break

    case 'xy':
      // In XY plane - arbitrary direction, use 45 degrees
      position = [x0 + targetLength * 0.707, y0 + targetLength * 0.707, z0]
      break

    case 'xz':
      // In XZ plane (horizontal) - arbitrary direction, use 45 degrees
      position = [x0 + targetLength * 0.707, y0, z0 + targetLength * 0.707]
      break

    case 'yz':
      // In YZ plane - arbitrary direction, use 45 degrees
      position = [x0, y0 + targetLength * 0.707, z0 + targetLength * 0.707]
      break

    default:
      return false
  }

  if (position) {
    unknownPoint.optimizedXyz = position
    return true
  }

  return false
}

function step3_triangulateFromImages(
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

function step4_propagateThroughLineGraph(
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

function step5_coplanarGroups(
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

function step6_randomFallback(
  points: WorldPoint[],
  initialized: Set<WorldPoint>,
  sceneScale: number,
  verbose: boolean
): void {
  let randomCount = 0

  for (const point of points) {
    if (!initialized.has(point)) {
      point.optimizedXyz = [
        (Math.random() - 0.5) * sceneScale,
        (Math.random() - 0.5) * sceneScale,
        (Math.random() - 0.5) * sceneScale
      ]
      initialized.add(point)
      randomCount++
    }
  }

  if (verbose) {
    log(`[Step 6] Random fallback for ${randomCount} points`)
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
