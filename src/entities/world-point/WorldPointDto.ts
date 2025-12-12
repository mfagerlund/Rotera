import type { BaseDto } from '../serialization/ISerializable'

export interface WorldPointDto extends BaseDto {
  id: string
  name: string
  lockedXyz: [number | null, number | null, number | null]
  inferredXyz?: [number | null, number | null, number | null]
  optimizedXyz?: [number, number, number]
  color: string
}
