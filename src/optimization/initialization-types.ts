/**
 * Types for camera and world point initialization.
 *
 * These types are used to pass information between initialization phases
 * without relying on shared mutable flags in the parent scope.
 */

import type { Viewpoint } from '../entities/viewpoint';

/**
 * Diagnostics collected during camera initialization.
 * These flags affect downstream behavior (world point init, alignment, etc.).
 */
export interface InitializationDiagnostics {
  /** Essential Matrix was used for camera initialization */
  usedEssentialMatrix: boolean;

  /** Stepped VP init was attempted but reverted (remaining cameras failed PnP) */
  steppedVPInitReverted: boolean;

  /** VP+EM hybrid was applied (VP rotation applied to EM result) */
  vpEmHybridApplied: boolean;

  /** Scene has only single-axis constraint (one rotational DoF unresolved) */
  hasSingleAxisConstraint: boolean;
}

/**
 * Result from the camera initialization phase.
 */
export interface CameraInitializationResult {
  /** Names of cameras that were successfully initialized */
  camerasInitialized: string[];

  /** Cameras initialized via Vanishing Points */
  camerasInitializedViaVP: Set<Viewpoint>;

  /** Cameras initialized via late PnP (after triangulation) */
  camerasInitializedViaLatePnP: Set<Viewpoint>;

  /** Diagnostics for downstream phases */
  diagnostics: InitializationDiagnostics;

  /** Strategy used for each camera (camera name -> strategy) */
  strategyUsed?: Map<string, string>;

  /** Cameras that couldn't be initialized */
  camerasFailed?: string[];

  /** Number of iterations used (for iterative init) */
  iterations?: number;
}

/**
 * Alignment state collected during world point initialization.
 */
export interface AlignmentState {
  /** Alignment couldn't determine Y-sign definitively */
  wasAmbiguous: boolean;

  /** Which sign was used for alignment ('positive' or 'negative') */
  signUsed: 'positive' | 'negative';

  /** Scale factor applied during initialization */
  scaleFactor: number;
}

/**
 * Result from validation phase.
 */
export interface ValidationResult {
  /** Validation passed */
  valid: boolean;

  /** Error message if validation failed */
  error?: string;

  /** Locked/constrained points found */
  lockedPoints: number;

  /** Whether scale constraint exists (2+ locked points or line with targetLength) */
  hasScaleConstraint: boolean;
}

/**
 * Result from a single camera VP initialization attempt.
 */
export interface VPInitResult {
  /** Whether VP init succeeded */
  success: boolean;

  /** Camera that was initialized (if successful) */
  camera?: Viewpoint;

  /** Computed focal length from VPs */
  focalLength?: number;

  /** Computed rotation quaternion */
  rotation?: [number, number, number, number];
}

/**
 * Result from stepped VP initialization (VP on one camera, PnP on rest).
 */
export interface SteppedVPInitResult {
  /** Whether stepped init fully succeeded */
  success: boolean;

  /** Whether VP init was attempted but reverted */
  reverted: boolean;

  /** Cameras initialized via VP (if successful) */
  vpCameras: Viewpoint[];

  /** Cameras initialized via PnP (if successful) */
  pnpCameras: Viewpoint[];
}

/**
 * Result from Essential Matrix initialization.
 */
export interface EssentialMatrixInitResult {
  /** Whether EM init succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Cameras initialized (typically 2) */
  cameras: Viewpoint[];

  /** Whether VP+EM hybrid was applied */
  vpEmHybridApplied: boolean;
}

/**
 * Create default diagnostics (no flags set).
 */
export function createDefaultDiagnostics(): InitializationDiagnostics {
  return {
    usedEssentialMatrix: false,
    steppedVPInitReverted: false,
    vpEmHybridApplied: false,
    hasSingleAxisConstraint: false,
  };
}
