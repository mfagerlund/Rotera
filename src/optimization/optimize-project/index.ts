/**
 * optimize-project module - Main entry point
 *
 * Public API for project optimization, including camera initialization,
 * world point initialization, and bundle adjustment.
 */

// Re-export main optimization function
export { optimizeProject } from './orchestrator';

// Re-export types
export type { OptimizeProjectOptions, OptimizeProjectResult } from './types';

// Re-export utilities from other modules (backwards compatibility)
export { log, clearOptimizationLogs, optimizationLogs, setLogCallback } from '../optimization-logger';
export type { OutlierInfo } from '../outlier-detection';
export { viewpointInitialVps } from '../state-reset';
export { resetOptimizationState } from '../state-reset';
