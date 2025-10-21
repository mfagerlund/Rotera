import type { SerializationContext } from './SerializationContext'

export interface ISerializable<TDto> {
  serialize(context: SerializationContext): TDto
}

export interface IDeserializable<TDto, TEntity> {
  deserialize(dto: TDto, context: SerializationContext): TEntity
}

export interface BaseDto {
  id: string
}
