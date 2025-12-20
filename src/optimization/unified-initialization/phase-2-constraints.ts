import type { WorldPoint } from '../../entities/world-point'
import type { Line } from '../../entities/line'
import { log } from '../optimization-logger'

/**
 * Phase 2: Infer point positions from geometric constraints (target length + direction)
 * Iteratively propagates known positions along constrained lines
 */
export function step2_inferFromConstraints(
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
