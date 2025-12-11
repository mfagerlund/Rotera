export interface SerializationOptions {
  excludeImages?: boolean
}

export class SerializationContext {
  private entityToId = new Map<object, string>()
  private idToEntity = new Map<string, object>()
  private idCounter = 0
  readonly options: SerializationOptions

  constructor(options: SerializationOptions = {}) {
    this.options = options
  }

  registerEntity(entity: object, id?: string): string {
    const existing = this.entityToId.get(entity)
    if (existing) {
      if (id && id !== existing) {
        throw new Error(`Entity already registered with different ID: ${existing} vs ${id}`)
      }
      return existing
    }

    const finalId = id || `${entity.constructor.name}_${this.idCounter++}`

    this.entityToId.set(entity, finalId)
    this.idToEntity.set(finalId, entity)

    return finalId
  }

  getEntityId(entity: object): string | undefined {
    return this.entityToId.get(entity)
  }

  getEntity<T>(id: string): T | undefined {
    return this.idToEntity.get(id) as T | undefined
  }

  hasEntity(entity: object): boolean {
    return this.entityToId.has(entity)
  }

  getAllIds(): string[] {
    return Array.from(this.idToEntity.keys())
  }

  clear(): void {
    this.entityToId.clear()
    this.idToEntity.clear()
    this.idCounter = 0
  }
}
