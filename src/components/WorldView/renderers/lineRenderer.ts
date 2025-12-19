// Line rendering

import type { Project } from '../../../entities/project'
import type { Line, LineDirection } from '../../../entities/line/Line'
import type { ProjectedPoint } from '../types'

const AXIS_COLORS: Record<'x' | 'y' | 'z', string> = {
  x: '#ff0000',
  y: '#00ff00',
  z: '#0000ff'
}

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
 * @param ctx Canvas context
 * @param x X position of arrow tip
 * @param y Y position of arrow tip
 * @param angle Direction angle in radians (where the arrow points)
 * @param size Size of the arrowhead
 * @param color Stroke color
 * @param lineWidth Stroke width
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

export function renderLines(
  ctx: CanvasRenderingContext2D,
  project: Project,
  selectedSet: Set<any>,
  hoveredLine: Line | null,
  project3DTo2D: (point: [number, number, number]) => ProjectedPoint
) {
  project.lines.forEach((line) => {
    const pointA = line.pointA
    const pointB = line.pointB
    const coordsA = pointA.optimizedXyz
    const coordsB = pointB.optimizedXyz
    if (!coordsA || !coordsB) return

    const projA = project3DTo2D(coordsA)
    const projB = project3DTo2D(coordsB)
    const isSelected = selectedSet.has(line)
    const isHovered = hoveredLine === line

    ctx.beginPath()
    ctx.moveTo(projA.x, projA.y)
    ctx.lineTo(projB.x, projB.y)

    // All lines are segments now
    if (line.isConstruction) {
      ctx.setLineDash([5, 3]) // Construction segments
    } else {
      ctx.setLineDash([]) // Solid for segments
    }

    // Use axis color for direction-constrained lines, otherwise use line's own color
    const axisColor = getAxisColorForDirection(line.direction)
    let strokeColor = axisColor || line.color || '#2196F3'
    let lineWidth = 2

    if (isSelected) {
      strokeColor = '#FFC107'
      lineWidth = 3
    } else if (isHovered) {
      strokeColor = '#42A5F5' // Lighter blue for hover
      lineWidth = 3
    }

    ctx.strokeStyle = strokeColor
    ctx.lineWidth = lineWidth
    ctx.stroke()

    // Draw arrow for axis-aligned lines with a target length
    // Arrow points from pointA toward pointB (positive direction)
    if (line.isAxisAligned() && line.targetLength !== undefined) {
      const dx = projB.x - projA.x
      const dy = projB.y - projA.y
      const angle = Math.atan2(dy, dx)
      const arrowSize = 12
      drawArrowhead(ctx, projB.x, projB.y, angle, arrowSize, strokeColor, lineWidth)
    }

    // Always show line name and distance (if set)
    const midX = (projA.x + projB.x) / 2
    const midY = (projA.y + projB.y) / 2

    // Show glyph with direction constraint if available
    let directionGlyph = '' // No glyph for free
    const direction = line.direction
    switch (direction) {
      case 'x': directionGlyph = 'X'; break
      case 'y': directionGlyph = 'Y'; break
      case 'z': directionGlyph = 'Z'; break
      case 'xy': directionGlyph = 'XY'; break
      case 'xz': directionGlyph = 'XZ'; break
      case 'yz': directionGlyph = 'YZ'; break
      case 'free': directionGlyph = ''; break
    }

    // Show target length if set, otherwise show calculated length in parentheses
    let displayText = `${line.name} ${directionGlyph}`
    const targetLength = line.targetLength
    if (targetLength !== undefined) {
      // Driving length (user-specified) - no parentheses
      displayText = `${line.name} ${directionGlyph} ${targetLength.toFixed(1)}`
    } else {
      const calculatedLength = line.length()
      if (calculatedLength !== null) {
        // Optimized length (computed) - in parentheses
        displayText = `${line.name} ${directionGlyph} (${calculatedLength.toFixed(1)})`
      }
    }

    // Draw outlined text
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'

    // Draw text outline (stroke)
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 3
    ctx.strokeText(displayText, midX, midY + 2)

    // Draw text fill
    ctx.fillStyle = '#000'
    ctx.fillText(displayText, midX, midY + 2)
  })
}
