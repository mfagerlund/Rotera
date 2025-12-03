import React, { useRef, useEffect, useImperativeHandle, forwardRef, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLocationDot } from '@fortawesome/free-solid-svg-icons'
import { useImageViewerRenderer } from './image-viewer/useImageViewerRenderer'
import { WorldPoint } from '../entities/world-point'
import { Line as LineEntity } from '../entities/line'
import { VanishingLine } from '../entities/vanishing-line'
import { DEFAULT_VISIBILITY, DEFAULT_LOCKING } from '../types/visibility'
import { SELECT_TOOL_CONTEXT } from '../types/tool-context'
import { ImageViewerPropsBase, ImageViewerRenderState } from './image-viewer/types'
import { usePrecisionMode } from '../hooks/usePrecisionMode'
import { useImageViewerState } from './image-viewer/hooks/useImageViewerState'
import { useImageTransform } from './image-viewer/hooks/useImageTransform'
import { useSelectionManager } from './image-viewer/hooks/useSelectionManager'
import { useImageViewerEvents } from './image-viewer/hooks/useImageViewerEvents'
import { ImageCanvas } from './image-viewer/components/ImageCanvas'

export interface ImageViewerRef {
  zoomFit: () => void
  zoomSelection: () => void
  getScale: () => number
  setScale: (newScale: number) => void
  getMousePosition: () => { u: number; v: number } | null
}

interface ImageViewerProps extends ImageViewerPropsBase {
  onPointClick: (worldPoint: WorldPoint, ctrlKey: boolean, shiftKey: boolean) => void
  onLineClick?: (lineEntity: LineEntity, ctrlKey: boolean, shiftKey: boolean) => void
  onCreatePoint?: (u: number, v: number) => void
  onMovePoint?: (worldPoint: WorldPoint, u: number, v: number) => void
  onPlaceWorldPoint?: (worldPoint: WorldPoint, u: number, v: number) => void
  onPointHover?: (worldPoint: WorldPoint | null) => void
  onPointRightClick?: (worldPoint: WorldPoint) => void
  onLineRightClick?: (lineEntity: LineEntity) => void
  onEmptySpaceClick?: (shiftKey: boolean) => void
  onZoomFit?: () => void
  onZoomSelection?: () => void
  onScaleChange?: (scale: number) => void
  isLoopTraceActive?: boolean
  onCreateVanishingLine?: (p1: { u: number; v: number }, p2: { u: number; v: number }) => void
  onVanishingLineClick?: (vanishingLine: VanishingLine, ctrlKey: boolean, shiftKey: boolean) => void
  selectedVanishingLines?: VanishingLine[]
  onMousePositionChange?: (position: { u: number; v: number } | null) => void
  onEscapePressed?: () => void
}

export const ImageViewer = forwardRef<ImageViewerRef, ImageViewerProps>(({
  image,
  worldPoints,
  lineEntities = new Map(),
  selectedPoints,
  selectedLines = [],
  hoveredConstraintId,
  hoveredWorldPoint = null,
  placementMode = { active: false, worldPoint: null },
  isPointCreationActive = false,
  activeConstraintType = null,
  constructionPreview = null,
  onPointClick,
  onLineClick,
  onCreatePoint,
  onMovePoint,
  onPlaceWorldPoint,
  onPointHover,
  onPointRightClick,
  onLineRightClick,
  onEmptySpaceClick,
  onZoomFit,
  onZoomSelection,
  onScaleChange,
  isLoopTraceActive = false,
  isVanishingLineActive = false,
  currentVanishingLineAxis,
  onCreateVanishingLine,
  onVanishingLineClick,
  selectedVanishingLines = [],
  visibility = DEFAULT_VISIBILITY,
  locking = DEFAULT_LOCKING,
  toolContext = SELECT_TOOL_CONTEXT,
  onMousePositionChange,
  onEscapePressed
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(new Image())

  const {
    imageViewerState,
    dragState,
    pointDragState,
    precisionDragState,
    vanishingLineDragState
  } = useImageViewerState()

  const transform = useImageTransform({
    canvasRef,
    containerRef,
    imageRef,
    scale: imageViewerState.scale,
    setScale: imageViewerState.setScale,
    offset: imageViewerState.offset,
    setOffset: imageViewerState.setOffset,
    imageLoaded: imageViewerState.imageLoaded,
    setImageLoaded: imageViewerState.setImageLoaded,
    image,
    selectedPoints,
    worldPoints,
    onScaleChange
  })

  const selectionManager = useSelectionManager({
    image,
    worldPoints,
    lineEntities,
    scale: imageViewerState.scale,
    offset: imageViewerState.offset,
    visibility,
    locking,
    toolContext
  })

  const precisionMode = usePrecisionMode(transform.imageToCanvasCoords)

  const events = useImageViewerEvents({
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
  })

  useImperativeHandle(ref, () => ({
    zoomFit: transform.zoomFit,
    zoomSelection: transform.zoomSelection,
    getScale: () => imageViewerState.scale,
    setScale: transform.setScaleValue,
    getMousePosition: () => transform.getMousePosition(imageViewerState.currentMousePos)
  }), [transform, imageViewerState.scale, imageViewerState.currentMousePos])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const updateCanvasSize = () => {
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
    }

    updateCanvasSize()

    const resizeObserver = new ResizeObserver(updateCanvasSize)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  const placementModeActive = placementMode?.active ?? false
  const creationContextActive = placementModeActive || isPointCreationActive || isLoopTraceActive || isVanishingLineActive
  const isPlacementInteractionActive = pointDragState.isDraggingPoint || precisionDragState.isDragDropActive || creationContextActive

  const renderState = useMemo<ImageViewerRenderState>(() => ({
    viewpoint: image,
    worldPoints,
    lines: lineEntities,
    scale: imageViewerState.scale,
    offset: imageViewerState.offset,
    selectedPoints,
    selectedLines,
    selectedVanishingLines,
    hoveredConstraintId,
    hoveredWorldPoint,
    hoveredPoint: pointDragState.hoveredPoint,
    hoveredLine: pointDragState.hoveredLine,
    isDraggingPoint: pointDragState.isDraggingPoint,
    draggedPoint: pointDragState.draggedPoint,
    isDragging: dragState.isDragging,
    panVelocity: imageViewerState.panVelocity,
    constructionPreview: isVanishingLineActive && vanishingLineDragState.vanishingLineStart ? {
      type: 'vanishing-line',
      vanishingLineStart: vanishingLineDragState.vanishingLineStart,
      vanishingLineAxis: currentVanishingLineAxis
    } : constructionPreview,
    currentMousePos: imageViewerState.currentMousePos,
    isPrecisionDrag: precisionDragState.isPrecisionDrag,
    isDragDropActive: precisionDragState.isDragDropActive,
    isPlacementModeActive: placementModeActive,
    isPointCreationActive,
    isLoopTraceActive,
    isVanishingLineActive,
    currentVanishingLineAxis,
    isDraggingVanishingLine: vanishingLineDragState.isDraggingVanishingLine,
    draggedVanishingLine: vanishingLineDragState.draggedVanishingLine,
    visibility
  }), [
    constructionPreview,
    currentVanishingLineAxis,
    dragState.isDragging,
    hoveredConstraintId,
    hoveredWorldPoint,
    image,
    imageViewerState.currentMousePos,
    imageViewerState.offset,
    imageViewerState.panVelocity,
    imageViewerState.scale,
    isLoopTraceActive,
    isPointCreationActive,
    isVanishingLineActive,
    lineEntities,
    placementModeActive,
    pointDragState.draggedPoint,
    pointDragState.hoveredLine,
    pointDragState.hoveredPoint,
    pointDragState.isDraggingPoint,
    precisionDragState.isDragDropActive,
    precisionDragState.isPrecisionDrag,
    selectedLines,
    selectedPoints,
    selectedVanishingLines,
    vanishingLineDragState.draggedVanishingLine,
    vanishingLineDragState.isDraggingVanishingLine,
    vanishingLineDragState.vanishingLineStart,
    visibility,
    worldPoints
  ])

  useImageViewerRenderer({
    canvasRef,
    imageRef,
    imageLoaded: imageViewerState.imageLoaded,
    renderState,
    canvasToImageCoords: transform.canvasToImageCoords,
    imageToCanvasCoords: transform.imageToCanvasCoords,
    precisionCanvasPosRef: pointDragState.precisionCanvasPosRef,
    draggedPointImageCoordsRef: pointDragState.draggedPointImageCoordsRef,
    onMovePoint
  })

  return (
    <div
      ref={containerRef}
      className="image-viewer"
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <ImageCanvas
        canvasRef={canvasRef}
        worldPoints={worldPoints}
        isDragging={dragState.isDragging}
        isDraggingVanishingLine={vanishingLineDragState.isDraggingVanishingLine}
        isDraggingPoint={pointDragState.isDraggingPoint}
        hoveredVanishingLine={!!pointDragState.hoveredVanishingLine}
        hoveredPoint={pointDragState.hoveredPoint}
        hoveredLine={!!pointDragState.hoveredLine}
        placementModeActive={placementModeActive}
        isAltKeyPressed={dragState.isAltKeyPressed}
        isDragOverTarget={pointDragState.isDragOverTarget}
        setIsDragOverTarget={pointDragState.setIsDragOverTarget}
        setIsDragDropActive={precisionDragState.setIsDragDropActive}
        setCurrentMousePos={imageViewerState.setCurrentMousePos}
        setIsPrecisionDrag={precisionDragState.setIsPrecisionDrag}
        setIsPrecisionToggleActive={precisionDragState.setIsPrecisionToggleActive}
        precisionPointerRef={pointDragState.precisionPointerRef}
        precisionCanvasPosRef={pointDragState.precisionCanvasPosRef}
        draggedPointImageCoordsRef={pointDragState.draggedPointImageCoordsRef}
        canvasToImageCoords={transform.canvasToImageCoords}
        getPrecisionState={precisionMode.getPrecisionState}
        applyPrecisionToImageDelta={precisionMode.applyPrecisionToImageDelta}
        onCreatePoint={onCreatePoint}
        onMovePoint={onMovePoint}
        onPlaceWorldPoint={onPlaceWorldPoint}
        events={events}
      />

      {!imageViewerState.imageLoaded && (
        <div className="image-loading">
          <span>Loading image...</span>
        </div>
      )}

      {placementMode.active && placementMode.worldPoint && (
        <div className="placement-mode-overlay">
          <div className="placement-instructions">
            <div className="placement-icon"><FontAwesomeIcon icon={faLocationDot} /></div>
            <div className="placement-text">
              <strong>Placing: {placementMode.worldPoint.name}</strong>
              <div className="placement-hint">Click anywhere on the image to place this world point</div>
              <div className="placement-escape">Press Esc to cancel</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

ImageViewer.displayName = 'ImageViewer'

export default ImageViewer
