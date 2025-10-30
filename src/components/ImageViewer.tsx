// Canvas-based image viewer with point interaction

import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLocationDot } from '@fortawesome/free-solid-svg-icons'
import { useImageViewerRenderer } from './image-viewer/useImageViewerRenderer'
import { WorldPoint } from '../entities/world-point'
import { Line as LineEntity } from '../entities/line'
import { VanishingLine } from '../entities/vanishing-line'
import { DEFAULT_VISIBILITY, DEFAULT_LOCKING, LockSettings, VisibilitySettings } from '../types/visibility'
import { ToolContext, SELECT_TOOL_CONTEXT } from '../types/tool-context'
import {
  CanvasOffset,
  CanvasPoint,
  CanvasToImage,
  ImageCoords,
  ImageToCanvas,
  ImageViewerPropsBase,
  ImageViewerRenderState,
  PanVelocity
} from './image-viewer/types'

const PRECISION_DRAG_RATIO = 0.12
const SHIFT_TAP_THRESHOLD_MS = 250

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
  toolContext = SELECT_TOOL_CONTEXT
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(new Image())

  const [scale, setScale] = useState<number>(1)
  const [offset, setOffset] = useState<CanvasOffset>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [lastMousePos, setLastMousePos] = useState<CanvasPoint>({ x: 0, y: 0 })
  const [currentMousePos, setCurrentMousePos] = useState<CanvasPoint | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Drag state for world points
  const [isDraggingPoint, setIsDraggingPoint] = useState(false)
  const [draggedPoint, setDraggedPoint] = useState<WorldPoint | null>(null)
  const [dragStartPos, setDragStartPos] = useState<CanvasPoint>({ x: 0, y: 0 })
  const [hoveredPoint, setHoveredPoint] = useState<WorldPoint | null>(null)
  const [hoveredLine, setHoveredLine] = useState<LineEntity | null>(null)
  const [hoveredVanishingLine, setHoveredVanishingLine] = useState<VanishingLine | null>(null)
  const [panVelocity, setPanVelocity] = useState<PanVelocity>({ x: 0, y: 0 })
  const [lastPanTime, setLastPanTime] = useState(0)
  const [isAltKeyPressed, setIsAltKeyPressed] = useState(false)
  const [isDragOverTarget, setIsDragOverTarget] = useState(false)
  const dragStartImageCoordsRef = useRef<ImageCoords | null>(null)
  const draggedPointImageCoordsRef = useRef<ImageCoords | null>(null)
  const precisionPointerRef = useRef<ImageCoords | null>(null)
  const precisionCanvasPosRef = useRef<CanvasPoint | null>(null)
  const shiftPressStartTimeRef = useRef<number | null>(null)
  const [isPrecisionDrag, setIsPrecisionDrag] = useState(false)
  const [isPrecisionToggleActive, setIsPrecisionToggleActive] = useState(false)
  const [isDragDropActive, setIsDragDropActive] = useState(false)
  const [vanishingLineStart, setVanishingLineStart] = useState<ImageCoords | null>(null)

  // Vanishing line drag state
  const [isDraggingVanishingLine, setIsDraggingVanishingLine] = useState(false)
  const [draggedVanishingLine, setDraggedVanishingLine] = useState<VanishingLine | null>(null)
  const [vanishingLineDragMode, setVanishingLineDragMode] = useState<'whole' | 'p1' | 'p2' | null>(null)
  const vanishingLineDragStartRef = useRef<{ p1: ImageCoords; p2: ImageCoords; mouseU: number; mouseV: number } | null>(null)

  // Load image
  useEffect(() => {
    if (!image) return

    const img = imageRef.current
    img.onload = () => {
      setImageLoaded(true)
      fitImageToCanvas()
    }
    img.src = image.url
  }, [image])

  // Fit image to canvas
  const fitImageToCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    const img = imageRef.current

    if (!canvas || !container || !img) return

    const containerRect = container.getBoundingClientRect()

    // Calculate scale to fit image using CSS size
    const cssWidth = containerRect.width
    const cssHeight = containerRect.height
    const scaleX = cssWidth / img.width
    const scaleY = cssHeight / img.height
    const newScale = Math.min(scaleX, scaleY, 1) // Don't scale up

    setScale(newScale)
    setOffset({
      x: (cssWidth - img.width * newScale) / 2,
      y: (cssHeight - img.height * newScale) / 2
    })
  }, [])

  // Zoom to fit selected points
  const zoomToSelection = useCallback(() => {
    const canvas = canvasRef.current
    const img = imageRef.current

    if (!canvas || !img || selectedPoints.length === 0) return

    // Find bounds of selected points
    let minU = Infinity, maxU = -Infinity
    let minV = Infinity, maxV = -Infinity

    selectedPoints.forEach(wp => {
      const imagePoint = image.getImagePointsForWorldPoint(wp)[0]
      if (imagePoint) {
        minU = Math.min(minU, imagePoint.u)
        maxU = Math.max(maxU, imagePoint.u)
        minV = Math.min(minV, imagePoint.v)
        maxV = Math.max(maxV, imagePoint.v)
      }
    })

    if (minU === Infinity) return

    // Add padding around selection
    const padding = 50
    const selectionWidth = maxU - minU + (padding * 2)
    const selectionHeight = maxV - minV + (padding * 2)
    const centerU = (minU + maxU) / 2
    const centerV = (minV + maxV) / 2

    // Calculate scale to fit selection using canvas dimensions
    const scaleX = canvas.width / selectionWidth
    const scaleY = canvas.height / selectionHeight
    const newScale = Math.min(scaleX, scaleY, 5) // Max zoom 5x

    // Center the selection
    setScale(newScale)
    setOffset({
      x: canvas.width / 2 - centerU * newScale,
      y: canvas.height / 2 - centerV * newScale
    })
  }, [selectedPoints, worldPoints, image])

  // Public zoom controls
  const zoomFit = useCallback(() => {
    fitImageToCanvas()
  }, [fitImageToCanvas])

  const zoomSelection = useCallback(() => {
    if (selectedPoints.length > 0) {
      zoomToSelection()
    } else {
      // If no selection, zoom to fit all points
      const allPoints = Array.from(worldPoints.values()).filter(wp =>
        image.getImagePointsForWorldPoint(wp).length > 0
      )

      if (allPoints.length > 0) {
        // Temporarily set selection to all points for zoom calculation
        const originalSelection = selectedPoints
        selectedPoints.splice(0, selectedPoints.length, ...allPoints)
        zoomToSelection()
        selectedPoints.splice(0, selectedPoints.length, ...originalSelection)
      }
    }
  }, [selectedPoints, zoomToSelection, worldPoints, image])

  // Set scale programmatically
  const setScaleValue = useCallback((newScale: number) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const clampedScale = Math.max(0.1, Math.min(5, newScale))
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2

    // Zoom towards center when setting scale programmatically
    const scaleRatio = clampedScale / scale
    setOffset(prev => ({
      x: centerX - (centerX - prev.x) * scaleRatio,
      y: centerY - (centerY - prev.y) * scaleRatio
    }))

    setScale(clampedScale)
  }, [scale])

  // Get current mouse position in image coordinates
  const getMousePosition = useCallback(() => {
    if (!currentMousePos) return null
    return canvasToImageCoords(currentMousePos.x, currentMousePos.y)
  }, [currentMousePos])

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    zoomFit,
    zoomSelection,
    getScale: () => scale,
    setScale: setScaleValue,
    getMousePosition
  }), [zoomFit, zoomSelection, scale, setScaleValue, getMousePosition])

  // Notify parent of scale changes
  useEffect(() => {
    if (onScaleChange) {
      onScaleChange(scale)
    }
  }, [scale, onScaleChange])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (imageLoaded) {
        fitImageToCanvas()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [imageLoaded, fitImageToCanvas])

  // Initialize canvas size to match CSS
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const updateCanvasSize = () => {
      const rect = container.getBoundingClientRect()
      // Set canvas internal resolution to match CSS size exactly
      canvas.width = rect.width
      canvas.height = rect.height
    }

    updateCanvasSize()

    // Update on resize
    const resizeObserver = new ResizeObserver(updateCanvasSize)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  const canvasToImageCoords = useCallback<CanvasToImage>((canvasX: number, canvasY: number) => {
    const img = imageRef.current
    if (!img) return null

    const imageX = (canvasX - offset.x) / scale
    const imageY = (canvasY - offset.y) / scale

    if (imageX < 0 || imageX > img.width || imageY < 0 || imageY > img.height) {
      return null
    }

    return { u: imageX, v: imageY }
  }, [offset.x, offset.y, scale])

  const canvasToImageCoordsUnbounded = useCallback((canvasX: number, canvasY: number): ImageCoords | null => {
    const img = imageRef.current
    if (!img) return null

    const imageX = (canvasX - offset.x) / scale
    const imageY = (canvasY - offset.y) / scale

    return { u: imageX, v: imageY }
  }, [offset.x, offset.y, scale])

  const imageToCanvasCoords = useCallback<ImageToCanvas>((u: number, v: number) => ({
    x: u * scale + offset.x,
    y: v * scale + offset.y
  }), [offset.x, offset.y, scale])

  const placementModeActive = placementMode?.active ?? false
  const creationContextActive = placementModeActive || isPointCreationActive || isLoopTraceActive
  const isPlacementInteractionActive = isDraggingPoint || isDragDropActive || creationContextActive

  // Use lineEntities directly - no need to convert!

  const renderState = useMemo<ImageViewerRenderState>(() => ({
    viewpoint: image,
    worldPoints,
    lines: lineEntities,
    scale,
    offset,
    selectedPoints,
    selectedLines,
    selectedVanishingLines,
    hoveredConstraintId,
    hoveredWorldPoint,
    hoveredPoint,
    hoveredLine,
    isDraggingPoint,
    draggedPoint,
    isDragging,
    panVelocity,
    constructionPreview: isVanishingLineActive && vanishingLineStart ? {
      type: 'vanishing-line',
      vanishingLineStart,
      vanishingLineAxis: currentVanishingLineAxis
    } : constructionPreview,
    currentMousePos,
    isPrecisionDrag,
    isDragDropActive,
    isPlacementModeActive: placementModeActive,
    isPointCreationActive,
    isLoopTraceActive,
    isVanishingLineActive,
    currentVanishingLineAxis,
    isDraggingVanishingLine,
    draggedVanishingLine,
    visibility
  }), [
    constructionPreview,
    currentMousePos,
    draggedPoint,
    hoveredConstraintId,
    hoveredLine,
    hoveredPoint,
    hoveredWorldPoint,
    image,
    isDragDropActive,
    isDragging,
    isDraggingPoint,
    isPrecisionDrag,
    placementModeActive,
    isPointCreationActive,
    isLoopTraceActive,
    isVanishingLineActive,
    vanishingLineStart,
    currentVanishingLineAxis,
    lineEntities,
    offset,
    panVelocity,
    scale,
    selectedLines,
    selectedPoints,
    selectedVanishingLines,
    worldPoints,
    isDraggingVanishingLine,
    draggedVanishingLine,
    visibility
  ])

  useImageViewerRenderer({
    canvasRef,
    imageRef,
    imageLoaded,
    renderState,
    canvasToImageCoords,
    imageToCanvasCoords,
    precisionCanvasPosRef,
    onMovePoint
  })

  const isEntityTypeInteractive = useCallback((entityType: keyof VisibilitySettings): boolean => {
    if (toolContext.allowedEntityTypes !== null) {
      if (!toolContext.allowedEntityTypes.has(entityType)) {
        return false
      }
    }

    if (!visibility[entityType]) {
      return false
    }

    const lockKey = entityType as keyof LockSettings
    if (lockKey in locking && locking[lockKey]) {
      return false
    }

    return true
  }, [toolContext, visibility, locking])

  // Find nearby point (checks worldPoints because image points are just visual representations)
  // NOTE: Locking world points prevents dragging their image points
  const findNearbyPoint = useCallback((canvasX: number, canvasY: number, threshold: number = 15) => {
    if (!isEntityTypeInteractive('worldPoints')) {
      return null
    }

    return Array.from(worldPoints.values()).find(wp => {
      const imagePoint = image.getImagePointsForWorldPoint(wp)[0]
      if (!imagePoint) return false

      const pointCanvasX = imagePoint.u * scale + offset.x
      const pointCanvasY = imagePoint.v * scale + offset.y

      const distance = Math.sqrt(
        Math.pow(pointCanvasX - canvasX, 2) + Math.pow(pointCanvasY - canvasY, 2)
      )

      return distance <= threshold
    })
  }, [isEntityTypeInteractive, image, offset.x, offset.y, scale, worldPoints])

  // Find nearby line
  const findNearbyLine = useCallback((canvasX: number, canvasY: number, threshold: number = 10): LineEntity | null => {
    if (!isEntityTypeInteractive('lines')) {
      return null
    }

    for (const [lineId, lineEntity] of Array.from(lineEntities.entries())) {
      // lineEntity.pointA and lineEntity.pointB are already WorldPoint entities
      const pointA = lineEntity.pointA
      const pointB = lineEntity.pointB

      const ipA = image.getImagePointsForWorldPoint(pointA)[0]
      const ipB = image.getImagePointsForWorldPoint(pointB)[0]
      if (!ipA || !ipB) continue

      const x1 = ipA.u * scale + offset.x
      const y1 = ipA.v * scale + offset.y
      const x2 = ipB.u * scale + offset.x
      const y2 = ipB.v * scale + offset.y

      const A = canvasX - x1
      const B = canvasY - y1
      const C = x2 - x1
      const D = y2 - y1

      const dot = A * C + B * D
      const lenSq = C * C + D * D

      if (lenSq === 0) {
        const distance = Math.sqrt(A * A + B * B)
        if (distance <= threshold) return lineId
        continue
      }

      let param = dot / lenSq
      param = Math.max(0, Math.min(1, param))

      const closestX = x1 + param * C
      const closestY = y1 + param * D

      const distance = Math.sqrt(
        Math.pow(canvasX - closestX, 2) + Math.pow(canvasY - closestY, 2)
      )

      if (distance <= threshold) return lineEntity
    }
    return null
  }, [isEntityTypeInteractive, image, lineEntities, offset.x, offset.y, scale])

  // Find nearby vanishing line and which part was clicked
  const findNearbyVanishingLinePart = useCallback((canvasX: number, canvasY: number, endpointThreshold: number = 15, lineThreshold: number = 10): { line: VanishingLine; part: 'p1' | 'p2' | 'whole' } | null => {
    if (!isEntityTypeInteractive('vanishingLines')) {
      return null
    }

    if (!image.vanishingLines) return null

    for (const vanishingLine of image.vanishingLines) {
      const x1 = vanishingLine.p1.u * scale + offset.x
      const y1 = vanishingLine.p1.v * scale + offset.y
      const x2 = vanishingLine.p2.u * scale + offset.x
      const y2 = vanishingLine.p2.v * scale + offset.y

      // Check endpoints first (higher priority)
      const dist1 = Math.sqrt((canvasX - x1) ** 2 + (canvasY - y1) ** 2)
      if (dist1 <= endpointThreshold) {
        return { line: vanishingLine, part: 'p1' }
      }

      const dist2 = Math.sqrt((canvasX - x2) ** 2 + (canvasY - y2) ** 2)
      if (dist2 <= endpointThreshold) {
        return { line: vanishingLine, part: 'p2' }
      }

      // Check line body
      const A = canvasX - x1
      const B = canvasY - y1
      const C = x2 - x1
      const D = y2 - y1

      const dot = A * C + B * D
      const lenSq = C * C + D * D

      if (lenSq === 0) continue

      let param = dot / lenSq
      param = Math.max(0, Math.min(1, param))

      const closestX = x1 + param * C
      const closestY = y1 + param * D

      const distance = Math.sqrt((canvasX - closestX) ** 2 + (canvasY - closestY) ** 2)

      if (distance <= lineThreshold) {
        return { line: vanishingLine, part: 'whole' }
      }
    }

    return null
  }, [isEntityTypeInteractive, image, offset.x, offset.y, scale])

  // Find nearby vanishing line (for backward compatibility)
  const findNearbyVanishingLine = useCallback((canvasX: number, canvasY: number, threshold: number = 10): VanishingLine | null => {
    const result = findNearbyVanishingLinePart(canvasX, canvasY, threshold, threshold)
    return result ? result.line : null
  }, [findNearbyVanishingLinePart])

  // Handle mouse events
  // Handle mouse events
  const handleMouseDown = (event: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    precisionPointerRef.current = null
    precisionCanvasPosRef.current = null
    setIsPrecisionToggleActive(false)

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    if (event.button === 1 || (event.button === 0 && event.altKey)) {
      // Middle mouse or Alt+click for panning
      setIsDragging(true)
      setLastMousePos({ x, y })
      setLastPanTime(Date.now())
      setPanVelocity({ x: 0, y: 0 })
      event.preventDefault()
    } else if (event.button === 0) {
      // Left click for point interaction

      if (isVanishingLineActive && onCreateVanishingLine) {
        // Vanishing line mode - two-click interaction
        const imageCoords = canvasToImageCoords(x, y)
        if (!imageCoords) return

        if (!vanishingLineStart) {
          // First click - set start point
          setVanishingLineStart(imageCoords)
        } else {
          // Second click - create vanishing line
          onCreateVanishingLine(vanishingLineStart, imageCoords)
          setVanishingLineStart(null)
        }
      } else if (placementMode.active && onCreatePoint) {
        // In placement mode, always create/place point regardless of nearby points
        let imageCoords = canvasToImageCoords(x, y)

        // Save precision coords in case they're needed
        const savedPrecisionCoords = isPrecisionToggleActive ? draggedPointImageCoordsRef.current : null

        // Apply precision adjustment if precision toggle is active
        if (isPrecisionToggleActive && savedPrecisionCoords) {
          imageCoords = savedPrecisionCoords
        }

        if (imageCoords) {
          onCreatePoint(imageCoords.u, imageCoords.v)
        }
      } else {
        // Normal mode - check for nearby entities first
        setIsPrecisionDrag(false)
        const nearbyPoint = findNearbyPoint(x, y)
        const nearbyLine = findNearbyLine(x, y)
        const nearbyVanishingLine = findNearbyVanishingLine(x, y)

        if (nearbyPoint) {
          // Points have priority over lines
          const draggedImagePoint = image.getImagePointsForWorldPoint(nearbyPoint)[0]
          if (draggedImagePoint) {
            dragStartImageCoordsRef.current = { u: draggedImagePoint.u, v: draggedImagePoint.v }
            draggedPointImageCoordsRef.current = { u: draggedImagePoint.u, v: draggedImagePoint.v }
          } else {
            dragStartImageCoordsRef.current = null
            draggedPointImageCoordsRef.current = null
          }
          precisionPointerRef.current = null
          setIsPrecisionDrag(false)
          setIsPrecisionToggleActive(false)
          setDragStartPos({ x, y })
          setDraggedPoint(nearbyPoint)
          // Don't start dragging immediately - wait for mouse movement

          // Single click for selection and properties
          onPointClick(nearbyPoint, event.ctrlKey, event.shiftKey)
        } else if (nearbyLine && onLineClick) {
          // Handle line click
          dragStartImageCoordsRef.current = null
          draggedPointImageCoordsRef.current = null
          precisionPointerRef.current = null
          onLineClick(nearbyLine, event.ctrlKey, event.shiftKey)
        } else if (nearbyVanishingLine && onVanishingLineClick) {
          // Handle vanishing line click - check which part was clicked for dragging
          const vanishingLinePart = findNearbyVanishingLinePart(x, y)

          if (vanishingLinePart) {
            // Set up dragging state (use unbounded coords since vanishing lines can extend outside image)
            const imageCoords = canvasToImageCoordsUnbounded(x, y)
            if (imageCoords) {
              setDraggedVanishingLine(vanishingLinePart.line)
              setVanishingLineDragMode(vanishingLinePart.part)
              vanishingLineDragStartRef.current = {
                p1: { ...vanishingLinePart.line.p1 },
                p2: { ...vanishingLinePart.line.p2 },
                mouseU: imageCoords.u,
                mouseV: imageCoords.v
              }
            }
          }

          dragStartImageCoordsRef.current = null
          draggedPointImageCoordsRef.current = null
          precisionPointerRef.current = null
          onVanishingLineClick(nearbyVanishingLine, event.ctrlKey, event.shiftKey)
        } else {
          // Click on empty space

          // Save precision coords BEFORE clearing refs
          const savedPrecisionCoords = isPrecisionToggleActive ? draggedPointImageCoordsRef.current : null

          dragStartImageCoordsRef.current = null
          draggedPointImageCoordsRef.current = null
          precisionPointerRef.current = null

          // Clear selection if not holding shift
          if (onEmptySpaceClick) {
            onEmptySpaceClick(event.shiftKey)
          }

          // Create point if tool is active (loop trace or point tool)
          if (onCreatePoint) {
            let imageCoords = canvasToImageCoords(x, y)

            // Apply precision adjustment if precision toggle is active
            if (isPrecisionToggleActive && savedPrecisionCoords) {
              imageCoords = savedPrecisionCoords
            }

            if (imageCoords) {
              onCreatePoint(imageCoords.u, imageCoords.v)
            }
          }
        }
      }
    }
  }

  const handleMouseMove = (event: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    // Always track current mouse position for construction preview
    setCurrentMousePos({ x, y })

    if (isDragging) {
      setIsPrecisionDrag(false)
      // Handle viewport panning
      const deltaX = x - lastMousePos.x
      const deltaY = y - lastMousePos.y
      const currentTime = Date.now()

      // Calculate pan velocity for visual feedback
      const timeDelta = currentTime - lastPanTime
      if (timeDelta > 0) {
        setPanVelocity({
          x: deltaX / timeDelta * 100, // Scale for better feedback
          y: deltaY / timeDelta * 100
        })
        setLastPanTime(currentTime)
      }

      setOffset(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }))

      setLastMousePos({ x, y })
    } else if (draggedVanishingLine && vanishingLineDragMode && vanishingLineDragStartRef.current) {
      // Handle vanishing line dragging (use unbounded coords since lines can extend outside image)
      const imageCoords = canvasToImageCoordsUnbounded(x, y)
      if (imageCoords) {
        const dragStart = vanishingLineDragStartRef.current
        const deltaU = imageCoords.u - dragStart.mouseU
        const deltaV = imageCoords.v - dragStart.mouseV

        if (!isDraggingVanishingLine) {
          const dragDistance = Math.sqrt(deltaU * deltaU + deltaV * deltaV)
          if (dragDistance > 5) {
            setIsDraggingVanishingLine(true)
          }
        }

        if (isDraggingVanishingLine) {
          if (vanishingLineDragMode === 'whole') {
            // Move both endpoints
            draggedVanishingLine.setEndpoints(
              { u: dragStart.p1.u + deltaU, v: dragStart.p1.v + deltaV },
              { u: dragStart.p2.u + deltaU, v: dragStart.p2.v + deltaV }
            )
          } else if (vanishingLineDragMode === 'p1') {
            // Move only p1
            draggedVanishingLine.setEndpoints(
              { u: dragStart.p1.u + deltaU, v: dragStart.p1.v + deltaV },
              dragStart.p2
            )
          } else if (vanishingLineDragMode === 'p2') {
            // Move only p2
            draggedVanishingLine.setEndpoints(
              dragStart.p1,
              { u: dragStart.p2.u + deltaU, v: dragStart.p2.v + deltaV }
            )
          }
        }
      }
    } else if (draggedPoint && onMovePoint) {
      // Check if we should start dragging based on mouse movement distance
      const dragDistance = Math.sqrt(
        Math.pow(x - dragStartPos.x, 2) + Math.pow(y - dragStartPos.y, 2)
      )

      if (!isDraggingPoint && dragDistance > 5) {
        // Start dragging when mouse moves more than 5 pixels
        setIsDraggingPoint(true)
      }

      if (isDraggingPoint) {
        // Handle point dragging - update point position in real-time
        const imageCoords = canvasToImageCoords(x, y)
        if (imageCoords) {
          const precisionActive = event.shiftKey || isPrecisionToggleActive

          if (precisionActive) {
            setIsPrecisionDrag(true)
            const previousPointer = precisionPointerRef.current || imageCoords
            const deltaU = imageCoords.u - previousPointer.u
            const deltaV = imageCoords.v - previousPointer.v
            precisionPointerRef.current = imageCoords

            const baseCoords = draggedPointImageCoordsRef.current || dragStartImageCoordsRef.current || imageCoords
            const targetCoords = {
              u: baseCoords.u + deltaU * PRECISION_DRAG_RATIO,
              v: baseCoords.v + deltaV * PRECISION_DRAG_RATIO
            }

            onMovePoint(draggedPoint, targetCoords.u, targetCoords.v)
            draggedPointImageCoordsRef.current = targetCoords
            precisionCanvasPosRef.current = imageToCanvasCoords(targetCoords.u, targetCoords.v)
          } else {
            if (precisionPointerRef.current) {
              precisionPointerRef.current = null
            }
            if (precisionCanvasPosRef.current) {
              precisionCanvasPosRef.current = null
            }
            if (isPrecisionDrag) {
              setIsPrecisionDrag(false)
            }
            onMovePoint(draggedPoint, imageCoords.u, imageCoords.v)
            draggedPointImageCoordsRef.current = imageCoords
          }
        } else {
          if (precisionPointerRef.current) {
            precisionPointerRef.current = null
          }
          if (precisionCanvasPosRef.current) {
            precisionCanvasPosRef.current = null
          }
          setIsPrecisionDrag(false)
        }
      } else {
        if (precisionPointerRef.current) {
          precisionPointerRef.current = null
        }
        if (precisionCanvasPosRef.current) {
          precisionCanvasPosRef.current = null
        }
        setIsPrecisionDrag(false)
      }
    } else {
      // Handle precision mode in placement contexts (without dragging)
      if (isPlacementInteractionActive && isPrecisionToggleActive) {
        setIsPrecisionDrag(true)
        const imageCoords = canvasToImageCoords(x, y)
        if (imageCoords) {
          const previousPointer = precisionPointerRef.current || imageCoords
          const deltaU = imageCoords.u - previousPointer.u
          const deltaV = imageCoords.v - previousPointer.v
          precisionPointerRef.current = imageCoords

          const baseCoords = draggedPointImageCoordsRef.current || imageCoords
          const targetCoords = {
            u: baseCoords.u + deltaU * PRECISION_DRAG_RATIO,
            v: baseCoords.v + deltaV * PRECISION_DRAG_RATIO
          }

          draggedPointImageCoordsRef.current = targetCoords
          precisionCanvasPosRef.current = imageToCanvasCoords(targetCoords.u, targetCoords.v)
        }
      } else {
        // Only clear if precision is NOT supposed to be active
        if (!isPrecisionToggleActive) {
          if (precisionCanvasPosRef.current) {
            precisionCanvasPosRef.current = null
          }
          if (precisionPointerRef.current) {
            precisionPointerRef.current = null
          }
          if (draggedPointImageCoordsRef.current) {
            draggedPointImageCoordsRef.current = null
          }
          setIsPrecisionDrag(false)
        }
      }

      // Check for nearby entities to show hover cursor
      const nearbyPoint = findNearbyPoint(x, y)
      const nearbyLine = findNearbyLine(x, y)
      const nearbyVanishingLine = findNearbyVanishingLine(x, y)

      setHoveredPoint(nearbyPoint || null)
      setHoveredLine(nearbyLine || null)
      setHoveredVanishingLine(nearbyVanishingLine || null)

      // Notify parent of hover changes
      if (onPointHover) {
        onPointHover(nearbyPoint || null)
      }
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setPanVelocity({ x: 0, y: 0 })

    // End point dragging
    if (isDraggingPoint) {
      setIsDraggingPoint(false)
    }
    setIsPrecisionDrag(false)
    setIsPrecisionToggleActive(false)
    setDraggedPoint(null)
    dragStartImageCoordsRef.current = null
    draggedPointImageCoordsRef.current = null
    precisionPointerRef.current = null
    precisionCanvasPosRef.current = null

    // End vanishing line dragging
    if (isDraggingVanishingLine) {
      setIsDraggingVanishingLine(false)
    }
    setDraggedVanishingLine(null)
    setVanishingLineDragMode(null)
    vanishingLineDragStartRef.current = null
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
    setHoveredPoint(null)
    setHoveredLine(null)
    setHoveredVanishingLine(null)
    setPanVelocity({ x: 0, y: 0 })

    // Clear hover state
    if (onPointHover) {
      onPointHover(null)
    }

    // End point dragging
    if (isDraggingPoint) {
      setIsDraggingPoint(false)
    }
    setIsPrecisionDrag(false)
    setIsPrecisionToggleActive(false)
    setDraggedPoint(null)
    dragStartImageCoordsRef.current = null
    draggedPointImageCoordsRef.current = null
    precisionPointerRef.current = null
    precisionCanvasPosRef.current = null

    // End vanishing line dragging
    if (isDraggingVanishingLine) {
      setIsDraggingVanishingLine(false)
    }
    setDraggedVanishingLine(null)
    setVanishingLineDragMode(null)
    vanishingLineDragStartRef.current = null
  }

  const handleContextMenu = (event: React.MouseEvent) => {
    console.log('=== ImageViewer: handleContextMenu triggered ===')
    console.log('Event button:', event.button, 'Event type:', event.type)
    console.log('onPointRightClick defined:', !!onPointRightClick)
    console.log('onLineClick defined:', !!onLineClick)

    event.preventDefault()
    event.stopPropagation()

    const canvas = canvasRef.current
    if (!canvas) {
      console.log('No canvas ref')
      return
    }

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    console.log('Click position:', x, y)

    // Find nearby entities (points have priority over lines)
    const nearbyPoint = findNearbyPoint(x, y)
    const nearbyLine = findNearbyLine(x, y)
    console.log('Nearby point:', nearbyPoint?.getName(), 'Nearby line:', nearbyLine)

    if (nearbyPoint && onPointRightClick) {
      console.log('✓ Calling onPointRightClick for point:', nearbyPoint.getName())
      onPointRightClick(nearbyPoint)
    } else if (nearbyLine && onLineRightClick) {
      console.log('✓ Calling onLineRightClick for line:', nearbyLine)
      onLineRightClick(nearbyLine)
    } else {
      console.log('× No nearby entity found (empty space)')
    }
  }

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.target instanceof HTMLElement && event.target !== document.body) return

      // Cancel in-progress vanishing line
      if (vanishingLineStart) {
        setVanishingLineStart(null)
        event.preventDefault()
        return
      }

      if (!draggedPoint && !isDraggingPoint) return

      if (draggedPoint && dragStartImageCoordsRef.current && onMovePoint) {
        const origin = dragStartImageCoordsRef.current
        onMovePoint(draggedPoint, origin.u, origin.v)
      }

      setIsDragging(false)
      setIsDraggingPoint(false)
      setIsPrecisionDrag(false)
      setIsPrecisionToggleActive(false)
      setDraggedPoint(null)
      dragStartImageCoordsRef.current = null
      draggedPointImageCoordsRef.current = null
      precisionPointerRef.current = null
      precisionCanvasPosRef.current = null
      setCurrentMousePos(null)
      setPanVelocity({ x: 0, y: 0 })
      event.preventDefault()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [draggedPoint, isDraggingPoint, onMovePoint, vanishingLineStart])

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault()

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top

    const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(5, scale * scaleFactor))

    // Zoom towards mouse position
    const scaleRatio = newScale / scale
    setOffset(prev => ({
      x: mouseX - (mouseX - prev.x) * scaleRatio,
      y: mouseY - (mouseY - prev.y) * scaleRatio
    }))

    setScale(newScale)
  }

  // Keyboard shortcuts for zoom
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target !== document.body) return // Only handle when not in input

      if (event.key === '=' || event.key === '+') {
        event.preventDefault()
        const canvas = canvasRef.current
        if (canvas) {
          const centerX = canvas.width / 2
          const centerY = canvas.height / 2
          const scaleFactor = 1.2
          const newScale = Math.min(5, scale * scaleFactor)

          const scaleRatio = newScale / scale
          setOffset(prev => ({
            x: centerX - (centerX - prev.x) * scaleRatio,
            y: centerY - (centerY - prev.y) * scaleRatio
          }))
          setScale(newScale)
        }
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        const canvas = canvasRef.current
        if (canvas) {
          const centerX = canvas.width / 2
          const centerY = canvas.height / 2
          const scaleFactor = 0.8
          const newScale = Math.max(0.1, scale * scaleFactor)

          const scaleRatio = newScale / scale
          setOffset(prev => ({
            x: centerX - (centerX - prev.x) * scaleRatio,
            y: centerY - (centerY - prev.y) * scaleRatio
          }))
          setScale(newScale)
        }
      } else if (event.key === '0') {
        event.preventDefault()
        fitImageToCanvas()
      }
    }

    const handleAltKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        setIsAltKeyPressed(true)
      }
    }

    const handleAltKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        setIsAltKeyPressed(false)
      }
    }

    const handleShiftKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift' && !event.repeat) {
        shiftPressStartTimeRef.current = Date.now()
      }
    }

    const handleShiftKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Shift') {
        return
      }

      const pressStarted = shiftPressStartTimeRef.current
      shiftPressStartTimeRef.current = null

      if (!pressStarted) {
        return
      }

      const pressDuration = Date.now() - pressStarted
      const hasActivePlacement = Boolean(draggedPoint || isPlacementInteractionActive)

      if (pressDuration <= SHIFT_TAP_THRESHOLD_MS && hasActivePlacement) {
        setIsPrecisionToggleActive(prev => {
          const next = !prev
          if (!next) {
            setIsPrecisionDrag(false)
            precisionPointerRef.current = null
            precisionCanvasPosRef.current = null
          } else if (isPlacementInteractionActive) {
            setIsPrecisionDrag(true)
          }
          return next
        })
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
  }, [scale, fitImageToCanvas, draggedPoint, isPlacementInteractionActive])

  // NO ZOOM HANDLING - REMOVED COMPLETELY

  return (
    <div
      ref={containerRef}
      className="image-viewer"
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setIsDragOverTarget(true)
          setIsDragDropActive(true)
          setIsPrecisionDrag(false)
          setIsPrecisionToggleActive(false)
          precisionPointerRef.current = null
          precisionCanvasPosRef.current = null

          // Update mouse position for loupe
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
          precisionPointerRef.current = null
          precisionCanvasPosRef.current = null
        }}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragOverTarget(false)
          setIsDragDropActive(false)
          setCurrentMousePos(null)
          setIsPrecisionDrag(false)
          setIsPrecisionToggleActive(false)
          precisionPointerRef.current = null
          precisionCanvasPosRef.current = null
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
                    // For new world points, just place them
                    onCreatePoint(imageCoords.u, imageCoords.v)
                  } else if (data.action === 'move' && onMovePoint && data.worldPointId) {
                    // For existing world points, move their image point
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
          cursor: isDragging ? 'grabbing' :
                  isDraggingVanishingLine ? 'grabbing' :
                  isDraggingPoint ? 'move' :
                  hoveredVanishingLine ? 'grab' :
                  hoveredPoint && onMovePoint ? 'move' :
                  (hoveredPoint || hoveredLine) ? 'pointer' :
                  placementMode.active ? 'copy' :
                  isAltKeyPressed ? 'grab' : 'crosshair',
          display: 'block',
          width: '100%',
          height: '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain'
        }}
      />

      {!imageLoaded && (
        <div className="image-loading">
          <span>Loading image...</span>
        </div>
      )}

      {/* Placement mode overlay */}
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
