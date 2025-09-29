// WorldPoint entity - now uses modular architecture
// This file maintains backward compatibility while using the new modular structure

export { WorldPoint } from './world-point/WorldPoint'
export type { WorldPointDto } from './world-point/WorldPointDto'
export { WorldPointValidator } from './world-point/WorldPointValidation'
export { WorldPointGeometry } from './world-point/WorldPointGeometry'
export { WorldPointRelationshipManager } from './world-point/WorldPointRelationships'
export type { ILine, IConstraint } from './world-point/WorldPointRelationships'