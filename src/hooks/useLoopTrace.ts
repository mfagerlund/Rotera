// Loop Trace Tool Logic Hook

import { useCallback, useMemo } from 'react'
import { LineDirection } from '../entities/line'
import { WorldPoint } from '../entities/world-point'
import { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint'

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
  existingLines: Map<string, any>
  onCreateLine: (pointA: WorldPoint, pointB: WorldPoint, constraints?: LineConstraints) => void
  onCreateConstraint?: (constraint: any) => void
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
  existingLineId?: string
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

  // Check if a line exists between two points (bidirectional)
  const lineExists = useCallback((pointA: WorldPoint, pointB: WorldPoint): { exists: boolean; lineId?: string } => {
    const existingLine = Array.from(existingLines.values()).find(line =>
      (line.pointA === pointA && line.pointB === pointB) ||
      (line.pointA === pointB && line.pointB === pointA)
    )
    return {
      exists: !!existingLine,
      lineId: existingLine?.id
    }
  }, [existingLines])

  // Calculate segment statuses for preview based on selection order
  const segments = useMemo((): SegmentStatus[] => {
    const result: SegmentStatus[] = []

    for (let i = 0; i < selectedPoints.length - 1; i++) {
      const pointA = selectedPoints[i]
      const pointB = selectedPoints[i + 1]

      const { exists, lineId } = lineExists(pointA, pointB)

      result.push({
        pointA,
        pointB,
        status: exists ? 'exists' : 'new',
        existingLineId: lineId
      })
    }

    // Add closing line if closedLoop is enabled and we have at least 3 points
    if (closedLoop && selectedPoints.length >= 3) {
      const pointA = selectedPoints[selectedPoints.length - 1]
      const pointB = selectedPoints[0]
      const { exists, lineId } = lineExists(pointA, pointB)

      result.push({
        pointA,
        pointB,
        status: exists ? 'exists' : 'new',
        existingLineId: lineId
      })
    }

    return result
  }, [selectedPoints, lineExists, closedLoop])

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

    // Calculate how many segments to process
    const segmentCount = closedLoop && selectedPoints.length >= 3
      ? selectedPoints.length
      : selectedPoints.length - 1

    for (let i = 0; i < segmentCount; i++) {
      const pointA = selectedPoints[i]
      const pointB = selectedPoints[(i + 1) % selectedPoints.length]

      // Check if line exists (bidirectional)
      const { exists, lineId } = lineExists(pointA, pointB)

      if (exists) {
        skipped.push(lineId!)
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
    if (coplanarEnabled && selectedPoints.length >= 4 && onCreateConstraint) {
      const constraintName = namePrefix
        ? `${namePrefix}_coplanar`
        : 'Loop_coplanar'

      const coplanarConstraint = CoplanarPointsConstraint.create(
        constraintName,
        selectedPoints,
        {
          tolerance: 0.001
        }
      )

      onCreateConstraint(coplanarConstraint)
    }

    return { created, skipped }
  }, [selectedPoints, orientation, lineExists, onCreateLine, namePrefix, closedLoop, coplanarEnabled, onCreateConstraint])

  return {
    segments,
    lineCounts,
    complete
  }
}