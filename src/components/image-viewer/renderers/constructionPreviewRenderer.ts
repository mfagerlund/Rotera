import { RenderParams } from './types'

export function renderConstructionPreview(params: RenderParams): void {
  const {
    ctx,
    viewpoint,
    scale,
    offset,
    constructionPreview,
    currentMousePos
  } = params

  if (!constructionPreview) {
    return
  }

  if (constructionPreview.type === 'loop-chain') {
    const segments = constructionPreview.segments || []

    segments.forEach(segment => {
      const wpA = segment.pointA
      const wpB = segment.pointB
      if (!wpA || !wpB) return

      const ipA = viewpoint.getImagePointsForWorldPoint(wpA)[0] || null
      const ipB = viewpoint.getImagePointsForWorldPoint(wpB)[0] || null
      if (!ipA || !ipB) return

      const x1 = ipA.u * scale + offset.x
      const y1 = ipA.v * scale + offset.y
      const x2 = ipB.u * scale + offset.x
      const y2 = ipB.v * scale + offset.y

      if (segment.status === 'new') {
        ctx.strokeStyle = 'rgba(92, 184, 92, 0.8)'
      } else if (segment.status === 'exists') {
        ctx.strokeStyle = 'rgba(102, 102, 102, 0.6)'
      } else if (segment.status === 'building') {
        ctx.strokeStyle = 'rgba(6, 150, 215, 0.8)'
      }

      ctx.lineWidth = 2
      ctx.setLineDash([8, 4])

      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
    })

    if (segments.length > 0 && currentMousePos) {
      const lastSegment = segments[segments.length - 1]
      const lastPoint = lastSegment.pointB
      if (lastPoint) {
        const ipLast = viewpoint.getImagePointsForWorldPoint(lastPoint)[0] || null
        if (ipLast) {
          const x1 = ipLast.u * scale + offset.x
          const y1 = ipLast.v * scale + offset.y
          const x2 = currentMousePos.x
          const y2 = currentMousePos.y

          ctx.strokeStyle = 'rgba(6, 150, 215, 0.6)'
          ctx.lineWidth = 2
          ctx.setLineDash([8, 4])

          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }
    }

    return
  }

  if (constructionPreview.type === 'vanishing-line') {
    if (!currentMousePos || !constructionPreview.vanishingLineStart) {
      return
    }

    const start = constructionPreview.vanishingLineStart
    const x1 = start.u * scale + offset.x
    const y1 = start.v * scale + offset.y
    const x2 = currentMousePos.x
    const y2 = currentMousePos.y

    const axis = constructionPreview.vanishingLineAxis || 'x'
    const color = axis === 'x' ? '#ff0000' : axis === 'y' ? '#00ff00' : '#0000ff'

    ctx.lineWidth = 1
    ctx.setLineDash([6, 6])

    ctx.strokeStyle = '#000000'
    ctx.lineDashOffset = 0
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    ctx.strokeStyle = '#FFFFFF'
    ctx.lineDashOffset = 6
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    ctx.setLineDash([])

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x1, y1, 4, 0, 2 * Math.PI)
    ctx.fill()

    return
  }

  if (constructionPreview.type !== 'line') {
    return
  }
  if (!currentMousePos) {
    return
  }

  const { pointA, pointB, showToCursor } = constructionPreview

  if (pointA && !pointB && showToCursor) {
    const wpA = pointA
    if (!wpA) {
      return
    }

    const ipA = viewpoint.getImagePointsForWorldPoint(wpA)[0] || null
    if (!ipA) {
      return
    }

    const x1 = ipA.u * scale + offset.x
    const y1 = ipA.v * scale + offset.y
    const x2 = currentMousePos.x
    const y2 = currentMousePos.y

    ctx.strokeStyle = 'rgba(255, 140, 0, 0.8)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (pointA && pointB) {
    const wpA = pointA
    const wpB = pointB
    if (!wpA || !wpB) {
      return
    }

    const ipA = viewpoint.getImagePointsForWorldPoint(wpA)[0] || null
    const ipB = viewpoint.getImagePointsForWorldPoint(wpB)[0] || null
    if (!ipA || !ipB) {
      return
    }

    const x1 = ipA.u * scale + offset.x
    const y1 = ipA.v * scale + offset.y
    const x2 = ipB.u * scale + offset.x
    const y2 = ipB.v * scale + offset.y

    ctx.strokeStyle = 'rgba(255, 140, 0, 0.8)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.setLineDash([])
  }
}
