// Loop Trace Tool Logic Hook

import { useCallback, useMemo } from 'react'
import { LineDirection, LineConstraintSettings } from '../entities/line'
import { WorldPoint } from '../entities/world-point'

interface LineConstraints {
  name?: string
  color?: string
  isVisible?: boolean
  isConstruction?: boolean
  constraints?: LineConstraintSettings
}

interface UseLoopTraceProps {
  selectedPoints: string[]
  worldPoints?: Map<string, WorldPoint>
  existingLines: Record<string, any>
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
  worldPoints,
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
    if (!worldPoints) return []
    const result: SegmentStatus[] = []

    for (let i = 0; i < selectedPoints.length - 1; i++) {
      const pointAId = selectedPoints[i]
      const pointBId = selectedPoints[i + 1]
      const entityA = worldPoints.get(pointAId)
      const entityB = worldPoints.get(pointBId)
      if (!entityA || !entityB) continue

      const { exists, lineId } = lineExists(pointAId, pointBId)

      result.push({
        pointA: entityA,
        pointB: entityB,
        status: exists ? 'exists' : 'new',
        existingLineId: lineId
      })
    }

    // Add closing line if closedLoop is enabled and we have at least 3 points
    if (closedLoop && selectedPoints.length >= 3) {
      const pointAId = selectedPoints[selectedPoints.length - 1]
      const pointBId = selectedPoints[0]
      const entityA = worldPoints.get(pointAId)
      const entityB = worldPoints.get(pointBId)
      if (entityA && entityB) {
        const { exists, lineId } = lineExists(pointAId, pointBId)

        result.push({
          pointA: entityA,
          pointB: entityB,
          status: exists ? 'exists' : 'new',
          existingLineId: lineId
        })
      }
    }

    return result
  }, [selectedPoints, worldPoints, lineExists, closedLoop])

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

      // Lookup entities
      if (!worldPoints) continue
      const entityA = worldPoints.get(pointA)
      const entityB = worldPoints.get(pointB)
      if (!entityA || !entityB) continue

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

      onCreateLine(entityA, entityB, constraints)
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
  }, [selectedPoints, worldPoints, orientation, lineExists, onCreateLine, namePrefix, closedLoop, coplanarEnabled, onCreateConstraint])

  return {
    segments,
    lineCounts,
    complete
  }
}