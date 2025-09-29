// Enhanced entity management hook for unified geometry system

import { useState, useCallback, useMemo } from 'react'
import {
  EntityCollection,
  EntityManager,
  EntitySelection,
  EntityOperations,
  EntityCreationParams,
  EntityValidation,
  EntityEvent,
  EntityStatistics,
  BoundingBox
} from '../types/entities'
import {
  GeometricEntity,
  Point,
  Line,
  Plane,
  Circle,
  EnhancedConstraint
} from '../types/geometry'

export const useEntityManager = (
  initialEntities?: EntityCollection,
  constraints: EnhancedConstraint[] = []
): EntityManager => {
  // Core state
  const [entities, setEntities] = useState<EntityCollection>(
    initialEntities || { points: {}, lines: {}, planes: {}, circles: {} }
  )

  const [selection, setSelection] = useState<EntitySelection>({
    entities: [],
    selectionMode: 'multi',
    filters: {
      points: true,
      lines: true,
      planes: true,
      circles: true
    }
  })

  const [nextCounters, setNextCounters] = useState({
    point: 1,
    line: 1,
    plane: 1,
    circle: 1
  })

  // Event handling
  const [eventListeners] = useState(new Map<string, Array<(event: EntityEvent) => void>>())

  const addEventListener = useCallback((type: EntityEvent['type'], handler: (event: EntityEvent) => void) => {
    if (!eventListeners.has(type)) {
      eventListeners.set(type, [])
    }
    eventListeners.get(type)!.push(handler)
  }, [eventListeners])

  const removeEventListener = useCallback((type: EntityEvent['type'], handler: (event: EntityEvent) => void) => {
    const handlers = eventListeners.get(type)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index >= 0) {
        handlers.splice(index, 1)
      }
    }
  }, [eventListeners])

  const dispatchEvent = useCallback((event: EntityEvent) => {
    const handlers = eventListeners.get(event.type)
    if (handlers) {
      handlers.forEach(handler => handler(event))
    }
  }, [eventListeners])

  // Name generation
  const generateName = useCallback((type: 'point' | 'line' | 'plane' | 'points_equal_distance'): string => {
    const counter = nextCounters[type]
    const prefix = type === 'point' ? 'WP' : type === 'line' ? 'L' : type === 'plane' ? 'P' : 'C'
    return `${prefix}${counter}`
  }, [nextCounters])

  // Entity creation
  const create = useCallback((params: EntityCreationParams): string | null => {
    const id = crypto.randomUUID()
    const name = params.name || generateName(params.type)
    const timestamp = new Date().toISOString()

    let entity: GeometricEntity

    switch (params.type) {
      case 'point':
        entity = {
          id,
          name,
          type: 'point',
          xyz: params.definition.coordinates,
          imagePoints: params.definition.imagePoint ? [params.definition.imagePoint] : [],
          isVisible: params.properties?.isVisible ?? true,
          color: params.properties?.color || '#2196F3',
          isConstruction: params.properties?.isConstruction || false,
          createdAt: timestamp,
          tags: params.properties?.tags || []
        } as Point
        break

      case 'line':
        entity = {
          id,
          name,
          type: 'line',
          definition: {
            type: 'two_points',
            pointIds: params.definition.pointIds
          },
          geometry: params.definition.geometry || 'segment',
          isVisible: params.properties?.isVisible ?? true,
          color: params.properties?.color || '#2196F3',
          isConstruction: params.properties?.isConstruction || false,
          createdAt: timestamp
        } as Line
        break

      case 'plane':
        entity = {
          id,
          name,
          type: 'plane',
          definition: params.definition,
          isInfinite: params.definition.isInfinite ?? true,
          isVisible: params.properties?.isVisible ?? true,
          color: params.properties?.color || '#2196F3',
          isConstruction: params.properties?.isConstruction || false,
          createdAt: timestamp
        } as Plane
        break

      case 'points_equal_distance':
        entity = {
          id,
          name,
          type: 'points_equal_distance',
          definition: params.definition,
          isVisible: params.properties?.isVisible ?? true,
          color: params.properties?.color || '#2196F3',
          isConstruction: params.properties?.isConstruction || false,
          createdAt: timestamp
        } as Circle
        break

      default:
        return null
    }

    setEntities(prev => ({
      ...prev,
      [params.type + 's']: {
        ...prev[params.type + 's' as keyof EntityCollection],
        [id]: entity
      }
    }))

    setNextCounters(prev => ({
      ...prev,
      [params.type]: prev[params.type] + 1
    }))

    dispatchEvent({ type: 'entity_created', entity })
    return id
  }, [generateName, dispatchEvent])

  // Entity reading
  const read = useCallback((id: string): GeometricEntity | null => {
    // Search through all entity types
    for (const [type, collection] of Object.entries(entities)) {
      if (collection[id]) {
        return collection[id]
      }
    }
    return null
  }, [entities])

  // Entity updating
  const update = useCallback((id: string, updates: Partial<GeometricEntity>): boolean => {
    const entity = read(id)
    if (!entity) return false

    const timestamp = new Date().toISOString()
    const updatedEntity = {
      ...entity,
      ...updates,
      updatedAt: timestamp
    }

    const collectionKey = entity.type + 's' as keyof EntityCollection

    setEntities(prev => ({
      ...prev,
      [collectionKey]: {
        ...prev[collectionKey],
        [id]: updatedEntity
      }
    }))

    dispatchEvent({
      type: 'entity_updated',
      id,
      changes: { ...updates, updatedAt: timestamp }
    })

    return true
  }, [read, dispatchEvent])

  // Entity deletion
  const deleteEntity = useCallback((id: string): boolean => {
    const entity = read(id)
    if (!entity) return false

    const collectionKey = entity.type + 's' as keyof EntityCollection

    setEntities(prev => {
      const newCollection = { ...prev[collectionKey] }
      delete newCollection[id]
      return {
        ...prev,
        [collectionKey]: newCollection
      }
    })

    // Remove from selection if selected
    setSelection(prev => ({
      ...prev,
      entities: prev.entities.filter(ref => ref.id !== id),
      primaryEntity: prev.primaryEntity?.id === id ? undefined : prev.primaryEntity
    }))

    dispatchEvent({ type: 'entity_deleted', id, entity })
    return true
  }, [read, dispatchEvent])

  // Batch operations
  const createBatch = useCallback((entityParams: EntityCreationParams[]): string[] => {
    const ids: string[] = []
    for (const params of entityParams) {
      const id = create(params)
      if (id) ids.push(id)
    }
    return ids
  }, [create])

  const deleteBatch = useCallback((ids: string[]): boolean => {
    let success = true
    for (const id of ids) {
      if (!deleteEntity(id)) {
        success = false
      }
    }
    return success
  }, [deleteEntity])

  const updateBatch = useCallback((
    updates: Array<{ id: string; updates: Partial<GeometricEntity> }>
  ): boolean => {
    let success = true
    const changes: Array<{ id: string; changes: Partial<GeometricEntity> }> = []

    for (const { id, updates: entityUpdates } of updates) {
      if (update(id, entityUpdates)) {
        changes.push({ id, changes: entityUpdates })
      } else {
        success = false
      }
    }

    if (changes.length > 0) {
      dispatchEvent({ type: 'entities_batch_updated', changes })
    }

    return success
  }, [update, dispatchEvent])

  // Query operations
  const getByType = useCallback((type: 'point' | 'line' | 'plane' | 'points_equal_distance'): GeometricEntity[] => {
    const collectionKey = type + 's' as keyof EntityCollection
    return Object.values(entities[collectionKey])
  }, [entities])

  const getByIds = useCallback((ids: string[]): GeometricEntity[] => {
    return ids.map(id => read(id)).filter(Boolean) as GeometricEntity[]
  }, [read])

  const getVisible = useCallback((): GeometricEntity[] => {
    const all: GeometricEntity[] = []
    for (const collection of Object.values(entities)) {
      all.push(...Object.values(collection).filter((entity: unknown): entity is GeometricEntity => (entity as GeometricEntity).isVisible))
    }
    return all
  }, [entities])

  const getConstruction = useCallback((): GeometricEntity[] => {
    const all: GeometricEntity[] = []
    for (const collection of Object.values(entities)) {
      all.push(...Object.values(collection).filter((entity: unknown): entity is GeometricEntity => Boolean((entity as GeometricEntity).isConstruction)))
    }
    return all
  }, [entities])

  const getByTag = useCallback((tag: string): GeometricEntity[] => {
    const all: GeometricEntity[] = []
    for (const collection of Object.values(entities)) {
      all.push(...Object.values(collection).filter((entity: unknown): entity is GeometricEntity => {
        const geometricEntity = entity as GeometricEntity
        return geometricEntity.type === 'point' && Boolean(geometricEntity.tags?.includes(tag))
      }))
    }
    return all
  }, [entities])

  // Dependency tracking
  const getDependents = useCallback((id: string): string[] => {
    const dependents: string[] = []

    // Check lines that depend on points
    if (entities.points[id]) {
      for (const line of Object.values(entities.lines)) {
        if (line.definition.pointIds.includes(id)) {
          dependents.push(line.id)
        }
      }
    }

    // Check planes that depend on points or lines
    for (const plane of Object.values(entities.planes)) {
      if (plane.definition.pointIds?.includes(id) ||
          plane.definition.lineIds?.includes(id) ||
          plane.definition.lineId === id ||
          plane.definition.pointId === id) {
        dependents.push(plane.id)
      }
    }

    // Check circles that depend on points
    for (const circle of Object.values(entities.circles)) {
      if (circle.definition.centerId === id ||
          circle.definition.pointIds?.includes(id)) {
        dependents.push(circle.id)
      }
    }

    return dependents
  }, [entities])

  const getDependencies = useCallback((id: string): string[] => {
    const entity = read(id)
    if (!entity) return []

    const dependencies: string[] = []

    switch (entity.type) {
      case 'line':
        dependencies.push(...entity.definition.pointIds)
        break
      case 'plane':
        if (entity.definition.pointIds) {
          dependencies.push(...entity.definition.pointIds)
        }
        if (entity.definition.lineIds) {
          dependencies.push(...entity.definition.lineIds)
        }
        if (entity.definition.lineId) {
          dependencies.push(entity.definition.lineId)
        }
        if (entity.definition.pointId) {
          dependencies.push(entity.definition.pointId)
        }
        break
      case 'points_equal_distance':
        if (entity.definition.centerId) {
          dependencies.push(entity.definition.centerId)
        }
        if (entity.definition.pointIds) {
          dependencies.push(...entity.definition.pointIds)
        }
        break
    }

    return dependencies
  }, [read])

  const getConstraintsForEntity = useCallback((id: string): EnhancedConstraint[] => {
    return constraints.filter(constraint => {
      return constraint.entities.points.includes(id) ||
             constraint.entities.lines.includes(id) ||
             constraint.entities.planes.includes(id) ||
             constraint.entities.circles.includes(id)
    })
  }, [constraints])

  // Validation
  const validate = useCallback((id: string): EntityValidation => {
    const entity = read(id)
    if (!entity) {
      return {
        isValid: false,
        errors: ['Entity not found'],
        warnings: [],
        dependencies: []
      }
    }

    const errors: string[] = []
    const warnings: string[] = []
    const dependencies = getDependencies(id)

    // Check if dependencies exist
    for (const depId of dependencies) {
      if (!read(depId)) {
        errors.push(`Missing dependency: ${depId}`)
      }
    }

    // Type-specific validation
    switch (entity.type) {
      case 'line':
        if (entity.definition.pointIds[0] === entity.definition.pointIds[1]) {
          errors.push('Line cannot have identical start and end points')
        }
        break
      case 'plane':
        if (entity.definition.type === 'three_points' && entity.definition.pointIds) {
          const [p1, p2, p3] = entity.definition.pointIds
          if (p1 === p2 || p2 === p3 || p1 === p3) {
            errors.push('Plane cannot have duplicate points')
          }
        }
        break
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      dependencies
    }
  }, [read, getDependencies])

  const validateAll = useCallback((): Record<string, EntityValidation> => {
    const results: Record<string, EntityValidation> = {}

    for (const collection of Object.values(entities)) {
      for (const entity of Object.values(collection)) {
        results[(entity as GeometricEntity).id] = validate((entity as GeometricEntity).id)
      }
    }

    return results
  }, [entities, validate])

  // Statistics
  const getStatistics = useCallback((): EntityStatistics => {
    const stats = {
      total: 0,
      byType: {
        points: Object.keys(entities.points).length,
        lines: Object.keys(entities.lines).length,
        planes: Object.keys(entities.planes).length,
        circles: Object.keys(entities.circles).length
      },
      visible: 0,
      construction: 0,
      constrained: 0,
      orphaned: 0
    }

    stats.total = stats.byType.points + stats.byType.lines + stats.byType.planes + stats.byType.circles

    for (const collection of Object.values(entities)) {
      for (const entity of Object.values(collection)) {
        if ((entity as GeometricEntity).isVisible) stats.visible++
        if ((entity as GeometricEntity).isConstruction) stats.construction++

        const entityConstraints = getConstraintsForEntity((entity as GeometricEntity).id)
        if (entityConstraints.length > 0) {
          stats.constrained++
        } else {
          stats.orphaned++
        }
      }
    }

    return stats
  }, [entities, getConstraintsForEntity])

  // Bounding box calculation
  const getBounds = useCallback((): BoundingBox => {
    const points: [number, number, number][] = []

    for (const point of Object.values(entities.points)) {
      if (point.xyz) {
        points.push(point.xyz)
      }
    }

    if (points.length === 0) {
      return {
        min: [0, 0, 0],
        max: [0, 0, 0]
      }
    }

    const min: [number, number, number] = [Infinity, Infinity, Infinity]
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]

    for (const [x, y, z] of points) {
      min[0] = Math.min(min[0], x)
      min[1] = Math.min(min[1], y)
      min[2] = Math.min(min[2], z)
      max[0] = Math.max(max[0], x)
      max[1] = Math.max(max[1], y)
      max[2] = Math.max(max[2], z)
    }

    return { min, max }
  }, [entities])

  // Create operations object
  const operations: EntityOperations = useMemo(() => ({
    create,
    read,
    update,
    delete: deleteEntity,
    createBatch,
    deleteBatch,
    updateBatch,
    getByType,
    getByIds,
    getVisible,
    getConstruction,
    getByTag,
    getDependents,
    getDependencies,
    getConstraintsForEntity,
    validate,
    validateAll,
    getEntitiesInRegion: () => [], // TODO: Implement spatial queries
    findNearestEntity: () => null, // TODO: Implement spatial queries
    getIntersections: () => []     // TODO: Implement geometric intersections
  }), [
    create, read, update, deleteEntity, createBatch, deleteBatch, updateBatch,
    getByType, getByIds, getVisible, getConstruction, getByTag,
    getDependents, getDependencies, getConstraintsForEntity,
    validate, validateAll
  ])

  const resetCounters = useCallback(() => {
    setNextCounters({ point: 1, line: 1, plane: 1, circle: 1 })
  }, [])

  // Export/Import (simplified)
  const exportEntities = useCallback((ids?: string[]) => {
    if (ids) {
      const exportData: Partial<EntityCollection> = {}
      for (const id of ids) {
        const entity = read(id)
        if (entity) {
          const collectionKey = entity.type + 's' as keyof EntityCollection
          if (!exportData[collectionKey]) {
            exportData[collectionKey] = {}
          }
          exportData[collectionKey]![id] = entity
        }
      }
      return exportData
    }
    return entities
  }, [entities, read])

  const importEntities = useCallback((data: any): string[] => {
    // TODO: Implement proper import with validation
    return []
  }, [])

  return {
    entities,
    selection,
    nextCounters,
    operations,
    addEventListener,
    removeEventListener,
    dispatchEvent,
    generateName,
    resetCounters,
    exportEntities,
    importEntities,
    getBounds,
    getStatistics
  }
}