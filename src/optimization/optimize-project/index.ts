/**
 * optimize-project module - Main entry point
 *
 * Public API for project optimization, including camera initialization,
 * world point initialization, and bundle adjustment.
 */

// Re-export main optimization function
export { optimizeProject } from './orchestrator';

// Re-export types and quality utilities
export type { OptimizeProjectOptions, OptimizeProjectResult, SolveQuality } from './types';
export { getSolveQuality } from './types';

// Re-export utilities from other modules (backwards compatibility)
export { log, clearOptimizationLogs, optimizationLogs, setLogCallback } from '../optimization-logger';
export type { OutlierInfo } from '../outlier-detection';
export { viewpointInitialVps } from '../state-reset';
export { resetOptimizationState } from '../state-reset';
