// Branded ID types for type safety and preventing cross-wiring

export type PointId = string & { readonly __brand: 'PointId' }
export type LineId = string & { readonly __brand: 'LineId' }
export type PlaneId = string & { readonly __brand: 'PlaneId' }
export type CameraId = string & { readonly __brand: 'CameraId' }
export type ImageId = string & { readonly __brand: 'ImageId' }
export type ImagePointId = string & { readonly __brand: 'ImagePointId' }
export type ConstraintId = string & { readonly __brand: 'ConstraintId' }
export type ProjectId = string & { readonly __brand: 'ProjectId' }

// Type guards for ID validation
export function isPointId(id: string): id is PointId {
  return typeof id === 'string' && id.length > 0
}

export function isLineId(id: string): id is LineId {
  return typeof id === 'string' && id.length > 0
}

export function isPlaneId(id: string): id is PlaneId {
  return typeof id === 'string' && id.length > 0
}

export function isCameraId(id: string): id is CameraId {
  return typeof id === 'string' && id.length > 0
}

export function isImageId(id: string): id is ImageId {
  return typeof id === 'string' && id.length > 0
}

export function isImagePointId(id: string): id is ImagePointId {
  return typeof id === 'string' && id.length > 0
}

export function isConstraintId(id: string): id is ConstraintId {
  return typeof id === 'string' && id.length > 0
}

export function isProjectId(id: string): id is ProjectId {
  return typeof id === 'string' && id.length > 0
}

// Helper functions to create branded IDs
export function createPointId(id: string): PointId {
  if (!isPointId(id)) {
    throw new Error(`Invalid point ID: ${id}`)
  }
  return id as PointId
}

export function createLineId(id: string): LineId {
  if (!isLineId(id)) {
    throw new Error(`Invalid line ID: ${id}`)
  }
  return id as LineId
}

export function createPlaneId(id: string): PlaneId {
  if (!isPlaneId(id)) {
    throw new Error(`Invalid plane ID: ${id}`)
  }
  return id as PlaneId
}

export function createCameraId(id: string): CameraId {
  if (!isCameraId(id)) {
    throw new Error(`Invalid camera ID: ${id}`)
  }
  return id as CameraId
}

export function createImageId(id: string): ImageId {
  if (!isImageId(id)) {
    throw new Error(`Invalid image ID: ${id}`)
  }
  return id as ImageId
}

export function createImagePointId(id: string): ImagePointId {
  if (!isImagePointId(id)) {
    throw new Error(`Invalid image point ID: ${id}`)
  }
  return id as ImagePointId
}

export function createConstraintId(id: string): ConstraintId {
  if (!isConstraintId(id)) {
    throw new Error(`Invalid constraint ID: ${id}`)
  }
  return id as ConstraintId
}

export function createProjectId(id: string): ProjectId {
  if (!isProjectId(id)) {
    throw new Error(`Invalid project ID: ${id}`)
  }
  return id as ProjectId
}

// Generate new IDs with proper branding
export function generatePointId(): PointId {
  return createPointId(crypto.randomUUID())
}

export function generateLineId(): LineId {
  return createLineId(crypto.randomUUID())
}

export function generatePlaneId(): PlaneId {
  return createPlaneId(crypto.randomUUID())
}

export function generateCameraId(): CameraId {
  return createCameraId(crypto.randomUUID())
}

export function generateImageId(): ImageId {
  return createImageId(crypto.randomUUID())
}

export function generateImagePointId(): ImagePointId {
  return createImagePointId(crypto.randomUUID())
}

export function generateConstraintId(): ConstraintId {
  return createConstraintId(crypto.randomUUID())
}

export function generateProjectId(): ProjectId {
  return createProjectId(crypto.randomUUID())
}

// Union type for all entity IDs
export type EntityId = PointId | LineId | PlaneId | CameraId | ImageId | ImagePointId | ConstraintId | ProjectId

// Type-safe ID collections
export type EntityIdMap<T> = {
  [K in EntityId]: T
}

// Helper to get entity type from ID (for debugging/logging)
export function getEntityType(id: EntityId): string {
  // This is a runtime check based on conventions
  // In practice, you'd track this in your repository
  if (id.includes('point')) return 'point'
  if (id.includes('line')) return 'line'
  if (id.includes('plane')) return 'plane'
  if (id.includes('camera')) return 'camera'
  if (id.includes('image')) return 'image'
  if (id.includes('constraint')) return 'constraint'
  if (id.includes('project')) return 'project'
  return 'unknown'
}