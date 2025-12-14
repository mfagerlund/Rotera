import { RenderParams } from './types'
import { imagePointToCanvas } from './renderUtils'

export function renderSelectionOverlay(params: RenderParams): void {
  const {
    ctx,
    viewpoint,
    scale,
    offset,
    selectedPoints
  } = params

  selectedPoints.forEach((wp, index) => {
    if (!wp) return

    const imagePoints = viewpoint.getImagePointsForWorldPoint(wp)
    const imagePoint = imagePoints.length > 0 ? imagePoints[0] : null
    if (!imagePoint) {
      return
    }

    const { x, y } = imagePointToCanvas(imagePoint, scale, offset)

    const time = Date.now() * 0.003
    const pulseRadius = 12 + Math.sin(time) * 2

    ctx.strokeStyle = '#0696d7'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI)
    ctx.stroke()

    if (selectedPoints.length > 1) {
      ctx.strokeStyle = 'rgba(6, 150, 215, 0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(x, y, pulseRadius + 5, 0, 2 * Math.PI)
      ctx.stroke()
    }

    ctx.fillStyle = '#0696d7'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.font = 'bold 10px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const numberX = x + 15
    const numberY = y - 15

    ctx.beginPath()
    ctx.arc(numberX, numberY, 10, 0, 2 * Math.PI)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    ctx.fillText(`${index + 1}`, numberX, numberY + (navigator.platform.includes('Win') ? 1 : 0))
  })
}
