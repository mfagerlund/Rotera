/**
 * Types for analytical gradient computation.
 *
 * These types support direct accumulation into J^T J and J^T r,
 * never materializing the full Jacobian matrix.
 */

/**
 * A provider computes one residual and its gradient.
 * Knows which variables it depends on (sparse pattern).
 *
 * Example: A reprojection residual depends on ~10 variables:
 * - World point [x, y, z] → 3 variables
 * - Camera position [x, y, z] → 3 variables
 * - Camera quaternion [w, x, y, z] → 4 variables
 *
 * The provider's gradient is length 10, and it contributes
 * a 10×10 block to J^T J (not a 10×N dense row).
 */
export interface AnalyticalResidualProvider {
  /**
   * Variable indices this residual depends on.
   * These are indices into the flat variable array.
   * -1 indicates a locked variable (not in the array).
   *
   * Example: [0, 1, 2, 7, 8, 9, 10, 11, 12, 13] for a reprojection
   * where world point is at indices 0-2 and camera at 7-13.
   */
  readonly variableIndices: readonly number[];

  /**
   * Compute residual value (plain number, not Value).
   * This is the error: (predicted - observed) or similar.
   */
  computeResidual(variables: Float64Array): number;

  /**
   * Compute gradient w.r.t. each variable in variableIndices.
   * Returns array of same length as variableIndices.
   *
   * gradient[i] = d(residual) / d(variables[variableIndices[i]])
   */
  computeGradient(variables: Float64Array): Float64Array;
}

/**
 * Maps entities to variable indices in the flat optimization array.
 * Built once at solve() start, immutable during optimization.
 *
 * Locked variables get index -1 and are not included in the array.
 * The provider is responsible for using the locked value directly
 * when computing residuals.
 */
export interface VariableLayout {
  /** Total number of free (non-locked) variables */
  readonly numVariables: number;

  /** Initial values for all variables */
  readonly initialValues: Float64Array;

  /**
   * Returns indices for a world point's [x, y, z].
   * -1 for any locked coordinate.
   */
  getWorldPointIndices(pointId: string): readonly [number, number, number];

  /**
   * Returns indices for camera position [x, y, z].
   * -1 for any locked coordinate.
   */
  getCameraPosIndices(cameraId: string): readonly [number, number, number];

  /**
   * Returns indices for camera quaternion [w, x, y, z].
   * Quaternions are never partially locked.
   */
  getCameraQuatIndices(cameraId: string): readonly [number, number, number, number];

  /**
   * Get the locked value for a world point coordinate.
   * Used when computing residuals for locked variables.
   */
  getLockedWorldPointValue(pointId: string, axis: 'x' | 'y' | 'z'): number | undefined;

  /**
   * Get the locked value for a camera position coordinate.
   */
  getLockedCameraPosValue(cameraId: string, axis: 'x' | 'y' | 'z'): number | undefined;
}
