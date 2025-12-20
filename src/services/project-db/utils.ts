import { ThumbnailGeometry } from './types'
import { AXIS_COLORS } from './constants'

export function generateId(): string {
  return crypto.randomUUID()
}

export async function extractImageFromDataUrl(dataUrl: string): Promise<{ blob: Blob; mimeType: string } | null> {
  if (!dataUrl.startsWith('data:')) {
    return null
  }

  try {
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    return { blob, mimeType: blob.type }
  } catch {
    return null
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function createThumbnail(imageUrl: string, geometry?: ThumbnailGeometry, maxSize: number = 120): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      let width = img.width
      let height = img.height

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width
          width = maxSize
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height
          height = maxSize
        }
      }

      canvas.width = width
      canvas.height = height
      ctx.drawImage(img, 0, 0, width, height)

      // Draw geometry if provided
      if (geometry) {
        const scaleX = width / geometry.imageWidth
        const scaleY = height / geometry.imageHeight

        // Draw lines first (behind points)
        for (const line of geometry.lines) {
          ctx.beginPath()
          ctx.moveTo(line.p1.u * scaleX, line.p1.v * scaleY)
          ctx.lineTo(line.p2.u * scaleX, line.p2.v * scaleY)
          ctx.strokeStyle = line.color
          ctx.lineWidth = 1
          ctx.globalAlpha = 0.7
          if (line.isConstruction) {
            ctx.setLineDash([3, 2])
          } else {
            ctx.setLineDash([])
          }
          ctx.stroke()
        }

        // Draw vanishing lines
        ctx.setLineDash([])
        for (const vl of geometry.vanishingLines) {
          ctx.beginPath()
          ctx.moveTo(vl.p1.u * scaleX, vl.p1.v * scaleY)
          ctx.lineTo(vl.p2.u * scaleX, vl.p2.v * scaleY)
          ctx.strokeStyle = AXIS_COLORS[vl.axis]
          ctx.lineWidth = 1
          ctx.globalAlpha = 0.8
          ctx.stroke()
        }

        // Draw points on top
        ctx.globalAlpha = 1.0
        for (const point of geometry.points) {
          const x = point.u * scaleX
          const y = point.v * scaleY

          ctx.beginPath()
          ctx.arc(x, y, 3, 0, 2 * Math.PI)
          ctx.fillStyle = point.color
          ctx.fill()
          ctx.strokeStyle = 'white'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = imageUrl
  })
}
