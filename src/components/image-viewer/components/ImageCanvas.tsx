import React, { RefObject } from 'react'
import { CanvasPoint, ImageCoords, CanvasToImage } from '../types'
import { WorldPoint } from '../../../entities/world-point'
import { UseImageViewerEventsReturn } from '../hooks/useImageViewerEvents'

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
  canvasToImageCoords: CanvasToImage
  onCreatePoint?: (u: number, v: number) => void
  onMovePoint?: (worldPoint: WorldPoint, u: number, v: number) => void
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
  canvasToImageCoords,
  onCreatePoint,
  onMovePoint,
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
        setIsPrecisionDrag(false)
        setIsPrecisionToggleActive(false)
        if (precisionPointerRef.current) {
          precisionPointerRef.current = null
        }
        if (precisionCanvasPosRef.current) {
          precisionCanvasPosRef.current = null
        }

        const rect = canvasRef.current?.getBoundingClientRect()
        if (rect) {
          setCurrentMousePos({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          })
        }
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        setIsDragOverTarget(false)
        setIsDragDropActive(false)
        setCurrentMousePos(null)
        setIsPrecisionDrag(false)
        setIsPrecisionToggleActive(false)
        if (precisionPointerRef.current) {
          precisionPointerRef.current = null
        }
        if (precisionCanvasPosRef.current) {
          precisionCanvasPosRef.current = null
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragOverTarget(false)
        setIsDragDropActive(false)
        setCurrentMousePos(null)
        setIsPrecisionDrag(false)
        setIsPrecisionToggleActive(false)
        if (precisionPointerRef.current) {
          precisionPointerRef.current = null
        }
        if (precisionCanvasPosRef.current) {
          precisionCanvasPosRef.current = null
        }
        try {
          const data = JSON.parse(e.dataTransfer.getData('application/json'))
          if (data.type === 'world-point') {
            const rect = canvasRef.current?.getBoundingClientRect()
            if (rect) {
              const x = e.clientX - rect.left
              const y = e.clientY - rect.top
              const imageCoords = canvasToImageCoords(x, y)
              if (imageCoords) {
                if (data.action === 'place' && onCreatePoint) {
                  onCreatePoint(imageCoords.u, imageCoords.v)
                } else if (data.action === 'move' && onMovePoint && data.worldPointId) {
                  const worldPoint = worldPoints.get(data.worldPointId)
                  if (worldPoint) {
                    onMovePoint(worldPoint, imageCoords.u, imageCoords.v)
                  }
                }
              }
            }
          }
        } catch (error) {
          console.warn('Failed to parse drop data:', error)
        }
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
