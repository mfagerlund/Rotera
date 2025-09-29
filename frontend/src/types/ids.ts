// Simple string-based ID types

export type PointId = string
export type LineId = string
export type PlaneId = string
export type CameraId = string
export type ImageId = string
export type ImagePointId = string
export type ConstraintId = string
export type ProjectId = string


// Union type for all entity IDs
export type EntityId = PointId | LineId | PlaneId | CameraId | ImageId | ImagePointId | ConstraintId | ProjectId

