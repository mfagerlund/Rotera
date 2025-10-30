import { MutableRefObject, RefObject, useEffect } from 'react'

import {
  CanvasToImage,
  ImageToCanvas,
  ImageViewerRenderState,
  OnMovePoint
} from './types'
import { computeVanishingPoint, validateLineQuality } from '../../optimization/vanishing-points'
import { VanishingLine } from '../../entities/vanishing-line'

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
    selectedVanishingLines,
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
    isLoopTraceActive,
    isDraggingVanishingLine,
    draggedVanishingLine,
    visibility
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
      if (!visibility.worldPoints) return

      Array.from(worldPoints.values()).forEach(wp => {
        const imagePoints = viewpoint.getImagePointsForWorldPoint(wp)
        const imagePoint = imagePoints.length > 0 ? imagePoints[0] : null
        if (!imagePoint) {
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
      if (!visibility.lines) return

      Array.from(lines.entries()).forEach(([lineId, line]) => {
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
      if (!visibility.vanishingLines && !visibility.vanishingPoints) return

      const linesByAxis: Record<string, Array<VanishingLine>> = {
        x: [],
        y: [],
        z: []
      }

      Array.from(viewpoint.vanishingLines).forEach(vanishingLine => {
        linesByAxis[vanishingLine.axis].push(vanishingLine)
      })

      if (visibility.vanishingLines) {
        Array.from(viewpoint.vanishingLines).forEach(vanishingLine => {
        const x1 = vanishingLine.p1.u * scale + offset.x
        const y1 = vanishingLine.p1.v * scale + offset.y
        const x2 = vanishingLine.p2.u * scale + offset.x
        const y2 = vanishingLine.p2.v * scale + offset.y

        const isSelected = selectedVanishingLines.some(vl => vl.id === vanishingLine.id)
        const isBeingDragged = isDraggingVanishingLine && draggedVanishingLine?.id === vanishingLine.id

        let color = vanishingLine.getColor()
        let lineWidth = 3
        let endpointRadius = 4

        if (isSelected) {
          color = '#FFC107'
          lineWidth = 5
          endpointRadius = 6
        }

        if (isBeingDragged) {
          lineWidth = 1
          endpointRadius = 3
        }

        // Draw line
        if (isBeingDragged) {
          // Draw dashed black-white pattern for contrast
          ctx.lineWidth = lineWidth
          ctx.setLineDash([6, 6])

          // Black dashes
          ctx.strokeStyle = '#000000'
          ctx.lineDashOffset = 0
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()

          // White dashes
          ctx.strokeStyle = '#FFFFFF'
          ctx.lineDashOffset = 6
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()

          ctx.setLineDash([])
        } else {
          ctx.strokeStyle = color
          ctx.lineWidth = lineWidth
          ctx.setLineDash([])

          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
        }

        // Draw endpoints
        ctx.fillStyle = isBeingDragged ? '#FFFFFF' : color
        if (isBeingDragged) {
          // White fill with black outline for contrast
          ctx.strokeStyle = '#000000'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(x1, y1, endpointRadius, 0, 2 * Math.PI)
          ctx.fill()
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(x2, y2, endpointRadius, 0, 2 * Math.PI)
          ctx.fill()
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.arc(x1, y1, endpointRadius, 0, 2 * Math.PI)
          ctx.fill()
          ctx.beginPath()
          ctx.arc(x2, y2, endpointRadius, 0, 2 * Math.PI)
          ctx.fill()
        }

        const qualityIssues = validateLineQuality(vanishingLine, linesByAxis[vanishingLine.axis])
        if (qualityIssues.length > 0) {
          const midX = (x1 + x2) / 2
          const midY = (y1 + y2) / 2

          const hasError = qualityIssues.some(issue => issue.type === 'error')
          const iconColor = hasError ? '#FF5252' : '#FFC107'
          const iconSize = 12

          if (isSelected) {
            ctx.strokeStyle = '#FFC107'
            ctx.lineWidth = 3
            ctx.beginPath()
            ctx.arc(midX, midY, iconSize + 4, 0, 2 * Math.PI)
            ctx.stroke()
          }

          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
          ctx.beginPath()
          ctx.arc(midX, midY, iconSize, 0, 2 * Math.PI)
          ctx.fill()

          ctx.fillStyle = iconColor
          ctx.beginPath()
          ctx.arc(midX, midY, iconSize - 2, 0, 2 * Math.PI)
          ctx.fill()

          ctx.fillStyle = hasError ? '#FFFFFF' : '#000000'
          ctx.font = 'bold 16px Arial'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('!', midX, midY)
        }
        })
      }

      if (!visibility.vanishingPoints) return

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

        const vp = computeVanishingPoint(lines)
        if (vp) {
          const vpU = vp.u
          const vpV = vp.v

          if (lines.length === 2) {
            vanishingPointAccuracy[axis] = -1
          } else {
            const angularErrors: number[] = []
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]

              const lineDir_u = line.p2.u - line.p1.u
              const lineDir_v = line.p2.v - line.p1.v
              const lineDirMag = Math.sqrt(lineDir_u * lineDir_u + lineDir_v * lineDir_v)

              if (lineDirMag < 1e-6) continue

              const lineDirNorm_u = lineDir_u / lineDirMag
              const lineDirNorm_v = lineDir_v / lineDirMag

              const mid_u = (line.p1.u + line.p2.u) / 2
              const mid_v = (line.p1.v + line.p2.v) / 2

              const vpToMid_u = mid_u - vpU
              const vpToMid_v = mid_v - vpV
              const vpToMidMag = Math.sqrt(vpToMid_u * vpToMid_u + vpToMid_v * vpToMid_v)

              if (vpToMidMag < 1e-6) continue

              const vpToMidNorm_u = vpToMid_u / vpToMidMag
              const vpToMidNorm_v = vpToMid_v / vpToMidMag

              const dot = Math.abs(lineDirNorm_u * vpToMidNorm_u + lineDirNorm_v * vpToMidNorm_v)
              const angle = Math.acos(Math.max(0, Math.min(1, dot)))
              const angleError = Math.min(angle, Math.PI - angle)

              angularErrors.push(angleError)
            }

            const rmsError = angularErrors.length > 0
              ? Math.sqrt(angularErrors.reduce((sum, e) => sum + e * e, 0) / angularErrors.length)
              : 0

            const rmsDegrees = (rmsError * 180) / Math.PI
            vanishingPointAccuracy[axis] = rmsDegrees
          }

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
        let accuracyLabel = ''
        let accuracyLabelColor = vp.color

        if (accuracy !== undefined && accuracy >= 0) {
          if (accuracy < 1.0) {
            accuracyLabelColor = '#00ff00'
            accuracyLabel = `${accuracy.toFixed(2)}°`
          } else if (accuracy < 5.0) {
            accuracyLabelColor = '#ffff00'
            accuracyLabel = `${accuracy.toFixed(2)}°`
          } else {
            accuracyLabelColor = '#ff0000'
            accuracyLabel = `${accuracy.toFixed(2)}°`
          }
        }

        ctx.strokeStyle = vp.color
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

        if (accuracyLabel) {
          ctx.font = 'bold 11px Arial'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
          ctx.fillRect(x - 20, y + 15, 40, 16)
          ctx.fillStyle = accuracyLabelColor
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

      if (Object.keys(vanishingPoints).filter(k => vanishingPoints[k as 'x' | 'y' | 'z']).length >= 2) {
        const canvasEl = canvasRef.current
        if (!canvasEl) return

        ctx.setLineDash([])

        const canvasWidth = canvasEl.width
        const canvasHeight = canvasEl.height

        const drawLineToVP = (x: number, y: number, vpX: number, vpY: number) => {
          const dx = vpX - x
          const dy = vpY - y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 1) return

          const dirX = dx / dist
          const dirY = dy / dist
          const extendLength = Math.max(canvasWidth, canvasHeight) * 3

          const endX = x + dirX * extendLength
          const endY = y + dirY * extendLength

          // Draw dark outline first for visibility on light backgrounds
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(endX, endY)
          ctx.stroke()

          // Draw lighter line on top for visibility on dark backgrounds
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(endX, endY)
          ctx.stroke()
        }

        // Draw perspective-correct grid using homography
        type Pt = { x: number; y: number }
        type HLine = [number, number, number]
        type HMat = number[][]

        const toH = (p: Pt): [number, number, number] => [p.x, p.y, 1]
        const cross3 = (a: [number,number,number], b: [number,number,number]): [number,number,number] => [
          a[1]*b[2]-a[2]*b[1],
          a[2]*b[0]-a[0]*b[2],
          a[0]*b[1]-a[1]*b[0]
        ]
        const lineThrough = (p: Pt, q: Pt): HLine => cross3(toH(p), toH(q))
        const interLL = (l1: HLine, l2: HLine): Pt | null => {
          const p = cross3(l1, l2)
          if (Math.abs(p[2]) < 1e-9) return null
          return { x: p[0]/p[2], y: p[1]/p[2] }
        }

        const solve2 = (A: number[][], b: number[]): [number,number] => {
          const [a,b1] = A[0], [c,d] = A[1]
          const det = a*d - b1*c
          if (Math.abs(det) < 1e-12) return [0,0]
          const x = ( d*b[0] - b1*b[1]) / det
          const y = (-c*b[0] + a *b[1]) / det
          return [x,y]
        }

        const homographyUnitToQuad = (P00: Pt, P10: Pt, P01: Pt, P11: Pt): HMat => {
          const M = [
            [P10.x - P00.x, P01.x - P00.x, P00.x],
            [P10.y - P00.y, P01.y - P00.y, P00.y],
            [0,             0,             1    ],
          ]
          const vx = (P10.x + P01.x) - (P11.x + P00.x)
          const vy = (P10.y + P01.y) - (P11.y + P00.y)
          const [h31, h32] = solve2(
            [[P10.x - P00.x, P01.x - P00.x],
             [P10.y - P00.y, P01.y - P00.y]],
            [vx, vy]
          )
          return [
            [M[0][0] + M[0][2]*h31, M[0][1] + M[0][2]*h32, M[0][2]],
            [M[1][0] + M[1][2]*h31, M[1][1] + M[1][2]*h32, M[1][2]],
            [h31,                   h32,                   1      ],
          ]
        }

        const mapUV = (H: HMat, u: number, v: number): Pt => {
          const x = H[0][0]*u + H[0][1]*v + H[0][2]
          const y = H[1][0]*u + H[1][1]*v + H[1][2]
          const w = H[2][0]*u + H[2][1]*v + H[2][2]
          return { x: x/w, y: y/w }
        }

        const drawPerspectiveGrid = (
          linesX: Array<{p1:{u:number;v:number};p2:{u:number;v:number}}>,
          linesY: typeof linesX,
          vpX: {u:number;v:number},
          vpY: {u:number;v:number},
          nx = 10,
          ny = 10
        ) => {
          if (linesX.length < 2 || linesY.length < 2) return

          const vpX_pix = {x: vpX.u * scale + offset.x, y: vpX.v * scale + offset.y}
          const vpY_pix = {x: vpY.u * scale + offset.x, y: vpY.v * scale + offset.y}

          // Get angle range for each axis
          const getAngleRange = (vp: {x:number;y:number}, lines: typeof linesX) => {
            const angles = lines.map(L => {
              const mid_u = (L.p1.u + L.p2.u) / 2
              const mid_v = (L.p1.v + L.p2.v) / 2
              const mid_x = mid_u * scale + offset.x
              const mid_y = mid_v * scale + offset.y
              return Math.atan2(mid_y - vp.y, mid_x - vp.x)
            }).sort((a,b) => a - b)

            let minAngle = angles[0]
            let maxAngle = angles[angles.length - 1]

            // Handle wrap-around
            const directSpan = maxAngle - minAngle
            if (directSpan > Math.PI) {
              const temp = minAngle
              minAngle = maxAngle
              maxAngle = temp + 2 * Math.PI
            }

            return { minAngle, maxAngle }
          }

          const rangeX = getAngleRange(vpX_pix, linesX)
          const rangeY = getAngleRange(vpY_pix, linesY)

          ctx.save()
          ctx.beginPath()
          ctx.rect(0, 0, canvasWidth, canvasHeight)
          ctx.clip()

          const extendLen = Math.max(canvasWidth, canvasHeight) * 3

          // Draw X-axis lines (radiating from vpX)
          for (let i = 0; i <= nx; i++) {
            const t = i / nx
            let angle = rangeX.minAngle + t * (rangeX.maxAngle - rangeX.minAngle)
            while (angle > Math.PI) angle -= 2 * Math.PI
            while (angle < -Math.PI) angle += 2 * Math.PI

            const dx = Math.cos(angle)
            const dy = Math.sin(angle)

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(vpX_pix.x - dx * extendLen, vpX_pix.y - dy * extendLen)
            ctx.lineTo(vpX_pix.x + dx * extendLen, vpX_pix.y + dy * extendLen)
            ctx.stroke()

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(vpX_pix.x - dx * extendLen, vpX_pix.y - dy * extendLen)
            ctx.lineTo(vpX_pix.x + dx * extendLen, vpX_pix.y + dy * extendLen)
            ctx.stroke()
          }

          // Draw Y-axis lines (radiating from vpY)
          for (let j = 0; j <= ny; j++) {
            const t = j / ny
            let angle = rangeY.minAngle + t * (rangeY.maxAngle - rangeY.minAngle)
            while (angle > Math.PI) angle -= 2 * Math.PI
            while (angle < -Math.PI) angle += 2 * Math.PI

            const dx = Math.cos(angle)
            const dy = Math.sin(angle)

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(vpY_pix.x - dx * extendLen, vpY_pix.y - dy * extendLen)
            ctx.lineTo(vpY_pix.x + dx * extendLen, vpY_pix.y + dy * extendLen)
            ctx.stroke()

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(vpY_pix.x - dx * extendLen, vpY_pix.y - dy * extendLen)
            ctx.lineTo(vpY_pix.x + dx * extendLen, vpY_pix.y + dy * extendLen)
            ctx.stroke()
          }

          ctx.restore()
        }

        const linesX = linesByAxis['x']
        const linesY = linesByAxis['y']
        const linesZ = linesByAxis['z']
        const vpX = vanishingPoints['x']
        const vpY = vanishingPoints['y']
        const vpZ = vanishingPoints['z']

        // Draw perspective grid if enabled
        if (visibility.perspectiveGrid) {
          // Try X+Y grid (vertical plane)
          if (linesX.length >= 2 && linesY.length >= 2 && vpX && vpY) {
            drawPerspectiveGrid(linesX, linesY, {u:vpX.u, v:vpX.v}, {u:vpY.u, v:vpY.v}, 10, 10)
          }
          // Try X+Z grid (horizontal plane)
          else if (linesX.length >= 2 && linesZ.length >= 2 && vpX && vpZ) {
            drawPerspectiveGrid(linesX, linesZ, {u:vpX.u, v:vpX.v}, {u:vpZ.u, v:vpZ.v}, 10, 10)
          }
          // Try Y+Z grid (side plane)
          else if (linesY.length >= 2 && linesZ.length >= 2 && vpY && vpZ) {
            drawPerspectiveGrid(linesY, linesZ, {u:vpY.u, v:vpY.v}, {u:vpZ.u, v:vpZ.v}, 10, 10)
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

        // Draw striped pattern for consistency with editing mode
        ctx.lineWidth = 1
        ctx.setLineDash([6, 6])

        // Black dashes
        ctx.strokeStyle = '#000000'
        ctx.lineDashOffset = 0
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()

        // White dashes
        ctx.strokeStyle = '#FFFFFF'
        ctx.lineDashOffset = 6
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()

        ctx.setLineDash([])

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
    viewpoint.vanishingLines.size,
    worldPoints,
    lines,
    scale,
    offset,
    selectedPoints,
    selectedLines,
    selectedVanishingLines,
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
    isDraggingVanishingLine,
    draggedVanishingLine,
    canvasToImageCoords,
    imageToCanvasCoords,
    precisionCanvasPosRef,
    onMovePoint
  ])
}
