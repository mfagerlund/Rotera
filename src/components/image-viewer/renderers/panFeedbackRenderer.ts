import { RenderParams } from './types'

export function renderPanFeedback(params: RenderParams): void {
  const {
    ctx,
    canvasEl,
    canvasRef,
    isDragging,
    panVelocity
  } = params

  if (!isDragging || (Math.abs(panVelocity.x) < 0.1 && Math.abs(panVelocity.y) < 0.1)) {
    return
  }

  const canvas = canvasRef.current
  if (!canvas) {
    return
  }

  const indicatorSize = 80
  const margin = 20
  const centerX = canvas.width - margin - indicatorSize / 2
  const centerY = margin + indicatorSize / 2

  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
  ctx.beginPath()
  ctx.arc(centerX, centerY, indicatorSize / 2, 0, 2 * Math.PI)
  ctx.fill()

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = 2
  ctx.stroke()

  const maxVelocity = 20
  const normalizedVx = Math.max(-1, Math.min(1, panVelocity.x / maxVelocity))
  const normalizedVy = Math.max(-1, Math.min(1, panVelocity.y / maxVelocity))

  const arrowLength = Math.sqrt(normalizedVx * normalizedVx + normalizedVy * normalizedVy) * (indicatorSize / 3)
  const arrowEndX = centerX + normalizedVx * arrowLength
  const arrowEndY = centerY + normalizedVy * arrowLength

  if (arrowLength > 5) {
    ctx.strokeStyle = 'rgba(6, 150, 215, 0.8)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(centerX, centerY)
    ctx.lineTo(arrowEndX, arrowEndY)
    ctx.stroke()

    const headSize = 8
    const angle = Math.atan2(normalizedVy, normalizedVx)

    ctx.fillStyle = 'rgba(6, 150, 215, 0.8)'
    ctx.beginPath()
    ctx.moveTo(arrowEndX, arrowEndY)
    ctx.lineTo(
      arrowEndX - headSize * Math.cos(angle - Math.PI / 6),
      arrowEndY - headSize * Math.sin(angle - Math.PI / 6)
    )
    ctx.lineTo(
      arrowEndX - headSize * Math.cos(angle + Math.PI / 6),
      arrowEndY - headSize * Math.sin(angle + Math.PI / 6)
    )
    ctx.closePath()
    ctx.fill()
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.beginPath()
  ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI)
  ctx.fill()
}
