// World point rendering

import type { Project } from '../../../entities/project'
import type { WorldPoint } from '../../../entities/world-point/WorldPoint'
import type { ProjectedPoint } from '../types'

function getConstraintStatusColor(point: WorldPoint): string {
  const status = point.getConstraintStatus()
  switch (status) {
    case 'locked':
      return '#2E7D32'
    case 'inferred':
      return '#2E7D32'
    case 'partial':
      return '#FF9800'
    case 'free':
      return '#D32F2F'
  }
}

export function renderWorldPoints(
  ctx: CanvasRenderingContext2D,
  project: Project,
  selectedSet: Set<any>,
  hoveredPoint: WorldPoint | null,
  project3DTo2D: (point: [number, number, number]) => ProjectedPoint
) {
  project.worldPoints.forEach((point) => {
    const coords = point.optimizedXyz
    if (!coords) return

    const projected = project3DTo2D(coords)
    const isSelected = selectedSet.has(point)
    const isHovered = hoveredPoint === point
    const radius = isSelected ? 6 : (isHovered ? 5 : 4)

    ctx.beginPath()
    ctx.arc(projected.x, projected.y, radius, 0, 2 * Math.PI)

    // Use point's color as fill (like ImageView does)
    ctx.fillStyle = point.color || '#ff6b6b'
    ctx.fill()

    // Stroke indicates selection/hover state
    if (isSelected) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3
    } else if (isHovered) {
      ctx.strokeStyle = '#FFB300'
      ctx.lineWidth = 2
    } else {
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 1
    }
    ctx.stroke()

    // Draw constraint status indicator in center (like ImageView does)
    const status = point.getConstraintStatus()
    if (status !== 'free') {
      ctx.fillStyle = getConstraintStatusColor(point)
      ctx.beginPath()
      ctx.arc(projected.x, projected.y, 2, 0, 2 * Math.PI)
      ctx.fill()
    }

    if (project.showPointNames || isHovered) {
      ctx.fillStyle = '#000'
      ctx.font = '12px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(point.name, projected.x, projected.y - 12)
    }
  })
}
