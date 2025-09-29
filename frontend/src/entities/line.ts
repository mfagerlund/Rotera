// Line entity - now uses modular architecture
// This file maintains backward compatibility while using the new modular structure

export { Line } from './line/Line'
export type {
  LineDto,
  LineDirection,
  LineConstraintSettings
} from './line/LineDto'
export { LineValidator } from './line/LineValidation'
export { LineGeometry } from './line/LineGeometry'
export { LineRelationshipManager } from './line/LineRelationships'