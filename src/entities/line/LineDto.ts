import type { BaseDto } from '../serialization/ISerializable'
import type { LineDirection } from './Line'

export interface LineDto extends BaseDto {
  id: string
  name: string
  pointAId: string
  pointBId: string
  color: string
  isConstruction: boolean
  lineStyle: 'solid' | 'dashed' | 'dotted'
  thickness: number
  direction: LineDirection
  targetLength?: number
  tolerance?: number
  lastResiduals?: number[]
  collinearPointIds?: string[]
}
