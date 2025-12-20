import { useCallback } from 'react'
import { VanishingLine } from '../../../entities/vanishing-line'
import { ImageCoords } from '../types'
import { PointDragState, PrecisionDragState, VanishingLineDragState } from './useImageViewerState'
import { UseImageTransformReturn } from './useImageTransform'
import { PrecisionModeHandlers } from '../../../hooks/usePrecisionMode'

export interface UseVanishingLineDragHandlersParams {
  pointDragState: PointDragState
  precisionDragState: PrecisionDragState
  vanishingLineDragState: VanishingLineDragState
  transform: UseImageTransformReturn
  precisionMode: PrecisionModeHandlers
  onCreateVanishingLine?: (p1: { u: number; v: number }, p2: { u: number; v: number }) => void
}

export interface UseVanishingLineDragHandlersReturn {
  handleVanishingLineClick: (x: number, y: number) => void
  updateVanishingLineDrag: (x: number, y: number) => void
  stopVanishingLineDrag: () => void
}

export function useVanishingLineDragHandlers({
  pointDragState,
  precisionDragState,
  vanishingLineDragState,
  transform,
  precisionMode,
  onCreateVanishingLine
}: UseVanishingLineDragHandlersParams): UseVanishingLineDragHandlersReturn {

  const handleVanishingLineClick = useCallback((x: number, y: number) => {
    if (!onCreateVanishingLine) return

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
  }, [pointDragState, vanishingLineDragState, transform, onCreateVanishingLine])

  const updateVanishingLineDrag = useCallback((x: number, y: number) => {
    if (!vanishingLineDragState.draggedVanishingLine || !vanishingLineDragState.vanishingLineDragMode || !vanishingLineDragState.vanishingLineDragStartRef.current) return

    const imageCoords = transform.canvasToImageCoordsUnbounded(x, y)
    if (!imageCoords) return

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
  }, [pointDragState, precisionDragState, vanishingLineDragState, transform, precisionMode])

  const stopVanishingLineDrag = useCallback(() => {
    if (vanishingLineDragState.isDraggingVanishingLine) {
      vanishingLineDragState.setIsDraggingVanishingLine(false)
    }
    vanishingLineDragState.setDraggedVanishingLine(null)
    vanishingLineDragState.setVanishingLineDragMode(null)
    vanishingLineDragState.vanishingLineDragStartRef.current = null
    vanishingLineDragState.vanishingLineAccumulatedDeltaRef.current = { u: 0, v: 0 }
  }, [vanishingLineDragState])

  return {
    handleVanishingLineClick,
    updateVanishingLineDrag,
    stopVanishingLineDrag
  }
}
