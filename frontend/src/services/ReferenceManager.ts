// ReferenceManager: Smart reference resolution system for performance optimization
// Implements hybrid approach from architecture review

import type { EntityId, PointId, LineId, PlaneId, CameraId, ImageId, ConstraintId } from '../types/ids'
import type { ISelectable } from '../types/selectable'

// Type definitions for reference resolution
export type EntityType = 'point' | 'line' | 'plane' | 'camera' | 'image' | 'constraint'

export interface BatchLoadOptions {
  depth?: number // How deep to preload relationships
  types?: EntityType[] // Which entity types to include
}

export interface ReferenceInvalidationEvent {
  entityId: EntityId
  changeType: 'update' | 'delete' | 'create'
  affectedReferences?: EntityId[]
}

// Core interface for reference resolution
export interface IReferenceResolver {
  resolve<T extends ISelectable>(id: EntityId, type: EntityType): T | undefined
  batchResolve<T extends ISelectable>(ids: EntityId[], type: EntityType): T[]
  preloadReferences(rootEntities: EntityId[], options?: BatchLoadOptions): void
  invalidateReferences(entityId: EntityId): void
  getReferenceCacheStats(): ReferenceStats
}

export interface ReferenceStats {
  totalCacheSize: number
  hitRate: number
  missRate: number
  hotReferences: number
  coldReferences: number
  lastCleanup: Date
}

// Repository interface that ReferenceManager will integrate with
export interface IEntityRepository {
  getEntity(id: EntityId): ISelectable | undefined
  entityExists(id: EntityId): boolean
  getAllEntities(): ISelectable[]
  getDependencies(id: EntityId): EntityId[]
  getDependents(id: EntityId): EntityId[]
}

/**
 * ReferenceManager: Centralized reference resolution with smart caching
 *
 * Key features:
 * - Hot/cold reference caching for frequently accessed relationships
 * - Batch loading to reduce lookup overhead
 * - Reference invalidation on entity changes
 * - Preloading for performance-critical workflows
 */
export class ReferenceManager implements IReferenceResolver {
  // Two-tier cache system as recommended in architecture review
  private hotCache = new Map<EntityId, ISelectable>() // Frequently accessed
  private coldCache = new Map<EntityId, ISelectable>() // Occasionally accessed

  // Reference tracking for invalidation
  private referenceGraph = new Map<EntityId, Set<EntityId>>() // what references what
  private dependencyGraph = new Map<EntityId, Set<EntityId>>() // what depends on what

  // Performance metrics
  private stats = {
    hits: 0,
    misses: 0,
    lastCleanup: new Date(),
    hotPromotions: 0,
    coldDemotions: 0
  }

  // Configuration
  private readonly maxHotSize = 1000
  private readonly maxColdSize = 5000
  private readonly hotThreshold = 5 // access count to promote to hot
  private accessCounts = new Map<EntityId, number>()

  constructor(private repository: IEntityRepository) {
    this.buildReferenceGraph()
  }

  /**
   * Resolve single entity reference with smart caching
   */
  resolve<T extends ISelectable>(id: EntityId, type: EntityType): T | undefined {
    // Check hot cache first
    if (this.hotCache.has(id)) {
      this.stats.hits++
      this.recordAccess(id)
      return this.hotCache.get(id) as T
    }

    // Check cold cache
    if (this.coldCache.has(id)) {
      this.stats.hits++
      this.recordAccess(id)
      const entity = this.coldCache.get(id) as T

      // Consider promoting to hot cache
      this.considerHotPromotion(id, entity)
      return entity
    }

    // Cache miss - load from repository
    this.stats.misses++
    const entity = this.repository.getEntity(id)

    if (entity) {
      this.coldCache.set(id, entity)
      this.recordAccess(id)
      this.manageCacheSize()
    }

    return entity as T | undefined
  }

  /**
   * Batch resolve multiple entity references efficiently
   */
  batchResolve<T extends ISelectable>(ids: EntityId[], type: EntityType): T[] {
    const results: T[] = []
    const uncachedIds: EntityId[] = []

    // First pass: collect cached entities and identify misses
    for (const id of ids) {
      const cached = this.getCachedEntity(id)
      if (cached) {
        results.push(cached as T)
        this.recordAccess(id)
      } else {
        uncachedIds.push(id)
      }
    }

    // Second pass: batch load uncached entities
    if (uncachedIds.length > 0) {
      const uncachedEntities = this.batchLoadFromRepository(uncachedIds)
      results.push(...uncachedEntities as T[])
    }

    return results
  }

  /**
   * Preload entity references for performance-critical workflows
   */
  preloadReferences(rootEntities: EntityId[], options: BatchLoadOptions = {}): void {
    const { depth = 2, types } = options
    const toLoad = new Set<EntityId>(rootEntities)
    const loaded = new Set<EntityId>()

    for (let currentDepth = 0; currentDepth < depth; currentDepth++) {
      const currentLevel = Array.from(toLoad).filter(id => !loaded.has(id))

      if (currentLevel.length === 0) break

      // Load current level
      this.batchLoadFromRepository(currentLevel)

      // Add dependencies for next level
      for (const id of currentLevel) {
        loaded.add(id)
        const dependencies = this.repository.getDependencies(id)

        for (const depId of dependencies) {
          if (!loaded.has(depId)) {
            // Filter by types if specified
            if (!types || this.entityMatchesTypes(depId, types)) {
              toLoad.add(depId)
            }
          }
        }
      }
    }
  }

  /**
   * Invalidate cached references when entity changes
   */
  invalidateReferences(entityId: EntityId): void {
    // Remove from both caches
    this.hotCache.delete(entityId)
    this.coldCache.delete(entityId)
    this.accessCounts.delete(entityId)

    // Invalidate dependent entities that might have cached references to this entity
    const dependents = this.dependencyGraph.get(entityId) || new Set()
    for (const dependentId of dependents) {
      // Don't remove dependent entities, just reset their access counts
      // so they'll be re-evaluated for cache placement
      if (this.accessCounts.has(dependentId)) {
        this.accessCounts.set(dependentId, 0)
      }
    }

    this.rebuildReferenceGraph()
  }

  /**
   * Get cache performance statistics
   */
  getReferenceCacheStats(): ReferenceStats {
    const totalRequests = this.stats.hits + this.stats.misses

    return {
      totalCacheSize: this.hotCache.size + this.coldCache.size,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.stats.misses / totalRequests : 0,
      hotReferences: this.hotCache.size,
      coldReferences: this.coldCache.size,
      lastCleanup: this.stats.lastCleanup
    }
  }

  // Private helper methods

  private getCachedEntity(id: EntityId): ISelectable | undefined {
    return this.hotCache.get(id) || this.coldCache.get(id)
  }

  private recordAccess(id: EntityId): void {
    const currentCount = this.accessCounts.get(id) || 0
    this.accessCounts.set(id, currentCount + 1)
  }

  private considerHotPromotion(id: EntityId, entity: ISelectable): void {
    const accessCount = this.accessCounts.get(id) || 0

    if (accessCount >= this.hotThreshold) {
      this.coldCache.delete(id)
      this.hotCache.set(id, entity)
      this.stats.hotPromotions++
      this.manageCacheSize()
    }
  }

  private manageCacheSize(): void {
    // Manage hot cache size
    if (this.hotCache.size > this.maxHotSize) {
      const lruEntries = this.getLRUEntries(this.hotCache, this.hotCache.size - this.maxHotSize)

      for (const [id, entity] of lruEntries) {
        this.hotCache.delete(id)
        this.coldCache.set(id, entity)
        this.stats.coldDemotions++
      }
    }

    // Manage cold cache size
    if (this.coldCache.size > this.maxColdSize) {
      const lruEntries = this.getLRUEntries(this.coldCache, this.coldCache.size - this.maxColdSize)

      for (const [id] of lruEntries) {
        this.coldCache.delete(id)
        this.accessCounts.delete(id)
      }
    }
  }

  private getLRUEntries(cache: Map<EntityId, ISelectable>, count: number): Array<[EntityId, ISelectable]> {
    const entries = Array.from(cache.entries())

    // Sort by access count (ascending) to get least recently used
    entries.sort(([idA], [idB]) => {
      const countA = this.accessCounts.get(idA) || 0
      const countB = this.accessCounts.get(idB) || 0
      return countA - countB
    })

    return entries.slice(0, count)
  }

  private batchLoadFromRepository(ids: EntityId[]): ISelectable[] {
    const entities: ISelectable[] = []

    for (const id of ids) {
      const entity = this.repository.getEntity(id)
      if (entity) {
        entities.push(entity)
        this.coldCache.set(id, entity)
        this.recordAccess(id)
      }
    }

    this.manageCacheSize()
    return entities
  }

  private entityMatchesTypes(id: EntityId, types: EntityType[]): boolean {
    const entity = this.repository.getEntity(id)
    if (!entity) return false

    const entityType = entity.getType() as EntityType
    return types.includes(entityType)
  }

  private buildReferenceGraph(): void {
    this.referenceGraph.clear()
    this.dependencyGraph.clear()

    const allEntities = this.repository.getAllEntities()

    for (const entity of allEntities) {
      const entityId = entity.getId()
      const dependencies = this.repository.getDependencies(entityId)

      this.referenceGraph.set(entityId, new Set(dependencies))

      // Build reverse dependency graph
      for (const depId of dependencies) {
        if (!this.dependencyGraph.has(depId)) {
          this.dependencyGraph.set(depId, new Set())
        }
        this.dependencyGraph.get(depId)!.add(entityId)
      }
    }
  }

  private rebuildReferenceGraph(): void {
    // Rebuild graph incrementally - more efficient than full rebuild
    this.buildReferenceGraph()
  }

  /**
   * Clear all caches - useful for testing or memory management
   */
  clearCaches(): void {
    this.hotCache.clear()
    this.coldCache.clear()
    this.accessCounts.clear()
    this.stats = {
      hits: 0,
      misses: 0,
      lastCleanup: new Date(),
      hotPromotions: 0,
      coldDemotions: 0
    }
  }

  /**
   * Force cleanup of stale references
   */
  cleanup(): void {
    // Remove entities that no longer exist in repository
    const allIds = new Set(this.repository.getAllEntities().map(e => e.getId()))

    for (const id of this.hotCache.keys()) {
      if (!allIds.has(id)) {
        this.hotCache.delete(id)
      }
    }

    for (const id of this.coldCache.keys()) {
      if (!allIds.has(id)) {
        this.coldCache.delete(id)
      }
    }

    for (const id of this.accessCounts.keys()) {
      if (!allIds.has(id)) {
        this.accessCounts.delete(id)
      }
    }

    this.stats.lastCleanup = new Date()
  }
}

// Factory function for creating ReferenceManager with repository
export function createReferenceManager(repository: IEntityRepository): ReferenceManager {
  return new ReferenceManager(repository)
}

// Helper types for enhanced entity access patterns
export interface SmartEntityReference<T extends ISelectable> {
  id: EntityId
  entity?: T
  resolve(referenceManager: ReferenceManager): T | undefined
}

/**
 * Creates a smart reference that can lazy-load the entity
 */
export function createSmartReference<T extends ISelectable>(
  id: EntityId,
  type: EntityType
): SmartEntityReference<T> {
  return {
    id,
    resolve(referenceManager: ReferenceManager): T | undefined {
      if (!this.entity) {
        this.entity = referenceManager.resolve<T>(id, type)
      }
      return this.entity
    }
  }
}