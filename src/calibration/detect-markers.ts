import { AR } from 'js-aruco2'
import type { Viewpoint } from '../entities/viewpoint'
import { KNOWN_MARKER_IDS } from './marker-registry'

export interface DetectedMarkerCorner {
  u: number
  v: number
}

export interface DetectedMarker {
  id: number
  corners: [DetectedMarkerCorner, DetectedMarkerCorner, DetectedMarkerCorner, DetectedMarkerCorner]
}

/**
 * Detect ArUco calibration markers in a viewpoint image.
 * Returns only markers with IDs that match our predefined calibration markers (0-3).
 */
export async function detectMarkersInViewpoint(viewpoint: Viewpoint): Promise<DetectedMarker[]> {
  const imageData = await getImageDataFromViewpoint(viewpoint)
  if (!imageData) return []

  const detector = new AR.Detector({ dictionaryName: 'ARUCO' })
  const rawMarkers = detector.detect(imageData)

  return rawMarkers
    .filter(m => KNOWN_MARKER_IDS.has(m.id))
    .map(m => ({
      id: m.id,
      corners: m.corners.map(c => ({ u: c.x, v: c.y })) as [DetectedMarkerCorner, DetectedMarkerCorner, DetectedMarkerCorner, DetectedMarkerCorner]
    }))
}

async function getImageDataFromViewpoint(viewpoint: Viewpoint): Promise<ImageData | null> {
  const url = viewpoint.url
  if (!url) return null

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.drawImage(img, 0, 0)
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height))
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}
