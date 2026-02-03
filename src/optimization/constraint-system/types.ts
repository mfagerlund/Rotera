import type { IOptimizableCamera } from '../IOptimizable';

export interface SolverResult {
  converged: boolean;
  iterations: number;
  residual: number;
  error: string | null;
}

export interface SolverOptions {
  tolerance?: number;
  maxIterations?: number;
  damping?: number;
  verbose?: boolean;
  /**
   * If true (or function returns true), camera intrinsics are optimized.
   * If false, intrinsics stay fixed.
   */
  optimizeCameraIntrinsics?: boolean | ((camera: IOptimizableCamera) => boolean);
  /**
   * If > 0, adds soft regularization to prevent unconstrained points from diverging.
   * The weight is multiplied by distance from initial position.
   * Typical values: 0.01-0.1. Default: 0 (no regularization).
   */
  regularizationWeight?: number;

  /**
   * If true, use camera's isZReflected flag when computing projections.
   *
   * - During calibration: false (isZReflected may change mid-optimization)
   * - During fine-tune: true (isZReflected is already set correctly)
   *
   * Default: false
   */
  useIsZReflected?: boolean;

  /**
   * Force a specific solver mode, overriding the global setting.
   * Use this for internal subsystems (like PnP refinement) that need a specific mode.
   *
   * - 'dense': Dense LM with autodiff (works everywhere but slow)
   * - 'sparse': Sparse CG with autodiff (fast for large systems)
   * - 'analytical': Analytical gradients (fastest but may not support all constraints)
   * - undefined: Use global setting from solver-config
   */
  forceSolverMode?: 'dense' | 'sparse' | 'analytical';
}
