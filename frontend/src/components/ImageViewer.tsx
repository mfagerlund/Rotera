// Canvas-based image viewer with point interaction

import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLocationDot } from '@fortawesome/free-solid-svg-icons'
import { useImageViewerRenderer } from './image-viewer/useImageViewerRenderer'
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
  onPointClick: (pointId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onLineClick?: (lineId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onCreatePoint?: (u: number, v: number) => void
  onMovePoint?: (worldPointId: string, u: number, v: number) => void
  onPointHover?: (pointId: string | null) => void
  onPointRightClick?: (pointId: string) => void
  onLineRightClick?: (lineId: string) => void
  onEmptySpaceClick?: (shiftKey: boolean) => void
  onZoomFit?: () => void
  onZoomSelection?: () => void
  onScaleChange?: (scale: number) => void
  isLoopTraceActive?: boolean
}

export const ImageViewer = forwardRef<ImageViewerRef, ImageViewerProps>(({
  image,
  worldPoints,
  lines = new Map(),
  selectedPoints,
  selectedLines = [],
  hoveredConstraintId,
  hoveredWorldPointId = null,
  placementMode = { active: false, worldPointId: null },
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
  isLoopTraceActive = false
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
  const [draggedPointId, setDraggedPointId] = useState<string | null>(null)
  const [dragStartPos, setDragStartPos] = useState<CanvasPoint>({ x: 0, y: 0 })
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null)
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null)
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

  // Load image
  useEffect(() => {
    if (!image) return

    const img = imageRef.current
    img.onload = () => {
      setImageLoaded(true)
      fitImageToCanvas()
    }
    img.src = image.blob
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

    selectedPoints.forEach(pointId => {
      const wp = worldPoints.get(pointId)
      const imagePoint = wp?.imagePoints.find(ip => ip.imageId === image.id)
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
  }, [selectedPoints, worldPoints, image.id])

  // Public zoom controls
  const zoomFit = useCallback(() => {
    fitImageToCanvas()
  }, [fitImageToCanvas])

  const zoomSelection = useCallback(() => {
    if (selectedPoints.length > 0) {
      zoomToSelection()
    } else {
      // If no selection, zoom to fit all points
      const allPointIds = Array.from(worldPoints.keys()).filter(id => {
        const wp = worldPoints.get(id)
        return wp?.imagePoints.some(ip => ip.imageId === image.id)
      })

      if (allPointIds.length > 0) {
        // Temporarily set selection to all points for zoom calculation
        const originalSelection = selectedPoints
        selectedPoints.splice(0, selectedPoints.length, ...allPointIds)
        zoomToSelection()
        selectedPoints.splice(0, selectedPoints.length, ...originalSelection)
      }
    }
  }, [selectedPoints, zoomToSelection, worldPoints, image.id])

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

  const imageToCanvasCoords = useCallback<ImageToCanvas>((u: number, v: number) => ({
    x: u * scale + offset.x,
    y: v * scale + offset.y
  }), [offset.x, offset.y, scale])

  const placementModeActive = placementMode?.active ?? false
  const creationContextActive = placementModeActive || isPointCreationActive || isLoopTraceActive
  const isPlacementInteractionActive = isDraggingPoint || isDragDropActive || creationContextActive

  const renderState = useMemo<ImageViewerRenderState>(() => ({
    imageId: image.id,
    worldPoints,
    lines,
    scale,
    offset,
    selectedPoints,
    selectedLines,
    hoveredConstraintId,
    hoveredWorldPointId: hoveredWorldPointId ?? null,
    hoveredPointId,
    hoveredLineId,
    isDraggingPoint,
    draggedPointId,
    isDragging,
    panVelocity,
    constructionPreview,
    currentMousePos,
    isPrecisionDrag,
    isDragDropActive,
    isPlacementModeActive: placementModeActive,
    isPointCreationActive,
    isLoopTraceActive
  }), [
    constructionPreview,
    currentMousePos,
    draggedPointId,
    hoveredConstraintId,
    hoveredLineId,
    hoveredPointId,
    hoveredWorldPointId,
    image.id,
    isDragDropActive,
    isDragging,
    isDraggingPoint,
    isPrecisionDrag,
    placementModeActive,
    isPointCreationActive,
    isLoopTraceActive,
    lines,
    offset,
    panVelocity,
    scale,
    selectedLines,
    selectedPoints,
    worldPoints
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

  // Find nearby point
  const findNearbyPoint = useCallback((canvasX: number, canvasY: number, threshold: number = 15) => {
    return Array.from(worldPoints.values()).find(wp => {
      const imagePoint = wp.imagePoints.find(ip => ip.imageId === image.id)
      if (!imagePoint) return false

      const pointCanvasX = imagePoint.u * scale + offset.x
      const pointCanvasY = imagePoint.v * scale + offset.y

      const distance = Math.sqrt(
        Math.pow(pointCanvasX - canvasX, 2) + Math.pow(pointCanvasY - canvasY, 2)
      )

      return distance <= threshold
    })
  }, [image.id, offset.x, offset.y, scale, worldPoints])

  // Find nearby line
  const findNearbyLine = useCallback((canvasX: number, canvasY: number, threshold: number = 10) => {
    for (const [lineId, line] of Array.from(lines.entries())) {
      if (!line.isVisible) continue

      const pointA = worldPoints.get(line.pointA)
      const pointB = worldPoints.get(line.pointB)
      if (!pointA || !pointB) continue

      const ipA = pointA.imagePoints.find(ip => ip.imageId === image.id)
      const ipB = pointB.imagePoints.find(ip => ip.imageId === image.id)
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

      if (distance <= threshold) return lineId
    }
    return null
  }, [image.id, lines, offset.x, offset.y, scale, worldPoints])

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

      if (placementMode.active && onCreatePoint) {
        // In placement mode, always create/place point regardless of nearby points
        let imageCoords = canvasToImageCoords(x, y)

        // Apply precision adjustment if precision toggle is active
        if (isPrecisionToggleActive && precisionCanvasPosRef.current) {
          const precisionPos: CanvasPoint = precisionCanvasPosRef.current
          const precisionImageCoords = canvasToImageCoords(precisionPos.x, precisionPos.y)
          if (precisionImageCoords) {
            imageCoords = precisionImageCoords
          }
        }

        if (imageCoords) {
          onCreatePoint(imageCoords.u, imageCoords.v)
        }
      } else {
        // Normal mode - check for nearby entities first
        setIsPrecisionDrag(false)
        const nearbyPoint = findNearbyPoint(x, y)
        const nearbyLine = findNearbyLine(x, y)

        if (nearbyPoint) {
          // Points have priority over lines
          const draggedImagePoint = nearbyPoint.imagePoints.find(ip => ip.imageId === image.id)
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
          setDraggedPointId(nearbyPoint.id)
          // Don't start dragging immediately - wait for mouse movement

          // Loop trace uses normal point clicks (selection system)
          onPointClick(nearbyPoint.id, event.ctrlKey, event.shiftKey)
        } else if (nearbyLine && onLineClick) {
          // Handle line click
          dragStartImageCoordsRef.current = null
          draggedPointImageCoordsRef.current = null
          precisionPointerRef.current = null
          onLineClick(nearbyLine, event.ctrlKey, event.shiftKey)
        } else {
          // Click on empty space
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
            if (isPrecisionToggleActive && precisionCanvasPosRef.current) {
              const precisionPos: CanvasPoint = precisionCanvasPosRef.current
              const precisionImageCoords = canvasToImageCoords(precisionPos.x, precisionPos.y)
              if (precisionImageCoords) {
                imageCoords = precisionImageCoords
              }
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
    } else if (draggedPointId && onMovePoint) {
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

            onMovePoint(draggedPointId, targetCoords.u, targetCoords.v)
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
            onMovePoint(draggedPointId, imageCoords.u, imageCoords.v)
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

      // Check for nearby entities to show hover cursor
      const nearbyPoint = findNearbyPoint(x, y)
      const nearbyLine = findNearbyLine(x, y)

      const newHoveredPointId = nearbyPoint?.id || null
      setHoveredPointId(newHoveredPointId)
      setHoveredLineId(nearbyLine || null)

      // Notify parent of hover changes
      if (onPointHover) {
        onPointHover(newHoveredPointId)
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
    setDraggedPointId(null)
    dragStartImageCoordsRef.current = null
    draggedPointImageCoordsRef.current = null
    precisionPointerRef.current = null
    precisionCanvasPosRef.current = null
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
    setHoveredPointId(null)
    setHoveredLineId(null)
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
    setDraggedPointId(null)
    dragStartImageCoordsRef.current = null
    draggedPointImageCoordsRef.current = null
    precisionPointerRef.current = null
    precisionCanvasPosRef.current = null
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
    console.log('Nearby point:', nearbyPoint?.id, 'Nearby line:', nearbyLine)

    if (nearbyPoint && onPointRightClick) {
      console.log('✓ Calling onPointRightClick for point:', nearbyPoint.id, nearbyPoint.name)
      onPointRightClick(nearbyPoint.id)
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
      if (!draggedPointId && !isDraggingPoint) return

      if (draggedPointId && dragStartImageCoordsRef.current && onMovePoint) {
        const origin = dragStartImageCoordsRef.current
        onMovePoint(draggedPointId, origin.u, origin.v)
      }

      setIsDragging(false)
      setIsDraggingPoint(false)
      setIsPrecisionDrag(false)
      setIsPrecisionToggleActive(false)
      setDraggedPointId(null)
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
  }, [draggedPointId, isDraggingPoint, onMovePoint])

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
      const hasActivePlacement = Boolean(draggedPointId || isPlacementInteractionActive)

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
  }, [scale, fitImageToCanvas, draggedPointId, isPlacementInteractionActive])

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
                  } else if (data.action === 'move' && onMovePoint) {
                    // For existing world points, move their image point
                    onMovePoint(data.worldPointId, imageCoords.u, imageCoords.v)
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
                  isDraggingPoint ? 'move' :
                  hoveredPointId && onMovePoint ? 'move' :
                  (hoveredPointId || hoveredLineId) ? 'pointer' :
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
      {placementMode.active && placementMode.worldPointId && (
        <div className="placement-mode-overlay">
          <div className="placement-instructions">
            <div className="placement-icon"><FontAwesomeIcon icon={faLocationDot} /></div>
            <div className="placement-text">
              <strong>Placing: {worldPoints.get(placementMode.worldPointId!)?.name}</strong>
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
