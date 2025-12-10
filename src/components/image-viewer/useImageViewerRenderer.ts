import { MutableRefObject, RefObject, useEffect } from 'react'

import {
  CanvasToImage,
  ImageToCanvas,
  ImageViewerRenderState,
  OnMovePoint
} from './types'
import { renderWorldPoints } from './renderers/worldPointsRenderer'
import { renderLines } from './renderers/imagePointsRenderer'
import { renderVanishingLines } from './renderers/vanishingGeometryRenderer'
import { renderCameraVanishingGeometry } from './renderers/cameraGeometryRenderer'
import { renderConstructionPreview } from './renderers/constructionPreviewRenderer'
import { renderReprojectionErrors } from './renderers/reprojectionErrorRenderer'
import { renderSelectionOverlay } from './renderers/selectionOverlayRenderer'
import { renderPanFeedback } from './renderers/panFeedbackRenderer'
import { renderLoupeHelper } from './renderers/loupeRenderer'
import { RenderParams } from './renderers/types'

interface UseImageViewerRendererParams {
  canvasRef: RefObject<HTMLCanvasElement>
  imageRef: RefObject<HTMLImageElement>
  imageLoaded: boolean
  renderState: ImageViewerRenderState
  canvasToImageCoords: CanvasToImage
  imageToCanvasCoords: ImageToCanvas
  precisionCanvasPosRef: MutableRefObject<{ x: number; y: number } | null>
  draggedPointImageCoordsRef: MutableRefObject<{ u: number; v: number } | null>
  onMovePoint: OnMovePoint
}

export const useImageViewerRenderer = ({
  canvasRef,
  imageRef,
  imageLoaded,
  renderState,
  canvasToImageCoords,
  imageToCanvasCoords,
  precisionCanvasPosRef,
  draggedPointImageCoordsRef,
  onMovePoint
}: UseImageViewerRendererParams) => {
  const {
    viewpoint,
    worldPoints,
    lines,
    scale,
    offset,
    selectedPoints,
    selectedLines,
    selectedVanishingLines,
    constraintHighlightedPoints,
    hoveredConstraintId: hoveredConstraintIdForEffect,
    hoveredWorldPoint,
    hoveredPoint,
    hoveredLine,
    isDraggingPoint,
    draggedPoint,
    isDragging,
    panVelocity,
    constructionPreview,
    currentMousePos,
    isPrecisionDrag,
    isDragDropActive,
    isPlacementModeActive,
    isPointCreationActive,
    isLoopTraceActive,
    isVanishingLineActive,
    isDraggingVanishingLine,
    draggedVanishingLine,
    visibility
  } = renderState

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const img = imageRef.current

    if (!canvas || !ctx || !img || !imageLoaded) {
      return
    }

    let animationId: number | undefined

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      ctx.drawImage(
        img,
        offset.x,
        offset.y,
        img.width * scale,
        img.height * scale
      )

      const params: RenderParams = {
        ctx,
        canvasEl: canvas,
        imageEl: img,
        viewpoint,
        worldPoints,
        lines,
        scale,
        offset,
        selectedPoints,
        selectedLines,
        selectedVanishingLines,
        constraintHighlightedPoints,
        hoveredWorldPoint,
        hoveredPoint,
        hoveredLine,
        isDraggingPoint,
        draggedPoint,
        isDragging,
        panVelocity,
        constructionPreview,
        currentMousePos,
        isPrecisionDrag,
        isDragDropActive,
        isPlacementModeActive,
        isPointCreationActive,
        isLoopTraceActive,
        isVanishingLineActive,
        isDraggingVanishingLine,
        draggedVanishingLine,
        visibility,
        canvasToImageCoords,
        imageToCanvasCoords,
        precisionCanvasPosRef,
        draggedPointImageCoordsRef,
        onMovePoint: onMovePoint || null,
        canvasRef,
        imageRef
      }

      renderLines(params)
      renderVanishingLines(params)
      renderCameraVanishingGeometry(params)
      renderWorldPoints(params)
      renderReprojectionErrors(params)
      renderConstructionPreview(params)
      renderSelectionOverlay(params)
      renderPanFeedback(params)
      renderLoupeHelper(params)

      animationId = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [
    canvasRef,
    imageRef,
    imageLoaded,
    viewpoint,
    viewpoint.vanishingLines.size,
    worldPoints,
    lines,
    scale,
    offset,
    selectedPoints,
    selectedLines,
    selectedVanishingLines,
    constraintHighlightedPoints,
    hoveredConstraintIdForEffect,
    hoveredWorldPoint,
    hoveredPoint,
    hoveredLine,
    isDraggingPoint,
    draggedPoint,
    isDragging,
    panVelocity,
    constructionPreview,
    currentMousePos,
    isPrecisionDrag,
    isDragDropActive,
    isPlacementModeActive,
    isPointCreationActive,
    isLoopTraceActive,
    isVanishingLineActive,
    isDraggingVanishingLine,
    draggedVanishingLine,
    canvasToImageCoords,
    imageToCanvasCoords,
    precisionCanvasPosRef,
    draggedPointImageCoordsRef,
    onMovePoint,
    visibility
  ])
}
