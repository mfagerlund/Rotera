import React, { RefObject } from 'react'
import { CanvasPoint, ImageCoords, CanvasToImage } from '../types'
import { WorldPoint } from '../../../entities/world-point'
import { UseImageViewerEventsReturn } from '../hooks/useImageViewerEvents'
import { getDraggingWorldPoint, getDragAction, clearDraggingWorldPoint } from '../../../utils/dragContext'

// Drag-time shift tracking - detect taps from DragEvent.shiftKey changes
let dragShiftToggled = false
let lastShiftState = false
let shiftPressStart: number | null = null
const TAP_THRESHOLD = 250

function resetDragShiftState() {
  dragShiftToggled = false
  lastShiftState = false
  shiftPressStart = null
}

function updateDragShiftState(currentShiftKey: boolean): boolean {
  // Detect shift state transitions from consecutive dragOver events
  if (currentShiftKey && !lastShiftState) {
    // Shift just pressed
    shiftPressStart = Date.now()
  } else if (!currentShiftKey && lastShiftState) {
    // Shift just released - check if it was a tap
    if (shiftPressStart !== null) {
      const duration = Date.now() - shiftPressStart
      if (duration < TAP_THRESHOLD) {
        dragShiftToggled = !dragShiftToggled
      }
      shiftPressStart = null
    }
  }
  lastShiftState = currentShiftKey

  // Return true if precision should be active (held OR toggled)
  return currentShiftKey || dragShiftToggled
}

interface PrecisionState {
  isPrecisionActive: boolean
  isPrecisionToggled: boolean
  precisionCanvasPos: CanvasPoint | null
}

interface ImageCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement>
  worldPoints: Set<WorldPoint>
  isDragging: boolean
  isDraggingVanishingLine: boolean
  isDraggingPoint: boolean
  hoveredVanishingLine: boolean
  hoveredPoint: WorldPoint | null
  hoveredLine: boolean
  placementModeActive: boolean
  isCtrlKeyPressed: boolean
  isDragOverTarget: boolean
  setIsDragOverTarget: (isOver: boolean) => void
  setIsDragDropActive: (isActive: boolean) => void
  setCurrentMousePos: (pos: CanvasPoint | null) => void
  setIsPrecisionDrag: (isPrecision: boolean) => void
  setIsPrecisionToggleActive: (isActive: boolean) => void
  precisionPointerRef: React.MutableRefObject<ImageCoords | null>
  precisionCanvasPosRef: React.MutableRefObject<CanvasPoint | null>
  draggedPointImageCoordsRef: React.MutableRefObject<ImageCoords | null>
  canvasToImageCoords: CanvasToImage
  getPrecisionState: () => PrecisionState
  applyPrecisionToImageDelta: (currentImageCoords: ImageCoords, baseImageCoords: ImageCoords) => ImageCoords
  onCreatePoint?: (u: number, v: number) => void
  onMovePoint?: (worldPoint: WorldPoint, u: number, v: number) => void
  onPlaceWorldPoint?: (worldPoint: WorldPoint, u: number, v: number) => void
  events: UseImageViewerEventsReturn
}

export const ImageCanvas: React.FC<ImageCanvasProps> = ({
  canvasRef,
  worldPoints,
  isDragging,
  isDraggingVanishingLine,
  isDraggingPoint,
  hoveredVanishingLine,
  hoveredPoint,
  hoveredLine,
  placementModeActive,
  isCtrlKeyPressed,
  isDragOverTarget,
  setIsDragOverTarget,
  setIsDragDropActive,
  setCurrentMousePos,
  setIsPrecisionDrag,
  setIsPrecisionToggleActive,
  precisionPointerRef,
  precisionCanvasPosRef,
  draggedPointImageCoordsRef,
  canvasToImageCoords,
  getPrecisionState,
  applyPrecisionToImageDelta,
  onCreatePoint,
  onMovePoint,
  onPlaceWorldPoint,
  events
}) => {

  const getCursor = () => {
    if (isDragging) return 'grabbing'
    if (isDraggingVanishingLine) return 'none'
    if (isDraggingPoint) return 'none'
    if (hoveredVanishingLine) return 'grab'
    if (hoveredPoint && onMovePoint) return 'grab'
    if (hoveredPoint || hoveredLine) return 'pointer'
    if (placementModeActive) return 'copy'
    if (isCtrlKeyPressed) return 'grab'
    return 'crosshair'
  }

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={events.handleMouseDown}
      onMouseMove={events.handleMouseMove}
      onMouseUp={events.handleMouseUp}
      onMouseLeave={events.handleMouseLeave}
      onContextMenu={events.handleContextMenu}
      onWheel={events.handleWheel}
      onDragEnter={(e) => {
        e.preventDefault()
        resetDragShiftState()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setIsDragOverTarget(true)
        setIsDragDropActive(true)

        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return

        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        setCurrentMousePos({ x, y })

        // Detect shift taps from DragEvent.shiftKey changes
        const shouldActivatePrecision = updateDragShiftState(e.shiftKey)

        if (shouldActivatePrecision) {
          setIsPrecisionDrag(true)
          const imageCoords = canvasToImageCoords(x, y)
          if (imageCoords) {
            const baseCoords = draggedPointImageCoordsRef.current || imageCoords
            const targetCoords = applyPrecisionToImageDelta(imageCoords, baseCoords)
            draggedPointImageCoordsRef.current = targetCoords
            precisionCanvasPosRef.current = getPrecisionState().precisionCanvasPos
          }
        } else {
          setIsPrecisionDrag(false)
          precisionCanvasPosRef.current = null
          precisionPointerRef.current = null
          draggedPointImageCoordsRef.current = null
        }
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        resetDragShiftState()
        setIsDragOverTarget(false)
        setIsDragDropActive(false)
        setCurrentMousePos(null)
        setIsPrecisionDrag(false)
        precisionPointerRef.current = null
        precisionCanvasPosRef.current = null
        draggedPointImageCoordsRef.current = null
      }}
      onDrop={(e) => {
        e.preventDefault()

        const precisionImageCoords = draggedPointImageCoordsRef.current

        setIsDragOverTarget(false)
        setIsDragDropActive(false)
        setCurrentMousePos(null)
        setIsPrecisionDrag(false)

        // Try dataTransfer first, fall back to drag context
        let worldPoint: WorldPoint | null = null
        let action: 'place' | 'move' | null = null

        try {
          const data = JSON.parse(e.dataTransfer.getData('application/json'))
          if (data.type === 'world-point' && data.worldPointName) {
            worldPoint = Array.from(worldPoints.values()).find(
              wp => wp.getName() === data.worldPointName
            ) || null
            action = data.action
          }
        } catch {
          // Fall back to drag context if dataTransfer fails
          worldPoint = getDraggingWorldPoint()
          action = getDragAction()
        }

        if (worldPoint) {
          let finalU: number, finalV: number
          if (precisionImageCoords) {
            finalU = precisionImageCoords.u
            finalV = precisionImageCoords.v
          } else {
            const rect = canvasRef.current?.getBoundingClientRect()
            if (rect) {
              const x = e.clientX - rect.left
              const y = e.clientY - rect.top
              const imageCoords = canvasToImageCoords(x, y)
              if (imageCoords) {
                finalU = imageCoords.u
                finalV = imageCoords.v
              } else {
                clearDraggingWorldPoint()
                return
              }
            } else {
              clearDraggingWorldPoint()
              return
            }
          }
          if (action === 'place' && onPlaceWorldPoint) {
            onPlaceWorldPoint(worldPoint, finalU, finalV)
          } else if (action === 'move' && onMovePoint) {
            onMovePoint(worldPoint, finalU, finalV)
          }
        }

        clearDraggingWorldPoint()
        precisionPointerRef.current = null
        precisionCanvasPosRef.current = null
        draggedPointImageCoordsRef.current = null
        resetDragShiftState()
      }}
      data-drop-target={isDragOverTarget}
      style={{
        cursor: getCursor(),
        display: 'block',
        width: '100%',
        height: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain'
      }}
    />
  )
}
