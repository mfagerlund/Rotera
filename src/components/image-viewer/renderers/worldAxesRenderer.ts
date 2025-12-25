import { RenderParams, AXIS_COLORS } from './types'
import { quaternionToMatrix } from '../../../utils/rotation-utils'

/**
 * Renders a small XYZ axes indicator at the world origin, projected into image space.
 * Similar to the axes indicator in WorldView, but projected through the camera.
 */
export function renderWorldAxes(params: RenderParams): void {
  const {
    ctx,
    viewpoint,
    scale,
    offset
  } = params

  // Build rotation matrix from quaternion
  const rotationMatrix = quaternionToMatrix(viewpoint.rotation)

  const fx = viewpoint.focalLength
  const fy = viewpoint.focalLength * viewpoint.aspectRatio
  const cx = viewpoint.principalPointX
  const cy = viewpoint.principalPointY
  const skew = viewpoint.skewCoefficient ?? 0
  const camPos = viewpoint.position

  // Project a world point to image coordinates
  const projectWorldPoint = (worldX: number, worldY: number, worldZ: number): { u: number; v: number; depth: number } | null => {
    // Transform to camera coordinates: cam = R * (world - camPos)
    const dx = worldX - camPos[0]
    const dy = worldY - camPos[1]
    const dz = worldZ - camPos[2]

    const camX = rotationMatrix[0][0] * dx + rotationMatrix[0][1] * dy + rotationMatrix[0][2] * dz
    const camY = rotationMatrix[1][0] * dx + rotationMatrix[1][1] * dy + rotationMatrix[1][2] * dz
    const camZ = rotationMatrix[2][0] * dx + rotationMatrix[2][1] * dy + rotationMatrix[2][2] * dz

    // Check if point is too close to camera plane (avoid division issues)
    if (Math.abs(camZ) < 1e-6) {
      return null
    }

    const xNorm = camX / camZ
    const yNorm = camY / camZ

    const u = cx + fx * xNorm + skew * yNorm
    const v = cy - fy * yNorm

    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      return null
    }

    return { u, v, depth: Math.abs(camZ) }
  }

  // Convert image coords to canvas coords
  const toCanvas = (uv: { u: number; v: number }) => ({
    x: uv.u * scale + offset.x,
    y: uv.v * scale + offset.y
  })

  // Project origin
  const origin = projectWorldPoint(0, 0, 0)
  if (!origin) return // Origin not visible

  // Determine axis length based on distance to origin and image size
  // Scale relative to image diagonal for consistent appearance across different image sizes
  const imageDiagonal = Math.sqrt(viewpoint.imageWidth ** 2 + viewpoint.imageHeight ** 2)
  const baseLength = origin.depth * 0.031 // ~3.1% of distance (65% of original 4.8%)
  const axisLength = baseLength * (imageDiagonal / 2000) // Normalize to ~2000px diagonal reference

  const axes: Array<{ axis: 'x' | 'y' | 'z'; end: [number, number, number] }> = [
    { axis: 'x', end: [axisLength, 0, 0] },
    { axis: 'y', end: [0, axisLength, 0] },
    { axis: 'z', end: [0, 0, axisLength] }
  ]

  const originCanvas = toCanvas(origin)

  // Draw each axis
  axes.forEach(({ axis, end }) => {
    const endPoint = projectWorldPoint(end[0], end[1], end[2])
    if (!endPoint) return

    const endCanvas = toCanvas(endPoint)
    const color = AXIS_COLORS[axis]

    // Draw white outline for contrast
    ctx.beginPath()
    ctx.moveTo(originCanvas.x, originCanvas.y)
    ctx.lineTo(endCanvas.x, endCanvas.y)
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.stroke()

    // Draw colored axis line
    ctx.beginPath()
    ctx.moveTo(originCanvas.x, originCanvas.y)
    ctx.lineTo(endCanvas.x, endCanvas.y)
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.stroke()

    // Draw axis label
    const labelOffset = 8
    const dx = endCanvas.x - originCanvas.x
    const dy = endCanvas.y - originCanvas.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 20) { // Only label if line is long enough
      const labelX = endCanvas.x + (dx / len) * labelOffset
      const labelY = endCanvas.y + (dy / len) * labelOffset

      ctx.font = 'bold 12px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.strokeText(axis.toUpperCase(), labelX, labelY)
      ctx.fillStyle = color
      ctx.fillText(axis.toUpperCase(), labelX, labelY)
    }
  })

  // Draw origin marker
  ctx.beginPath()
  ctx.arc(originCanvas.x, originCanvas.y, 4, 0, 2 * Math.PI)
  ctx.fillStyle = 'white'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(originCanvas.x, originCanvas.y, 2.5, 0, 2 * Math.PI)
  ctx.fillStyle = '#333'
  ctx.fill()
}
