import { RenderParams } from './types'

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
