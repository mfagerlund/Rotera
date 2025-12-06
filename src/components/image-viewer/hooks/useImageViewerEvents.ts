import { useEffect, useCallback, RefObject } from 'react'
import { CanvasPoint, ImageCoords } from '../types'
import { WorldPoint } from '../../../entities/world-point'
import { Line } from '../../../entities/line'
import { VanishingLine, VanishingLineAxis } from '../../../entities/vanishing-line'
import { ImageViewerState, DragState, PointDragState, PrecisionDragState, VanishingLineDragState } from './useImageViewerState'
import { UseSelectionManagerReturn } from './useSelectionManager'
import { UseImageTransformReturn } from './useImageTransform'
import { PrecisionModeHandlers } from '../../../hooks/usePrecisionMode'

export interface UseImageViewerEventsParams {
  canvasRef: RefObject<HTMLCanvasElement>
  imageViewerState: ImageViewerState
  dragState: DragState
  pointDragState: PointDragState
  precisionDragState: PrecisionDragState
  vanishingLineDragState: VanishingLineDragState
  selectionManager: UseSelectionManagerReturn
  transform: UseImageTransformReturn
  precisionMode: PrecisionModeHandlers
  placementMode: { active: boolean; worldPoint: WorldPoint | null }
  isPointCreationActive: boolean
  isLoopTraceActive: boolean
  isVanishingLineActive: boolean
  currentVanishingLineAxis?: VanishingLineAxis
  onPointClick: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onLineClick?: (lineEntity: Line, ctrlKey: boolean, shiftKey: boolean) => void
  onCreatePoint?: (u: number, v: number) => void
  onMovePoint?: (worldPoint: WorldPoint, u: number, v: number) => void
  onPointHover?: (worldPoint: WorldPoint | null) => void
  onPointRightClick?: (worldPoint: WorldPoint) => void
  onLineRightClick?: (lineEntity: Line) => void
  onEmptySpaceClick?: (shiftKey: boolean) => void
  onCreateVanishingLine?: (p1: { u: number; v: number }, p2: { u: number; v: number }) => void
  onVanishingLineClick?: (vanishingLine: VanishingLine, ctrlKey: boolean, shiftKey: boolean) => void
  onMousePositionChange?: (position: { u: number; v: number } | null) => void
  onEscapePressed?: () => void
}

export interface UseImageViewerEventsReturn {
  handleMouseDown: (event: React.MouseEvent) => void
  handleMouseMove: (event: React.MouseEvent) => void
  handleMouseUp: () => void
  handleMouseLeave: () => void
  handleContextMenu: (event: React.MouseEvent) => void
  handleWheel: (event: React.WheelEvent) => void
}

export function useImageViewerEvents({
  canvasRef,
  imageViewerState,
  dragState,
  pointDragState,
  precisionDragState,
  vanishingLineDragState,
  selectionManager,
  transform,
  precisionMode,
  placementMode,
  isPointCreationActive,
  isLoopTraceActive,
  isVanishingLineActive,
  currentVanishingLineAxis,
  onPointClick,
  onLineClick,
  onCreatePoint,
  onMovePoint,
  onPointHover,
  onPointRightClick,
  onLineRightClick,
  onEmptySpaceClick,
  onCreateVanishingLine,
  onVanishingLineClick,
  onMousePositionChange,
  onEscapePressed
}: UseImageViewerEventsParams): UseImageViewerEventsReturn {

  const placementModeActive = placementMode?.active ?? false
  const creationContextActive = placementModeActive || isPointCreationActive || isLoopTraceActive || isVanishingLineActive
  const isPlacementInteractionActive = pointDragState.isDraggingPoint || precisionDragState.isDragDropActive || creationContextActive

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    pointDragState.precisionPointerRef.current = null
    pointDragState.precisionCanvasPosRef.current = null
    precisionDragState.setIsPrecisionToggleActive(false)

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    if (event.button === 1 || (event.button === 0 && event.altKey)) {
      dragState.setIsDragging(true)
      dragState.setLastMousePos({ x, y })
      dragState.setLastPanTime(Date.now())
      imageViewerState.setPanVelocity({ x: 0, y: 0 })
      event.preventDefault()
    } else if (event.button === 0) {
      if (isVanishingLineActive && onCreateVanishingLine) {
        let imageCoords = transform.canvasToImageCoordsUnbounded(x, y)
        if (!imageCoords) return

        if (pointDragState.draggedPointImageCoordsRef.current) {
          imageCoords = pointDragState.draggedPointImageCoordsRef.current
        }

        if (!vanishingLineDragState.vanishingLineStart) {
          vanishingLineDragState.setVanishingLineStart(imageCoords)
        } else {
          onCreateVanishingLine(vanishingLineDragState.vanishingLineStart, imageCoords)
          vanishingLineDragState.setVanishingLineStart(null)
        }
      } else if (placementMode.active && onCreatePoint) {
        let imageCoords = transform.canvasToImageCoords(x, y)

        if (pointDragState.draggedPointImageCoordsRef.current) {
          imageCoords = pointDragState.draggedPointImageCoordsRef.current
        }

        if (imageCoords) {
          onCreatePoint(imageCoords.u, imageCoords.v)
        }
      } else {
        precisionDragState.setIsPrecisionDrag(false)
        const nearbyPoint = selectionManager.findNearbyPoint(x, y)
        const vanishingLinePart = selectionManager.findNearbyVanishingLinePart(x, y)
        // Check for vanishing line endpoints before lines - points should always take priority over lines
        const isVanishingLineEndpoint = vanishingLinePart && (vanishingLinePart.part === 'p1' || vanishingLinePart.part === 'p2')
        const nearbyLine = isVanishingLineEndpoint ? null : selectionManager.findNearbyLine(x, y)
        const nearbyVanishingLine = vanishingLinePart?.line ?? null

        if (nearbyPoint) {
          const draggedImagePoint = transform.canvasToImageCoords(x, y)
          if (draggedImagePoint) {
            pointDragState.dragStartImageCoordsRef.current = { u: draggedImagePoint.u, v: draggedImagePoint.v }
            pointDragState.draggedPointImageCoordsRef.current = { u: draggedImagePoint.u, v: draggedImagePoint.v }
          } else {
            pointDragState.dragStartImageCoordsRef.current = null
            pointDragState.draggedPointImageCoordsRef.current = null
          }
          pointDragState.precisionPointerRef.current = null
          precisionDragState.setIsPrecisionDrag(false)
          precisionDragState.setIsPrecisionToggleActive(false)
          precisionMode.resetPrecision(true)
          pointDragState.setDragStartPos({ x, y })
          pointDragState.setDraggedPoint(nearbyPoint)

          onPointClick(nearbyPoint, event.ctrlKey, event.shiftKey)
        } else if (nearbyLine && onLineClick) {
          pointDragState.dragStartImageCoordsRef.current = null
          pointDragState.draggedPointImageCoordsRef.current = null
          pointDragState.precisionPointerRef.current = null
          onLineClick(nearbyLine, event.ctrlKey, event.shiftKey)
        } else if (nearbyVanishingLine && onVanishingLineClick) {
          if (vanishingLinePart) {
            const imageCoords = transform.canvasToImageCoordsUnbounded(x, y)
            if (imageCoords) {
              let draggedEndpoint: ImageCoords
              if (vanishingLinePart.part === 'p1' || vanishingLinePart.part === 'whole') {
                draggedEndpoint = { u: vanishingLinePart.line.p1.u, v: vanishingLinePart.line.p1.v }
              } else {
                draggedEndpoint = { u: vanishingLinePart.line.p2.u, v: vanishingLinePart.line.p2.v }
              }

              pointDragState.dragStartImageCoordsRef.current = draggedEndpoint
              pointDragState.draggedPointImageCoordsRef.current = draggedEndpoint
              pointDragState.precisionPointerRef.current = null
              precisionDragState.setIsPrecisionDrag(false)
              precisionDragState.setIsPrecisionToggleActive(false)
              precisionMode.resetPrecision(true)
              pointDragState.setDragStartPos({ x, y })
              vanishingLineDragState.setDraggedVanishingLine(vanishingLinePart.line)
              vanishingLineDragState.setVanishingLineDragMode(vanishingLinePart.part)
              vanishingLineDragState.vanishingLineDragStartRef.current = {
                p1: { ...vanishingLinePart.line.p1 },
                p2: { ...vanishingLinePart.line.p2 },
                mouseU: imageCoords.u,
                mouseV: imageCoords.v
              }
            }
          }
          onVanishingLineClick(nearbyVanishingLine, event.ctrlKey, event.shiftKey)
        } else {
          const savedDraggedRef = pointDragState.draggedPointImageCoordsRef.current

          pointDragState.dragStartImageCoordsRef.current = null
          pointDragState.draggedPointImageCoordsRef.current = null
          pointDragState.precisionPointerRef.current = null

          if (onEmptySpaceClick) {
            onEmptySpaceClick(event.shiftKey)
          }

          if (onCreatePoint) {
            let imageCoords = transform.canvasToImageCoords(x, y)

            if (savedDraggedRef) {
              imageCoords = savedDraggedRef
            }

            if (imageCoords) {
              onCreatePoint(imageCoords.u, imageCoords.v)
            }
          }
        }
      }
    }
  }, [
    canvasRef,
    dragState,
    imageViewerState,
    pointDragState,
    precisionDragState,
    vanishingLineDragState,
    selectionManager,
    transform,
    precisionMode,
    placementMode,
    isVanishingLineActive,
    onCreateVanishingLine,
    onCreatePoint,
    onPointClick,
    onLineClick,
    onVanishingLineClick,
    onEmptySpaceClick
  ])

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    imageViewerState.setCurrentMousePos({ x, y })

    if (onMousePositionChange) {
      const imageCoords = transform.canvasToImageCoordsUnbounded(x, y)
      onMousePositionChange(imageCoords)
    }

    if (dragState.isDragging) {
      precisionDragState.setIsPrecisionDrag(false)
      const deltaX = x - dragState.lastMousePos.x
      const deltaY = y - dragState.lastMousePos.y
      const currentTime = Date.now()

      const timeDelta = currentTime - dragState.lastPanTime
      if (timeDelta > 0) {
        imageViewerState.setPanVelocity({
          x: deltaX / timeDelta * 100,
          y: deltaY / timeDelta * 100
        })
        dragState.setLastPanTime(currentTime)
      }

      imageViewerState.setOffset(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }))

      dragState.setLastMousePos({ x, y })
    } else if (vanishingLineDragState.draggedVanishingLine && vanishingLineDragState.vanishingLineDragMode && vanishingLineDragState.vanishingLineDragStartRef.current) {
      const imageCoords = transform.canvasToImageCoordsUnbounded(x, y)
      if (imageCoords) {
        const dragStart = vanishingLineDragState.vanishingLineDragStartRef.current
        const precState = precisionMode.getPrecisionState()

        if (!vanishingLineDragState.isDraggingVanishingLine) {
          const dragDistance = Math.sqrt(
            Math.pow(x - pointDragState.dragStartPos.x, 2) + Math.pow(y - pointDragState.dragStartPos.y, 2)
          )
          if (dragDistance > 5) {
            vanishingLineDragState.setIsDraggingVanishingLine(true)
            precisionMode.resetPrecision(false)
          }
        }

        if (vanishingLineDragState.isDraggingVanishingLine) {
          const deltaU = imageCoords.u - dragStart.mouseU
          const deltaV = imageCoords.v - dragStart.mouseV

          let newP1: ImageCoords
          let newP2: ImageCoords

          if (vanishingLineDragState.vanishingLineDragMode === 'whole') {
            newP1 = { u: dragStart.p1.u + deltaU, v: dragStart.p1.v + deltaV }
            newP2 = { u: dragStart.p2.u + deltaU, v: dragStart.p2.v + deltaV }
          } else if (vanishingLineDragState.vanishingLineDragMode === 'p1') {
            newP1 = { u: dragStart.p1.u + deltaU, v: dragStart.p1.v + deltaV }
            newP2 = dragStart.p2
          } else {
            newP1 = dragStart.p1
            newP2 = { u: dragStart.p2.u + deltaU, v: dragStart.p2.v + deltaV }
          }

          if (precState.isPrecisionActive) {
            precisionDragState.setIsPrecisionDrag(true)
            const baseCoords = pointDragState.draggedPointImageCoordsRef.current || pointDragState.dragStartImageCoordsRef.current || imageCoords
            const targetCoords = precisionMode.applyPrecisionToImageDelta(imageCoords, baseCoords)

            const precDeltaU = targetCoords.u - (pointDragState.draggedPointImageCoordsRef.current?.u || newP1.u)
            const precDeltaV = targetCoords.v - (pointDragState.draggedPointImageCoordsRef.current?.v || newP1.v)

            if (vanishingLineDragState.vanishingLineDragMode === 'whole') {
              newP1 = { u: newP1.u + precDeltaU, v: newP1.v + precDeltaV }
              newP2 = { u: newP2.u + precDeltaU, v: newP2.v + precDeltaV }
            } else if (vanishingLineDragState.vanishingLineDragMode === 'p1') {
              newP1 = targetCoords
            } else {
              newP2 = targetCoords
            }

            pointDragState.draggedPointImageCoordsRef.current = (vanishingLineDragState.vanishingLineDragMode === 'p2') ? newP2 : newP1
            pointDragState.precisionCanvasPosRef.current = precState.precisionCanvasPos
          } else {
            precisionDragState.setIsPrecisionDrag(false)
            pointDragState.draggedPointImageCoordsRef.current = (vanishingLineDragState.vanishingLineDragMode === 'p2') ? newP2 : newP1
          }

          vanishingLineDragState.draggedVanishingLine.setEndpoints(newP1, newP2)
        }
      }
    } else if (pointDragState.draggedPoint && onMovePoint) {
      const dragDistance = Math.sqrt(
        Math.pow(x - pointDragState.dragStartPos.x, 2) + Math.pow(y - pointDragState.dragStartPos.y, 2)
      )

      if (!pointDragState.isDraggingPoint && dragDistance > 5) {
        pointDragState.setIsDraggingPoint(true)
        precisionMode.resetPrecision(false)
      }

      if (pointDragState.isDraggingPoint) {
        const imageCoords = transform.canvasToImageCoords(x, y)
        if (imageCoords) {
          const precState = precisionMode.getPrecisionState()

          if (precState.isPrecisionActive) {
            precisionDragState.setIsPrecisionDrag(true)
            const baseCoords = pointDragState.draggedPointImageCoordsRef.current || pointDragState.dragStartImageCoordsRef.current || imageCoords
            const targetCoords = precisionMode.applyPrecisionToImageDelta(imageCoords, baseCoords)
            onMovePoint(pointDragState.draggedPoint, targetCoords.u, targetCoords.v)
            pointDragState.draggedPointImageCoordsRef.current = targetCoords
            pointDragState.precisionCanvasPosRef.current = precState.precisionCanvasPos
          } else {
            precisionDragState.setIsPrecisionDrag(false)
            onMovePoint(pointDragState.draggedPoint, imageCoords.u, imageCoords.v)
            pointDragState.draggedPointImageCoordsRef.current = imageCoords
          }
        } else {
          precisionDragState.setIsPrecisionDrag(false)
        }
      } else {
        if (pointDragState.precisionPointerRef.current) {
          pointDragState.precisionPointerRef.current = null
        }
        if (pointDragState.precisionCanvasPosRef.current) {
          pointDragState.precisionCanvasPosRef.current = null
        }
        precisionDragState.setIsPrecisionDrag(false)
      }
    } else {
      const precState = precisionMode.getPrecisionState()
      if (isPlacementInteractionActive && precState.isPrecisionActive) {
        precisionDragState.setIsPrecisionDrag(true)
        const imageCoords = transform.canvasToImageCoordsUnbounded(x, y)
        if (imageCoords) {
          const baseCoords = pointDragState.draggedPointImageCoordsRef.current || imageCoords
          const targetCoords = precisionMode.applyPrecisionToImageDelta(imageCoords, baseCoords)
          pointDragState.draggedPointImageCoordsRef.current = targetCoords
          pointDragState.precisionCanvasPosRef.current = precState.precisionCanvasPos
        }
      } else {
        if (!precState.isPrecisionActive) {
          if (pointDragState.precisionCanvasPosRef.current) {
            pointDragState.precisionCanvasPosRef.current = null
          }
          if (pointDragState.precisionPointerRef.current) {
            pointDragState.precisionPointerRef.current = null
          }
          if (pointDragState.draggedPointImageCoordsRef.current) {
            pointDragState.draggedPointImageCoordsRef.current = null
          }
          precisionDragState.setIsPrecisionDrag(false)
        }
      }

      const nearbyPoint = selectionManager.findNearbyPoint(x, y)
      const nearbyLine = selectionManager.findNearbyLine(x, y)
      const nearbyVanishingLine = selectionManager.findNearbyVanishingLine(x, y)

      pointDragState.setHoveredPoint(nearbyPoint || null)
      pointDragState.setHoveredLine(nearbyLine || null)
      pointDragState.setHoveredVanishingLine(nearbyVanishingLine || null)

      if (onPointHover) {
        onPointHover(nearbyPoint || null)
      }
    }
  }, [
    canvasRef,
    dragState,
    imageViewerState,
    pointDragState,
    precisionDragState,
    vanishingLineDragState,
    selectionManager,
    transform,
    precisionMode,
    isPlacementInteractionActive,
    onMovePoint,
    onMousePositionChange,
    onPointHover
  ])

  const handleMouseUp = useCallback(() => {
    dragState.setIsDragging(false)
    imageViewerState.setPanVelocity({ x: 0, y: 0 })

    if (pointDragState.isDraggingPoint) {
      pointDragState.setIsDraggingPoint(false)
    }
    precisionDragState.setIsPrecisionDrag(false)
    pointDragState.setDraggedPoint(null)
    pointDragState.dragStartImageCoordsRef.current = null
    pointDragState.draggedPointImageCoordsRef.current = null
    pointDragState.precisionPointerRef.current = null
    pointDragState.precisionCanvasPosRef.current = null

    if (vanishingLineDragState.isDraggingVanishingLine) {
      vanishingLineDragState.setIsDraggingVanishingLine(false)
    }
    vanishingLineDragState.setDraggedVanishingLine(null)
    vanishingLineDragState.setVanishingLineDragMode(null)
    vanishingLineDragState.vanishingLineDragStartRef.current = null
    vanishingLineDragState.vanishingLineAccumulatedDeltaRef.current = { u: 0, v: 0 }

    precisionMode.resetPrecision(true)
    precisionDragState.setIsPrecisionToggleActive(false)
    precisionDragState.setIsPrecisionDrag(false)
  }, [dragState, imageViewerState, pointDragState, precisionDragState, vanishingLineDragState, precisionMode])

  const handleMouseLeave = useCallback(() => {
    dragState.setIsDragging(false)
    pointDragState.setHoveredPoint(null)
    pointDragState.setHoveredLine(null)
    pointDragState.setHoveredVanishingLine(null)
    imageViewerState.setPanVelocity({ x: 0, y: 0 })

    if (onPointHover) {
      onPointHover(null)
    }

    if (onMousePositionChange) {
      onMousePositionChange(null)
    }

    if (pointDragState.isDraggingPoint) {
      pointDragState.setIsDraggingPoint(false)
    }
    precisionDragState.setIsPrecisionDrag(false)
    precisionDragState.setIsPrecisionToggleActive(false)
    pointDragState.setDraggedPoint(null)
    pointDragState.dragStartImageCoordsRef.current = null
    pointDragState.draggedPointImageCoordsRef.current = null
    pointDragState.precisionPointerRef.current = null
    pointDragState.precisionCanvasPosRef.current = null
    precisionMode.resetPrecision(true)

    if (vanishingLineDragState.isDraggingVanishingLine) {
      vanishingLineDragState.setIsDraggingVanishingLine(false)
    }
    vanishingLineDragState.setDraggedVanishingLine(null)
    vanishingLineDragState.setVanishingLineDragMode(null)
    vanishingLineDragState.vanishingLineDragStartRef.current = null
  }, [dragState, imageViewerState, pointDragState, precisionDragState, vanishingLineDragState, precisionMode, onPointHover, onMousePositionChange])

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    const nearbyPoint = selectionManager.findNearbyPoint(x, y)
    const nearbyLine = selectionManager.findNearbyLine(x, y)

    if (nearbyPoint && onPointRightClick) {
      onPointRightClick(nearbyPoint)
    } else if (nearbyLine && onLineRightClick) {
      onLineRightClick(nearbyLine)
    }
  }, [canvasRef, selectionManager, onPointRightClick, onLineClick, onLineRightClick])

  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault()

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top

    const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(5, imageViewerState.scale * scaleFactor))

    const scaleRatio = newScale / imageViewerState.scale
    imageViewerState.setOffset(prev => ({
      x: mouseX - (mouseX - prev.x) * scaleRatio,
      y: mouseY - (mouseY - prev.y) * scaleRatio
    }))

    imageViewerState.setScale(newScale)
  }, [canvasRef, imageViewerState])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      // Always call onEscapePressed to deselect tool
      onEscapePressed?.()

      if (vanishingLineDragState.vanishingLineStart) {
        vanishingLineDragState.setVanishingLineStart(null)
        event.preventDefault()
      }

      if (!pointDragState.draggedPoint && !pointDragState.isDraggingPoint) return

      if (pointDragState.draggedPoint && pointDragState.dragStartImageCoordsRef.current && onMovePoint) {
        const origin = pointDragState.dragStartImageCoordsRef.current
        onMovePoint(pointDragState.draggedPoint, origin.u, origin.v)
      }

      dragState.setIsDragging(false)
      pointDragState.setIsDraggingPoint(false)
      precisionDragState.setIsPrecisionDrag(false)
      precisionDragState.setIsPrecisionToggleActive(false)
      pointDragState.setDraggedPoint(null)
      pointDragState.dragStartImageCoordsRef.current = null
      pointDragState.draggedPointImageCoordsRef.current = null
      pointDragState.precisionPointerRef.current = null
      pointDragState.precisionCanvasPosRef.current = null
      imageViewerState.setCurrentMousePos(null)
      imageViewerState.setPanVelocity({ x: 0, y: 0 })
      event.preventDefault()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [dragState, pointDragState, precisionDragState, imageViewerState, vanishingLineDragState, onMovePoint, onEscapePressed])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target !== document.body) return

      if (event.key === '=' || event.key === '+') {
        event.preventDefault()
        const canvas = canvasRef.current
        if (canvas) {
          const centerX = canvas.width / 2
          const centerY = canvas.height / 2
          const scaleFactor = 1.2
          const newScale = Math.min(5, imageViewerState.scale * scaleFactor)

          const scaleRatio = newScale / imageViewerState.scale
          imageViewerState.setOffset(prev => ({
            x: centerX - (centerX - prev.x) * scaleRatio,
            y: centerY - (centerY - prev.y) * scaleRatio
          }))
          imageViewerState.setScale(newScale)
        }
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        const canvas = canvasRef.current
        if (canvas) {
          const centerX = canvas.width / 2
          const centerY = canvas.height / 2
          const scaleFactor = 0.8
          const newScale = Math.max(0.1, imageViewerState.scale * scaleFactor)

          const scaleRatio = newScale / imageViewerState.scale
          imageViewerState.setOffset(prev => ({
            x: centerX - (centerX - prev.x) * scaleRatio,
            y: centerY - (centerY - prev.y) * scaleRatio
          }))
          imageViewerState.setScale(newScale)
        }
      } else if (event.key === '0') {
        event.preventDefault()
        transform.fitImageToCanvas()
      }
    }

    const handleAltKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        dragState.setIsAltKeyPressed(true)
      }
    }

    const handleAltKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        dragState.setIsAltKeyPressed(false)
      }
    }

    const handleShiftKeyDown = (event: KeyboardEvent) => {
      precisionMode.handleShiftKey(event)
    }

    const handleShiftKeyUp = (event: KeyboardEvent) => {
      const wasActive = precisionMode.getPrecisionState().isPrecisionToggled
      precisionMode.handleShiftKey(event)
      const precState = precisionMode.getPrecisionState()
      if (precState.isPrecisionToggled) {
        if (!wasActive) {
          precisionMode.resetPrecision(false)
        }
        precisionDragState.setIsPrecisionDrag(true)
        precisionDragState.setIsPrecisionToggleActive(true)
      } else {
        if (wasActive) {
          precisionMode.resetPrecision(false)
        }
        precisionDragState.setIsPrecisionDrag(false)
        precisionDragState.setIsPrecisionToggleActive(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keydown', handleAltKeyDown)
    window.addEventListener('keyup', handleAltKeyUp)
    window.addEventListener('keydown', handleShiftKeyDown)
    window.addEventListener('keyup', handleShiftKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keydown', handleAltKeyDown)
      window.removeEventListener('keyup', handleAltKeyUp)
      window.removeEventListener('keydown', handleShiftKeyDown)
      window.removeEventListener('keyup', handleShiftKeyUp)
    }
  }, [canvasRef, imageViewerState, dragState, precisionDragState, transform, precisionMode, isPlacementInteractionActive])

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleContextMenu,
    handleWheel
  }
}
