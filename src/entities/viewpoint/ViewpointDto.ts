import type { BaseDto } from '../serialization/ISerializable'

export interface ViewpointDto extends BaseDto {
  id: string
  name: string
  filename: string
  url: string
  imageWidth: number
  imageHeight: number
  focalLength: number
  principalPointX: number
  principalPointY: number
  skewCoefficient: number
  aspectRatio: number
  radialDistortion: [number, number, number]
  tangentialDistortion: [number, number]
  position: [number, number, number]
  rotation: [number, number, number, number]
  calibrationAccuracy: number
  calibrationDate?: string
  calibrationNotes?: string
  isProcessed: boolean
  processingNotes?: string
  metadata?: any
  isVisible: boolean
  opacity: number
  color: string
  vanishingLineIds?: string[]
}
