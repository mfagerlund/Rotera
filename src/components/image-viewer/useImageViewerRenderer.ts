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
        const isBeingDragged = isDraggingPoint && draggedPoint === wp
        const isHovered = hoveredPoint === wp
        const isGloballyHovered = hoveredWorldPoint === wp

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

        if (imagePoint.isOutlier) {
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(x, y, 14, 0, 2 * Math.PI)
          ctx.stroke()

          ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(x - 8, y - 8)
          ctx.lineTo(x + 8, y + 8)
          ctx.moveTo(x + 8, y - 8)
          ctx.lineTo(x - 8, y + 8)
          ctx.stroke()
        }

        const status = wp.getConstraintStatus()
        const statusColors = {
          locked: '#2E7D32',
          inferred: '#2E7D32',
          partial: '#FF9800',
          free: '#D32F2F'
        }
        const statusColor = statusColors[status]

        ctx.fillStyle = wp.color || '#ff6b6b'
        ctx.strokeStyle = isSelected ? '#ffffff' : '#000000'
        ctx.lineWidth = isSelected ? 3 : 1

        ctx.beginPath()
        ctx.arc(x, y, 6, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()

        if (status !== 'free') {
          ctx.fillStyle = statusColor
          ctx.beginPath()
          ctx.arc(x, y, 2.5, 0, 2 * Math.PI)
          ctx.fill()
        }

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
        if (line.direction && line.direction !== 'free') {
          switch (line.direction) {
            case 'horizontal': directionGlyph = '↔'; break
            case 'vertical': directionGlyph = '↕'; break
            case 'x-aligned': directionGlyph = 'X'; break
            case 'z-aligned': directionGlyph = 'Z'; break
          }
        }

        // Prioritize showing glyph and distance over name
        let displayText = ''
        if (directionGlyph && line.targetLength) {
          // Both glyph and target length
          displayText = `${directionGlyph} ${line.targetLength.toFixed(1)}m`
        } else if (line.targetLength) {
          // Only target length
          displayText = `${line.targetLength.toFixed(1)}m`
        } else if (directionGlyph) {
          // Only direction glyph
          displayText = directionGlyph
        } else {
          // Fallback to name only if no constraints
          displayText = line.name
        }

        ctx.font = '12px Arial'
        ctx.textAlign = 'center'

        ctx.strokeStyle = 'white'
        ctx.lineWidth = 3
        ctx.strokeText(displayText, midX, midY - 2)

        ctx.fillStyle = '#000'
        ctx.fillText(displayText, midX, midY - 2)
      })
    }

    const renderVanishingLines = () => {
      const linesByAxis: Record<string, Array<{ p1: { u: number; v: number }; p2: { u: number; v: number } }>> = {
        x: [],
        y: [],
        z: []
      }

      Array.from(viewpoint.vanishingLines).forEach(vanishingLine => {
        const x1 = vanishingLine.p1.u * scale + offset.x
        const y1 = vanishingLine.p1.v * scale + offset.y
        const x2 = vanishingLine.p2.u * scale + offset.x
        const y2 = vanishingLine.p2.v * scale + offset.y

        const color = vanishingLine.getColor()

        ctx.strokeStyle = color
        ctx.lineWidth = 3
        ctx.setLineDash([])

        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()

        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x1, y1, 4, 0, 2 * Math.PI)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x2, y2, 4, 0, 2 * Math.PI)
        ctx.fill()

        linesByAxis[vanishingLine.axis].push({ p1: vanishingLine.p1, p2: vanishingLine.p2 })
      })

      const vanishingPoints: Record<string, { u: number; v: number; color: string } | null> = {
        x: null,
        y: null,
        z: null
      }

      const axisColors = { x: '#ff0000', y: '#00ff00', z: '#0000ff' }

      const vanishingPointAccuracy: Record<string, number> = {}

      Object.keys(linesByAxis).forEach(axis => {
        const lines = linesByAxis[axis]
        if (lines.length < 2) return

        const homogeneousLines = lines.map(line => {
          const p1 = [line.p1.u, line.p1.v, 1]
          const p2 = [line.p2.u, line.p2.v, 1]

          const a = p1[1] * p2[2] - p1[2] * p2[1]
          const b = p1[2] * p2[0] - p1[0] * p2[2]
          const c = p1[0] * p2[1] - p1[1] * p2[0]

          return [a, b, c]
        })

        const l1 = homogeneousLines[0]
        const l2 = homogeneousLines[1]

        const vp_x = l1[1] * l2[2] - l1[2] * l2[1]
        const vp_y = l1[2] * l2[0] - l1[0] * l2[2]
        const vp_w = l1[0] * l2[1] - l1[1] * l2[0]

        if (Math.abs(vp_w) > 1e-10) {
          const vpU = vp_x / vp_w
          const vpV = vp_y / vp_w

          // Compute convergence accuracy - measure angular spread
          const angles: number[] = []
          for (let i = 0; i < lines.length; i++) {
            for (let j = i + 1; j < lines.length; j++) {
              const l1 = homogeneousLines[i]
              const l2 = homogeneousLines[j]

              // Compute angle between line directions
              const dir1 = Math.sqrt(l1[0] * l1[0] + l1[1] * l1[1])
              const dir2 = Math.sqrt(l2[0] * l2[0] + l2[1] * l2[1])
              const dot = (l1[0] * l2[0] + l1[1] * l2[1]) / (dir1 * dir2)
              const angle = Math.abs(Math.acos(Math.max(-1, Math.min(1, dot))))
              angles.push(angle)
            }
          }

          // RMS of angles (lower is better convergence)
          const rmsAngle = angles.length > 0
            ? Math.sqrt(angles.reduce((sum, a) => sum + a * a, 0) / angles.length)
            : 0

          // Convert to degrees and normalize (good < 1 deg, warning < 5 deg, poor >= 5 deg)
          const rmsDegrees = (rmsAngle * 180) / Math.PI
          vanishingPointAccuracy[axis] = rmsDegrees

          vanishingPoints[axis] = {
            u: vpU,
            v: vpV,
            color: axisColors[axis as 'x' | 'y' | 'z']
          }
        }
      })

      Object.entries(vanishingPoints).forEach(([axis, vp]) => {
        if (!vp) return

        const x = vp.u * scale + offset.x
        const y = vp.v * scale + offset.y

        const accuracy = vanishingPointAccuracy[axis]
        let accuracyColor = vp.color
        let accuracyLabel = ''

        if (accuracy !== undefined) {
          if (accuracy < 1.0) {
            accuracyColor = '#00ff00' // Green - excellent
            accuracyLabel = `${accuracy.toFixed(2)}°`
          } else if (accuracy < 5.0) {
            accuracyColor = '#ffff00' // Yellow - good
            accuracyLabel = `${accuracy.toFixed(2)}°`
          } else {
            accuracyColor = '#ff0000' // Red - poor
            accuracyLabel = `${accuracy.toFixed(2)}°`
          }
        }

        ctx.strokeStyle = accuracyColor
        ctx.lineWidth = 2
        ctx.setLineDash([])

        const crosshairSize = 20
        ctx.beginPath()
        ctx.moveTo(x - crosshairSize, y)
        ctx.lineTo(x + crosshairSize, y)
        ctx.moveTo(x, y - crosshairSize)
        ctx.lineTo(x, y + crosshairSize)
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(x, y, 8, 0, 2 * Math.PI)
        ctx.stroke()

        // Draw accuracy label if available
        if (accuracyLabel) {
          ctx.font = 'bold 11px Arial'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
          ctx.fillRect(x - 20, y + 15, 40, 16)
          ctx.fillStyle = accuracyColor
          ctx.fillText(accuracyLabel, x, y + 17)
        }
      })

      if (vanishingPoints.x && vanishingPoints.y) {
        const vp1_x = vanishingPoints.x.u * scale + offset.x
        const vp1_y = vanishingPoints.x.v * scale + offset.y
        const vp2_x = vanishingPoints.y.u * scale + offset.x
        const vp2_y = vanishingPoints.y.v * scale + offset.y

        ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)'
        ctx.lineWidth = 2
        ctx.setLineDash([10, 5])

        ctx.beginPath()
        ctx.moveTo(vp1_x, vp1_y)
        ctx.lineTo(vp2_x, vp2_y)
        ctx.stroke()
        ctx.setLineDash([])
      } else if (vanishingPoints.x && vanishingPoints.z) {
        const vp1_x = vanishingPoints.x.u * scale + offset.x
        const vp1_y = vanishingPoints.x.v * scale + offset.y
        const vp2_x = vanishingPoints.z.u * scale + offset.x
        const vp2_y = vanishingPoints.z.v * scale + offset.y

        ctx.strokeStyle = 'rgba(255, 0, 255, 0.5)'
        ctx.lineWidth = 2
        ctx.setLineDash([10, 5])

        ctx.beginPath()
        ctx.moveTo(vp1_x, vp1_y)
        ctx.lineTo(vp2_x, vp2_y)
        ctx.stroke()
        ctx.setLineDash([])
      } else if (vanishingPoints.y && vanishingPoints.z) {
        const vp1_x = vanishingPoints.y.u * scale + offset.x
        const vp1_y = vanishingPoints.y.v * scale + offset.y
        const vp2_x = vanishingPoints.z.u * scale + offset.x
        const vp2_y = vanishingPoints.z.v * scale + offset.y

        ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)'
        ctx.lineWidth = 2
        ctx.setLineDash([10, 5])

        ctx.beginPath()
        ctx.moveTo(vp1_x, vp1_y)
        ctx.lineTo(vp2_x, vp2_y)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Draw perspective grid overlay
      if (Object.keys(vanishingPoints).filter(k => vanishingPoints[k as 'x' | 'y' | 'z']).length >= 2) {
        const img = imageRef.current
        if (!img) return

        // Get principal point (image center)
        const ppU = img.width / 2
        const ppV = img.height / 2
        const pp_x = ppU * scale + offset.x
        const pp_y = ppV * scale + offset.y

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
        ctx.lineWidth = 1
        ctx.setLineDash([])

        // Draw grid lines radiating from principal point to each vanishing point
        const gridCount = 8 // Number of grid lines per axis

        Object.entries(vanishingPoints).forEach(([axis, vp]) => {
          if (!vp) return

          const vp_x = vp.u * scale + offset.x
          const vp_y = vp.v * scale + offset.y

          // Direction from PP to VP
          const dx = vp_x - pp_x
          const dy = vp_y - pp_y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 1) return

          // Perpendicular direction (for spacing lines)
          const perpX = -dy / dist
          const perpY = dx / dist

          // Draw parallel lines converging to this VP
          const spacing = 100 // Spacing at principal point

          for (let i = -gridCount; i <= gridCount; i++) {
            if (i === 0) continue // Skip center line

            // Start point offset perpendicular to PP-VP direction
            const startX = pp_x + perpX * spacing * i
            const startY = pp_y + perpY * spacing * i

            // Draw line from offset start point toward vanishing point
            // Extend line far beyond to reach canvas edges
            const lineScale = 10 // Extend line length

            ctx.beginPath()
            ctx.moveTo(startX, startY)
            ctx.lineTo(startX + dx * lineScale, startY + dy * lineScale)
            ctx.stroke()
          }
        })

        // Draw orthogonal grid lines between pairs of vanishing points
        const vpList = Object.entries(vanishingPoints).filter(([_, vp]) => vp !== null) as Array<[string, { u: number; v: number; color: string }]>

        if (vpList.length >= 2) {
          for (let i = 0; i < vpList.length; i++) {
            for (let j = i + 1; j < vpList.length; j++) {
              const vp1 = vpList[i][1]
              const vp2 = vpList[j][1]

              const vp1_x = vp1.u * scale + offset.x
              const vp1_y = vp1.v * scale + offset.y
              const vp2_x = vp2.u * scale + offset.x
              const vp2_y = vp2.v * scale + offset.y

              ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'

              // Draw lines from VP1 that converge to VP2
              const perpCount = 5
              for (let k = -perpCount; k <= perpCount; k++) {
                if (k === 0) continue

                // Point on line from PP to VP1
                const t = k * 0.15 // Parameter along PP-VP1 line
                const px = pp_x + t * (vp1_x - pp_x)
                const py = pp_y + t * (vp1_y - pp_y)

                // Draw line from this point toward VP2
                const dx2 = vp2_x - px
                const dy2 = vp2_y - py
                const lineScale = 10

                ctx.beginPath()
                ctx.moveTo(px, py)
                ctx.lineTo(px + dx2 * lineScale, py + dy2 * lineScale)
                ctx.stroke()
              }
            }
          }
        }
      }
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

      // Handle vanishing line preview
      if (constructionPreview.type === 'vanishing-line') {
        if (!currentMousePos || !constructionPreview.vanishingLineStart) {
          return
        }

        const start = constructionPreview.vanishingLineStart
        const x1 = start.u * scale + offset.x
        const y1 = start.v * scale + offset.y
        const x2 = currentMousePos.x
        const y2 = currentMousePos.y

        const axis = constructionPreview.vanishingLineAxis || 'x'
        const color = axis === 'x' ? '#ff0000' : axis === 'y' ? '#00ff00' : '#0000ff'

        ctx.strokeStyle = color
        ctx.lineWidth = 3
        ctx.setLineDash([])

        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()

        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x1, y1, 4, 0, 2 * Math.PI)
        ctx.fill()

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

      renderLines()
      renderVanishingLines()
      renderWorldPoints()
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
    canvasToImageCoords,
    imageToCanvasCoords,
    precisionCanvasPosRef,
    onMovePoint
  ])
}
