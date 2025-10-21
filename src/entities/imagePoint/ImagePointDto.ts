import type { BaseDto } from '../serialization/ISerializable'

export interface ImagePointDto extends BaseDto {
  id: string
  worldPointId: string
  viewpointId: string
  u: number
  v: number
  isVisible: boolean
  confidence: number
}
