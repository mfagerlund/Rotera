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

  // NEW: Infer coordinate along the line direction using targetLength
  // This enables single-point scale establishment: if one endpoint is fully known
  // and the line has a targetLength, we can infer the unknown endpoint's position
  // along the line direction.
  // Direction is from pointA to pointB (positive), so:
  // - When inferring pointB from pointA: add targetLength
  // - When inferring pointA from pointB: subtract targetLength
  if (line.targetLength !== undefined && line.targetLength > 0) {
    const axisIndex = getAxisIndex(direction)
    if (axisIndex !== null) {
      // Try to infer pointB from pointA (positive direction)
      const resultB = inferAlongLineDirection(line, pointA, pointB, axisIndex, line.targetLength, `${direction}-line ${line.name} targetLength`)
      pointsUpdated += resultB.pointsUpdated
      conflicts.push(...resultB.conflicts)

      // Try to infer pointA from pointB (negative direction)
      const resultA = inferAlongLineDirection(line, pointB, pointA, axisIndex, line.targetLength, `${direction}-line ${line.name} targetLength`)
      pointsUpdated += resultA.pointsUpdated
      conflicts.push(...resultA.conflicts)
    }
  }

  return { pointsUpdated, conflicts }
}

/**
 * Get the axis index for a single-axis direction (x=0, y=1, z=2), or null for plane/free directions
 */
function getAxisIndex(direction: string | undefined): number | null {
  switch (direction) {
    case 'x': return 0
    case 'y': return 1
    case 'z': return 2
    default: return null
  }
}

/**
 * Infer the coordinate along the line direction using targetLength.
 *
 * This is a VERY conservative inference that only applies when:
 * - Source point is FULLY LOCKED (not just inferred) - this establishes the coordinate system
 * - Target point has the 2 perpendicular coords known, but NOT the direction coord
 * - The source point is at the origin (0,0,0) - this ensures we're inferring scale from origin
 * - The target point is visible in exactly 1 camera - this is a proxy for "single camera setup"
 *
 * The restriction to single-camera scenarios prevents incorrect inferences in multi-camera
 * setups where Essential Matrix handles scale differently.
 *
 * Direction is from pointA to pointB (positive). When source is pointA, we add the length.
 * When source is pointB, we subtract the length.
 */
function inferAlongLineDirection(
  line: Line,
  source: WorldPoint,
  target: WorldPoint,
  axisIndex: number,
  targetLength: number,
  constraintName: string
): { pointsUpdated: number; conflicts: InferenceConflict[] } {
  const conflicts: InferenceConflict[] = []

  // Target must not have the direction axis locked or already inferred
  if (target.lockedXyz[axisIndex] !== null || target.inferredXyz[axisIndex] !== null) {
    return { pointsUpdated: 0, conflicts }
  }

  // CONSERVATIVE: Source must be FULLY LOCKED (not just inferred)
  // This ensures we're only inferring from a definitive coordinate system anchor
  if (!source.isFullyLocked()) {
    return { pointsUpdated: 0, conflicts }
  }

  // CONSERVATIVE: Source must be at origin
  // This restricts inference to scale establishment from a known origin point
  const sourceXyz = source.lockedXyz
  if (sourceXyz[0] !== 0 || sourceXyz[1] !== 0 || sourceXyz[2] !== 0) {
    return { pointsUpdated: 0, conflicts }
  }

  // CONSERVATIVE: BOTH source and target must be visible in exactly 1 camera
  // AND it must be the SAME camera (single-camera project)
  // Multi-camera setups use Essential Matrix which handles scale differently
  if (source.imagePoints.size !== 1 || target.imagePoints.size !== 1) {
    return { pointsUpdated: 0, conflicts }
  }

  // Check both points are visible in the SAME camera
  const sourceImagePoint = Array.from(source.imagePoints)[0]
  const targetImagePoint = Array.from(target.imagePoints)[0]
  if (sourceImagePoint.viewpoint !== targetImagePoint.viewpoint) {
    return { pointsUpdated: 0, conflicts }
  }

  // CONSERVATIVE: Check if this is truly a single-camera project
  // by verifying the viewpoint has no other cameras visible
  // (i.e., the viewpoint's imagePoints all belong to points with size 1)
  const theViewpoint = sourceImagePoint.viewpoint
  const allPointsInViewpoint = Array.from(theViewpoint.imagePoints).map(ip => ip.worldPoint)
  const isMultiCameraProject = allPointsInViewpoint.some(wp => wp.imagePoints.size > 1)
  if (isMultiCameraProject) {
    return { pointsUpdated: 0, conflicts }
  }

  // Source must have the direction axis known (always true for fully locked)
  const sourceAxisValue = sourceXyz[axisIndex]!

  // Target must have the perpendicular axes known (from the regular inference pass)
  // For axis-aligned lines, the perpendicular coords should already be inferred
  const otherAxes = [0, 1, 2].filter(i => i !== axisIndex)
  for (const otherAxis of otherAxes) {
    const targetOtherValue = target.lockedXyz[otherAxis] ?? target.inferredXyz[otherAxis]
    if (targetOtherValue === null) {
      // Perpendicular axis not yet known, can't infer
      return { pointsUpdated: 0, conflicts }
    }
  }

  // All conditions met: infer the coordinate along the direction
  // Direction is from pointA to pointB (positive)
  // If source is pointA, we're inferring pointB: add targetLength
  // If source is pointB, we're inferring pointA: subtract targetLength
  const sign = source === line.pointA ? 1 : -1
  const inferredValue = sourceAxisValue + sign * targetLength

  target.inferredXyz[axisIndex] = inferredValue
  return { pointsUpdated: 1, conflicts }
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
