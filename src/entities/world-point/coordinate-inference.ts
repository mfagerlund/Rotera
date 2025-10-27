import type { WorldPoint } from './WorldPoint'
import type { Line, LineDirection } from '../line'

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
  const { pointA, pointB, direction, targetLength } = line
  const conflicts: InferenceConflict[] = []
  let pointsUpdated = 0

  if (direction === 'vertical') {
    const resultA = inferAxisFromOther(pointA, pointB, 0, `vertical line ${line.name}`)
    const resultB = inferAxisFromOther(pointB, pointA, 0, `vertical line ${line.name}`)
    pointsUpdated += resultA.pointsUpdated + resultB.pointsUpdated
    conflicts.push(...resultA.conflicts, ...resultB.conflicts)

    const resultAZ = inferAxisFromOther(pointA, pointB, 2, `vertical line ${line.name}`)
    const resultBZ = inferAxisFromOther(pointB, pointA, 2, `vertical line ${line.name}`)
    pointsUpdated += resultAZ.pointsUpdated + resultBZ.pointsUpdated
    conflicts.push(...resultAZ.conflicts, ...resultBZ.conflicts)

    if (targetLength !== undefined) {
      const resultDist = inferFromVerticalDistance(pointA, pointB, targetLength, line.name)
      pointsUpdated += resultDist.pointsUpdated
      conflicts.push(...resultDist.conflicts)
    }
  } else if (direction === 'horizontal') {
    const resultA = inferAxisFromOther(pointA, pointB, 1, `horizontal line ${line.name}`)
    const resultB = inferAxisFromOther(pointB, pointA, 1, `horizontal line ${line.name}`)
    pointsUpdated += resultA.pointsUpdated + resultB.pointsUpdated
    conflicts.push(...resultA.conflicts, ...resultB.conflicts)
  } else if (direction === 'x-aligned') {
    const resultA = inferAxisFromOther(pointA, pointB, 1, `x-aligned line ${line.name}`)
    const resultB = inferAxisFromOther(pointB, pointA, 1, `x-aligned line ${line.name}`)
    pointsUpdated += resultA.pointsUpdated + resultB.pointsUpdated
    conflicts.push(...resultA.conflicts, ...resultB.conflicts)

    const resultAZ = inferAxisFromOther(pointA, pointB, 2, `x-aligned line ${line.name}`)
    const resultBZ = inferAxisFromOther(pointB, pointA, 2, `x-aligned line ${line.name}`)
    pointsUpdated += resultAZ.pointsUpdated + resultBZ.pointsUpdated
    conflicts.push(...resultAZ.conflicts, ...resultBZ.conflicts)

    if (targetLength !== undefined) {
      const resultDist = inferFromXAlignedDistance(pointA, pointB, targetLength, line.name)
      pointsUpdated += resultDist.pointsUpdated
      conflicts.push(...resultDist.conflicts)
    }
  } else if (direction === 'z-aligned') {
    const resultA = inferAxisFromOther(pointA, pointB, 0, `z-aligned line ${line.name}`)
    const resultB = inferAxisFromOther(pointB, pointA, 0, `z-aligned line ${line.name}`)
    pointsUpdated += resultA.pointsUpdated + resultB.pointsUpdated
    conflicts.push(...resultA.conflicts, ...resultB.conflicts)

    const resultAY = inferAxisFromOther(pointA, pointB, 1, `z-aligned line ${line.name}`)
    const resultBY = inferAxisFromOther(pointB, pointA, 1, `z-aligned line ${line.name}`)
    pointsUpdated += resultAY.pointsUpdated + resultBY.pointsUpdated
    conflicts.push(...resultAY.conflicts, ...resultBY.conflicts)

    if (targetLength !== undefined) {
      const resultDist = inferFromZAlignedDistance(pointA, pointB, targetLength, line.name)
      pointsUpdated += resultDist.pointsUpdated
      conflicts.push(...resultDist.conflicts)
    }
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

function inferFromVerticalDistance(
  pointA: WorldPoint,
  pointB: WorldPoint,
  targetLength: number,
  lineName: string
): { pointsUpdated: number; conflicts: InferenceConflict[] } {
  const conflicts: InferenceConflict[] = []
  let pointsUpdated = 0

  const effectiveA = pointA.getEffectiveXyz()
  const effectiveB = pointB.getEffectiveXyz()

  if (effectiveA[1] !== null && effectiveB[1] === null && pointB.lockedXyz[1] === null) {
    const inferredY = effectiveA[1] + targetLength
    if (pointB.inferredXyz[1] !== null && Math.abs(pointB.inferredXyz[1] - inferredY) > EPSILON) {
      conflicts.push({
        point: pointB,
        axis: 1,
        existingValue: pointB.inferredXyz[1]!,
        newValue: inferredY,
        source: `vertical line ${lineName} with length ${targetLength}`
      })
    } else if (pointB.inferredXyz[1] === null) {
      pointB.inferredXyz[1] = inferredY
      pointsUpdated++
    }
  }

  if (effectiveB[1] !== null && effectiveA[1] === null && pointA.lockedXyz[1] === null) {
    const inferredY = effectiveB[1] - targetLength
    if (pointA.inferredXyz[1] !== null && Math.abs(pointA.inferredXyz[1] - inferredY) > EPSILON) {
      conflicts.push({
        point: pointA,
        axis: 1,
        existingValue: pointA.inferredXyz[1]!,
        newValue: inferredY,
        source: `vertical line ${lineName} with length ${targetLength}`
      })
    } else if (pointA.inferredXyz[1] === null) {
      pointA.inferredXyz[1] = inferredY
      pointsUpdated++
    }
  }

  return { pointsUpdated, conflicts }
}

function inferFromXAlignedDistance(
  pointA: WorldPoint,
  pointB: WorldPoint,
  targetLength: number,
  lineName: string
): { pointsUpdated: number; conflicts: InferenceConflict[] } {
  const conflicts: InferenceConflict[] = []
  let pointsUpdated = 0

  const effectiveA = pointA.getEffectiveXyz()
  const effectiveB = pointB.getEffectiveXyz()

  if (effectiveA[0] !== null && effectiveB[0] === null && pointB.lockedXyz[0] === null) {
    const inferredX = effectiveA[0] + targetLength
    if (pointB.inferredXyz[0] !== null && Math.abs(pointB.inferredXyz[0] - inferredX) > EPSILON) {
      conflicts.push({
        point: pointB,
        axis: 0,
        existingValue: pointB.inferredXyz[0]!,
        newValue: inferredX,
        source: `x-aligned line ${lineName} with length ${targetLength}`
      })
    } else if (pointB.inferredXyz[0] === null) {
      pointB.inferredXyz[0] = inferredX
      pointsUpdated++
    }
  }

  if (effectiveB[0] !== null && effectiveA[0] === null && pointA.lockedXyz[0] === null) {
    const inferredX = effectiveB[0] - targetLength
    if (pointA.inferredXyz[0] !== null && Math.abs(pointA.inferredXyz[0] - inferredX) > EPSILON) {
      conflicts.push({
        point: pointA,
        axis: 0,
        existingValue: pointA.inferredXyz[0]!,
        newValue: inferredX,
        source: `x-aligned line ${lineName} with length ${targetLength}`
      })
    } else if (pointA.inferredXyz[0] === null) {
      pointA.inferredXyz[0] = inferredX
      pointsUpdated++
    }
  }

  return { pointsUpdated, conflicts }
}

function inferFromZAlignedDistance(
  pointA: WorldPoint,
  pointB: WorldPoint,
  targetLength: number,
  lineName: string
): { pointsUpdated: number; conflicts: InferenceConflict[] } {
  const conflicts: InferenceConflict[] = []
  let pointsUpdated = 0

  const effectiveA = pointA.getEffectiveXyz()
  const effectiveB = pointB.getEffectiveXyz()

  if (effectiveA[2] !== null && effectiveB[2] === null && pointB.lockedXyz[2] === null) {
    const inferredZ = effectiveA[2] + targetLength
    if (pointB.inferredXyz[2] !== null && Math.abs(pointB.inferredXyz[2] - inferredZ) > EPSILON) {
      conflicts.push({
        point: pointB,
        axis: 2,
        existingValue: pointB.inferredXyz[2]!,
        newValue: inferredZ,
        source: `z-aligned line ${lineName} with length ${targetLength}`
      })
    } else if (pointB.inferredXyz[2] === null) {
      pointB.inferredXyz[2] = inferredZ
      pointsUpdated++
    }
  }

  if (effectiveB[2] !== null && effectiveA[2] === null && pointA.lockedXyz[2] === null) {
    const inferredZ = effectiveB[2] - targetLength
    if (pointA.inferredXyz[2] !== null && Math.abs(pointA.inferredXyz[2] - inferredZ) > EPSILON) {
      conflicts.push({
        point: pointA,
        axis: 2,
        existingValue: pointA.inferredXyz[2]!,
        newValue: inferredZ,
        source: `z-aligned line ${lineName} with length ${targetLength}`
      })
    } else if (pointA.inferredXyz[2] === null) {
      pointA.inferredXyz[2] = inferredZ
      pointsUpdated++
    }
  }

  return { pointsUpdated, conflicts }
}
