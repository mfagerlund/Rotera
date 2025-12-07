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
    case 'x-aligned': return AXIS_COLORS.x
    case 'vertical': return AXIS_COLORS.y
    case 'z-aligned': return AXIS_COLORS.z
    default: return null
  }
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

    // Always show line name and distance (if set)
    const midX = (projA.x + projB.x) / 2
    const midY = (projA.y + projB.y) / 2

    // Show glyph with direction constraint if available
    let directionGlyph = '↔' // Default glyph
    const direction = line.direction
    switch (direction) {
      case 'horizontal': directionGlyph = '↔'; break
      case 'vertical': directionGlyph = '↕'; break
      case 'x-aligned': directionGlyph = 'X'; break
      case 'z-aligned': directionGlyph = 'Z'; break
      case 'free': directionGlyph = '↔'; break
    }

    // Show target length if set, otherwise show calculated length
    let displayText = `${line.name} ${directionGlyph}`
    const targetLength = line.targetLength
    if (targetLength !== undefined) {
      displayText = `${line.name} ${directionGlyph} ${targetLength.toFixed(1)}`
    } else {
      const calculatedLength = line.length()
      if (calculatedLength !== null) {
        displayText = `${line.name} ${directionGlyph} ${calculatedLength.toFixed(1)}`
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
