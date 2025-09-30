// Loop Trace Tool Logic Hook

import { useCallback, useMemo } from 'react'
import { LineDirection, LineConstraintSettings } from '../entities/line'

interface LineConstraints {
  name?: string
  color?: string
  isVisible?: boolean
  isConstruction?: boolean
  constraints?: LineConstraintSettings
}

interface UseLoopTraceProps {
  selectedPoints: string[]
  existingLines: Record<string, any>
  onCreateLine: (pointIds: [string, string], constraints?: LineConstraints) => void
  onCreateConstraint?: (constraint: any) => void
  orientation: LineDirection
  setOrientation: (orientation: LineDirection) => void
  coplanarEnabled: boolean
  setCoplanarEnabled: (enabled: boolean) => void
  namePrefix?: string
  closedLoop?: boolean
}

interface SegmentStatus {
  pointA: string
  pointB: string
  status: 'new' | 'exists' | 'building'
  existingLineId?: string
}

export function useLoopTrace({
  selectedPoints,
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
  const lineExists = useCallback((pointA: string, pointB: string): { exists: boolean; lineId?: string } => {
    const existingLine = Object.values(existingLines).find(line =>
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

      // Create new line with optional prefix
      const lineName = namePrefix
        ? `${namePrefix}_${i + 1}`
        : `Loop_${i + 1}`

      const constraints: LineConstraints = {
        name: lineName,
        color: '#0696d7',
        isVisible: true,
        isConstruction: false,
        constraints: {
          direction: orientation,
          tolerance: 0.001
        }
      }

      onCreateLine([pointA, pointB], constraints)
      created.push(`${pointA}-${pointB}`)
    }

    // Create coplanar constraint if enabled and we have at least 4 points
    if (coplanarEnabled && selectedPoints.length >= 4 && onCreateConstraint) {
      const constraintName = namePrefix
        ? `${namePrefix}_coplanar`
        : 'Loop_coplanar'

      const coplanarConstraint = {
        id: `constraint_${Date.now()}`,
        type: 'points_coplanar',
        enabled: true,
        isDriving: true,
        weight: 1.0,
        status: 'satisfied',
        entities: {
          points: [...selectedPoints]
        },
        parameters: {
          tolerance: 0.001,
          name: constraintName
        },
        createdAt: new Date().toISOString()
      }

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