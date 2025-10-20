// Image viewport management with zoom controls

import React, { useState, useCallback, useRef } from 'react'
import { WorldPoint } from '../entities/world-point'
import { Viewpoint } from '../entities/viewpoint'

// Type alias for backward compatibility
type ProjectImage = Viewpoint

interface ViewportState {
  scale: number
  offset: { x: number; y: number }
}

export const useImageViewport = (
  image: ProjectImage | null,
  containerRef: React.RefObject<HTMLElement>
) => {
  const [viewport, setViewport] = useState<ViewportState>({
    scale: 1,
    offset: { x: 0, y: 0 }
  })

  const imageRef = useRef<HTMLImageElement>(new Image())

  // Fit image to container
  const fitToContainer = useCallback(() => {
    if (!image || !containerRef.current) return

    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()
    const img = imageRef.current

    if (!img.complete) return

    // Calculate scale to fit image
    const scaleX = containerRect.width / img.width
    const scaleY = containerRect.height / img.height
    const newScale = Math.min(scaleX, scaleY, 1) // Don't scale up

    setViewport({
      scale: newScale,
      offset: {
        x: (containerRect.width - img.width * newScale) / 2,
        y: (containerRect.height - img.height * newScale) / 2
      }
    })
  }, [image, containerRef])

  // Zoom to specific scale at point
  const zoomToPoint = useCallback((targetScale: number, centerX: number, centerY: number) => {
    if (!containerRef.current) return

    const newScale = Math.max(0.1, Math.min(5, targetScale))
    const scaleRatio = newScale / viewport.scale

    setViewport(prev => ({
      scale: newScale,
      offset: {
        x: centerX - (centerX - prev.offset.x) * scaleRatio,
        y: centerY - (centerY - prev.offset.y) * scaleRatio
      }
    }))
  }, [viewport.scale, containerRef])

  // Zoom to fit selected points
  const zoomToSelection = useCallback((
    selectedPointIds: string[],
    worldPoints: Record<string, WorldPoint>
  ) => {
    if (!image || !containerRef.current || selectedPointIds.length === 0) return

    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()

    // Get image points for selected world points from this image
    const imagePoints = image.getImagePoints().filter(ip =>
      selectedPointIds.includes(ip.worldPointId)
    )

    if (imagePoints.length === 0) return

    // Calculate bounding box of selected points
    const bounds = {
      minX: Math.min(...imagePoints.map(ip => ip.u)),
      maxX: Math.max(...imagePoints.map(ip => ip.u)),
      minY: Math.min(...imagePoints.map(ip => ip.v)),
      maxY: Math.max(...imagePoints.map(ip => ip.v))
    }

    // Add padding around selection
    const padding = 100 // pixels
    const width = bounds.maxX - bounds.minX + padding * 2
    const height = bounds.maxY - bounds.minY + padding * 2

    // Calculate scale to fit selection
    const scaleX = containerRect.width / width
    const scaleY = containerRect.height / height
    const newScale = Math.min(scaleX, scaleY, 2) // Max 2x zoom

    // Calculate center of selection
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2

    // Calculate offset to center the selection
    const offsetX = containerRect.width / 2 - centerX * newScale
    const offsetY = containerRect.height / 2 - centerY * newScale

    setViewport({
      scale: newScale,
      offset: { x: offsetX, y: offsetY }
    })
  }, [image, containerRef])

  // Zoom to fit all world points in current image
  const zoomToFitAll = useCallback((worldPoints: Record<string, WorldPoint>) => {
    if (!image || !containerRef.current) return

    const imagePoints = image.getImagePoints()

    if (imagePoints.length === 0) {
      fitToContainer()
      return
    }

    const allPointIds = imagePoints.map(ip => ip.worldPointId)

    zoomToSelection(allPointIds, worldPoints)
  }, [image, containerRef, fitToContainer, zoomToSelection])

  // Pan viewport by delta
  const pan = useCallback((deltaX: number, deltaY: number) => {
    setViewport(prev => ({
      ...prev,
      offset: {
        x: prev.offset.x + deltaX,
        y: prev.offset.y + deltaY
      }
    }))
  }, [])

  // Zoom in/out by factor
  const zoom = useCallback((factor: number, centerX?: number, centerY?: number) => {
    if (!containerRef.current) return

    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()

    const zoomCenterX = centerX ?? containerRect.width / 2
    const zoomCenterY = centerY ?? containerRect.height / 2

    zoomToPoint(viewport.scale * factor, zoomCenterX, zoomCenterY)
  }, [viewport.scale, zoomToPoint, containerRef])

  // Convert canvas coordinates to image coordinates
  const canvasToImageCoords = useCallback((canvasX: number, canvasY: number) => {
    if (!image) return null

    const imageX = (canvasX - viewport.offset.x) / viewport.scale
    const imageY = (canvasY - viewport.offset.y) / viewport.scale

    const [width, height] = [image.imageWidth, image.imageHeight]

    // Check if coordinates are within image bounds
    if (imageX < 0 || imageX > width || imageY < 0 || imageY > height) {
      return null
    }

    return { u: imageX, v: imageY }
  }, [image, viewport])

  // Convert image coordinates to canvas coordinates
  const imageToCanvasCoords = useCallback((imageX: number, imageY: number) => {
    return {
      x: imageX * viewport.scale + viewport.offset.x,
      y: imageY * viewport.scale + viewport.offset.y
    }
  }, [viewport])

  // Reset viewport to default
  const resetViewport = useCallback(() => {
    fitToContainer()
  }, [fitToContainer])

  // Get current zoom level as percentage
  const getZoomPercentage = useCallback(() => {
    return Math.round(viewport.scale * 100)
  }, [viewport.scale])

  return {
    // State
    viewport,
    scale: viewport.scale,
    offset: viewport.offset,

    // Actions
    setViewport,
    fitToContainer,
    zoomToPoint,
    zoomToSelection,
    zoomToFitAll,
    pan,
    zoom,
    resetViewport,

    // Utilities
    canvasToImageCoords,
    imageToCanvasCoords,
    getZoomPercentage,

    // Image ref for loading
    imageRef
  }
}

// Zoom controls component
export const ZoomControls: React.FC<{
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomFit: () => void
  onZoomToSelection: () => void
  onZoomToAll: () => void
  hasSelection: boolean
}> = ({
  scale,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onZoomToSelection,
  onZoomToAll,
  hasSelection
}) => {
  return (
    <div className="zoom-controls">
      <div className="zoom-buttons">
        <button
          className="zoom-btn"
          onClick={onZoomIn}
          title="Zoom In (+)"
        >
          🔍+
        </button>
        <button
          className="zoom-btn"
          onClick={onZoomOut}
          title="Zoom Out (-)"
        >
          🔍-
        </button>
        <div className="zoom-level">
          {Math.round(scale * 100)}%
        </div>
      </div>

      <div className="zoom-actions">
        <button
          className="zoom-action-btn"
          onClick={onZoomFit}
          title="Fit to Screen (F)"
        >
          🎯 Fit
        </button>
        <button
          className="zoom-action-btn"
          onClick={onZoomToSelection}
          disabled={!hasSelection}
          title="Zoom to Selection (S)"
        >
          📍 Selection
        </button>
        <button
          className="zoom-action-btn"
          onClick={onZoomToAll}
          title="Zoom to All Points (A)"
        >
          🌐 All
        </button>
      </div>
    </div>
  )
}

// Keyboard shortcuts for zoom controls
export const useZoomKeyboard = (
  onZoomIn: () => void,
  onZoomOut: () => void,
  onZoomFit: () => void,
  onZoomToSelection: () => void,
  onZoomToAll: () => void,
  hasSelection: boolean
) => {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (event.key.toLowerCase()) {
        case '+':
        case '=':
          event.preventDefault()
          onZoomIn()
          break
        case '-':
          event.preventDefault()
          onZoomOut()
          break
        case 'f':
          event.preventDefault()
          onZoomFit()
          break
        case 's':
          if (hasSelection) {
            event.preventDefault()
            onZoomToSelection()
          }
          break
        case 'a':
          if (!event.ctrlKey && !event.metaKey) {
            event.preventDefault()
            onZoomToAll()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onZoomIn, onZoomOut, onZoomFit, onZoomToSelection, onZoomToAll, hasSelection])
}