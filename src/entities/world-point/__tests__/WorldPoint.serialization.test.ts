import { WorldPoint } from '../WorldPoint'
import { SerializationContext } from '../../serialization/SerializationContext'

describe('WorldPoint Serialization', () => {
  let context: SerializationContext

  beforeEach(() => {
    context = new SerializationContext()
  })

  test('serializes basic world point', () => {
    const point = WorldPoint.create('P1', {
      lockedXyz: [1, 2, 3],
      color: '#ff0000',
      isVisible: true
    })

    const dto = point.serialize(context)

    expect(dto.id).toBeTruthy()
    expect(dto.name).toBe('P1')
    expect(dto.lockedXyz).toEqual([1, 2, 3])
    expect(dto.color).toBe('#ff0000')
    expect(dto.isVisible).toBe(true)
  })

  test('serializes point with optimized coordinates', () => {
    const point = WorldPoint.create('P1', {
      lockedXyz: [null, null, null],
      optimizedXyz: [5, 6, 7]
    })

    const dto = point.serialize(context)

    expect(dto.optimizedXyz).toEqual([5, 6, 7])
  })

  test('round-trip serialization preserves data', () => {
    const original = WorldPoint.create('Origin', {
      lockedXyz: [0, 0, 0],
      color: '#00ff00',
      isVisible: true,
      optimizedXyz: [0, 0, 0]
    })

    const dto = original.serialize(context)
    const deserialized = WorldPoint.deserialize(dto, context)

    expect(deserialized.name).toBe(original.name)
    expect(deserialized.lockedXyz).toEqual(original.lockedXyz)
    expect(deserialized.optimizedXyz).toEqual(original.optimizedXyz)
    expect(deserialized.color).toBe(original.color)
    expect(deserialized.isVisible).toBe(original.isVisible)
  })

  test('deserialized point is registered in context', () => {
    const original = WorldPoint.create('P1', {
      lockedXyz: [1, 2, 3]
    })

    const dto = original.serialize(context)
    context.clear()

    const deserialized = WorldPoint.deserialize(dto, context)

    expect(context.hasEntity(deserialized)).toBe(true)
    expect(context.getEntityId(deserialized)).toBe(dto.id)
  })

  test('serializes point with partially locked coordinates', () => {
    const point = WorldPoint.create('P1', {
      lockedXyz: [10, null, 5],
      optimizedXyz: [10, 20, 5]
    })

    const dto = point.serialize(context)

    expect(dto.lockedXyz).toEqual([10, null, 5])
    expect(dto.optimizedXyz).toEqual([10, 20, 5])
  })
})
