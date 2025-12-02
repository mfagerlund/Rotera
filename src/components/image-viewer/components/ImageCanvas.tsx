import React, { RefObject, useRef } from 'react'
import { CanvasPoint, ImageCoords, CanvasToImage } from '../types'
import { WorldPoint } from '../../../entities/world-point'
import { UseImageViewerEventsReturn } from '../hooks/useImageViewerEvents'

interface PrecisionState {
  isPrecisionActive: boolean
  isPrecisionToggled: boolean
  precisionCanvasPos: CanvasPoint | null
}

interface ImageCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement>
  worldPoints: Map<string, WorldPoint>
  isDragging: boolean
  isDraggingVanishingLine: boolean
  isDraggingPoint: boolean
  hoveredVanishingLine: boolean
  hoveredPoint: WorldPoint | null
  hoveredLine: boolean
  placementModeActive: boolean
  isAltKeyPressed: boolean
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
  isAltKeyPressed,
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
    if (isAltKeyPressed) return 'grab'
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

        const precState = getPrecisionState()
        if (precState.isPrecisionActive) {
          setIsPrecisionDrag(true)
          const imageCoords = canvasToImageCoords(x, y)
          if (imageCoords) {
            const baseCoords = draggedPointImageCoordsRef.current || imageCoords
            const targetCoords = applyPrecisionToImageDelta(imageCoords, baseCoords)
            draggedPointImageCoordsRef.current = targetCoords
            precisionCanvasPosRef.current = precState.precisionCanvasPos
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

        try {
          const data = JSON.parse(e.dataTransfer.getData('application/json'))
          if (data.type === 'world-point' && data.worldPointName) {
            const worldPoint = Array.from(worldPoints.values()).find(
              wp => wp.getName() === data.worldPointName
            )
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
                    return
                  }
                } else {
                  return
                }
              }
              if (data.action === 'place' && onPlaceWorldPoint) {
                onPlaceWorldPoint(worldPoint, finalU, finalV)
              } else if (data.action === 'move' && onMovePoint) {
                onMovePoint(worldPoint, finalU, finalV)
              }
            }
          }
        } catch (error) {
          console.warn('Failed to parse drop data:', error)
        }

        precisionPointerRef.current = null
        precisionCanvasPosRef.current = null
        draggedPointImageCoordsRef.current = null
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
