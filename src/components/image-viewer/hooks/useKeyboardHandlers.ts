import { useEffect, RefObject } from 'react'
import { WorldPoint } from '../../../entities/world-point'
import { ImageViewerState, DragState, PointDragState, PrecisionDragState, VanishingLineDragState } from './useImageViewerState'
import { UseImageTransformReturn } from './useImageTransform'
import { PrecisionModeHandlers } from '../../../hooks/usePrecisionMode'

export interface UseKeyboardHandlersParams {
  canvasRef: RefObject<HTMLCanvasElement>
  imageViewerState: ImageViewerState
  dragState: DragState
  pointDragState: PointDragState
  precisionDragState: PrecisionDragState
  vanishingLineDragState: VanishingLineDragState
  transform: UseImageTransformReturn
  precisionMode: PrecisionModeHandlers
  zoomAtCenter: (scaleFactor: number, minScale: number, maxScale: number) => void
  onMovePoint?: (worldPoint: WorldPoint, u: number, v: number) => void
  onEscapePressed?: () => void
}

export function useKeyboardHandlers({
  imageViewerState,
  dragState,
  pointDragState,
  precisionDragState,
  vanishingLineDragState,
  transform,
  precisionMode,
  zoomAtCenter,
  onMovePoint,
  onEscapePressed
}: UseKeyboardHandlersParams): void {

  // Escape key handler
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

  // Zoom and modifier key handlers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target !== document.body) return

      if (event.key === '=' || event.key === '+') {
        event.preventDefault()
        zoomAtCenter(1.2, 0.1, 5)
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        zoomAtCenter(0.8, 0.1, 5)
      } else if (event.key === '0') {
        event.preventDefault()
        transform.fitImageToCanvas()
      }
    }

    const handleCtrlKeyDownForPan = (event: KeyboardEvent) => {
      if (event.key === 'Control') {
        dragState.setIsCtrlKeyPressed(true)
      }
    }

    const handleCtrlKeyUpForPan = (event: KeyboardEvent) => {
      if (event.key === 'Control') {
        dragState.setIsCtrlKeyPressed(false)
      }
    }

    const handleShiftKeyDown = (event: KeyboardEvent) => {
      precisionMode.handleShiftKey(event)
    }

    const handleShiftKeyUp = (event: KeyboardEvent) => {
      precisionMode.handleShiftKey(event)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keydown', handleCtrlKeyDownForPan)
    window.addEventListener('keyup', handleCtrlKeyUpForPan)
    window.addEventListener('keydown', handleShiftKeyDown)
    window.addEventListener('keyup', handleShiftKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keydown', handleCtrlKeyDownForPan)
      window.removeEventListener('keyup', handleCtrlKeyUpForPan)
      window.removeEventListener('keydown', handleShiftKeyDown)
      window.removeEventListener('keyup', handleShiftKeyUp)
    }
  }, [dragState, transform, precisionMode, zoomAtCenter])
}
