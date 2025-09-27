// Canvas-based image viewer with point interaction

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { ProjectImage, WorldPoint } from '../types/project'

interface ImageViewerProps {
  image: ProjectImage
  worldPoints: Record<string, WorldPoint>
  selectedPoints: string[]
  hoveredConstraintId: string | null
  onPointClick: (pointId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onCreatePoint?: (u: number, v: number) => void
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  image,
  worldPoints,
  selectedPoints,
  hoveredConstraintId,
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

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const img = imageRef.current

    if (!canvas || !ctx || !img || !imageLoaded) return

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

    // Draw selection overlays
    renderSelectionOverlay(ctx)

  }, [imageLoaded, scale, offset, worldPoints, selectedPoints, hoveredConstraintId])

  const renderWorldPoints = (ctx: CanvasRenderingContext2D) => {
    Object.values(worldPoints).forEach(wp => {
      const imagePoint = wp.imagePoints.find(ip => ip.imageId === image.id)
      if (!imagePoint || !wp.isVisible) return

      const x = imagePoint.u * scale + offset.x
      const y = imagePoint.v * scale + offset.y

      // Check if point is selected
      const isSelected = selectedPoints.includes(wp.id)

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

      // Draw selection ring
      ctx.strokeStyle = '#0696d7'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, 12, 0, 2 * Math.PI)
      ctx.stroke()

      // Draw selection number
      ctx.fillStyle = '#0696d7'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.font = '10px Arial'
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
          cursor: isDragging ? 'grabbing' : 'crosshair',
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
    </div>
  )
}

export default ImageViewer