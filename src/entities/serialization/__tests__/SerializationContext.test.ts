import { SerializationContext } from '../SerializationContext'

describe('SerializationContext', () => {
  let context: SerializationContext

  beforeEach(() => {
    context = new SerializationContext()
  })

  test('auto-generates IDs', () => {
    const obj1 = {}
    const obj2 = {}

    const id1 = context.registerEntity(obj1)
    const id2 = context.registerEntity(obj2)

    expect(id1).toBeTruthy()
    expect(id2).toBeTruthy()
    expect(id1).not.toBe(id2)
  })

  test('uses explicit IDs when provided', () => {
    const obj = {}
    const id = context.registerEntity(obj, 'custom_123')

    expect(id).toBe('custom_123')
    expect(context.getEntityId(obj)).toBe('custom_123')
  })

  test('returns same ID for already-registered entity', () => {
    const obj = {}
    const id1 = context.registerEntity(obj)
    const id2 = context.registerEntity(obj)

    expect(id1).toBe(id2)
  })

  test('throws if re-registering with different ID', () => {
    const obj = {}
    context.registerEntity(obj, 'id1')

    expect(() => context.registerEntity(obj, 'id2')).toThrow('already registered with different ID')
  })

  test('retrieves entity by ID', () => {
    const obj = { value: 42 }
    const id = context.registerEntity(obj)

    const retrieved = context.getEntity<typeof obj>(id)
    expect(retrieved).toBe(obj)
    expect(retrieved?.value).toBe(42)
  })

  test('hasEntity works correctly', () => {
    const obj = {}
    expect(context.hasEntity(obj)).toBe(false)

    context.registerEntity(obj)
    expect(context.hasEntity(obj)).toBe(true)
  })

  test('clear resets context', () => {
    const obj = {}
    context.registerEntity(obj)

    context.clear()

    expect(context.hasEntity(obj)).toBe(false)
    expect(context.getAllIds()).toHaveLength(0)
  })
})
