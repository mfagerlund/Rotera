/**
 * Interfaces for entities that participate in constraint-based optimization.
 *
 * Entities that implement these interfaces are responsible for:
 * 1. Adding themselves to the ValueMap (deciding which values are optimizable)
 * 2. Computing their own residuals for the constraint solver
 * 3. Applying optimization results back to their state
 */

import type { Value, Vec3, Vec4 } from 'scalar-autograd';
import type { WorldPoint } from '../entities/world-point/WorldPoint';
import type { Viewpoint } from '../entities/viewpoint/Viewpoint';

/**
 * Viewpoint (camera) parameters in ValueMap.
 * Separated into position, rotation, and intrinsics for optimization.
 */
export interface CameraValues {
  position: Vec3;           // Camera position in world coordinates
  rotation: Vec4;           // Quaternion (w, x, y, z) - unit quaternion for rotation
  focalLength: Value;       // Focal length in pixels
  aspectRatio: Value;       // fy/fx
  principalPointX: Value;   // Principal point x
  principalPointY: Value;   // Principal point y
  skew: Value;              // Skew coefficient
  k1: Value;                // Radial distortion k1
  k2: Value;                // Radial distortion k2
  k3: Value;                // Radial distortion k3
  p1: Value;                // Tangential distortion p1
  p2: Value;                // Tangential distortion p2
  isZReflected: boolean;    // If true, negative Z is "in front" of camera
}

/**
 * Map from entities to their corresponding Value objects for optimization.
 * Points map to Vec3 (3D position vectors).
 * Viewpoints (cameras) map to CameraValues (pose + intrinsics).
 */
export interface ValueMap {
  points: Map<WorldPoint, Vec3>;
  cameras: Map<IOptimizableCamera, CameraValues>;

  /**
   * If true, use camera's isZReflected flag when computing projections.
   *
   * - During calibration: false (isZReflected may change mid-optimization)
   * - During fine-tune: true (isZReflected is already set correctly)
   */
  useIsZReflected?: boolean;
}

/**
 * Value provenance - tracks the source and reliability of computed values.
 */
export interface ValueProvenance {
  /** Source of this value */
  source: 'user' | 'optimized' | 'photogrammetry' | 'measured' | 'derived';

  /** When this value was last updated */
  timestamp?: Date;

  /** Confidence/quality metric (0-1) if applicable */
  confidence?: number;

  /** Additional metadata about the source */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for entities that can be added to the optimization ValueMap.
 * These entities contribute variables (V.W) or constants (V.C) to the system.
 */
export interface IValueMapContributor {
  /**
   * Add this entity's values to the ValueMap.
   * Returns an array of Value objects that are variables (should be optimized).
   * Constants (locked values) are added to the map but not returned.
   *
   * @param valueMap - The map to add values to
   * @returns Array of Value objects that are optimization variables
   */
  addToValueMap(valueMap: ValueMap): Value[];
}

/**
 * Interface for entities that contribute residuals to the constraint system.
 * Residuals are Value objects that should equal zero when constraints are satisfied.
 *
 * ARCHITECTURAL INVARIANT: The number of residuals returned by computeResiduals()
 * MUST match the number of residuals stored by applyOptimizationResult().
 * This ensures push/pop symmetry during optimization.
 */
export interface IResidualProvider {
  /**
   * Compute residuals for this entity's constraints.
   *
   * INVARIANT: The number of residuals returned here MUST be stored
   * by applyOptimizationResult() for proper push/pop symmetry.
   *
   * @param valueMap - The ValueMap containing all entity values
   * @returns Array of Value objects (residuals that should be zero)
   */
  computeResiduals(valueMap: ValueMap): Value[];
}

/**
 * Interface for entities that can receive optimization results.
 *
 * ARCHITECTURAL INVARIANT: Must store exactly the same number of residuals
 * that were returned by computeResiduals() to maintain push/pop symmetry.
 */
export interface IOptimizationResultReceiver {
  /**
   * Apply optimization results back to this entity.
   * Should update internal state and mark values as optimized.
   *
   * INVARIANT: MUST store exactly the same number of residuals as were
   * returned by computeResiduals(). Typically done by re-computing
   * residuals and storing them in a lastResiduals field.
   *
   * @param valueMap - The ValueMap with solved values
   */
  applyOptimizationResult(valueMap: ValueMap): void;
}

/**
 * Complete interface for entities that participate in optimization.
 * Combines all three aspects of the optimization lifecycle.
 */
export interface IOptimizable extends
  IValueMapContributor,
  IResidualProvider,
  IOptimizationResultReceiver {
}

/**
 * Interface for camera entities that can participate in optimization.
 * Cameras have additional options for controlling pose and intrinsic optimization.
 */
export interface IOptimizableCamera {
  /**
   * Add this camera's values to the ValueMap.
   * Returns an array of Value objects that are variables (should be optimized).
   *
   * @param valueMap - The map to add values to
   * @param options - Options controlling what gets optimized
   * @returns Array of Value objects that are optimization variables
   */
  addToValueMap(
    valueMap: ValueMap,
    options: {
      optimizePose?: boolean;
      optimizeIntrinsics?: boolean;
      optimizeDistortion?: boolean;
    }
  ): Value[];

  /**
   * Compute residuals for this camera's constraints.
   * @param valueMap - The ValueMap containing all entity values
   * @returns Array of Value objects (residuals that should be zero)
   */
  computeResiduals(valueMap: ValueMap): Value[];

  /**
   * Apply optimization results back to this camera.
   * @param valueMap - The ValueMap with solved values
   */
  applyOptimizationResultFromValueMap(valueMap: ValueMap): void;

  /**
   * Whether the camera pose (position and rotation) is locked.
   * When true, pose will not be optimized.
   */
  isPoseLocked: boolean;

  /**
   * Camera name for debugging and display.
   */
  name: string;

  /**
   * Set of vanishing lines associated with this camera.
   */
  vanishingLines: Set<any>;
}
