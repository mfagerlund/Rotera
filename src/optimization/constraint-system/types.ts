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
}
