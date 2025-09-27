// Canvas-based image viewer with point interaction

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { ProjectImage, WorldPoint } from '../types/project'

interface ImageViewerProps {
  image: ProjectImage
  worldPoints: Record<string, WorldPoint>
  selectedPoints: string[]
  selectedWorldPointIds?: string[]
  highlightedWorldPointId?: string | null
  hoveredConstraintId: string | null
  placementMode?: { active: boolean; worldPointId: string | null }
  activeConstraintType?: string | null
  onPointClick: (pointId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onCreatePoint?: (u: number, v: number) => void
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  image,
  worldPoints,
  selectedPoints,
  selectedWorldPointIds = [],
  highlightedWorldPointId = null,
  hoveredConstraintId,
  placementMode = { active: false, worldPointId: null },
  activeConstraintType = null,
  onPointClick,
  onCreatePoint
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(new Image())

  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })
  const [imageLoaded, setImageLoaded] = useState(false)

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
    canvas.width = containerRect.width
    canvas.height = containerRect.height

    // Calculate scale to fit image
    const scaleX = canvas.width / img.width
    const scaleY = canvas.height / img.height
    const newScale = Math.min(scaleX, scaleY, 1) // Don't scale up

    setScale(newScale)
    setOffset({
      x: (canvas.width - img.width * newScale) / 2,
      y: (canvas.height - img.height * newScale) / 2
    })
  }, [])

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

  // Render canvas with animation frame
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const img = imageRef.current

    if (!canvas || !ctx || !img || !imageLoaded) return

    let animationId: number

    const render = () => {
      // Clear canvas
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

      animationId = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [imageLoaded, scale, offset, worldPoints, selectedPoints, selectedWorldPointIds, highlightedWorldPointId, hoveredConstraintId, placementMode])

  const renderWorldPoints = (ctx: CanvasRenderingContext2D) => {
    Object.values(worldPoints).forEach(wp => {
      const imagePoint = wp.imagePoints.find(ip => ip.imageId === image.id)
      if (!imagePoint || !wp.isVisible) return

      const x = imagePoint.u * scale + offset.x
      const y = imagePoint.v * scale + offset.y

      // Check point states
      const isSelected = selectedPoints.includes(wp.id)
      const isWorldPointSelected = selectedWorldPointIds.includes(wp.id)
      const isHighlighted = highlightedWorldPointId === wp.id

      // Draw highlight ring for world point selection/highlighting
      // Only show world point selection ring if not also constraint-selected (to avoid double rings)
      if ((isWorldPointSelected || isHighlighted) && !isSelected) {
        ctx.strokeStyle = isHighlighted ? '#ff8c00' : '#27ae60'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(x, y, 12, 0, 2 * Math.PI)
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
          // Click on existing point
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
    if (!isDragging) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    const deltaX = x - lastMousePos.x
    const deltaY = y - lastMousePos.y

    setOffset(prev => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY
    }))

    setLastMousePos({ x, y })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
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
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          cursor: isDragging ? 'grabbing' : placementMode.active ? 'copy' : 'crosshair',
          display: 'block',
          width: '100%',
          height: '100%'
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
}

export default ImageViewer