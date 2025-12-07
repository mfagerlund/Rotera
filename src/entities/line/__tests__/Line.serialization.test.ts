import { Line } from '../Line'
import { WorldPoint } from '../../world-point/WorldPoint'
import { SerializationContext } from '../../serialization/SerializationContext'

describe('Line Serialization', () => {
  let context: SerializationContext
  let pointA: WorldPoint
  let pointB: WorldPoint

  beforeEach(() => {
    context = new SerializationContext()
    pointA = WorldPoint.create('A', { lockedXyz: [0, 0, 0], optimizedXyz: [0, 0, 0] })
    pointB = WorldPoint.create('B', { lockedXyz: [10, 0, 0], optimizedXyz: [10, 0, 0] })

    context.registerEntity(pointA)
    context.registerEntity(pointB)
  })

  test('serializes basic line', () => {
    const line = Line.create('AB', pointA, pointB)

    const dto = line.serialize(context)

    expect(dto.id).toBeTruthy()
    expect(dto.name).toBe('AB')
    expect(dto.pointAId).toBe(context.getEntityId(pointA))
    expect(dto.pointBId).toBe(context.getEntityId(pointB))
  })

  test('throws if endpoints not registered', () => {
    const orphanPoint = WorldPoint.create('C', { lockedXyz: [5, 5, 5] })
    const line = Line.create('AC', pointA, orphanPoint)

    expect(() => line.serialize(context)).toThrow('endpoints must be serialized first')
  })

  test('round-trip preserves line properties', () => {
    const original = Line.create('AB', pointA, pointB, {
      color: '#0000ff',
      isConstruction: true,
      lineStyle: 'dashed',
      thickness: 2,
      direction: 'xz',
      targetLength: 10,
      tolerance: 0.01
    })

    const dto = original.serialize(context)

    original.cleanup()

    const deserialized = Line.deserialize(dto, context)

    expect(deserialized.name).toBe('AB')
    expect(deserialized.pointA).toBe(pointA)
    expect(deserialized.pointB).toBe(pointB)
    expect(deserialized.color).toBe('#0000ff')
    expect(deserialized.isConstruction).toBe(true)
    expect(deserialized.lineStyle).toBe('dashed')
    expect(deserialized.thickness).toBe(2)
    expect(deserialized.direction).toBe('xz')
    expect(deserialized.targetLength).toBe(10)
    expect(deserialized.tolerance).toBe(0.01)
  })

  test('deserialize re-establishes point relationships', () => {
    const original = Line.create('AB', pointA, pointB)
    const dto = original.serialize(context)
    original.cleanup()

    expect(pointA.connectedLines.size).toBe(0)
    expect(pointB.connectedLines.size).toBe(0)

    const deserialized = Line.deserialize(dto, context)

    expect(pointA.connectedLines.has(deserialized)).toBe(true)
    expect(pointB.connectedLines.has(deserialized)).toBe(true)
  })
})
