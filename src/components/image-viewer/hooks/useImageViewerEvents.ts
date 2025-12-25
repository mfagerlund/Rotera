import { useCallback, RefObject } from 'react'
import { WorldPoint } from '../../../entities/world-point'
import { Line } from '../../../entities/line'
import { VanishingLine, VanishingLineAxis } from '../../../entities/vanishing-line'
import { ImageViewerState, DragState, PointDragState, PrecisionDragState, VanishingLineDragState } from './useImageViewerState'
import { UseSelectionManagerReturn } from './useSelectionManager'
import { UseImageTransformReturn } from './useImageTransform'
import { PrecisionModeHandlers } from '../../../hooks/usePrecisionMode'
import { useMousePanAndZoom } from './useMousePanAndZoom'
import { usePointDragHandlers } from './usePointDragHandlers'
import { useVanishingLineDragHandlers } from './useVanishingLineDragHandlers'
import { useMouseClickHandlers } from './useMouseClickHandlers'
import { useKeyboardHandlers } from './useKeyboardHandlers'

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

  // Pan and zoom handlers
  const panAndZoom = useMousePanAndZoom({
    canvasRef,
    imageViewerState,
    dragState,
    transform
  })

  // Point drag handlers
  const pointDrag = usePointDragHandlers({
    pointDragState,
    precisionDragState,
    transform,
    precisionMode,
    isPlacementInteractionActive,
    onMovePoint
  })

  // Vanishing line drag handlers
  const vanishingLineDrag = useVanishingLineDragHandlers({
    pointDragState,
    precisionDragState,
    vanishingLineDragState,
    transform,
    precisionMode,
    onCreateVanishingLine
  })

  // Click handlers
  const clickHandlers = useMouseClickHandlers({
    canvasRef,
    pointDragState,
    precisionDragState,
    selectionManager,
    transform,
    precisionMode,
    pointsOnlyMode: isLoopTraceActive,
    onPointClick,
    onLineClick,
    onVanishingLineClick,
    onEmptySpaceClick,
    onCreatePoint,
    onPointRightClick,
    onLineRightClick
  })

  // Keyboard handlers
  useKeyboardHandlers({
    canvasRef,
    imageViewerState,
    dragState,
    pointDragState,
    precisionDragState,
    vanishingLineDragState,
    transform,
    precisionMode,
    zoomAtCenter: panAndZoom.zoomAtCenter,
    onMovePoint,
    onEscapePressed
  })

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    pointDragState.precisionPointerRef.current = null
    pointDragState.precisionCanvasPosRef.current = null
    precisionDragState.setIsPrecisionToggleActive(false)

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    // Pan: middle mouse button OR ctrl+left click
    if (event.button === 1 || (event.button === 0 && event.ctrlKey)) {
      panAndZoom.startPan(x, y)
      event.preventDefault()
    } else if (event.button === 0) {
      if (isVanishingLineActive && onCreateVanishingLine) {
        vanishingLineDrag.handleVanishingLineClick(x, y)
      } else if (placementMode.active && onCreatePoint) {
        clickHandlers.handlePlacementClick(x, y)
      } else {
        const vanishingLinePart = clickHandlers.handleVanishingLinePartClick(x, y, event.ctrlKey, event.shiftKey)
        if (vanishingLinePart) {
          vanishingLineDragState.setDraggedVanishingLine(vanishingLinePart.line)
          vanishingLineDragState.setVanishingLineDragMode(vanishingLinePart.part)
          const imageCoords = transform.canvasToImageCoordsUnbounded(x, y)
          if (imageCoords) {
            vanishingLineDragState.vanishingLineDragStartRef.current = {
              p1: { ...vanishingLinePart.line.p1 },
              p2: { ...vanishingLinePart.line.p2 },
              mouseU: imageCoords.u,
              mouseV: imageCoords.v
            }
          }
        }
        clickHandlers.handleClick(x, y, event.ctrlKey, event.shiftKey)
      }
    }
  }, [
    canvasRef,
    pointDragState,
    precisionDragState,
    vanishingLineDragState,
    transform,
    placementMode,
    isVanishingLineActive,
    onCreateVanishingLine,
    onCreatePoint,
    panAndZoom,
    vanishingLineDrag,
    clickHandlers
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
      panAndZoom.updatePan(x, y)
    } else if (vanishingLineDragState.draggedVanishingLine && vanishingLineDragState.vanishingLineDragMode && vanishingLineDragState.vanishingLineDragStartRef.current) {
      vanishingLineDrag.updateVanishingLineDrag(x, y)
    } else if (pointDragState.draggedPoint && onMovePoint) {
      pointDrag.updatePointDrag(x, y)
    } else {
      pointDrag.handleHoverDuringPlacement(x, y)

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
    onMovePoint,
    onMousePositionChange,
    onPointHover,
    panAndZoom,
    pointDrag,
    vanishingLineDrag
  ])

  const handleMouseUp = useCallback(() => {
    panAndZoom.stopPan()
    pointDrag.stopPointDrag()
    vanishingLineDrag.stopVanishingLineDrag()
  }, [panAndZoom, pointDrag, vanishingLineDrag])

  const handleMouseLeave = useCallback(() => {
    panAndZoom.stopPan()
    pointDragState.setHoveredPoint(null)
    pointDragState.setHoveredLine(null)
    pointDragState.setHoveredVanishingLine(null)

    if (onPointHover) {
      onPointHover(null)
    }

    if (onMousePositionChange) {
      onMousePositionChange(null)
    }

    pointDrag.stopPointDrag()
    vanishingLineDrag.stopVanishingLineDrag()
  }, [pointDragState, onPointHover, onMousePositionChange, panAndZoom, pointDrag, vanishingLineDrag])

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    clickHandlers.handleContextMenu(event)
  }, [clickHandlers])

  const handleWheel = useCallback((event: React.WheelEvent) => {
    panAndZoom.handleWheel(event)
  }, [panAndZoom])

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleContextMenu,
    handleWheel
  }
}
