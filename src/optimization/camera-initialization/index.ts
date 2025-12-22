/**
 * Camera Initialization Strategies
 *
 * This module contains functions for initializing camera poses using different methods:
 * - Vanishing Point (VP) initialization
 * - PnP (Perspective-n-Point) initialization
 * - Essential Matrix initialization
 * - Stepped VP initialization (VP on one camera, PnP on rest)
 *
 * Public API:
 * - initializeCameras: Main orchestrator for camera initialization
 */

// Public API
export { initializeCameras } from './orchestrator';
export type { InitializeCamerasOptions } from './orchestrator';

// Internal exports (used by other optimization modules)
export { tryVPInitForCamera } from './vp-strategy';
export { tryPnPInitForCamera } from './pnp-strategy';
export { runEssentialMatrixInitialization } from './essential-matrix-strategy';
export { runFirstTierInitialization } from './first-tier';
export { runSteppedVPInitialization } from './stepped-vp';
export { trySingleCameraInit } from './single-camera-init';
