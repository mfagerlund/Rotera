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
  /** If true, don't pre-set locked points to their target positions (for Essential Matrix free solve) */
  skipLockedPoints?: boolean
}

export function initializeWorldPoints(
  points: WorldPoint[],
  lines: Line[],
  constraints: Constraint[],
  options: InitializationOptions = {}
): void {
  const { sceneScale = 10.0, verbose = false, initializedViewpoints, skipLockedPoints = false } = options

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

  step4_propagateThroughLineGraph(points, lines, initialized, sceneScale, verbose)

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
    } else if (point.optimizedXyz !== undefined) {
      // Point already has optimizedXyz set (e.g., from inferred coordinates)
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
  initializedViewpoints?: Set<Viewpoint>
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
  verbose: boolean
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
        if (line.direction && line.direction !== 'free') {
          continue
        }

        const distance = line.targetLength ?? sceneScale * 0.2

        const direction = randomUnitVector()
        const currentXyz = currentPoint.optimizedXyz!

        otherPoint.optimizedXyz = [
          currentXyz[0] + direction[0] * distance,
          currentXyz[1] + direction[1] * distance,
          currentXyz[2] + direction[2] * distance
        ]

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
