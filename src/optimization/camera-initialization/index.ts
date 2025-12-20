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
 * - initializeCamerasIteratively: Iterative initialization with triangulation
 */

// Public API
export { initializeCameras } from './orchestrator';
export { initializeCamerasIteratively } from './iterative';
export type { InitializeCamerasOptions } from './iterative';

// Internal exports (used by other optimization modules)
export { tryVPInitForCamera } from './vp-strategy';
export { tryPnPInitForCamera } from './pnp-strategy';
export { runEssentialMatrixInitialization } from './essential-matrix-strategy';
export { runFirstTierInitialization } from './first-tier';
export { runSteppedVPInitialization } from './stepped-vp';
export { trySingleCameraInit } from './single-camera-init';
