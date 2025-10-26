import type { Project } from '../../../entities/project'
import type { Viewpoint } from '../../../entities/viewpoint/Viewpoint'
import type { ProjectedPoint } from '../types'

function rotatePoint(point: [number, number, number], rotation: [number, number, number, number]): [number, number, number] {
  const [qw, qx, qy, qz] = rotation
  const [x, y, z] = point

  const tx = 2 * (qy * z - qz * y)
  const ty = 2 * (qz * x - qx * z)
  const tz = 2 * (qx * y - qy * x)

  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx)
  ]
}

function addVec3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function renderCameras(
  ctx: CanvasRenderingContext2D,
  project: Project,
  selectedSet: Set<any>,
  hoveredViewpoint: Viewpoint | null,
  project3DTo2D: (point: [number, number, number]) => ProjectedPoint
) {
  const frustumSize = 0.2

  project.viewpoints.forEach((viewpoint) => {
    if (!viewpoint.isVisible) return

    const isSelected = selectedSet.has(viewpoint)
    const isHovered = hoveredViewpoint === viewpoint

    const pos = viewpoint.position
    const rot = viewpoint.rotation

    const forward: [number, number, number] = [0, 0, frustumSize]
    const right: [number, number, number] = [frustumSize * 0.6, 0, frustumSize]
    const left: [number, number, number] = [-frustumSize * 0.6, 0, frustumSize]
    const top: [number, number, number] = [0, frustumSize * 0.45, frustumSize]
    const bottom: [number, number, number] = [0, -frustumSize * 0.45, frustumSize]

    const apex = pos
    const forwardWorld = addVec3(pos, rotatePoint(forward, rot))
    const rightWorld = addVec3(pos, rotatePoint(right, rot))
    const leftWorld = addVec3(pos, rotatePoint(left, rot))
    const topWorld = addVec3(pos, rotatePoint(top, rot))
    const bottomWorld = addVec3(pos, rotatePoint(bottom, rot))

    const apexProj = project3DTo2D(apex)
    const forwardProj = project3DTo2D(forwardWorld)
    const rightProj = project3DTo2D(rightWorld)
    const leftProj = project3DTo2D(leftWorld)
    const topProj = project3DTo2D(topWorld)
    const bottomProj = project3DTo2D(bottomWorld)

    const color = isSelected ? '#FFC107' : (isHovered ? '#FFE082' : (viewpoint.color || '#00BCD4'))
    const lineWidth = isSelected ? 2.5 : (isHovered ? 2 : 1.5)

    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth

    ctx.beginPath()
    ctx.moveTo(apexProj.x, apexProj.y)
    ctx.lineTo(rightProj.x, rightProj.y)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(apexProj.x, apexProj.y)
    ctx.lineTo(leftProj.x, leftProj.y)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(apexProj.x, apexProj.y)
    ctx.lineTo(topProj.x, topProj.y)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(apexProj.x, apexProj.y)
    ctx.lineTo(bottomProj.x, bottomProj.y)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(rightProj.x, rightProj.y)
    ctx.lineTo(topProj.x, topProj.y)
    ctx.lineTo(leftProj.x, leftProj.y)
    ctx.lineTo(bottomProj.x, bottomProj.y)
    ctx.lineTo(rightProj.x, rightProj.y)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(apexProj.x, apexProj.y)
    ctx.lineTo(forwardProj.x, forwardProj.y)
    ctx.strokeStyle = isSelected ? '#FFC107' : '#FF5722'
    ctx.lineWidth = lineWidth
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(apexProj.x, apexProj.y, 4, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.stroke()

    if (isHovered || isSelected) {
      ctx.fillStyle = '#000'
      ctx.font = '11px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(viewpoint.name, apexProj.x, apexProj.y - 10)
    }
  })
}
