// Canvas-based image viewer with point interaction

import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { ProjectImage, WorldPoint } from '../types/project'

export interface ImageViewerRef {
  zoomFit: () => void
  zoomSelection: () => void
  getScale: () => number
  setScale: (newScale: number) => void
}

interface ImageViewerProps {
  image: ProjectImage
  worldPoints: Record<string, WorldPoint>
  selectedPoints: string[]
  hoveredConstraintId: string | null
  placementMode?: { active: boolean; worldPointId: string | null }
  activeConstraintType?: string | null
  onPointClick: (pointId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onCreatePoint?: (u: number, v: number) => void
  onMovePoint?: (worldPointId: string, u: number, v: number) => void
  onZoomFit?: () => void
  onZoomSelection?: () => void
  onScaleChange?: (scale: number) => void
}

export const ImageViewer = forwardRef<ImageViewerRef, ImageViewerProps>(({
  image,
  worldPoints,
  selectedPoints,
  hoveredConstraintId,
  placementMode = { active: false, worldPointId: null },
  activeConstraintType = null,
  onPointClick,
  onCreatePoint,
  onMovePoint,
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
  const [imageLoaded, setImageLoaded] = useState(false)

  // Drag state for world points
  const [isDraggingPoint, setIsDraggingPoint] = useState(false)
  const [draggedPointId, setDraggedPointId] = useState<string | null>(null)
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 })
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null)
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

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    zoomFit,
    zoomSelection,
    getScale: () => scale,
    setScale: setScaleValue
  }), [zoomFit, zoomSelection, scale, setScaleValue])

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
  }, [imageLoaded, scale, offset, worldPoints, selectedPoints, hoveredConstraintId, placementMode, isDraggingPoint, draggedPointId, hoveredPointId, isDragging, panVelocity, isAltKeyPressed])

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

    // Draw constraint preview lines when constraints are available (not just when actively creating)
    const lineBasedConstraints = ['distance', 'horizontal', 'vertical', 'parallel', 'perpendicular']
    const angleBasedConstraints = ['angle']
    const shapeBasedConstraints = ['rectangle']

    // Show line preview when 2 points selected (line-based constraints available)
    if (selectedPoints.length === 2) {
      const wp1 = worldPoints[selectedPoints[0]]
      const wp2 = worldPoints[selectedPoints[1]]
      const ip1 = wp1?.imagePoints.find(ip => ip.imageId === image.id)
      const ip2 = wp2?.imagePoints.find(ip => ip.imageId === image.id)

      if (ip1 && ip2) {
        const x1 = ip1.u * scale + offset.x
        const y1 = ip1.v * scale + offset.y
        const x2 = ip2.u * scale + offset.x
        const y2 = ip2.v * scale + offset.y

        ctx.strokeStyle = 'rgba(6, 150, 215, 0.5)'
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        ctx.setLineDash([])
      }
    } else if (selectedPoints.length === 3) {
      // Draw angle visualization for 3 points (angle/collinear/plane constraints available)
      const wps = selectedPoints.map(id => worldPoints[id])
      const ips = wps.map(wp => wp?.imagePoints.find(ip => ip.imageId === image.id))

      if (ips.every(ip => ip)) {
        ctx.strokeStyle = 'rgba(6, 150, 215, 0.5)'
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])

        // Draw lines forming the angle (vertex is middle point)
        const coords = ips.map(ip => ({
          x: ip!.u * scale + offset.x,
          y: ip!.v * scale + offset.y
        }))

        ctx.beginPath()
        ctx.moveTo(coords[0].x, coords[0].y)
        ctx.lineTo(coords[1].x, coords[1].y)
        ctx.moveTo(coords[1].x, coords[1].y)
        ctx.lineTo(coords[2].x, coords[2].y)
        ctx.stroke()
        ctx.setLineDash([])
      }
    } else if (selectedPoints.length === 4) {
      // Draw rectangle preview for 4 points (rectangle/plane constraints available)
      const wps = selectedPoints.map(id => worldPoints[id])
      const ips = wps.map(wp => wp?.imagePoints.find(ip => ip.imageId === image.id))

      if (ips.every(ip => ip)) {
        ctx.strokeStyle = 'rgba(6, 150, 215, 0.5)'
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])

        const coords = ips.map(ip => ({
          x: ip!.u * scale + offset.x,
          y: ip!.v * scale + offset.y
        }))

        // Draw quad outline
        ctx.beginPath()
        ctx.moveTo(coords[0].x, coords[0].y)
        ctx.lineTo(coords[1].x, coords[1].y)
        ctx.lineTo(coords[2].x, coords[2].y)
        ctx.lineTo(coords[3].x, coords[3].y)
        ctx.closePath()
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
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
        // Normal mode - check for nearby points first
        const nearbyPoint = findNearbyPoint(x, y)

        if (nearbyPoint) {
          // Prepare for potential drag, but also allow click selection
          setDragStartPos({ x, y })
          setDraggedPointId(nearbyPoint.id)
          // Don't start dragging immediately - wait for mouse movement
          onPointClick(nearbyPoint.id, event.ctrlKey, event.shiftKey)
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
      // Check for nearby points to show hover cursor
      const nearbyPoint = findNearbyPoint(x, y)
      setHoveredPointId(nearbyPoint?.id || null)
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
    setPanVelocity({ x: 0, y: 0 })

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

  // Enhanced wheel handling with Ctrl modifier
  const handleWheelEnhanced = (event: React.WheelEvent) => {
    event.preventDefault()

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top

    // Adjust zoom speed based on Ctrl key
    const baseScaleFactor = event.deltaY > 0 ? 0.9 : 1.1
    const scaleFactor = event.ctrlKey ?
      (event.deltaY > 0 ? 0.95 : 1.05) : // Slower zoom with Ctrl
      baseScaleFactor // Normal zoom speed

    const newScale = Math.max(0.1, Math.min(5, scale * scaleFactor))

    // Zoom towards mouse position
    const scaleRatio = newScale / scale
    setOffset(prev => ({
      x: mouseX - (mouseX - prev.x) * scaleRatio,
      y: mouseY - (mouseY - prev.y) * scaleRatio
    }))

    setScale(newScale)
  }

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
        onWheel={handleWheelEnhanced}
        style={{
          cursor: isDragging ? 'grabbing' :
                  isDraggingPoint ? 'move' :
                  hoveredPointId && onMovePoint ? 'move' :
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