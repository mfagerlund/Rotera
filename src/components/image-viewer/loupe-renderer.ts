export interface LoupeConfig {
  diameter?: number
  zoom?: number
  padding?: number
}

export interface LoupeRenderParams {
  ctx: CanvasRenderingContext2D
  canvasEl: HTMLCanvasElement
  imgEl: HTMLImageElement
  anchorX: number
  anchorY: number
  imageU: number
  imageV: number
  scale: number
  offsetX: number
  offsetY: number
  precisionActive: boolean
  config?: LoupeConfig
}

const DEFAULT_CONFIG: Required<LoupeConfig> = {
  diameter: 160,
  zoom: 3,
  padding: 24
}

export function renderLoupe(params: LoupeRenderParams): void {
  const {
    ctx,
    canvasEl,
    imgEl,
    anchorX,
    anchorY,
    imageU,
    imageV,
    scale,
    offsetX,
    offsetY,
    precisionActive,
    config = {}
  } = params

  const { diameter, zoom, padding } = { ...DEFAULT_CONFIG, ...config }
  const radius = diameter / 2

  let centerX = anchorX + padding + radius
  let centerY = anchorY + padding + radius

  if (centerX + radius > canvasEl.width) {
    centerX = anchorX - padding - radius
  }
  if (centerY + radius > canvasEl.height) {
    centerY = anchorY - padding - radius
  }

  const margin = 12 + radius
  centerX = Math.max(margin, Math.min(centerX, canvasEl.width - margin))
  centerY = Math.max(margin, Math.min(centerY, canvasEl.height - margin))

  const sourceSize = diameter / zoom
  const maxSourceX = Math.max(0, imgEl.width - sourceSize)
  const maxSourceY = Math.max(0, imgEl.height - sourceSize)

  let sourceX = imageU - sourceSize / 2
  let sourceY = imageV - sourceSize / 2

  sourceX = Math.max(0, Math.min(sourceX, maxSourceX))
  sourceY = Math.max(0, Math.min(sourceY, maxSourceY))

  const drawX = centerX - ((imageU - sourceX) / sourceSize) * diameter
  const drawY = centerY - ((imageV - sourceY) / sourceSize) * diameter
  const topLeftX = centerX - radius
  const topLeftY = centerY - radius

  // Draw indicator circle on main image showing what area the loupe covers
  const indicatorCenterX = imageU * scale + offsetX
  const indicatorCenterY = imageV * scale + offsetY
  const indicatorRadius = (sourceSize / 2) * scale

  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
  ctx.lineWidth = 2
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.arc(indicatorCenterX, indicatorCenterY, indicatorRadius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(indicatorCenterX, indicatorCenterY, indicatorRadius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()

  ctx.save()

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.beginPath()
  ctx.arc(centerX + 3, centerY + 3, radius + 4, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.clip()

  ctx.fillStyle = '#111111'
  ctx.fillRect(topLeftX, topLeftY, diameter, diameter)

  ctx.drawImage(imgEl, sourceX, sourceY, sourceSize, sourceSize, drawX, drawY, diameter, diameter)

  ctx.restore()

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.stroke()

  const crosshairColor = precisionActive ? 'rgba(6, 150, 215, 0.85)' : 'rgba(255, 255, 255, 0.6)'
  const crosshairExtent = radius * (precisionActive ? 0.55 : 0.8)

  ctx.strokeStyle = crosshairColor
  ctx.lineWidth = precisionActive ? 2 : 1
  ctx.beginPath()
  ctx.moveTo(centerX - crosshairExtent, centerY)
  ctx.lineTo(centerX + crosshairExtent, centerY)
  ctx.moveTo(centerX, centerY - crosshairExtent)
  ctx.lineTo(centerX, centerY + crosshairExtent)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(centerX, centerY, precisionActive ? 3 : 4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.fill()
  ctx.strokeStyle = precisionActive ? 'rgba(6, 150, 215, 0.8)' : 'rgba(0, 0, 0, 0.6)'
  ctx.lineWidth = 1
  ctx.stroke()

  if (precisionActive) {
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.lineWidth = 3
    ctx.strokeText('Precision', centerX, centerY + radius - 18)
    ctx.fillText('Precision', centerX, centerY + radius - 18)
  } else {
    ctx.font = '11px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.lineWidth = 3
    ctx.strokeText('Tap Shift for precision', centerX, centerY + radius - 18)
    ctx.fillText('Tap Shift for precision', centerX, centerY + radius - 18)
  }
}
