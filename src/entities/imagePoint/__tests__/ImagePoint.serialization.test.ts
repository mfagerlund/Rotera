import { ImagePoint } from '../ImagePoint'
import { WorldPoint } from '../../world-point/WorldPoint'
import { Viewpoint } from '../../viewpoint/Viewpoint'
import { SerializationContext } from '../../serialization/SerializationContext'

describe('ImagePoint Serialization', () => {
  let context: SerializationContext
  let worldPoint: WorldPoint
  let viewpoint: Viewpoint

  beforeEach(() => {
    context = new SerializationContext()
    worldPoint = WorldPoint.create('P1', { lockedXyz: [1, 2, 3] })
    viewpoint = Viewpoint.create('IMG_001', 'img.jpg', 'url', 1920, 1080)

    context.registerEntity(worldPoint)
    context.registerEntity(viewpoint)
  })

  test('serializes image point', () => {
    const ip = ImagePoint.create(worldPoint, viewpoint, 500, 600)

    const dto = ip.serialize(context)

    expect(dto.worldPointId).toBe(context.getEntityId(worldPoint))
    expect(dto.viewpointId).toBe(context.getEntityId(viewpoint))
    expect(dto.u).toBe(500)
    expect(dto.v).toBe(600)
  })

  test('throws if dependencies not registered', () => {
    const orphanPoint = WorldPoint.create('P2', { lockedXyz: [0, 0, 0] })
    const ip = ImagePoint.create(orphanPoint, viewpoint, 100, 200)

    expect(() => ip.serialize(context)).toThrow('dependencies must be serialized first')
  })

  test('round-trip preserves data and relationships', () => {
    const original = ImagePoint.create(worldPoint, viewpoint, 100, 200, {
      isVisible: false,
      confidence: 0.8
    })

    const dto = original.serialize(context)

    const deserialized = ImagePoint.deserialize(dto, context)

    expect(deserialized.worldPoint).toBe(worldPoint)
    expect(deserialized.viewpoint).toBe(viewpoint)
    expect(deserialized.u).toBe(100)
    expect(deserialized.v).toBe(200)
    expect(deserialized.isVisible).toBe(false)
    expect(deserialized.confidence).toBe(0.8)
  })

  test('deserialize establishes bidirectional relationships', () => {
    const original = ImagePoint.create(worldPoint, viewpoint, 100, 200)
    const dto = original.serialize(context)

    worldPoint.imagePoints.clear()
    viewpoint.imagePoints.clear()

    const deserialized = ImagePoint.deserialize(dto, context)

    expect(worldPoint.imagePoints.has(deserialized)).toBe(true)
    expect(viewpoint.imagePoints.has(deserialized)).toBe(true)
  })
})
