import { RenderParams } from './types'
import { renderLoupe } from '../loupe-renderer'

export function renderLoupeHelper(params: RenderParams): void {
  const {
    ctx,
    canvasEl,
    canvasRef,
    imageRef,
    scale,
    offset,
    currentMousePos,
    isPrecisionDrag,
    precisionCanvasPosRef,
    draggedPointImageCoordsRef,
    isDraggingPoint,
    isDragDropActive,
    isPlacementModeActive,
    isPointCreationActive,
    isLoopTraceActive,
    isVanishingLineActive,
    isDraggingVanishingLine
  } = params

  const isPlacementInteractionActive =
    isDraggingPoint ||
    isDragDropActive ||
    isPlacementModeActive ||
    isPointCreationActive ||
    isLoopTraceActive ||
    isVanishingLineActive ||
    isDraggingVanishingLine

  if (!isPlacementInteractionActive) {
    return
  }

  const canvas = canvasRef.current
  const img = imageRef.current
  if (!canvas || !img) {
    return
  }

  if (!currentMousePos) {
    return
  }

  let imageU: number
  let imageV: number

  if (draggedPointImageCoordsRef.current) {
    imageU = draggedPointImageCoordsRef.current.u
    imageV = draggedPointImageCoordsRef.current.v
  } else if (isPrecisionDrag && precisionCanvasPosRef.current) {
    imageU = (precisionCanvasPosRef.current.x - offset.x) / scale
    imageV = (precisionCanvasPosRef.current.y - offset.y) / scale
  } else {
    imageU = (currentMousePos.x - offset.x) / scale
    imageV = (currentMousePos.y - offset.y) / scale
  }

  (window as any).__loupePos = { u: imageU, v: imageV }

  renderLoupe({
    ctx,
    canvasEl: canvas,
    imgEl: img,
    anchorX: currentMousePos.x,
    anchorY: currentMousePos.y,
    imageU,
    imageV,
    scale,
    offsetX: offset.x,
    offsetY: offset.y,
    precisionActive: isPrecisionDrag
  })
}
