import { useCallback, RefObject } from 'react'
import { WorldPoint } from '../../../entities/world-point'
import { Line } from '../../../entities/line'
import { VanishingLine } from '../../../entities/vanishing-line'
import { PointDragState, PrecisionDragState } from './useImageViewerState'
import { UseSelectionManagerReturn } from './useSelectionManager'
import { UseImageTransformReturn } from './useImageTransform'
import { PrecisionModeHandlers } from '../../../hooks/usePrecisionMode'

export interface UseMouseClickHandlersParams {
  canvasRef: RefObject<HTMLCanvasElement>
  pointDragState: PointDragState
  precisionDragState: PrecisionDragState
  selectionManager: UseSelectionManagerReturn
  transform: UseImageTransformReturn
  precisionMode: PrecisionModeHandlers
  pointsOnlyMode?: boolean
  onPointClick: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onLineClick?: (lineEntity: Line, ctrlKey: boolean, shiftKey: boolean) => void
  onVanishingLineClick?: (vanishingLine: VanishingLine, ctrlKey: boolean, shiftKey: boolean) => void
  onEmptySpaceClick?: (shiftKey: boolean) => void
  onCreatePoint?: (u: number, v: number) => void
  onPointRightClick?: (worldPoint: WorldPoint) => void
  onLineRightClick?: (lineEntity: Line) => void
}

export interface UseMouseClickHandlersReturn {
  handleClick: (x: number, y: number, ctrlKey: boolean, shiftKey: boolean) => { type: 'point' | 'line' | 'vanishingLine' | 'empty'; target?: WorldPoint | Line | VanishingLine }
  handleContextMenu: (event: React.MouseEvent) => void
  handlePlacementClick: (x: number, y: number) => void
  handleVanishingLinePartClick: (x: number, y: number, ctrlKey: boolean, shiftKey: boolean) => { line: VanishingLine; part: 'p1' | 'p2' | 'whole' } | null
}

export function useMouseClickHandlers({
  canvasRef,
  pointDragState,
  precisionDragState,
  selectionManager,
  transform,
  precisionMode,
  pointsOnlyMode = false,
  onPointClick,
  onLineClick,
  onVanishingLineClick,
  onEmptySpaceClick,
  onCreatePoint,
  onPointRightClick,
  onLineRightClick
}: UseMouseClickHandlersParams): UseMouseClickHandlersReturn {

  const handleClick = useCallback((x: number, y: number, ctrlKey: boolean, shiftKey: boolean) => {
    precisionDragState.setIsPrecisionDrag(false)
    const nearbyPoint = selectionManager.findNearbyPoint(x, y)
    // Skip line and vanishing line detection in points-only mode (e.g., loop trace)
    const vanishingLinePart = pointsOnlyMode ? null : selectionManager.findNearbyVanishingLinePart(x, y)
    const isVanishingLineEndpoint = vanishingLinePart && (vanishingLinePart.part === 'p1' || vanishingLinePart.part === 'p2')
    const nearbyLine = pointsOnlyMode || isVanishingLineEndpoint ? null : selectionManager.findNearbyLine(x, y)
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

      onPointClick(nearbyPoint, ctrlKey, shiftKey)
      return { type: 'point' as const, target: nearbyPoint }
    } else if (nearbyLine && onLineClick) {
      pointDragState.dragStartImageCoordsRef.current = null
      pointDragState.draggedPointImageCoordsRef.current = null
      pointDragState.precisionPointerRef.current = null
      onLineClick(nearbyLine, ctrlKey, shiftKey)
      return { type: 'line' as const, target: nearbyLine }
    } else if (nearbyVanishingLine && onVanishingLineClick && vanishingLinePart) {
      const imageCoords = transform.canvasToImageCoordsUnbounded(x, y)
      if (imageCoords) {
        let draggedEndpoint
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
      }
      onVanishingLineClick(nearbyVanishingLine, ctrlKey, shiftKey)
      return { type: 'vanishingLine' as const, target: nearbyVanishingLine }
    } else {
      const savedDraggedRef = pointDragState.draggedPointImageCoordsRef.current

      pointDragState.dragStartImageCoordsRef.current = null
      pointDragState.draggedPointImageCoordsRef.current = null
      pointDragState.precisionPointerRef.current = null

      if (onEmptySpaceClick) {
        onEmptySpaceClick(shiftKey)
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
      return { type: 'empty' as const }
    }
  }, [pointDragState, precisionDragState, selectionManager, transform, precisionMode, pointsOnlyMode, onPointClick, onLineClick, onVanishingLineClick, onEmptySpaceClick, onCreatePoint])

  const handlePlacementClick = useCallback((x: number, y: number) => {
    if (!onCreatePoint) return

    let imageCoords = transform.canvasToImageCoords(x, y)

    if (pointDragState.draggedPointImageCoordsRef.current) {
      imageCoords = pointDragState.draggedPointImageCoordsRef.current
    }

    if (imageCoords) {
      onCreatePoint(imageCoords.u, imageCoords.v)
    }
  }, [pointDragState, transform, onCreatePoint])

  const handleVanishingLinePartClick = useCallback((x: number, y: number, ctrlKey: boolean, shiftKey: boolean) => {
    const vanishingLinePart = selectionManager.findNearbyVanishingLinePart(x, y)
    if (!vanishingLinePart) return null

    const imageCoords = transform.canvasToImageCoordsUnbounded(x, y)
    if (imageCoords) {
      let draggedEndpoint
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
    }

    return vanishingLinePart
  }, [pointDragState, precisionDragState, selectionManager, transform, precisionMode])

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
  }, [canvasRef, selectionManager, onPointRightClick, onLineRightClick])

  return {
    handleClick,
    handleContextMenu,
    handlePlacementClick,
    handleVanishingLinePartClick
  }
}
