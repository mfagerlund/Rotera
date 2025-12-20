/**
 * Branching Inference Algorithm
 *
 * When a line connects points A and B along an axis (e.g., Y-axis) with length 10:
 * - A and B share the same X and Z coordinates
 * - Their Y coordinates differ by exactly 10
 *
 * But we don't know the sign: is B.Y = A.Y + 10 or A.Y - 10?
 *
 * This algorithm explores all valid coordinate combinations by:
 * 1. Branching at each +/- ambiguity point
 * 2. Propagating each branch through the constraint graph
 * 3. Pruning branches that hit contradictions
 * 4. Returning all surviving combinations
 */

import type { Project } from '../entities/project'
import type { WorldPoint } from '../entities/world-point'
import type { Line, LineDirection } from '../entities/line'

const EPSILON = 0.001

export type Xyz = [number | null, number | null, number | null]

export interface InferenceBranch {
  /** Map from WorldPoint to resolved coordinates */
  coordinates: Map<WorldPoint, Xyz>
  /** Description of choices made */
  choices: string[]
}

interface Ambiguity {
  line: Line
  sourcePoint: WorldPoint
  targetPoint: WorldPoint
  axis: 0 | 1 | 2
  length: number
}

/**
 * Collect locked coordinates as initial state
 */
function collectLockedCoordinates(project: Project): Map<WorldPoint, Xyz> {
  const coords = new Map<WorldPoint, Xyz>()
  for (const wp of project.worldPoints) {
    const point = wp as WorldPoint
    coords.set(point, [...point.lockedXyz] as Xyz)
  }
  return coords
}

/**
 * Try to set a coordinate value. Returns false if contradiction detected.
 */
function trySetCoordinate(
  coords: Map<WorldPoint, Xyz>,
  point: WorldPoint,
  axis: 0 | 1 | 2,
  value: number
): boolean {
  const current = coords.get(point)
  if (!current) return false

  if (current[axis] !== null && Math.abs(current[axis]! - value) > EPSILON) {
    return false // Contradiction!
  }

  current[axis] = value
  return true
}

/**
 * Get axis indices that should be shared between endpoints based on line direction
 */
function getSharedAxes(direction: LineDirection): (0 | 1 | 2)[] {
  switch (direction) {
    case 'x':
      return [1, 2] // X-aligned: share Y and Z
    case 'y':
      return [0, 2] // Y-aligned: share X and Z
    case 'z':
      return [0, 1] // Z-aligned: share X and Y
    case 'xy':
      return [2] // XY plane: share Z
    case 'xz':
      return [1] // XZ plane: share Y
    case 'yz':
      return [0] // YZ plane: share X
    case 'free':
    default:
      return []
  }
}

/**
 * Get the axis along the line direction (where we have length ambiguity)
 */
function getDirectionAxis(direction: LineDirection): (0 | 1 | 2) | null {
  switch (direction) {
    case 'x':
      return 0
    case 'y':
      return 1
    case 'z':
      return 2
    default:
      return null
  }
}

/**
 * Propagate deterministic inferences (shared coordinates only, no sign choices)
 * Returns true if any coordinate was updated, false if stable or contradiction
 */
function propagateDeterministic(
  coords: Map<WorldPoint, Xyz>,
  lines: Set<Line>
): { updated: boolean; contradiction: boolean } {
  let anyUpdated = false
  let contradiction = false

  for (const line of lines) {
    const sharedAxes = getSharedAxes(line.direction)
    const coordsA = coords.get(line.pointA)
    const coordsB = coords.get(line.pointB)
    if (!coordsA || !coordsB) continue

    for (const axis of sharedAxes) {
      // Propagate A -> B
      if (coordsA[axis] !== null && coordsB[axis] === null) {
        if (!trySetCoordinate(coords, line.pointB, axis, coordsA[axis]!)) {
          contradiction = true
          return { updated: false, contradiction: true }
        }
        anyUpdated = true
      }

      // Propagate B -> A
      if (coordsB[axis] !== null && coordsA[axis] === null) {
        if (!trySetCoordinate(coords, line.pointA, axis, coordsB[axis]!)) {
          contradiction = true
          return { updated: false, contradiction: true }
        }
        anyUpdated = true
      }

      // Check for contradiction
      if (
        coordsA[axis] !== null &&
        coordsB[axis] !== null &&
        Math.abs(coordsA[axis]! - coordsB[axis]!) > EPSILON
      ) {
        return { updated: false, contradiction: true }
      }
    }
  }

  return { updated: anyUpdated, contradiction }
}

/**
 * Run deterministic propagation until fixpoint or contradiction
 */
function propagateToFixpoint(
  coords: Map<WorldPoint, Xyz>,
  lines: Set<Line>
): boolean {
  for (let i = 0; i < 100; i++) {
    const result = propagateDeterministic(coords, lines)
    if (result.contradiction) return false
    if (!result.updated) break
  }
  return true
}

/**
 * Find the next ambiguity: an axis-aligned line with known length
 * where we know one endpoint's axis coordinate but not the other's
 */
function findNextAmbiguity(
  coords: Map<WorldPoint, Xyz>,
  lines: Set<Line>
): Ambiguity | null {
  for (const line of lines) {
    const dirAxis = getDirectionAxis(line.direction)
    if (dirAxis === null) continue
    if (line.targetLength === undefined) continue

    const coordsA = coords.get(line.pointA)
    const coordsB = coords.get(line.pointB)
    if (!coordsA || !coordsB) continue

    // Check if A has value but B doesn't
    if (coordsA[dirAxis] !== null && coordsB[dirAxis] === null) {
      return {
        line,
        sourcePoint: line.pointA,
        targetPoint: line.pointB,
        axis: dirAxis,
        length: line.targetLength
      }
    }

    // Check if B has value but A doesn't
    if (coordsB[dirAxis] !== null && coordsA[dirAxis] === null) {
      return {
        line,
        sourcePoint: line.pointB,
        targetPoint: line.pointA,
        axis: dirAxis,
        length: line.targetLength
      }
    }
  }

  return null
}

/**
 * Deep clone a coordinate map
 */
function cloneCoords(coords: Map<WorldPoint, Xyz>): Map<WorldPoint, Xyz> {
  const clone = new Map<WorldPoint, Xyz>()
  for (const [point, xyz] of coords) {
    clone.set(point, [...xyz] as Xyz)
  }
  return clone
}

/**
 * Generate all valid coordinate combinations by exploring +/- ambiguities
 */
export function generateAllInferenceBranches(project: Project): InferenceBranch[] {
  const lines = project.lines as Set<Line>

  // Start with locked coordinates as seeds
  const initialCoords = collectLockedCoordinates(project)

  // Initial deterministic propagation
  if (!propagateToFixpoint(initialCoords, lines)) {
    // Contradiction with just locked values - no valid solutions
    return []
  }

  // Work queue of partial solutions
  interface WorkItem {
    coords: Map<WorldPoint, Xyz>
    choices: string[]
  }

  const queue: WorkItem[] = [{ coords: initialCoords, choices: [] }]
  const complete: InferenceBranch[] = []

  while (queue.length > 0) {
    const item = queue.pop()!
    const { coords, choices } = item

    // Propagate deterministic inferences
    if (!propagateToFixpoint(coords, lines)) {
      continue // Contradiction - prune this branch
    }

    // Find next ambiguity
    const ambiguity = findNextAmbiguity(coords, lines)

    if (!ambiguity) {
      // No more ambiguities - this is a complete solution
      complete.push({ coordinates: coords, choices })
    } else {
      // Branch: try both + and - signs
      const sourceValue = coords.get(ambiguity.sourcePoint)![ambiguity.axis]!
      const axisName = ['X', 'Y', 'Z'][ambiguity.axis]

      // Plus branch
      const plusCoords = cloneCoords(coords)
      const plusValue = sourceValue + ambiguity.length
      if (trySetCoordinate(plusCoords, ambiguity.targetPoint, ambiguity.axis, plusValue)) {
        queue.push({
          coords: plusCoords,
          choices: [...choices, `${ambiguity.targetPoint.name}.${axisName} = ${plusValue.toFixed(2)} (+)`]
        })
      }

      // Minus branch
      const minusCoords = cloneCoords(coords)
      const minusValue = sourceValue - ambiguity.length
      if (trySetCoordinate(minusCoords, ambiguity.targetPoint, ambiguity.axis, minusValue)) {
        queue.push({
          coords: minusCoords,
          choices: [...choices, `${ambiguity.targetPoint.name}.${axisName} = ${minusValue.toFixed(2)} (-)`]
        })
      }
    }
  }

  return complete
}

/**
 * Count the number of ambiguities in a project (before branching)
 */
export function countAmbiguities(project: Project): number {
  const lines = project.lines as Set<Line>
  let count = 0

  for (const line of lines) {
    const dirAxis = getDirectionAxis(line.direction)
    if (dirAxis !== null && line.targetLength !== undefined) {
      count++
    }
  }

  return count
}

/**
 * Get statistics about the branching inference for a project
 */
export interface BranchingStats {
  totalAxisAlignedLinesWithLength: number
  theoreticalMaxBranches: number
  actualValidBranches: number
  branches: InferenceBranch[]
}

export function analyzeBranching(project: Project): BranchingStats {
  const ambiguityCount = countAmbiguities(project)
  const branches = generateAllInferenceBranches(project)

  return {
    totalAxisAlignedLinesWithLength: ambiguityCount,
    theoreticalMaxBranches: Math.pow(2, ambiguityCount),
    actualValidBranches: branches.length,
    branches
  }
}
