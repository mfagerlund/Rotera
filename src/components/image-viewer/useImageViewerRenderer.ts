import { MutableRefObject, RefObject, useEffect } from 'react'

import {
  CanvasToImage,
  ImageToCanvas,
  ImageViewerRenderState,
  OnMovePoint
} from './types'

interface UseImageViewerRendererParams {
  canvasRef: RefObject<HTMLCanvasElement>
  imageRef: RefObject<HTMLImageElement>
  imageLoaded: boolean
  renderState: ImageViewerRenderState
  canvasToImageCoords: CanvasToImage
  imageToCanvasCoords: ImageToCanvas
  precisionCanvasPosRef: MutableRefObject<{ x: number; y: number } | null>
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
    isLoopTraceActive
  } = renderState

  const isPlacementInteractionActive = isDraggingPoint || isDragDropActive || isPlacementModeActive || isPointCreationActive || isLoopTraceActive

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const img = imageRef.current

    if (!canvas || !ctx || !img || !imageLoaded) {
      return
    }

    let animationId: number | undefined

    const renderWorldPoints = () => {
      Array.from(worldPoints.values()).forEach(wp => {
        const imagePoints = viewpoint.getImagePointsForWorldPoint(wp)
        const imagePoint = imagePoints.length > 0 ? imagePoints[0] : null
        if (!imagePoint || !wp.isVisible) {
          return
        }

        const x = imagePoint.u * scale + offset.x
        const y = imagePoint.v * scale + offset.y

        const isSelected = selectedPoints.includes(wp)
        const isBeingDragged = isDraggingPoint && draggedPointId === wp
        const isHovered = hoveredPointId === wp
        const isGloballyHovered = hoveredWorldPointId === wp

        if (isBeingDragged) {
          ctx.strokeStyle = 'rgba(255, 140, 0, 0.8)'
          ctx.lineWidth = 2
          ctx.setLineDash([4, 4])
          ctx.beginPath()
          ctx.arc(x, y, 18, 0, 2 * Math.PI)
          ctx.stroke()
          ctx.setLineDash([])
        }

        if (isHovered && onMovePoint && !isBeingDragged) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(x, y, 10, 0, 2 * Math.PI)
          ctx.stroke()
        }

        if (isGloballyHovered && !isSelected && !isBeingDragged) {
          ctx.strokeStyle = 'rgba(255, 193, 7, 0.8)'
          ctx.lineWidth = 3
          ctx.setLineDash([2, 2])
          ctx.beginPath()
          ctx.arc(x, y, 12, 0, 2 * Math.PI)
          ctx.stroke()
          ctx.setLineDash([])
        }

        ctx.fillStyle = wp.color || '#ff6b6b'
        ctx.strokeStyle = isSelected ? '#ffffff' : '#000000'
        ctx.lineWidth = isSelected ? 3 : 1

        ctx.beginPath()
        ctx.arc(x, y, 6, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()

        ctx.fillStyle = '#000000'
        ctx.font = '12px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(wp.name, x, y - 10)

        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 3
        ctx.strokeText(wp.name, x, y - 10)
        ctx.fillText(wp.name, x, y - 10)
      })
    }

    const renderSelectionOverlay = () => {
      selectedPoints.forEach((wp, index) => {
        if (!wp) return

        const imagePoints = viewpoint.getImagePointsForWorldPoint(wp)
        const imagePoint = imagePoints.length > 0 ? imagePoints[0] : null
        if (!imagePoint) {
          return
        }

        const x = imagePoint.u * scale + offset.x
        const y = imagePoint.v * scale + offset.y

        const time = Date.now() * 0.003
        const pulseRadius = 12 + Math.sin(time) * 2

        ctx.strokeStyle = '#0696d7'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI)
        ctx.stroke()

        if (selectedPoints.length > 1) {
          ctx.strokeStyle = 'rgba(6, 150, 215, 0.3)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(x, y, pulseRadius + 5, 0, 2 * Math.PI)
          ctx.stroke()
        }

        ctx.fillStyle = '#0696d7'
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.font = 'bold 10px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        const numberX = x + 15
        const numberY = y - 15

        ctx.beginPath()
        ctx.arc(numberX, numberY, 10, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()

        ctx.fillStyle = '#ffffff'
        ctx.fillText(`${index + 1}`, numberX, numberY + (navigator.platform.includes('Win') ? 1 : 0))
      })
    }

    const renderPanFeedback = () => {
      if (!isDragging || (Math.abs(panVelocity.x) < 0.1 && Math.abs(panVelocity.y) < 0.1)) {
        return
      }

      const canvasEl = canvasRef.current
      if (!canvasEl) {
        return
      }

      const indicatorSize = 80
      const margin = 20
      const centerX = canvasEl.width - margin - indicatorSize / 2
      const centerY = margin + indicatorSize / 2

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.beginPath()
      ctx.arc(centerX, centerY, indicatorSize / 2, 0, 2 * Math.PI)
      ctx.fill()

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.lineWidth = 2
      ctx.stroke()

      const maxVelocity = 20
      const normalizedVx = Math.max(-1, Math.min(1, panVelocity.x / maxVelocity))
      const normalizedVy = Math.max(-1, Math.min(1, panVelocity.y / maxVelocity))

      const arrowLength = Math.sqrt(normalizedVx * normalizedVx + normalizedVy * normalizedVy) * (indicatorSize / 3)
      const arrowEndX = centerX + normalizedVx * arrowLength
      const arrowEndY = centerY + normalizedVy * arrowLength

      if (arrowLength > 5) {
        ctx.strokeStyle = 'rgba(6, 150, 215, 0.8)'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(centerX, centerY)
        ctx.lineTo(arrowEndX, arrowEndY)
        ctx.stroke()

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

      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
      ctx.beginPath()
      ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI)
      ctx.fill()
    }

    const renderLoupe = () => {
      if (!isPlacementInteractionActive) {
        return
      }

      const canvasEl = canvasRef.current
      const imgEl = imageRef.current
      if (!canvasEl || !imgEl) {
        return
      }

      const anchor = isPrecisionDrag && precisionCanvasPosRef.current ? precisionCanvasPosRef.current : currentMousePos

      if (!anchor) {
        return
      }

      const imageCoords = canvasToImageCoords(anchor.x, anchor.y)
      if (!imageCoords) {
        return
      }

      const diameter = 160
      const radius = diameter / 2
      const loupeZoom = 3
      const padding = 24
      const precisionActive = isPrecisionDrag

      let centerX = anchor.x + padding + radius
      let centerY = anchor.y + padding + radius

      if (centerX + radius > canvasEl.width) {
        centerX = anchor.x - padding - radius
      }
      if (centerY + radius > canvasEl.height) {
        centerY = anchor.y - padding - radius
      }

      const margin = 12 + radius
      centerX = Math.max(margin, Math.min(centerX, canvasEl.width - margin))
      centerY = Math.max(margin, Math.min(centerY, canvasEl.height - margin))

      const sourceSize = diameter / loupeZoom
      const maxSourceX = Math.max(0, imgEl.width - sourceSize)
      const maxSourceY = Math.max(0, imgEl.height - sourceSize)

      let sourceX = imageCoords.u - sourceSize / 2
      let sourceY = imageCoords.v - sourceSize / 2

      sourceX = Math.max(0, Math.min(sourceX, maxSourceX))
      sourceY = Math.max(0, Math.min(sourceY, maxSourceY))

      const drawX = centerX - ((imageCoords.u - sourceX) / sourceSize) * diameter
      const drawY = centerY - ((imageCoords.v - sourceY) / sourceSize) * diameter
      const topLeftX = centerX - radius
      const topLeftY = centerY - radius

      ctx.save()

      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
      ctx.beginPath()
      ctx.arc(centerX + 3, centerY + 3, radius + 4, 0, Math.PI * 2)
      ctx.fill()

      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.clip()

      ctx.fillStyle = '#111111'
      ctx.fillRect(topLeftX, topLeftY, diameter, diameter)

      ctx.drawImage(imgEl, sourceX, sourceY, sourceSize, sourceSize, drawX, drawY, diameter, diameter)

      ctx.restore()

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.stroke()

      const crosshairColor = precisionActive ? 'rgba(6, 150, 215, 0.85)' : 'rgba(255, 255, 255, 0.6)'
      const crosshairExtent = radius * (precisionActive ? 0.55 : 0.8)

      ctx.strokeStyle = crosshairColor
      ctx.lineWidth = precisionActive ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(centerX - crosshairExtent, centerY)
      ctx.lineTo(centerX + crosshairExtent, centerY)
      ctx.moveTo(centerX, centerY - crosshairExtent)
      ctx.lineTo(centerX, centerY + crosshairExtent)
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(centerX, centerY, precisionActive ? 3 : 4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      ctx.fill()
      ctx.strokeStyle = precisionActive ? 'rgba(6, 150, 215, 0.8)' : 'rgba(0, 0, 0, 0.6)'
      ctx.lineWidth = 1
      ctx.stroke()

      if (precisionActive) {
        ctx.font = '12px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
        ctx.lineWidth = 3
        ctx.strokeText('Precision', centerX, centerY + radius - 18)
        ctx.fillText('Precision', centerX, centerY + radius - 18)
      } else {
        ctx.font = '11px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
        ctx.lineWidth = 3
        ctx.strokeText('Tap Shift for precision', centerX, centerY + radius - 18)
        ctx.fillText('Tap Shift for precision', centerX, centerY + radius - 18)
      }
    }

    const renderLines = () => {
      Array.from(lines.entries()).forEach(([lineId, line]) => {
        if (!line.isVisible) {
          return
        }

        const pointA = line.pointA
        const pointB = line.pointB

        if (!pointA || !pointB) {
          return
        }

        const ipA = viewpoint.getImagePointsForWorldPoint(pointA)[0] || null
        const ipB = viewpoint.getImagePointsForWorldPoint(pointB)[0] || null

        if (!ipA || !ipB) {
          return
        }

        const x1 = ipA.u * scale + offset.x
        const y1 = ipA.v * scale + offset.y
        const x2 = ipB.u * scale + offset.x
        const y2 = ipB.v * scale + offset.y

        const isSelected = selectedLines.some(l => l.pointA === line.pointA && l.pointB === line.pointB)
        const isHovered = hoveredLine && hoveredLine.pointA === line.pointA && hoveredLine.pointB === line.pointB

        let strokeColor = line.isConstruction ? 'rgba(0, 150, 255, 0.6)' : line.color
        let lineWidth = line.isConstruction ? 1 : 2

        if (isSelected) {
          strokeColor = '#FFC107'
          lineWidth = 3
        } else if (isHovered) {
          strokeColor = '#42A5F5'
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

        const midX = (x1 + x2) / 2
        const midY = (y1 + y2) / 2

        let directionGlyph = ''
        if (line.constraints?.direction && line.constraints.direction !== 'free') {
          switch (line.constraints.direction) {
            case 'horizontal': directionGlyph = '↔'; break
            case 'vertical': directionGlyph = '↕'; break
            case 'x-aligned': directionGlyph = 'X'; break
            case 'z-aligned': directionGlyph = 'Z'; break
          }
        }

        const displayText = line.constraints?.targetLength
          ? directionGlyph
            ? `${line.name} ${directionGlyph} ${line.constraints.targetLength.toFixed(1)}m`
            : `${line.name} ${line.constraints.targetLength.toFixed(1)}m`
          : directionGlyph
            ? `${line.name} ${directionGlyph}`
            : `${line.name}`

        ctx.font = '12px Arial'
        ctx.textAlign = 'center'

        ctx.strokeStyle = 'white'
        ctx.lineWidth = 3
        ctx.strokeText(displayText, midX, midY - 2)

        ctx.fillStyle = '#000'
        ctx.fillText(displayText, midX, midY - 2)
      })
    }

    const renderConstructionPreview = () => {
      if (!constructionPreview) {
        return
      }

      // Handle loop-chain preview
      if (constructionPreview.type === 'loop-chain') {
        const segments = constructionPreview.segments || []

        segments.forEach(segment => {
          const wpA = segment.pointA
          const wpB = segment.pointB
          if (!wpA || !wpB) return

          const ipA = viewpoint.getImagePointsForWorldPoint(wpA)[0] || null
          const ipB = viewpoint.getImagePointsForWorldPoint(wpB)[0] || null
          if (!ipA || !ipB) return

          const x1 = ipA.u * scale + offset.x
          const y1 = ipA.v * scale + offset.y
          const x2 = ipB.u * scale + offset.x
          const y2 = ipB.v * scale + offset.y

          // Color based on status
          if (segment.status === 'new') {
            ctx.strokeStyle = 'rgba(92, 184, 92, 0.8)' // Green for new lines
          } else if (segment.status === 'exists') {
            ctx.strokeStyle = 'rgba(102, 102, 102, 0.6)' // Gray for existing
          } else if (segment.status === 'building') {
            ctx.strokeStyle = 'rgba(6, 150, 215, 0.8)' // Blue for building
          }

          ctx.lineWidth = 2
          ctx.setLineDash([8, 4])

          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
          ctx.setLineDash([])
        })

        // Show line to cursor from last point if there's a chain
        if (segments.length > 0 && currentMousePos) {
          const lastSegment = segments[segments.length - 1]
          const lastPoint = lastSegment.pointB
          if (lastPoint) {
            const ipLast = viewpoint.getImagePointsForWorldPoint(lastPoint)[0] || null
            if (ipLast) {
              const x1 = ipLast.u * scale + offset.x
              const y1 = ipLast.v * scale + offset.y
              const x2 = currentMousePos.x
              const y2 = currentMousePos.y

              ctx.strokeStyle = 'rgba(6, 150, 215, 0.6)' // Blue for cursor line
              ctx.lineWidth = 2
              ctx.setLineDash([8, 4])

              ctx.beginPath()
              ctx.moveTo(x1, y1)
              ctx.lineTo(x2, y2)
              ctx.stroke()
              ctx.setLineDash([])
            }
          }
        }

        return
      }

      // Handle regular line preview
      if (constructionPreview.type !== 'line') {
        return
      }
      if (!currentMousePos) {
        return
      }

      const { pointA, pointB, showToCursor } = constructionPreview

      if (pointA && !pointB && showToCursor) {
        const wpA = pointA
        if (!wpA) {
          return
        }

        const ipA = viewpoint.getImagePointsForWorldPoint(wpA)[0] || null
        if (!ipA) {
          return
        }

        const x1 = ipA.u * scale + offset.x
        const y1 = ipA.v * scale + offset.y
        const x2 = currentMousePos.x
        const y2 = currentMousePos.y

        ctx.strokeStyle = 'rgba(255, 140, 0, 0.8)'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 4])

        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        ctx.setLineDash([])
      }

      if (pointA && pointB) {
        const wpA = pointA
        const wpB = pointB
        if (!wpA || !wpB) {
          return
        }

        const ipA = viewpoint.getImagePointsForWorldPoint(wpA)[0] || null
        const ipB = viewpoint.getImagePointsForWorldPoint(wpB)[0] || null
        if (!ipA || !ipB) {
          return
        }

        const x1 = ipA.u * scale + offset.x
        const y1 = ipA.v * scale + offset.y
        const x2 = ipB.u * scale + offset.x
        const y2 = ipB.v * scale + offset.y

        ctx.strokeStyle = 'rgba(255, 140, 0, 0.8)'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 4])

        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      ctx.drawImage(
        img,
        offset.x,
        offset.y,
        img.width * scale,
        img.height * scale
      )

      renderWorldPoints()
      renderLines()
      renderConstructionPreview()
      renderSelectionOverlay()
      renderPanFeedback()
      renderLoupe()

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
    worldPoints,
    lines,
    scale,
    offset,
    selectedPoints,
    selectedLines,
    hoveredConstraintIdForEffect,
    hoveredWorldPointId,
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
    isPlacementModeActive,
    isPointCreationActive,
    isLoopTraceActive,
    canvasToImageCoords,
    imageToCanvasCoords,
    precisionCanvasPosRef,
    onMovePoint
  ])
}
