import { RenderParams, AXIS_COLORS } from './types'
import type { LineDirection } from '../../../entities/line'
import { imagePointToCanvas } from './renderUtils'

/**
 * Returns the axis color for direction-constrained lines, or null for non-axis-aligned lines.
 */
function getAxisColorForDirection(direction: LineDirection): string | null {
  switch (direction) {
    case 'x': return AXIS_COLORS.x
    case 'y': return AXIS_COLORS.y
    case 'z': return AXIS_COLORS.z
    default: return null
  }
}

/**
 * Draw an arrowhead at a point, pointing in the given direction.
 */
function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: string,
  lineWidth: number
) {
  const headAngle = Math.PI / 6 // 30 degrees

  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(
    x - size * Math.cos(angle - headAngle),
    y - size * Math.sin(angle - headAngle)
  )
  ctx.moveTo(x, y)
  ctx.lineTo(
    x - size * Math.cos(angle + headAngle),
    y - size * Math.sin(angle + headAngle)
  )

  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.setLineDash([])
  ctx.stroke()
}

export function renderLines(params: RenderParams): void {
  const {
    ctx,
    viewpoint,
    lines,
    scale,
    offset,
    selectedLines,
    hoveredLine,
    visibility
  } = params

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

    const { x: x1, y: y1 } = imagePointToCanvas(ipA, scale, offset)
    const { x: x2, y: y2 } = imagePointToCanvas(ipB, scale, offset)

    const isSelected = selectedLines.some(l => l.pointA === line.pointA && l.pointB === line.pointB)
    const isHovered = hoveredLine && hoveredLine.pointA === line.pointA && hoveredLine.pointB === line.pointB

    // Use axis color for direction-constrained lines, otherwise use line's own color
    const axisColor = getAxisColorForDirection(line.direction)
    let strokeColor = line.isConstruction
      ? 'rgba(0, 150, 255, 0.6)'
      : (axisColor || line.color)
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

    // Draw arrow for axis-aligned lines with a target length
    // Arrow points from pointA toward pointB (positive direction)
    if (line.isAxisAligned() && line.targetLength !== undefined) {
      const dx = x2 - x1
      const dy = y2 - y1
      const angle = Math.atan2(dy, dx)
      const arrowSize = 12
      drawArrowhead(ctx, x2, y2, angle, arrowSize, strokeColor, lineWidth)
    }

    const midX = (x1 + x2) / 2
    const midY = (y1 + y2) / 2

    let directionGlyph = ''
    if (line.direction && line.direction !== 'free') {
      switch (line.direction) {
        case 'x': directionGlyph = 'X'; break
        case 'y': directionGlyph = 'Y'; break
        case 'z': directionGlyph = 'Z'; break
        case 'xy': directionGlyph = 'XY'; break
        case 'xz': directionGlyph = 'XZ'; break
        case 'yz': directionGlyph = 'YZ'; break
      }
    }

    let displayText = ''
    if (directionGlyph && line.targetLength) {
      displayText = `${directionGlyph} ${line.targetLength.toFixed(1)}`
    } else if (line.targetLength) {
      displayText = `${line.targetLength.toFixed(1)}`
    } else if (directionGlyph) {
      displayText = directionGlyph
    } else {
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
