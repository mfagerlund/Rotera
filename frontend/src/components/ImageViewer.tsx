// Canvas-based image viewer with point interaction

import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { ProjectImage, WorldPoint } from '../types/project'

export interface ImageViewerRef {
  zoomFit: () => void
  zoomSelection: () => void
  getScale: () => number
  setScale: (newScale: number) => void
  getMousePosition: () => { u: number; v: number } | null
}

interface LineData {
  id: string
  name: string
  pointA: string
  pointB: string
  length?: number
  color: string
  isVisible: boolean
  isConstruction: boolean
  createdAt: string
  updatedAt?: string
  constraints?: {
    direction: 'free' | 'horizontal' | 'vertical' | 'x-aligned' | 'y-aligned' | 'z-aligned'
    targetLength?: number
    tolerance?: number
  }
}

interface ImageViewerProps {
  image: ProjectImage
  worldPoints: Record<string, WorldPoint>
  lines?: Record<string, LineData>
  selectedPoints: string[]
  selectedLines?: string[]
  hoveredConstraintId: string | null
  hoveredWorldPointId?: string | null
  placementMode?: { active: boolean; worldPointId: string | null }
  activeConstraintType?: string | null
  constructionPreview?: {
    type: 'line'
    pointA?: string
    pointB?: string
    showToCursor?: boolean
  } | null
  onPointClick: (pointId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onLineClick?: (lineId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onCreatePoint?: (u: number, v: number) => void
  onMovePoint?: (worldPointId: string, u: number, v: number) => void
  onPointHover?: (pointId: string | null) => void
  onZoomFit?: () => void
  onZoomSelection?: () => void
  onScaleChange?: (scale: number) => void
}

export const ImageViewer = forwardRef<ImageViewerRef, ImageViewerProps>(({
  image,
  worldPoints,
  lines = {},
  selectedPoints,
  selectedLines = [],
  hoveredConstraintId,
  hoveredWorldPointId,
  placementMode = { active: false, worldPointId: null },
  activeConstraintType = null,
  constructionPreview = null,
  onPointClick,
  onLineClick,
  onCreatePoint,
  onMovePoint,
  onPointHover,
  onZoomFit,
  onZoomSelection,
  onScaleChange
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(new Image())

  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })
  const [currentMousePos, setCurrentMousePos] = useState<{ x: number; y: number } | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Drag state for world points
  const [isDraggingPoint, setIsDraggingPoint] = useState(false)
  const [draggedPointId, setDraggedPointId] = useState<string | null>(null)
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 })
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null)
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null)
  const [panVelocity, setPanVelocity] = useState({ x: 0, y: 0 })
  const [lastPanTime, setLastPanTime] = useState(0)
  const [isAltKeyPressed, setIsAltKeyPressed] = useState(false)

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
      const wp = worldPoints[pointId]
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
      const allPointIds = Object.keys(worldPoints).filter(id => {
        const wp = worldPoints[id]
        return wp.imagePoints.some(ip => ip.imageId === image.id)
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

  // Render canvas with animation frame
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const img = imageRef.current

    if (!canvas || !ctx || !img || !imageLoaded) return

    let animationId: number

    const render = () => {
      // Clear canvas using canvas dimensions
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw image
      ctx.drawImage(
        img,
        offset.x,
        offset.y,
        img.width * scale,
        img.height * scale
      )

      // Draw world points
      renderWorldPoints(ctx)

      // Draw lines
      renderLines(ctx)

      // Draw construction preview
      renderConstructionPreview(ctx)

      // Draw selection overlays with animation
      renderSelectionOverlay(ctx)

      // Draw pan feedback
      renderPanFeedback(ctx)

      animationId = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [imageLoaded, scale, offset, worldPoints, lines, selectedPoints, selectedLines, hoveredConstraintId, hoveredWorldPointId, placementMode, isDraggingPoint, draggedPointId, hoveredPointId, hoveredLineId, isDragging, panVelocity, isAltKeyPressed, constructionPreview, currentMousePos])

  const renderWorldPoints = (ctx: CanvasRenderingContext2D) => {
    Object.values(worldPoints).forEach(wp => {
      const imagePoint = wp.imagePoints.find(ip => ip.imageId === image.id)
      if (!imagePoint || !wp.isVisible) return

      const x = imagePoint.u * scale + offset.x
      const y = imagePoint.v * scale + offset.y

      // Check point states
      const isSelected = selectedPoints.includes(wp.id)
      const isBeingDragged = isDraggingPoint && draggedPointId === wp.id
      const isHovered = hoveredPointId === wp.id
      const isGloballyHovered = hoveredWorldPointId === wp.id

      // Note: Removed green circle world point selection - only blue constraint selection is used

      // Draw drag feedback for point being dragged
      if (isBeingDragged) {
        ctx.strokeStyle = 'rgba(255, 140, 0, 0.8)'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.arc(x, y, 18, 0, 2 * Math.PI)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Draw hover feedback for draggable points
      if (isHovered && onMovePoint && !isBeingDragged) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, 10, 0, 2 * Math.PI)
        ctx.stroke()
      }

      // Draw global hover feedback (from other components)
      if (isGloballyHovered && !isSelected && !isBeingDragged) {
        ctx.strokeStyle = 'rgba(255, 193, 7, 0.8)' // Amber color for global hover
        ctx.lineWidth = 3
        ctx.setLineDash([2, 2])
        ctx.beginPath()
        ctx.arc(x, y, 12, 0, 2 * Math.PI)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Draw point
      ctx.fillStyle = wp.color || '#ff6b6b'
      ctx.strokeStyle = isSelected ? '#ffffff' : '#000000'
      ctx.lineWidth = isSelected ? 3 : 1

      ctx.beginPath()
      ctx.arc(x, y, 6, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()

      // Draw point name
      ctx.fillStyle = '#000000'
      ctx.font = '12px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(wp.name, x, y - 10)

      // Draw white outline for text readability
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3
      ctx.strokeText(wp.name, x, y - 10)
      ctx.fillText(wp.name, x, y - 10)
    })
  }

  const renderSelectionOverlay = (ctx: CanvasRenderingContext2D) => {
    selectedPoints.forEach((pointId, index) => {
      const wp = worldPoints[pointId]
      const imagePoint = wp?.imagePoints.find(ip => ip.imageId === image.id)

      if (!imagePoint) return

      const x = imagePoint.u * scale + offset.x
      const y = imagePoint.v * scale + offset.y

      // Draw selection ring with animation
      const time = Date.now() * 0.003
      const pulseRadius = 12 + Math.sin(time) * 2

      ctx.strokeStyle = '#0696d7'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI)
      ctx.stroke()

      // Draw secondary ring for multi-selection
      if (selectedPoints.length > 1) {
        ctx.strokeStyle = 'rgba(6, 150, 215, 0.3)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, pulseRadius + 5, 0, 2 * Math.PI)
        ctx.stroke()
      }

      // Draw selection number badge
      ctx.fillStyle = '#0696d7'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.font = 'bold 10px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const numberX = x + 15
      const numberY = y - 15

      ctx.beginPath()
      ctx.arc(numberX, numberY, 8, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = '#ffffff'
      ctx.fillText((index + 1).toString(), numberX, numberY)
    })

  }

  const renderPanFeedback = (ctx: CanvasRenderingContext2D) => {
    if (!isDragging || (Math.abs(panVelocity.x) < 0.1 && Math.abs(panVelocity.y) < 0.1)) return

    const canvas = canvasRef.current
    if (!canvas) return

    // Draw pan direction indicator in corner using canvas dimensions
    const indicatorSize = 80
    const margin = 20
    const centerX = canvas.width - margin - indicatorSize / 2
    const centerY = margin + indicatorSize / 2

    // Draw background circle
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.beginPath()
    ctx.arc(centerX, centerY, indicatorSize / 2, 0, 2 * Math.PI)
    ctx.fill()

    // Draw border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Draw velocity arrow
    const maxVelocity = 20
    const normalizedVx = Math.max(-1, Math.min(1, panVelocity.x / maxVelocity))
    const normalizedVy = Math.max(-1, Math.min(1, panVelocity.y / maxVelocity))

    const arrowLength = Math.sqrt(normalizedVx * normalizedVx + normalizedVy * normalizedVy) * (indicatorSize / 3)
    const arrowEndX = centerX + normalizedVx * arrowLength
    const arrowEndY = centerY + normalizedVy * arrowLength

    if (arrowLength > 5) {
      // Draw arrow line
      ctx.strokeStyle = 'rgba(6, 150, 215, 0.8)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.lineTo(arrowEndX, arrowEndY)
      ctx.stroke()

      // Draw arrow head
      const headSize = 8
      const angle = Math.atan2(normalizedVy, normalizedVx)

      ctx.fillStyle = 'rgba(6, 150, 215, 0.8)'
      ctx.beginPath()
      ctx.moveTo(arrowEndX, arrowEndY)
      ctx.lineTo(
        arrowEndX - headSize * Math.cos(angle - Math.PI / 6),
        arrowEndY - headSize * Math.sin(angle - Math.PI / 6)
      )
      ctx.lineTo(
        arrowEndX - headSize * Math.cos(angle + Math.PI / 6),
        arrowEndY - headSize * Math.sin(angle + Math.PI / 6)
      )
      ctx.closePath()
      ctx.fill()
    }

    // Draw center dot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.beginPath()
    ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI)
    ctx.fill()
  }

  // Render completed lines on the image
  const renderLines = (ctx: CanvasRenderingContext2D) => {
    Object.entries(lines).forEach(([lineId, line]) => {
      if (!line.isVisible) return

      const pointA = worldPoints[line.pointA]
      const pointB = worldPoints[line.pointB]

      if (!pointA || !pointB) return

      // Check if both points have image points in this image
      const ipA = pointA.imagePoints.find(ip => ip.imageId === image.id)
      const ipB = pointB.imagePoints.find(ip => ip.imageId === image.id)

      if (!ipA || !ipB) return

      // Convert to canvas coordinates
      const x1 = ipA.u * scale + offset.x
      const y1 = ipA.v * scale + offset.y
      const x2 = ipB.u * scale + offset.x
      const y2 = ipB.v * scale + offset.y

      // Check line states
      const isSelected = selectedLines.includes(lineId)
      const isHovered = hoveredLineId === lineId

      // Draw line with hover/selection feedback
      let strokeColor = line.isConstruction ? 'rgba(0, 150, 255, 0.6)' : line.color
      let lineWidth = line.isConstruction ? 1 : 2

      if (isSelected) {
        strokeColor = '#FFC107' // Yellow for selection
        lineWidth = 3
      } else if (isHovered) {
        strokeColor = '#42A5F5' // Light blue for hover
        lineWidth = 3
      }

      ctx.strokeStyle = strokeColor
      ctx.lineWidth = lineWidth

      if (line.isConstruction) {
        ctx.setLineDash([3, 3])
      }

      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()

      if (line.isConstruction) {
        ctx.setLineDash([])
      }

      // Always show line name and distance (if set)
      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2

      // Show glyph with direction constraint if available
      let directionGlyph = '↔' // Default glyph
      if (line.constraints) {
        switch (line.constraints.direction) {
          case 'horizontal': directionGlyph = '↔'; break
          case 'vertical': directionGlyph = '↕'; break
          case 'x-aligned': directionGlyph = '→'; break
          case 'y-aligned': directionGlyph = '↑'; break
          case 'z-aligned': directionGlyph = '⬆'; break
          case 'free': directionGlyph = '↔'; break
        }
      }

      const displayText = line.constraints?.targetLength
        ? `${line.name} ${directionGlyph} ${line.constraints.targetLength.toFixed(1)}m`
        : `${line.name} ${directionGlyph}`

      // Draw outlined text
      ctx.font = '12px Arial'
      ctx.textAlign = 'center'

      // Draw text outline (stroke)
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 3
      ctx.strokeText(displayText, midX, midY - 2)

      // Draw text fill
      ctx.fillStyle = '#000'
      ctx.fillText(displayText, midX, midY - 2)
    })
  }

  // Render construction preview for line tool
  const renderConstructionPreview = (ctx: CanvasRenderingContext2D) => {
    if (!constructionPreview || constructionPreview.type !== 'line') return
    if (!currentMousePos) return

    const { pointA, pointB, showToCursor } = constructionPreview

    // Case 1: One point defined, show line to cursor
    if (pointA && !pointB && showToCursor) {
      const wpA = worldPoints[pointA]
      if (!wpA) return

      const ipA = wpA.imagePoints.find(ip => ip.imageId === image.id)
      if (!ipA) return

      const x1 = ipA.u * scale + offset.x
      const y1 = ipA.v * scale + offset.y
      const x2 = currentMousePos.x
      const y2 = currentMousePos.y

      // Draw preview line
      ctx.strokeStyle = 'rgba(255, 140, 0, 0.8)'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])

      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Case 2: Two points defined, show completed line preview
    if (pointA && pointB) {
      const wpA = worldPoints[pointA]
      const wpB = worldPoints[pointB]
      if (!wpA || !wpB) return

      const ipA = wpA.imagePoints.find(ip => ip.imageId === image.id)
      const ipB = wpB.imagePoints.find(ip => ip.imageId === image.id)
      if (!ipA || !ipB) return

      const x1 = ipA.u * scale + offset.x
      const y1 = ipA.v * scale + offset.y
      const x2 = ipB.u * scale + offset.x
      const y2 = ipB.v * scale + offset.y

      // Draw preview line (brighter than final line)
      ctx.strokeStyle = 'rgba(255, 140, 0, 0.9)'
      ctx.lineWidth = 3

      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }

  // Convert canvas coordinates to image coordinates
  const canvasToImageCoords = (canvasX: number, canvasY: number) => {
    const img = imageRef.current
    if (!img) return null

    const imageX = (canvasX - offset.x) / scale
    const imageY = (canvasY - offset.y) / scale

    // Check if coordinates are within image bounds
    if (imageX < 0 || imageX > img.width || imageY < 0 || imageY > img.height) {
      return null
    }

    return { u: imageX, v: imageY }
  }

  // Find nearby point
  const findNearbyPoint = (canvasX: number, canvasY: number, threshold: number = 15) => {
    return Object.values(worldPoints).find(wp => {
      const imagePoint = wp.imagePoints.find(ip => ip.imageId === image.id)
      if (!imagePoint) return false

      const pointCanvasX = imagePoint.u * scale + offset.x
      const pointCanvasY = imagePoint.v * scale + offset.y

      const distance = Math.sqrt(
        Math.pow(pointCanvasX - canvasX, 2) + Math.pow(pointCanvasY - canvasY, 2)
      )

      return distance <= threshold
    })
  }

  // Find nearby line
  const findNearbyLine = (canvasX: number, canvasY: number, threshold: number = 5) => {
    for (const [lineId, line] of Object.entries(lines)) {
      if (!line.isVisible) continue

      const pointA = worldPoints[line.pointA]
      const pointB = worldPoints[line.pointB]
      if (!pointA || !pointB) continue

      // Check if both points have image points in this image
      const ipA = pointA.imagePoints.find(ip => ip.imageId === image.id)
      const ipB = pointB.imagePoints.find(ip => ip.imageId === image.id)
      if (!ipA || !ipB) continue

      // Convert to canvas coordinates
      const x1 = ipA.u * scale + offset.x
      const y1 = ipA.v * scale + offset.y
      const x2 = ipB.u * scale + offset.x
      const y2 = ipB.v * scale + offset.y

      // Calculate distance from point to line segment
      const A = canvasX - x1
      const B = canvasY - y1
      const C = x2 - x1
      const D = y2 - y1

      const dot = A * C + B * D
      const lenSq = C * C + D * D

      if (lenSq === 0) {
        // Line is a point
        const distance = Math.sqrt(A * A + B * B)
        if (distance <= threshold) return lineId
        continue
      }

      let param = dot / lenSq

      // All lines are segments, clamp parameter to [0, 1]
      param = Math.max(0, Math.min(1, param))

      const closestX = x1 + param * C
      const closestY = y1 + param * D

      const distance = Math.sqrt(
        Math.pow(canvasX - closestX, 2) + Math.pow(canvasY - closestY, 2)
      )

      if (distance <= threshold) return lineId
    }
    return null
  }

  // Handle mouse events
  const handleMouseDown = (event: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

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
        const imageCoords = canvasToImageCoords(x, y)
        if (imageCoords) {
          onCreatePoint(imageCoords.u, imageCoords.v)
        }
      } else {
        // Normal mode - check for nearby entities first
        const nearbyPoint = findNearbyPoint(x, y)
        const nearbyLine = findNearbyLine(x, y)

        if (nearbyPoint) {
          // Points have priority over lines
          setDragStartPos({ x, y })
          setDraggedPointId(nearbyPoint.id)
          // Don't start dragging immediately - wait for mouse movement
          onPointClick(nearbyPoint.id, event.ctrlKey, event.shiftKey)
        } else if (nearbyLine && onLineClick) {
          // Handle line click
          onLineClick(nearbyLine, event.ctrlKey, event.shiftKey)
        } else if (onCreatePoint) {
          // Click on empty space - create new point
          const imageCoords = canvasToImageCoords(x, y)
          if (imageCoords) {
            onCreatePoint(imageCoords.u, imageCoords.v)
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
          onMovePoint(draggedPointId, imageCoords.u, imageCoords.v)
        }
      }
    } else {
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
    setDraggedPointId(null)
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
    setDraggedPointId(null)
  }

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

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keydown', handleAltKeyDown)
    window.addEventListener('keyup', handleAltKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keydown', handleAltKeyDown)
      window.removeEventListener('keyup', handleAltKeyUp)
    }
  }, [scale, fitImageToCanvas])

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
            <div className="placement-icon">📍</div>
            <div className="placement-text">
              <strong>Placing: {worldPoints[placementMode.worldPointId]?.name}</strong>
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