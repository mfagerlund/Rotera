// Viewpoint DTO for serialization

import type { ViewpointId, ImagePointId } from '../../types/ids'

// ImagePoint DTO
export interface ImagePointDto {
  id: ImagePointId
  worldPointId: string
  u: number // pixel coordinate x
  v: number // pixel coordinate y
  isVisible: boolean
  isManuallyPlaced: boolean
  confidence: number // 0-1
  createdAt: string
  updatedAt: string
}

// Viewpoint DTO
export interface ViewpointDto {
  id: ViewpointId
  name: string

  // Image data
  filename: string
  url: string
  imageWidth: number
  imageHeight: number

  // Camera intrinsics
  focalLength: number
  principalPointX: number
  principalPointY: number
  skewCoefficient: number
  aspectRatio: number

  // Distortion
  radialDistortion: [number, number, number]
  tangentialDistortion: [number, number]

  // Camera extrinsics (pose in world)
  position: [number, number, number]
  rotation: [number, number, number, number] // quaternion (w, x, y, z)

  // Image points (observations)
  imagePoints: Record<ImagePointId, ImagePointDto>

  // Metadata
  calibrationAccuracy: number
  calibrationDate?: string
  calibrationNotes?: string
  isProcessed: boolean
  processingNotes?: string
  metadata?: {
    fileSize?: number
    mimeType?: string
    exifData?: Record<string, any>
    captureDate?: string
    gpsCoordinates?: [number, number]
  }

  // Display
  isVisible: boolean
  opacity: number
  color: string
  group?: string
  tags?: string[]

  createdAt: string
  updatedAt: string
}
