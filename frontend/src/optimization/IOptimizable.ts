/**
 * Interfaces for entities that participate in constraint-based optimization.
 *
 * Entities that implement these interfaces are responsible for:
 * 1. Adding themselves to the ValueMap (deciding which values are optimizable)
 * 2. Computing their own residuals for the constraint solver
 * 3. Applying optimization results back to their state
 */

import type { Value, Vec3 } from 'scalar-autograd';
import type { Vec4 } from './Vec4';
import type { WorldPoint } from '../entities/world-point/WorldPoint';
import type { Camera } from '../entities/camera';

/**
 * Camera parameters in ValueMap.
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
}

/**
 * Map from entities to their corresponding Value objects for optimization.
 * Points map to Vec3 (3D position vectors).
 * Cameras map to CameraValues (pose + intrinsics).
 */
export interface ValueMap {
  points: Map<WorldPoint, Vec3>;
  cameras: Map<Camera, CameraValues>;
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
 */
export interface IResidualProvider {
  /**
   * Compute residuals for this entity's constraints.
   *
   * @param valueMap - The ValueMap containing all entity values
   * @returns Array of Value objects (residuals that should be zero)
   */
  computeResiduals(valueMap: ValueMap): Value[];
}

/**
 * Interface for entities that can receive optimization results.
 */
export interface IOptimizationResultReceiver {
  /**
   * Apply optimization results back to this entity.
   * Should update internal state and mark values as optimized.
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
