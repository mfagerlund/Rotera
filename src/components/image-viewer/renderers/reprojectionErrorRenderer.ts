import { RenderParams } from './types'

export function renderReprojectionErrors(params: RenderParams): void {
  const {
    ctx,
    viewpoint,
    worldPoints,
    scale,
    offset,
    visibility
  } = params

  if (!visibility.reprojectionErrors) return

  Array.from(worldPoints.values()).forEach(wp => {
    const imagePoints = viewpoint.getImagePointsForWorldPoint(wp)
    const imagePoint = imagePoints.length > 0 ? imagePoints[0] : null
    if (!imagePoint || imagePoint.reprojectedU === undefined || imagePoint.reprojectedV === undefined) {
      return
    }

    const actualX = imagePoint.u * scale + offset.x
    const actualY = imagePoint.v * scale + offset.y
    const reprojectedX = imagePoint.reprojectedU * scale + offset.x
    const reprojectedY = imagePoint.reprojectedV * scale + offset.y

    ctx.strokeStyle = 'rgba(255, 0, 255, 0.7)'
    ctx.lineWidth = 2
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(actualX, actualY)
    ctx.lineTo(reprojectedX, reprojectedY)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(255, 0, 255, 0.5)'
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(reprojectedX, reprojectedY, 4, 0, 2 * Math.PI)
    ctx.fill()
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(reprojectedX, reprojectedY, 6, 0, 2 * Math.PI)
    ctx.stroke()
  })
}
