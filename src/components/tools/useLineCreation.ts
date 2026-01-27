import { useState, useCallback, useEffect, useRef } from 'react'
import { WorldPoint } from '../../entities/world-point'
import { Line, LineDirection } from '../../entities/line'

interface LineConstraints {
  name?: string
  color?: string
  isConstruction?: boolean
  direction?: LineDirection
  targetLength?: number
  tolerance?: number
  collinearPoints?: WorldPoint[]
}

interface UseLineCreationProps {
  selectedPoints: WorldPoint[]
  existingLines: Map<string, Line>
  isActive: boolean
  editMode: boolean
  existingLine?: Line
  onConstructionPreviewChange?: (preview: {
    type: 'line'
    pointA?: WorldPoint
    pointB?: WorldPoint
    showToCursor?: boolean
  } | null) => void
  onCancel: () => void
  onCreateLine: (pointA: WorldPoint, pointB: WorldPoint, constraints?: LineConstraints) => void
  onUpdateLine?: (lineEntity: Line, updatedLine: Partial<LineConstraints & { name: string; color: string; isConstruction: boolean }>) => void
  onDeleteLine?: (line: Line) => void
}

export const useLineCreation = ({
  selectedPoints,
  existingLines,
  isActive,
  editMode,
  existingLine,
  onConstructionPreviewChange,
  onCancel,
  onCreateLine,
  onUpdateLine,
  onDeleteLine
}: UseLineCreationProps) => {
  // Point slots state
  const [pointSlot1, setPointSlot1] = useState<WorldPoint | null>(null)
  const [pointSlot2, setPointSlot2] = useState<WorldPoint | null>(null)

  // Line constraint settings
  const [direction, setDirection] = useState<LineDirection>('free')
  const [lengthValue, setLengthValue] = useState<string>('')
  const [collinearPoints, setCollinearPoints] = useState<WorldPoint[]>([])

  // Line properties (for both creation and editing)
  const [lineName, setLineName] = useState<string>('')
  const [lineColor, setLineColor] = useState<string>('#0696d7')
  const [isConstruction, setIsConstruction] = useState<boolean>(false)

  // Track which slot is currently active for highlighting
  const [activeSlot, setActiveSlot] = useState<1 | 2 | null>(null)

  // Track previous isActive state to detect when tool becomes active
  const prevIsActiveRef = useRef(false)

  // Pre-populate form when in edit mode
  useEffect(() => {
    if (editMode && existingLine) {
      setPointSlot1(existingLine.pointA)
      setPointSlot2(existingLine.pointB)
      setLineName(existingLine.name || '')
      setLineColor(existingLine.color || '#0696d7')
      setIsConstruction(existingLine.isConstruction || false)
      setDirection(existingLine.direction || 'free')
      setCollinearPoints(Array.from(existingLine.collinearPoints))

      if (existingLine.targetLength !== undefined) {
        setLengthValue(existingLine.targetLength.toString())
      } else {
        setLengthValue('')
      }
    }
  }, [editMode])

  // Pre-populate slots from selection when tool opens
  useEffect(() => {
    const wasActive = prevIsActiveRef.current
    const isNowActive = isActive

    if (!wasActive && isNowActive && !editMode) {
      if (selectedPoints.length > 0) {
        setPointSlot1(selectedPoints[0] || null)
        setPointSlot2(selectedPoints[1] || null)
      }
    }

    if (wasActive && !isNowActive) {
      setPointSlot1(null)
      setPointSlot2(null)
      setCollinearPoints([])
    }

    prevIsActiveRef.current = isActive
  }, [isActive, selectedPoints, editMode, pointSlot1, pointSlot2])

  // Handle point clicks to fill slots while tool is active
  useEffect(() => {
    if (!isActive) return

    const handleGlobalPointClick = (event: CustomEvent<{ worldPoint: WorldPoint }>) => {
      const point = event.detail.worldPoint

      if (point === pointSlot1 || point === pointSlot2) {
        return
      }

      if (!pointSlot1) {
        setPointSlot1(point)
        setActiveSlot(2)
      } else if (!pointSlot2) {
        setPointSlot2(point)
        setActiveSlot(null)
      } else {
        setPointSlot1(point)
        setPointSlot2(null)
        setActiveSlot(2)
      }
    }

    window.addEventListener('lineToolPointClick', handleGlobalPointClick as EventListener)
    return () => window.removeEventListener('lineToolPointClick', handleGlobalPointClick as EventListener)
  }, [isActive, pointSlot1, pointSlot2])

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isActive) {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, onCancel])

  // Update construction preview when slots change
  useEffect(() => {
    if (!isActive || !onConstructionPreviewChange) return

    if (pointSlot1 && pointSlot2) {
      onConstructionPreviewChange({
        type: 'line',
        pointA: pointSlot1,
        pointB: pointSlot2,
        showToCursor: false
      })
    } else if (pointSlot1) {
      onConstructionPreviewChange({
        type: 'line',
        pointA: pointSlot1,
        showToCursor: true
      })
    } else {
      onConstructionPreviewChange(null)
    }
  }, [isActive, pointSlot1, pointSlot2, onConstructionPreviewChange])

  // Clear preview when tool is deactivated
  useEffect(() => {
    if (!isActive && onConstructionPreviewChange) {
      onConstructionPreviewChange(null)
    }
  }, [isActive, onConstructionPreviewChange])

  const clearSlot1 = () => {
    setPointSlot1(null)
    setActiveSlot(1)
  }

  const clearSlot2 = () => {
    setPointSlot2(null)
    setActiveSlot(2)
  }

  const handleSlot1Focus = () => setActiveSlot(1)
  const handleSlot2Focus = () => setActiveSlot(2)

  // Check if a line already exists between two points
  const lineAlreadyExists = useCallback((pointA: WorldPoint | null, pointB: WorldPoint | null): { exists: boolean, lineName?: string } => {
    if (!pointA || !pointB) return { exists: false }

    const foundLine = Array.from(existingLines.values()).find(line =>
      line !== existingLine &&
      ((line.pointA === pointA && line.pointB === pointB) ||
       (line.pointA === pointB && line.pointB === pointA))
    )

    return {
      exists: !!foundLine,
      lineName: foundLine?.name
    }
  }, [existingLines, existingLine])

  const lineCheck = lineAlreadyExists(pointSlot1, pointSlot2)
  const canCreateLine = !!(pointSlot1 && pointSlot2 && pointSlot1 !== pointSlot2 && !lineCheck.exists)

  const handleCreateLine = () => {
    if (editMode) {
      if (onUpdateLine && existingLine && pointSlot1 && pointSlot2) {
        const length = parseFloat(lengthValue)
        const targetLength = lengthValue.trim() !== '' && !isNaN(length) && length > 0 ? length : undefined

        const updates = {
          name: lineName,
          color: lineColor,
          isConstruction: isConstruction,
          direction: direction,
          targetLength: targetLength,
          tolerance: 0.001,
          pointA: pointSlot1,
          pointB: pointSlot2,
          collinearPoints: collinearPoints
        }

        onUpdateLine(existingLine, updates)
        onCancel()
      }
    } else {
      if (!canCreateLine) {
        return
      }

      const length = parseFloat(lengthValue)
      const targetLength = lengthValue.trim() !== '' && !isNaN(length) && length > 0 ? length : undefined

      const constraints: LineConstraints = {
        name: lineName,
        color: lineColor,
        isConstruction: isConstruction,
        direction: direction,
        targetLength: targetLength,
        tolerance: 0.001,
        collinearPoints: collinearPoints
      }

      if (!pointSlot1 || !pointSlot2) return

      onCreateLine(pointSlot1, pointSlot2, constraints)
      onCancel()
    }
  }

  const handleDeleteLine = async (confirm: (message: string) => Promise<boolean>) => {
    if (editMode && existingLine && onDeleteLine) {
      if (await confirm(`Are you sure you want to delete line "${existingLine.name}"?\n\nThis action cannot be undone.`)) {
        onDeleteLine(existingLine)
        onCancel()
      }
    }
  }

  return {
    // State
    pointSlot1,
    pointSlot2,
    direction,
    lengthValue,
    lineName,
    lineColor,
    isConstruction,
    activeSlot,
    lineCheck,
    canCreateLine,
    collinearPoints,

    // Setters
    setPointSlot1,
    setPointSlot2,
    setDirection,
    setLengthValue,
    setLineName,
    setLineColor,
    setIsConstruction,
    setCollinearPoints,

    // Handlers
    clearSlot1,
    clearSlot2,
    handleSlot1Focus,
    handleSlot2Focus,
    handleCreateLine,
    handleDeleteLine
  }
}
