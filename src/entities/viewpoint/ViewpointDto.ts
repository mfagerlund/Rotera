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
  useSimpleIntrinsics?: boolean  // Optional for backwards compatibility (defaults to true)
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
  // NOTE: isPoseLocked is a runtime-only flag, not persisted
  // Kept optional in DTO for backwards compatibility (old JSON files may have it)
  isPoseLocked?: boolean  // DEPRECATED - ignored on load, not written on save
  isPossiblyCropped?: boolean  // If true, principal point can be optimized. Defaults to false (PP locked to center)
  vanishingLineIds?: string[]
}
