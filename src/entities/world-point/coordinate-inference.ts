import type { WorldPoint } from './WorldPoint'
import type { Line } from '../line'

const EPSILON = 0.001
const MAX_ITERATIONS = 10

export interface InferenceConflict {
  point: WorldPoint
  axis: number
  existingValue: number
  newValue: number
  source: string
}

export interface InferenceResult {
  conflicts: InferenceConflict[]
  iterations: number
  pointsUpdated: number
}

export function propagateCoordinateInferences(
  points: Set<WorldPoint>,
  lines: Set<Line>
): InferenceResult {
  const conflicts: InferenceConflict[] = []
  let totalPointsUpdated = 0

  for (const point of points) {
    point.inferredXyz = [...point.lockedXyz]
  }

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let pointsUpdatedThisIteration = 0

    for (const line of lines) {
      const result = inferFromLine(line)
      pointsUpdatedThisIteration += result.pointsUpdated
      conflicts.push(...result.conflicts)
    }

    totalPointsUpdated += pointsUpdatedThisIteration

    if (pointsUpdatedThisIteration === 0) {
      return { conflicts, iterations: iteration + 1, pointsUpdated: totalPointsUpdated }
    }
  }

  return { conflicts, iterations: MAX_ITERATIONS, pointsUpdated: totalPointsUpdated }
}

function inferFromLine(line: Line): { pointsUpdated: number; conflicts: InferenceConflict[] } {
  const { pointA, pointB, direction } = line
  const conflicts: InferenceConflict[] = []
  let pointsUpdated = 0

  // Axis-aligned lines: share the 2 perpendicular axes
  // Plane-constrained lines: share only the normal axis

  switch (direction) {
    case 'x': {
      // X-aligned: Y and Z are shared between endpoints
      const resultAY = inferAxisFromOther(pointA, pointB, 1, `x-aligned line ${line.name}`)
      const resultBY = inferAxisFromOther(pointB, pointA, 1, `x-aligned line ${line.name}`)
      pointsUpdated += resultAY.pointsUpdated + resultBY.pointsUpdated
      conflicts.push(...resultAY.conflicts, ...resultBY.conflicts)

      const resultAZ = inferAxisFromOther(pointA, pointB, 2, `x-aligned line ${line.name}`)
      const resultBZ = inferAxisFromOther(pointB, pointA, 2, `x-aligned line ${line.name}`)
      pointsUpdated += resultAZ.pointsUpdated + resultBZ.pointsUpdated
      conflicts.push(...resultAZ.conflicts, ...resultBZ.conflicts)
      break
    }

    case 'y': {
      // Y-aligned (vertical): X and Z are shared between endpoints
      const resultAX = inferAxisFromOther(pointA, pointB, 0, `y-aligned line ${line.name}`)
      const resultBX = inferAxisFromOther(pointB, pointA, 0, `y-aligned line ${line.name}`)
      pointsUpdated += resultAX.pointsUpdated + resultBX.pointsUpdated
      conflicts.push(...resultAX.conflicts, ...resultBX.conflicts)

      const resultAZ = inferAxisFromOther(pointA, pointB, 2, `y-aligned line ${line.name}`)
      const resultBZ = inferAxisFromOther(pointB, pointA, 2, `y-aligned line ${line.name}`)
      pointsUpdated += resultAZ.pointsUpdated + resultBZ.pointsUpdated
      conflicts.push(...resultAZ.conflicts, ...resultBZ.conflicts)
      break
    }

    case 'z': {
      // Z-aligned: X and Y are shared between endpoints
      const resultAX = inferAxisFromOther(pointA, pointB, 0, `z-aligned line ${line.name}`)
      const resultBX = inferAxisFromOther(pointB, pointA, 0, `z-aligned line ${line.name}`)
      pointsUpdated += resultAX.pointsUpdated + resultBX.pointsUpdated
      conflicts.push(...resultAX.conflicts, ...resultBX.conflicts)

      const resultAY = inferAxisFromOther(pointA, pointB, 1, `z-aligned line ${line.name}`)
      const resultBY = inferAxisFromOther(pointB, pointA, 1, `z-aligned line ${line.name}`)
      pointsUpdated += resultAY.pointsUpdated + resultBY.pointsUpdated
      conflicts.push(...resultAY.conflicts, ...resultBY.conflicts)
      break
    }

    case 'xy': {
      // XY plane: Z is shared between endpoints
      const resultAZ = inferAxisFromOther(pointA, pointB, 2, `xy-plane line ${line.name}`)
      const resultBZ = inferAxisFromOther(pointB, pointA, 2, `xy-plane line ${line.name}`)
      pointsUpdated += resultAZ.pointsUpdated + resultBZ.pointsUpdated
      conflicts.push(...resultAZ.conflicts, ...resultBZ.conflicts)
      break
    }

    case 'xz': {
      // XZ plane (horizontal): Y is shared between endpoints
      const resultAY = inferAxisFromOther(pointA, pointB, 1, `xz-plane line ${line.name}`)
      const resultBY = inferAxisFromOther(pointB, pointA, 1, `xz-plane line ${line.name}`)
      pointsUpdated += resultAY.pointsUpdated + resultBY.pointsUpdated
      conflicts.push(...resultAY.conflicts, ...resultBY.conflicts)
      break
    }

    case 'yz': {
      // YZ plane: X is shared between endpoints
      const resultAX = inferAxisFromOther(pointA, pointB, 0, `yz-plane line ${line.name}`)
      const resultBX = inferAxisFromOther(pointB, pointA, 0, `yz-plane line ${line.name}`)
      pointsUpdated += resultAX.pointsUpdated + resultBX.pointsUpdated
      conflicts.push(...resultAX.conflicts, ...resultBX.conflicts)
      break
    }

    case 'free':
    default:
      // No inference for free lines
      break
  }

  return { pointsUpdated, conflicts }
}

function inferAxisFromOther(
  target: WorldPoint,
  source: WorldPoint,
  axis: number,
  constraintName: string
): { pointsUpdated: number; conflicts: InferenceConflict[] } {
  const conflicts: InferenceConflict[] = []

  if (target.lockedXyz[axis] !== null) {
    return { pointsUpdated: 0, conflicts }
  }

  const effectiveSource = source.lockedXyz[axis] ?? source.inferredXyz[axis]
  if (effectiveSource === null) {
    return { pointsUpdated: 0, conflicts }
  }

  if (target.inferredXyz[axis] !== null) {
    if (Math.abs(target.inferredXyz[axis]! - effectiveSource) > EPSILON) {
      conflicts.push({
        point: target,
        axis,
        existingValue: target.inferredXyz[axis]!,
        newValue: effectiveSource,
        source: constraintName
      })
    }
    return { pointsUpdated: 0, conflicts }
  }

  target.inferredXyz[axis] = effectiveSource
  return { pointsUpdated: 1, conflicts }
}
