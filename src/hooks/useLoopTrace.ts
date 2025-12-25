// Loop Trace Tool Logic Hook

import { useCallback, useMemo } from 'react'
import { Line, LineDirection } from '../entities/line'
import { WorldPoint } from '../entities/world-point'
import { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint'

/**
 * Find the common axis direction between two plane constraints.
 * If loop orientation is a plane (xy, xz, yz) and existing line is also a plane,
 * returns the common axis. For example:
 * - loop=yz, line=xy → common axis is y
 * - loop=yz, line=xz → common axis is z
 * - loop=xz, line=xy → common axis is x
 *
 * Returns null if there's no applicable constraint update.
 */
function getCommonAxisDirection(loopDirection: LineDirection, lineDirection: LineDirection): LineDirection | null {
  // Only apply when loop orientation is a plane constraint
  if (loopDirection !== 'xy' && loopDirection !== 'xz' && loopDirection !== 'yz') {
    return null
  }

  // Only update existing lines that also have a plane constraint
  if (lineDirection !== 'xy' && lineDirection !== 'xz' && lineDirection !== 'yz') {
    return null
  }

  // Don't update if they're the same plane
  if (loopDirection === lineDirection) {
    return null
  }

  // Find the common axis between two different planes
  const loopAxes = new Set(loopDirection.split(''))
  const lineAxes = new Set(lineDirection.split(''))

  for (const axis of loopAxes) {
    if (lineAxes.has(axis)) {
      return axis as LineDirection
    }
  }

  return null
}

interface LineConstraints {
  name?: string
  color?: string
  isConstruction?: boolean
  direction?: LineDirection
  targetLength?: number
  tolerance?: number
}

interface UseLoopTraceProps {
  selectedPoints: WorldPoint[]
  allWorldPoints: WorldPoint[]
  existingLines: Map<string, Line>
  onCreateLine: (pointA: WorldPoint, pointB: WorldPoint, constraints?: LineConstraints) => void
  onCreateConstraint?: (constraint: CoplanarPointsConstraint) => void
  orientation: LineDirection
  setOrientation: (orientation: LineDirection) => void
  coplanarEnabled: boolean
  setCoplanarEnabled: (enabled: boolean) => void
  namePrefix?: string
  closedLoop?: boolean
}

interface SegmentStatus {
  pointA: WorldPoint
  pointB: WorldPoint
  status: 'new' | 'exists' | 'building'
  existingLineName?: string
}

export function useLoopTrace({
  selectedPoints,
  allWorldPoints,
  existingLines,
  onCreateLine,
  onCreateConstraint,
  orientation,
  setOrientation,
  coplanarEnabled,
  setCoplanarEnabled,
  namePrefix = '',
  closedLoop = false
}: UseLoopTraceProps) {

  // Filter out any stale selections (points that are no longer in the project)
  // This can happen if a point was deleted while still being selected
  const validSelectedPoints = useMemo(() => {
    const allPointsSet = new Set(allWorldPoints)
    const valid = selectedPoints.filter(p => allPointsSet.has(p))
    if (valid.length !== selectedPoints.length) {
      console.warn(`Filtered out ${selectedPoints.length - valid.length} stale point(s) from loop trace selection`)
    }
    return valid
  }, [selectedPoints, allWorldPoints])

  // Check if a line exists between two points (bidirectional)
  const findExistingLine = useCallback((pointA: WorldPoint, pointB: WorldPoint): Line | undefined => {
    return Array.from(existingLines.values()).find(line =>
      (line.pointA === pointA && line.pointB === pointB) ||
      (line.pointA === pointB && line.pointB === pointA)
    )
  }, [existingLines])

  // Calculate segment statuses for preview based on selection order
  const segments = useMemo((): SegmentStatus[] => {
    const result: SegmentStatus[] = []

    for (let i = 0; i < validSelectedPoints.length - 1; i++) {
      const pointA = validSelectedPoints[i]
      const pointB = validSelectedPoints[i + 1]

      const existing = findExistingLine(pointA, pointB)

      result.push({
        pointA,
        pointB,
        status: existing ? 'exists' : 'new',
        existingLineName: existing?.name
      })
    }

    // Add closing line if closedLoop is enabled and we have at least 3 points
    if (closedLoop && validSelectedPoints.length >= 3) {
      const pointA = validSelectedPoints[validSelectedPoints.length - 1]
      const pointB = validSelectedPoints[0]
      const existing = findExistingLine(pointA, pointB)

      result.push({
        pointA,
        pointB,
        status: existing ? 'exists' : 'new',
        existingLineName: existing?.name
      })
    }

    return result
  }, [validSelectedPoints, findExistingLine, closedLoop])

  // Count of lines to create vs existing
  const lineCounts = useMemo(() => {
    const newLines = segments.filter(s => s.status === 'new').length
    const existingLines = segments.filter(s => s.status === 'exists').length
    return { newLines, existingLines }
  }, [segments])


  // Complete and create lines
  const complete = useCallback(() => {
    const created: string[] = []
    const skipped: string[] = []
    const updated: string[] = []

    // Calculate how many segments to process
    const segmentCount = closedLoop && validSelectedPoints.length >= 3
      ? validSelectedPoints.length
      : validSelectedPoints.length - 1

    for (let i = 0; i < segmentCount; i++) {
      const pointA = validSelectedPoints[i]
      const pointB = validSelectedPoints[(i + 1) % validSelectedPoints.length]

      // Check if line exists (bidirectional)
      const existingLine = findExistingLine(pointA, pointB)

      if (existingLine) {
        // Check if we should update the existing line's direction
        const newDirection = getCommonAxisDirection(orientation, existingLine.direction)
        if (newDirection && newDirection !== existingLine.direction) {
          existingLine.direction = newDirection
          updated.push(existingLine.name)
        } else {
          skipped.push(existingLine.name)
        }
        continue
      }

      // Create new line with optional prefix (no default name if prefix is empty)
      const lineName = namePrefix
        ? `${namePrefix}_${i + 1}`
        : ''

      const constraints: LineConstraints = {
        name: lineName,
        color: '#0696d7',
        isConstruction: false,
        direction: orientation,
        targetLength: undefined,
        tolerance: 0.001
      }

      onCreateLine(pointA, pointB, constraints)
      created.push(`${pointA.getName()}-${pointB.getName()}`)
    }

    // Create coplanar constraint if enabled and we have at least 4 points
    if (coplanarEnabled && validSelectedPoints.length >= 4 && onCreateConstraint) {
      const constraintName = namePrefix
        ? `${namePrefix}_coplanar`
        : 'Loop_coplanar'

      const coplanarConstraint = CoplanarPointsConstraint.create(
        constraintName,
        validSelectedPoints,
        {
          tolerance: 0.001
        }
      )

      onCreateConstraint(coplanarConstraint)
    }

    return { created, skipped, updated }
  }, [validSelectedPoints, orientation, findExistingLine, onCreateLine, namePrefix, closedLoop, coplanarEnabled, onCreateConstraint])

  return {
    segments,
    lineCounts,
    complete,
    validPointCount: validSelectedPoints.length
  }
}