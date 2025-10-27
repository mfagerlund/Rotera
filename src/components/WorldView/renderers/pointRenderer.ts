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
    if (!point.isVisible) return

    const coords = point.optimizedXyz
    if (!coords) return

    const projected = project3DTo2D(coords)
    const isSelected = selectedSet.has(point)
    const isHovered = hoveredPoint === point
    const radius = isSelected ? 6 : (isHovered ? 5 : 4)

    ctx.beginPath()
    ctx.arc(projected.x, projected.y, radius, 0, 2 * Math.PI)

    if (isSelected) {
      ctx.fillStyle = '#FF5722'
    } else if (isHovered) {
      ctx.fillStyle = '#FFE082'
    } else {
      ctx.fillStyle = getConstraintStatusColor(point)
    }

    ctx.fill()
    ctx.strokeStyle = isHovered ? '#FFB300' : '#000'
    ctx.lineWidth = isHovered ? 2 : 1
    ctx.stroke()

    if (project.showPointNames || isHovered) {
      ctx.fillStyle = '#000'
      ctx.font = '12px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(point.name, projected.x, projected.y - 12)
    }
  })
}
