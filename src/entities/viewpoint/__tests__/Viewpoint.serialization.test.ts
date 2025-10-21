import { Viewpoint } from '../Viewpoint'
import { SerializationContext } from '../../serialization/SerializationContext'

describe('Viewpoint Serialization', () => {
  let context: SerializationContext

  beforeEach(() => {
    context = new SerializationContext()
  })

  test('serializes basic viewpoint', () => {
    const vp = Viewpoint.create('IMG_001', 'img001.jpg', 'https://example.com/img001.jpg', 1920, 1080)

    const dto = vp.serialize(context)

    expect(dto.id).toBeTruthy()
    expect(dto.name).toBe('IMG_001')
    expect(dto.filename).toBe('img001.jpg')
    expect(dto.imageWidth).toBe(1920)
    expect(dto.imageHeight).toBe(1080)
  })

  test('round-trip preserves camera parameters', () => {
    const original = Viewpoint.create('IMG_001', 'img001.jpg', 'url', 1920, 1080, {
      focalLength: 2000,
      position: [10, 20, 30],
      rotation: [1, 0, 0, 0],
      radialDistortion: [0.1, 0.2, 0.3],
      tangentialDistortion: [0.01, 0.02]
    })

    const dto = original.serialize(context)
    context.clear()
    const deserialized = Viewpoint.deserialize(dto, context)

    expect(deserialized.focalLength).toBe(2000)
    expect(deserialized.position).toEqual([10, 20, 30])
    expect(deserialized.rotation).toEqual([1, 0, 0, 0])
    expect(deserialized.radialDistortion).toEqual([0.1, 0.2, 0.3])
    expect(deserialized.tangentialDistortion).toEqual([0.01, 0.02])
  })

  test('round-trip preserves metadata', () => {
    const original = Viewpoint.create('IMG_001', 'img.jpg', 'url', 1920, 1080, {
      metadata: { exif: { iso: 400, fStop: 2.8 } }
    })

    const dto = original.serialize(context)
    context.clear()
    const deserialized = Viewpoint.deserialize(dto, context)

    expect(deserialized.metadata).toEqual({ exif: { iso: 400, fStop: 2.8 } })
  })

  test('deserialized viewpoint is registered in context', () => {
    const original = Viewpoint.create('IMG_001', 'img.jpg', 'url', 1920, 1080)

    const dto = original.serialize(context)
    context.clear()

    const deserialized = Viewpoint.deserialize(dto, context)

    expect(context.hasEntity(deserialized)).toBe(true)
    expect(context.getEntityId(deserialized)).toBe(dto.id)
  })
})
