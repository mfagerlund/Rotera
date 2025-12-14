import { RenderParams } from './types'
import { imagePointToCanvas } from './renderUtils'

export function renderWorldPoints(params: RenderParams): void {
  const {
    ctx,
    viewpoint,
    worldPoints,
    scale,
    offset,
    selectedPoints,
    constraintHighlightedPoints,
    hoveredPoint,
    hoveredWorldPoint,
    isDraggingPoint,
    draggedPoint,
    onMovePoint,
    visibility
  } = params

  if (!visibility.worldPoints) return

  Array.from(worldPoints.values()).forEach(wp => {
    const imagePoints = viewpoint.getImagePointsForWorldPoint(wp)
    const imagePoint = imagePoints.length > 0 ? imagePoints[0] : null
    if (!imagePoint) {
      return
    }

    const { x, y } = imagePointToCanvas(imagePoint, scale, offset)

    const isSelected = selectedPoints.includes(wp)
    const isConstraintHighlighted = constraintHighlightedPoints.includes(wp)
    const isBeingDragged = isDraggingPoint && draggedPoint === wp
    const isHovered = hoveredPoint === wp
    const isGloballyHovered = hoveredWorldPoint === wp

    // Draw constraint highlight ring (magenta/purple ring)
    if (isConstraintHighlighted && !isSelected) {
      ctx.strokeStyle = 'rgba(255, 0, 255, 0.8)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(x, y, 14, 0, 2 * Math.PI)
      ctx.stroke()
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
