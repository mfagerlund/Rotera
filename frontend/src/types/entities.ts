// Entity management system for unified geometry handling

import { GeometricEntity, Point, Line, Plane, Circle, EnhancedConstraint } from './geometry'

// Entity collection interface
export interface EntityCollection {
  points: Record<string, Point>
  lines: Record<string, Line>
  planes: Record<string, Plane>
  circles: Record<string, Circle>
}

// Entity references for constraint system
export interface EntityReference {
  id: string
  type: 'point' | 'line' | 'plane' | 'circle'
  role?: string  // e.g., 'start', 'end', 'center', 'vertex'
}

// Entity selection state
export interface EntitySelection {
  entities: EntityReference[]
  primaryEntity?: EntityReference
  selectionMode: 'single' | 'multi' | 'range'
  filters: {
    points: boolean
    lines: boolean
    planes: boolean
    circles: boolean
  }
}

// Entity creation parameters
export interface EntityCreationParams {
  type: 'point' | 'line' | 'plane' | 'circle'
  name?: string
  definition: any  // Type-specific definition
  properties?: {
    color?: string
    isConstruction?: boolean
    isVisible?: boolean
    tags?: string[]
  }
}

// Entity validation result
export interface EntityValidation {
  isValid: boolean
  errors: string[]
  warnings: string[]
  dependencies: string[]  // IDs of entities this depends on
}

// Entity operations
export interface EntityOperations {
  // CRUD operations
  create: (params: EntityCreationParams) => string | null
  read: (id: string) => GeometricEntity | null
  update: (id: string, updates: Partial<GeometricEntity>) => boolean
  delete: (id: string) => boolean

  // Bulk operations
  createBatch: (entities: EntityCreationParams[]) => string[]
  deleteBatch: (ids: string[]) => boolean
  updateBatch: (updates: Array<{ id: string; updates: Partial<GeometricEntity> }>) => boolean

  // Query operations
  getByType: (type: 'point' | 'line' | 'plane' | 'points_equal_distance') => GeometricEntity[]
  getByIds: (ids: string[]) => GeometricEntity[]
  getVisible: () => GeometricEntity[]
  getConstruction: () => GeometricEntity[]
  getByTag: (tag: string) => GeometricEntity[]

  // Dependency tracking
  getDependents: (id: string) => string[]  // Entities that depend on this one
  getDependencies: (id: string) => string[]  // Entities this one depends on
  getConstraintsForEntity: (id: string) => EnhancedConstraint[]

  // Validation
  validate: (id: string) => EntityValidation
  validateAll: () => Record<string, EntityValidation>

  // Spatial queries
  getEntitiesInRegion: (bounds: BoundingBox) => GeometricEntity[]
  findNearestEntity: (point: [number, number, number], type?: 'point' | 'line' | 'plane' | 'points_equal_distance') => GeometricEntity | null
  getIntersections: (entityA: string, entityB: string) => [number, number, number][]
}

// Geometric utility types
export interface BoundingBox {
  min: [number, number, number]
  max: [number, number, number]
}

export interface Ray {
  origin: [number, number, number]
  direction: [number, number, number]
}

export interface Transform {
  translation: [number, number, number]
  rotation: [number, number, number]  // Euler angles
  scale: [number, number, number]
}

// Entity events for reactive updates
export type EntityEvent =
  | { type: 'entity_created'; entity: GeometricEntity }
  | { type: 'entity_updated'; id: string; changes: Partial<GeometricEntity> }
  | { type: 'entity_deleted'; id: string; entity: GeometricEntity }
  | { type: 'entities_batch_updated'; changes: Array<{ id: string; changes: Partial<GeometricEntity> }> }
  | { type: 'selection_changed'; selection: EntitySelection }

// Entity manager interface
export interface EntityManager {
  // State
  entities: EntityCollection
  selection: EntitySelection
  nextCounters: {
    point: number
    line: number
    plane: number
    circle: number
  }

  // Operations
  operations: EntityOperations

  // Event handling
  addEventListener: (type: EntityEvent['type'], handler: (event: EntityEvent) => void) => void
  removeEventListener: (type: EntityEvent['type'], handler: (event: EntityEvent) => void) => void
  dispatchEvent: (event: EntityEvent) => void

  // Naming and counters
  generateName: (type: 'point' | 'line' | 'plane' | 'circle') => string
  resetCounters: () => void

  // Import/Export
  exportEntities: (ids?: string[]) => any
  importEntities: (data: any) => string[]

  // Performance
  getBounds: () => BoundingBox
  getStatistics: () => EntityStatistics
}

export interface EntityStatistics {
  total: number
  byType: {
    points: number
    lines: number
    planes: number
    circles: number
  }
  visible: number
  construction: number
  constrained: number
  orphaned: number  // Entities with no constraints
}

// Helper type for entity creation
export type CreatePointParams = {
  type: 'point'
  coordinates?: [number, number, number]
  imagePoint?: { imageId: string; u: number; v: number }
}

export type CreateLineParams = {
  type: 'line'
  pointIds: [string, string]
}

export type CreatePlaneParams = {
  type: 'plane'
  definition: {
    type: 'three_points'
    pointIds: [string, string, string]
  } | {
    type: 'two_lines'
    lineIds: [string, string]
  } | {
    type: 'line_point'
    lineId: string
    pointId: string
  }
}

export type CreateCircleParams = {
  type: 'points_equal_distance'
  definition: {
    type: 'center_radius'
    centerId: string
    radius: number
  } | {
    type: 'three_points'
    pointIds: [string, string, string]
  }
}

export type EntityCreationUnion = CreatePointParams | CreateLineParams | CreatePlaneParams | CreateCircleParams