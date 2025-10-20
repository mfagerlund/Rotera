// Utility to generate stable React keys for entities
// Since entities don't expose IDs at runtime, we use WeakMap for stable keys

const entityKeyMap = new WeakMap<object, string>()
let keyCounter = 0

/**
 * Get a stable key for an entity object.
 * This is for React keys only - DO NOT use for business logic!
 */
export function getEntityKey(entity: object): string {
  let key = entityKeyMap.get(entity)
  if (!key) {
    key = `entity-${++keyCounter}`
    entityKeyMap.set(entity, key)
  }
  return key
}

/**
 * Get a stable key for an array index.
 * Use this when the entity doesn't change position in the list.
 */
export function getIndexKey(index: number, prefix: string = 'item'): string {
  return `${prefix}-${index}`
}
