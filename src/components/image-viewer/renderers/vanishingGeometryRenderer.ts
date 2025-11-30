import { RenderParams, AXIS_COLORS } from './types'
import { computeVanishingPoint, validateLineQuality } from '../../../optimization/vanishing-points'
import { VanishingLine } from '../../../entities/vanishing-line'

export function renderVanishingLines(params: RenderParams): void {
  const {
    ctx,
    canvasEl,
    viewpoint,
    scale,
    offset,
    selectedVanishingLines,
    isDraggingVanishingLine,
    draggedVanishingLine,
    visibility
  } = params

  if (!visibility.vanishingLines && !visibility.vanishingPoints) return

  const linesByAxis: Record<string, Array<VanishingLine>> = {
    x: [],
    y: [],
    z: []
  }

  Array.from(viewpoint.vanishingLines).forEach(vanishingLine => {
    linesByAxis[vanishingLine.axis].push(vanishingLine)
  })

  if (visibility.vanishingLines) {
    Array.from(viewpoint.vanishingLines).forEach(vanishingLine => {
      const x1 = vanishingLine.p1.u * scale + offset.x
      const y1 = vanishingLine.p1.v * scale + offset.y
      const x2 = vanishingLine.p2.u * scale + offset.x
      const y2 = vanishingLine.p2.v * scale + offset.y

      const isSelected = selectedVanishingLines.some(vl => vl.id === vanishingLine.id)
      const isBeingDragged = isDraggingVanishingLine && draggedVanishingLine?.id === vanishingLine.id

      const axisColor = vanishingLine.getColor()
      const lineWidth = isSelected ? 4 : 3
      const endpointRadius = isSelected ? 6 : 4

      ctx.setLineDash([])

      // Draw selection highlight (glow effect) behind the line
      if (isSelected) {
        ctx.strokeStyle = '#FFFFFF'
        ctx.lineWidth = lineWidth + 4
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()

        ctx.strokeStyle = '#FFC107'
        ctx.lineWidth = lineWidth + 2
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }

      // Draw the main line in axis color
      ctx.strokeStyle = axisColor
      ctx.lineWidth = lineWidth

      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()

      // Draw endpoints with selection ring
      if (isSelected) {
        ctx.fillStyle = '#FFFFFF'
        ctx.beginPath()
        ctx.arc(x1, y1, endpointRadius + 2, 0, 2 * Math.PI)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x2, y2, endpointRadius + 2, 0, 2 * Math.PI)
        ctx.fill()
      }

      ctx.fillStyle = axisColor
      ctx.beginPath()
      ctx.arc(x1, y1, endpointRadius, 0, 2 * Math.PI)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x2, y2, endpointRadius, 0, 2 * Math.PI)
      ctx.fill()

      const qualityIssues = validateLineQuality(vanishingLine, linesByAxis[vanishingLine.axis])
      if (qualityIssues.length > 0) {
        const midX = (x1 + x2) / 2
        const midY = (y1 + y2) / 2

        const hasError = qualityIssues.some(issue => issue.type === 'error')
        const iconColor = hasError ? '#FF5252' : '#FFC107'
        const iconSize = 12

        if (isSelected) {
          ctx.strokeStyle = '#FFC107'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(midX, midY, iconSize + 4, 0, 2 * Math.PI)
          ctx.stroke()
        }

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.beginPath()
        ctx.arc(midX, midY, iconSize, 0, 2 * Math.PI)
        ctx.fill()

        ctx.fillStyle = iconColor
        ctx.beginPath()
        ctx.arc(midX, midY, iconSize - 2, 0, 2 * Math.PI)
        ctx.fill()

        ctx.fillStyle = hasError ? '#FFFFFF' : '#000000'
        ctx.font = 'bold 16px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('!', midX, midY)
      }
    })
  }

  if (!visibility.vanishingPoints) return

  const vanishingPoints: Record<string, { u: number; v: number; color: string } | null> = {
    x: null,
    y: null,
    z: null
  }

  const vanishingPointAccuracy: Record<string, number> = {}

  Object.keys(linesByAxis).forEach(axis => {
    const lines = linesByAxis[axis]
    if (lines.length < 2) return

    const vp = computeVanishingPoint(lines)
    if (vp) {
      const vpU = vp.u
      const vpV = vp.v

      if (lines.length === 2) {
        vanishingPointAccuracy[axis] = -1
      } else {
        const angularErrors: number[] = []
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]

          const lineDir_u = line.p2.u - line.p1.u
          const lineDir_v = line.p2.v - line.p1.v
          const lineDirMag = Math.sqrt(lineDir_u * lineDir_u + lineDir_v * lineDir_v)

          if (lineDirMag < 1e-6) continue

          const lineDirNorm_u = lineDir_u / lineDirMag
          const lineDirNorm_v = lineDir_v / lineDirMag

          const mid_u = (line.p1.u + line.p2.u) / 2
          const mid_v = (line.p1.v + line.p2.v) / 2

          const vpToMid_u = mid_u - vpU
          const vpToMid_v = mid_v - vpV
          const vpToMidMag = Math.sqrt(vpToMid_u * vpToMid_u + vpToMid_v * vpToMid_v)

          if (vpToMidMag < 1e-6) continue

          const vpToMidNorm_u = vpToMid_u / vpToMidMag
          const vpToMidNorm_v = vpToMid_v / vpToMidMag

          const dot = Math.abs(lineDirNorm_u * vpToMidNorm_u + lineDirNorm_v * vpToMidNorm_v)
          const angle = Math.acos(Math.max(0, Math.min(1, dot)))
          const angleError = Math.min(angle, Math.PI - angle)

          angularErrors.push(angleError)
        }

        const rmsError = angularErrors.length > 0
          ? Math.sqrt(angularErrors.reduce((sum, e) => sum + e * e, 0) / angularErrors.length)
          : 0

        const rmsDegrees = (rmsError * 180) / Math.PI
        vanishingPointAccuracy[axis] = rmsDegrees
      }

      vanishingPoints[axis] = {
        u: vpU,
        v: vpV,
        color: AXIS_COLORS[axis as 'x' | 'y' | 'z']
      }
    }
  })

  Object.entries(vanishingPoints).forEach(([axis, vp]) => {
    if (!vp) return

    const x = vp.u * scale + offset.x
    const y = vp.v * scale + offset.y

    const accuracy = vanishingPointAccuracy[axis]
    let accuracyLabel = ''
    let accuracyLabelColor = vp.color

    if (accuracy !== undefined && accuracy >= 0) {
      if (accuracy < 1.0) {
        accuracyLabelColor = '#00ff00'
        accuracyLabel = `${accuracy.toFixed(2)}°`
      } else if (accuracy < 5.0) {
        accuracyLabelColor = '#ffff00'
        accuracyLabel = `${accuracy.toFixed(2)}°`
      } else {
        accuracyLabelColor = '#ff0000'
        accuracyLabel = `${accuracy.toFixed(2)}°`
      }
    }

    ctx.strokeStyle = vp.color
    ctx.lineWidth = 2
    ctx.setLineDash([])

    const crosshairSize = 20
    ctx.beginPath()
    ctx.moveTo(x - crosshairSize, y)
    ctx.lineTo(x + crosshairSize, y)
    ctx.moveTo(x, y - crosshairSize)
    ctx.lineTo(x, y + crosshairSize)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(x, y, 8, 0, 2 * Math.PI)
    ctx.stroke()

    if (accuracyLabel) {
      ctx.font = 'bold 11px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
      ctx.fillRect(x - 20, y + 15, 40, 16)
      ctx.fillStyle = accuracyLabelColor
      ctx.fillText(accuracyLabel, x, y + 17)
    }
  })

  if (vanishingPoints.x && vanishingPoints.y) {
    const vp1_x = vanishingPoints.x.u * scale + offset.x
    const vp1_y = vanishingPoints.x.v * scale + offset.y
    const vp2_x = vanishingPoints.y.u * scale + offset.x
    const vp2_y = vanishingPoints.y.v * scale + offset.y

    ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)'
    ctx.lineWidth = 2
    ctx.setLineDash([10, 5])

    ctx.beginPath()
    ctx.moveTo(vp1_x, vp1_y)
    ctx.lineTo(vp2_x, vp2_y)
    ctx.stroke()
    ctx.setLineDash([])
  } else if (vanishingPoints.x && vanishingPoints.z) {
    const vp1_x = vanishingPoints.x.u * scale + offset.x
    const vp1_y = vanishingPoints.x.v * scale + offset.y
    const vp2_x = vanishingPoints.z.u * scale + offset.x
    const vp2_y = vanishingPoints.z.v * scale + offset.y

    ctx.strokeStyle = 'rgba(255, 0, 255, 0.5)'
    ctx.lineWidth = 2
    ctx.setLineDash([10, 5])

    ctx.beginPath()
    ctx.moveTo(vp1_x, vp1_y)
    ctx.lineTo(vp2_x, vp2_y)
    ctx.stroke()
    ctx.setLineDash([])
  } else if (vanishingPoints.y && vanishingPoints.z) {
    const vp1_x = vanishingPoints.y.u * scale + offset.x
    const vp1_y = vanishingPoints.y.v * scale + offset.y
    const vp2_x = vanishingPoints.z.u * scale + offset.x
    const vp2_y = vanishingPoints.z.v * scale + offset.y

    ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)'
    ctx.lineWidth = 2
    ctx.setLineDash([10, 5])

    ctx.beginPath()
    ctx.moveTo(vp1_x, vp1_y)
    ctx.lineTo(vp2_x, vp2_y)
    ctx.stroke()
    ctx.setLineDash([])
  }

  const ppX = viewpoint.principalPointX * scale + offset.x
  const ppY = viewpoint.principalPointY * scale + offset.y

  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 2
  ctx.setLineDash([])

  const ppSize = 12
  ctx.beginPath()
  ctx.arc(ppX, ppY, ppSize, 0, 2 * Math.PI)
  ctx.stroke()

  ctx.strokeStyle = '#FF00FF'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(ppX, ppY, ppSize - 3, 0, 2 * Math.PI)
  ctx.stroke()

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.fillRect(ppX - 25, ppY - ppSize - 20, 50, 14)
  ctx.fillStyle = '#FF00FF'
  ctx.font = 'bold 10px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('PP', ppX, ppY - ppSize - 13)

  if (Object.keys(vanishingPoints).filter(k => vanishingPoints[k as 'x' | 'y' | 'z']).length >= 2) {
    if (!canvasEl) return

    ctx.setLineDash([])

    const canvasWidth = canvasEl.width
    const canvasHeight = canvasEl.height

    if (visibility.perspectiveGrid) {
      const linesX = linesByAxis['x']
      const linesY = linesByAxis['y']
      const linesZ = linesByAxis['z']
      const vpX = vanishingPoints['x']
      const vpY = vanishingPoints['y']
      const vpZ = vanishingPoints['z']

      const drawPerspectiveGrid = (
        linesA: Array<VanishingLine>,
        linesB: Array<VanishingLine>,
        vpA: { u: number; v: number },
        vpB: { u: number; v: number },
        nx = 10,
        ny = 10
      ) => {
        if (linesA.length < 2 || linesB.length < 2) return

        const vpA_pix = { x: vpA.u * scale + offset.x, y: vpA.v * scale + offset.y }
        const vpB_pix = { x: vpB.u * scale + offset.x, y: vpB.v * scale + offset.y }

        const getAngleRange = (vp: { x: number; y: number }, lines: Array<VanishingLine>) => {
          const angles = lines.map(L => {
            const mid_u = (L.p1.u + L.p2.u) / 2
            const mid_v = (L.p1.v + L.p2.v) / 2
            const mid_x = mid_u * scale + offset.x
            const mid_y = mid_v * scale + offset.y
            return Math.atan2(mid_y - vp.y, mid_x - vp.x)
          }).sort((a, b) => a - b)

          let minAngle = angles[0]
          let maxAngle = angles[angles.length - 1]

          const directSpan = maxAngle - minAngle
          if (directSpan > Math.PI) {
            const temp = minAngle
            minAngle = maxAngle
            maxAngle = temp + 2 * Math.PI
          }

          return { minAngle, maxAngle }
        }

        const rangeA = getAngleRange(vpA_pix, linesA)
        const rangeB = getAngleRange(vpB_pix, linesB)

        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, canvasWidth, canvasHeight)
        ctx.clip()

        const extendLen = Math.max(canvasWidth, canvasHeight) * 3

        for (let i = 0; i <= nx; i++) {
          const t = i / nx
          let angle = rangeA.minAngle + t * (rangeA.maxAngle - rangeA.minAngle)
          while (angle > Math.PI) angle -= 2 * Math.PI
          while (angle < -Math.PI) angle += 2 * Math.PI

          const dx = Math.cos(angle)
          const dy = Math.sin(angle)

          ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(vpA_pix.x - dx * extendLen, vpA_pix.y - dy * extendLen)
          ctx.lineTo(vpA_pix.x + dx * extendLen, vpA_pix.y + dy * extendLen)
          ctx.stroke()

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(vpA_pix.x - dx * extendLen, vpA_pix.y - dy * extendLen)
          ctx.lineTo(vpA_pix.x + dx * extendLen, vpA_pix.y + dy * extendLen)
          ctx.stroke()
        }

        for (let j = 0; j <= ny; j++) {
          const t = j / ny
          let angle = rangeB.minAngle + t * (rangeB.maxAngle - rangeB.minAngle)
          while (angle > Math.PI) angle -= 2 * Math.PI
          while (angle < -Math.PI) angle += 2 * Math.PI

          const dx = Math.cos(angle)
          const dy = Math.sin(angle)

          ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(vpB_pix.x - dx * extendLen, vpB_pix.y - dy * extendLen)
          ctx.lineTo(vpB_pix.x + dx * extendLen, vpB_pix.y + dy * extendLen)
          ctx.stroke()

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(vpB_pix.x - dx * extendLen, vpB_pix.y - dy * extendLen)
          ctx.lineTo(vpB_pix.x + dx * extendLen, vpB_pix.y + dy * extendLen)
          ctx.stroke()
        }

        ctx.restore()
      }

      if (linesX.length >= 2 && linesY.length >= 2 && vpX && vpY) {
        drawPerspectiveGrid(linesX, linesY, { u: vpX.u, v: vpX.v }, { u: vpY.u, v: vpY.v }, 10, 10)
      } else if (linesX.length >= 2 && linesZ.length >= 2 && vpX && vpZ) {
        drawPerspectiveGrid(linesX, linesZ, { u: vpX.u, v: vpX.v }, { u: vpZ.u, v: vpZ.v }, 10, 10)
      } else if (linesY.length >= 2 && linesZ.length >= 2 && vpY && vpZ) {
        drawPerspectiveGrid(linesY, linesZ, { u: vpY.u, v: vpY.v }, { u: vpZ.u, v: vpZ.v }, 10, 10)
      }
    }
  }
}
