import { RenderParams, AXIS_COLORS } from './types'

export function renderCameraVanishingGeometry(params: RenderParams): void {
  const {
    ctx,
    canvasEl,
    viewpoint,
    scale,
    offset,
    visibility
  } = params

  if (!visibility.cameraVanishingGeometry) return
  if (!canvasEl) return

  const [qw, qx, qy, qz] = viewpoint.rotation

  const rotationMatrix = [
    [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
    [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
    [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)]
  ] as const

  const fx = viewpoint.focalLength
  const fy = viewpoint.focalLength * viewpoint.aspectRatio
  const cx = viewpoint.principalPointX
  const cy = viewpoint.principalPointY
  const skew = viewpoint.skewCoefficient ?? 0

  const projectDirection = (dir: [number, number, number]) => {
    const camX = rotationMatrix[0][0] * dir[0] + rotationMatrix[0][1] * dir[1] + rotationMatrix[0][2] * dir[2]
    const camY = rotationMatrix[1][0] * dir[0] + rotationMatrix[1][1] * dir[1] + rotationMatrix[1][2] * dir[2]
    const camZ = rotationMatrix[2][0] * dir[0] + rotationMatrix[2][1] * dir[1] + rotationMatrix[2][2] * dir[2]

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

    return { u, v }
  }

  const directions: Record<'x' | 'y' | 'z', [number, number, number]> = {
    x: [1, 0, 0],
    y: [0, 1, 0],
    z: [0, 0, 1]
  }

  const cameraVps: Partial<Record<'x' | 'y' | 'z', { u: number; v: number }>> = {}

  const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z']
  axes.forEach(axis => {
    const vp = projectDirection(directions[axis])
    if (vp) {
      cameraVps[axis] = vp
    }
  })

  const drawCrosshair = (x: number, y: number, color: string, label: string) => {
    const onCanvas = x >= 0 && x <= canvasEl.width && y >= 0 && y <= canvasEl.height
    ctx.strokeStyle = onCanvas ? color : 'rgba(0, 255, 0, 0.5)'
    ctx.lineWidth = onCanvas ? 1.5 : 1
    ctx.setLineDash(onCanvas ? [4, 4] : [2, 6])

    const cross = 14
    ctx.beginPath()
    ctx.moveTo(x - cross, y)
    ctx.lineTo(x + cross, y)
    ctx.moveTo(x, y - cross)
    ctx.lineTo(x, y + cross)
    ctx.stroke()

    ctx.setLineDash([])
    ctx.font = '11px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = onCanvas ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 100, 0, 0.65)'
    ctx.fillText(label, x, y + 6)
  }

  const toCanvas = (vp: { u: number; v: number }) => ({
    x: vp.u * scale + offset.x,
    y: vp.v * scale + offset.y
  })

  axes.forEach(axis => {
    const vp = cameraVps[axis]
    if (vp) {
      const { x, y } = toCanvas(vp)
      drawCrosshair(x, y, AXIS_COLORS[axis], `${axis.toUpperCase()}ᶜ`)
    }
  })

  const drawHorizon = (vpA: { u: number; v: number }, vpB: { u: number; v: number }) => {
    const p1 = toCanvas(vpA)
    const p2 = toCanvas(vpB)

    const dx = p2.x - p1.x
    const dy = p2.y - p1.y

    const intersections: Array<{ x: number; y: number }> = []

    const addIntersection = (x: number, y: number) => {
      if (x >= 0 && x <= canvasEl.width && y >= 0 && y <= canvasEl.height) {
        intersections.push({ x, y })
      }
    }

    if (Math.abs(dx) > 1e-6) {
      const tLeft = (0 - p1.x) / dx
      addIntersection(p1.x + dx * tLeft, p1.y + dy * tLeft)

      const tRight = (canvasEl.width - p1.x) / dx
      addIntersection(p1.x + dx * tRight, p1.y + dy * tRight)
    }

    if (Math.abs(dy) > 1e-6) {
      const tTop = (0 - p1.y) / dy
      addIntersection(p1.x + dx * tTop, p1.y + dy * tTop)

      const tBottom = (canvasEl.height - p1.y) / dy
      addIntersection(p1.x + dx * tBottom, p1.y + dy * tBottom)
    }

    const uniquePoints = intersections.filter((point, idx, arr) =>
      arr.findIndex(other => Math.abs(other.x - point.x) < 1 && Math.abs(other.y - point.y) < 1) === idx
    )

    if (uniquePoints.length < 2) {
      return
    }

    let start = uniquePoints[0]
    let end = uniquePoints[1]

    if (uniquePoints.length > 2) {
      let maxDist = -Infinity
      for (let i = 0; i < uniquePoints.length; i++) {
        for (let j = i + 1; j < uniquePoints.length; j++) {
          const dxPair = uniquePoints[j].x - uniquePoints[i].x
          const dyPair = uniquePoints[j].y - uniquePoints[i].y
          const distSq = dxPair * dxPair + dyPair * dyPair
          if (distSq > maxDist) {
            maxDist = distSq
            start = uniquePoints[i]
            end = uniquePoints[j]
          }
        }
      }
    }

    ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)'
    ctx.lineWidth = 2
    ctx.setLineDash([12, 6])

    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()

    ctx.setLineDash([])

    const labelX = (start.x + end.x) / 2
    const labelY = (start.y + end.y) / 2
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillText('Camera Horizon', labelX, labelY - 6)
  }

  if (cameraVps.x && cameraVps.z) {
    drawHorizon(cameraVps.x, cameraVps.z)
  }
}
