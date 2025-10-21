// Coordinate axes rendering

import type { ProjectedPoint } from '../types'

export function renderAxes(
  ctx: CanvasRenderingContext2D,
  gridVisible: boolean,
  project3DTo2D: (point: [number, number, number]) => ProjectedPoint
) {
  if (!gridVisible) return

  const origin = [0, 0, 0] as [number, number, number]
  const axisLength = 2 // meters

  const axes = [
    { end: [axisLength, 0, 0] as [number, number, number], color: '#F44336', label: 'X' },
    { end: [0, axisLength, 0] as [number, number, number], color: '#4CAF50', label: 'Y' },
    { end: [0, 0, axisLength] as [number, number, number], color: '#2196F3', label: 'Z' }
  ]

  const originProj = project3DTo2D(origin)

  axes.forEach(axis => {
    const endProj = project3DTo2D(axis.end)

    ctx.beginPath()
    ctx.moveTo(originProj.x, originProj.y)
    ctx.lineTo(endProj.x, endProj.y)
    ctx.strokeStyle = axis.color
    ctx.lineWidth = 2
    ctx.stroke()

    // Axis label
    ctx.fillStyle = axis.color
    ctx.font = '14px Arial'
    ctx.fillText(axis.label, endProj.x + 5, endProj.y - 5)
  })
}
