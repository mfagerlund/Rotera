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

  if (direction === 'vertical') {
    // Vertical line: X and Z are shared between endpoints
    // Note: We do NOT infer Y from distance because distance is unsigned (+/- are both valid)
    const resultA = inferAxisFromOther(pointA, pointB, 0, `vertical line ${line.name}`)
    const resultB = inferAxisFromOther(pointB, pointA, 0, `vertical line ${line.name}`)
    pointsUpdated += resultA.pointsUpdated + resultB.pointsUpdated
    conflicts.push(...resultA.conflicts, ...resultB.conflicts)

    const resultAZ = inferAxisFromOther(pointA, pointB, 2, `vertical line ${line.name}`)
    const resultBZ = inferAxisFromOther(pointB, pointA, 2, `vertical line ${line.name}`)
    pointsUpdated += resultAZ.pointsUpdated + resultBZ.pointsUpdated
    conflicts.push(...resultAZ.conflicts, ...resultBZ.conflicts)
  } else if (direction === 'horizontal') {
    const resultA = inferAxisFromOther(pointA, pointB, 1, `horizontal line ${line.name}`)
    const resultB = inferAxisFromOther(pointB, pointA, 1, `horizontal line ${line.name}`)
    pointsUpdated += resultA.pointsUpdated + resultB.pointsUpdated
    conflicts.push(...resultA.conflicts, ...resultB.conflicts)
  } else if (direction === 'x-aligned') {
    // X-aligned line: Y and Z are shared between endpoints
    // Note: We do NOT infer X from distance because distance is unsigned (+/- are both valid)
    const resultA = inferAxisFromOther(pointA, pointB, 1, `x-aligned line ${line.name}`)
    const resultB = inferAxisFromOther(pointB, pointA, 1, `x-aligned line ${line.name}`)
    pointsUpdated += resultA.pointsUpdated + resultB.pointsUpdated
    conflicts.push(...resultA.conflicts, ...resultB.conflicts)

    const resultAZ = inferAxisFromOther(pointA, pointB, 2, `x-aligned line ${line.name}`)
    const resultBZ = inferAxisFromOther(pointB, pointA, 2, `x-aligned line ${line.name}`)
    pointsUpdated += resultAZ.pointsUpdated + resultBZ.pointsUpdated
    conflicts.push(...resultAZ.conflicts, ...resultBZ.conflicts)
  } else if (direction === 'z-aligned') {
    // Z-aligned line: X and Y are shared between endpoints
    // Note: We do NOT infer Z from distance because distance is unsigned (+/- are both valid)
    const resultA = inferAxisFromOther(pointA, pointB, 0, `z-aligned line ${line.name}`)
    const resultB = inferAxisFromOther(pointB, pointA, 0, `z-aligned line ${line.name}`)
    pointsUpdated += resultA.pointsUpdated + resultB.pointsUpdated
    conflicts.push(...resultA.conflicts, ...resultB.conflicts)

    const resultAY = inferAxisFromOther(pointA, pointB, 1, `z-aligned line ${line.name}`)
    const resultBY = inferAxisFromOther(pointB, pointA, 1, `z-aligned line ${line.name}`)
    pointsUpdated += resultAY.pointsUpdated + resultBY.pointsUpdated
    conflicts.push(...resultAY.conflicts, ...resultBY.conflicts)
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
