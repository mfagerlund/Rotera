import { useCallback } from 'react'
import { WorldPoint } from '../../../entities/world-point'
import { PointDragState, PrecisionDragState } from './useImageViewerState'
import { UseImageTransformReturn } from './useImageTransform'
import { PrecisionModeHandlers } from '../../../hooks/usePrecisionMode'

export interface UsePointDragHandlersParams {
  pointDragState: PointDragState
  precisionDragState: PrecisionDragState
  transform: UseImageTransformReturn
  precisionMode: PrecisionModeHandlers
  isPlacementInteractionActive: boolean
  onMovePoint?: (worldPoint: WorldPoint, u: number, v: number) => void
}

export interface UsePointDragHandlersReturn {
  startPointDrag: (point: WorldPoint, x: number, y: number) => void
  updatePointDrag: (x: number, y: number) => void
  handleHoverDuringPlacement: (x: number, y: number) => void
  stopPointDrag: () => void
  cancelPointDrag: () => void
}

export function usePointDragHandlers({
  pointDragState,
  precisionDragState,
  transform,
  precisionMode,
  isPlacementInteractionActive,
  onMovePoint
}: UsePointDragHandlersParams): UsePointDragHandlersReturn {

  const startPointDrag = useCallback((point: WorldPoint, x: number, y: number) => {
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
    pointDragState.setDraggedPoint(point)
  }, [pointDragState, precisionDragState, transform, precisionMode])

  const updatePointDrag = useCallback((x: number, y: number) => {
    if (!pointDragState.draggedPoint || !onMovePoint) return

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
  }, [pointDragState, precisionDragState, transform, precisionMode, onMovePoint])

  const handleHoverDuringPlacement = useCallback((x: number, y: number) => {
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
  }, [pointDragState, precisionDragState, transform, precisionMode, isPlacementInteractionActive])

  const stopPointDrag = useCallback(() => {
    if (pointDragState.isDraggingPoint) {
      pointDragState.setIsDraggingPoint(false)
    }
    precisionDragState.setIsPrecisionDrag(false)
    pointDragState.setDraggedPoint(null)
    pointDragState.dragStartImageCoordsRef.current = null
    pointDragState.draggedPointImageCoordsRef.current = null
    pointDragState.precisionPointerRef.current = null
    pointDragState.precisionCanvasPosRef.current = null

    precisionMode.resetPrecision(true)
    precisionDragState.setIsPrecisionToggleActive(false)
    precisionDragState.setIsPrecisionDrag(false)
  }, [pointDragState, precisionDragState, precisionMode])

  const cancelPointDrag = useCallback(() => {
    if (!pointDragState.draggedPoint || !pointDragState.dragStartImageCoordsRef.current || !onMovePoint) return

    const origin = pointDragState.dragStartImageCoordsRef.current
    onMovePoint(pointDragState.draggedPoint, origin.u, origin.v)

    pointDragState.setIsDraggingPoint(false)
    precisionDragState.setIsPrecisionDrag(false)
    precisionDragState.setIsPrecisionToggleActive(false)
    pointDragState.setDraggedPoint(null)
    pointDragState.dragStartImageCoordsRef.current = null
    pointDragState.draggedPointImageCoordsRef.current = null
    pointDragState.precisionPointerRef.current = null
    pointDragState.precisionCanvasPosRef.current = null
  }, [pointDragState, precisionDragState, onMovePoint])

  return {
    startPointDrag,
    updatePointDrag,
    handleHoverDuringPlacement,
    stopPointDrag,
    cancelPointDrag
  }
}
