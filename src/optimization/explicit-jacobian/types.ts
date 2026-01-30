/**
 * Explicit Jacobian System Types
 *
 * These types define the interface for hand-coded Jacobian optimization,
 * replacing the scalar-autograd automatic differentiation approach.
 */

/**
 * 3D point structure for gradient computations
 */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Quaternion structure for rotation gradients
 */
export interface Quaternion {
  w: number;
  x: number;
  y: number;
  z: number;
}

/**
 * Result of a gradient computation
 */
export interface GradientResult<T> {
  /** The computed residual value */
  value: number;
  /** Gradients with respect to each input parameter */
  gradients: T;
}

/**
 * A residual provider that can compute both residuals and Jacobians explicitly.
 */
export interface ResidualWithJacobian {
  /**
   * Unique identifier for this residual provider
   */
  id: string;

  /**
   * Human-readable name for debugging
   */
  name: string;

  /**
   * Number of residuals this provider produces
   */
  residualCount: number;

  /**
   * Indices into the variable array for the variables this residual depends on.
   * Used to place Jacobian entries in the correct columns.
   */
  variableIndices: number[];

  /**
   * Compute residual values (no Jacobian)
   * @param variables The full variable array
   * @returns Array of residual values
   */
  computeResiduals(variables: number[]): number[];

  /**
   * Compute Jacobian rows for this residual.
   * Each row corresponds to one residual, each entry to one variable.
   * @param variables The full variable array
   * @returns Matrix of partial derivatives: jacobian[residualIndex][variableLocalIndex]
   */
  computeJacobian(variables: number[]): number[][];
}

/**
 * System of residuals with explicit Jacobian computation
 */
export interface ExplicitJacobianSystem {
  /**
   * Current variable values (the unknowns being optimized)
   */
  variables: number[];

  /**
   * All residual providers in the system
   */
  residualProviders: ResidualWithJacobian[];

  /**
   * Compute all residuals concatenated
   */
  computeAllResiduals(): number[];

  /**
   * Build the full Jacobian matrix (dense)
   * @returns Matrix of shape [totalResiduals x totalVariables]
   */
  computeFullJacobian(): number[][];

  /**
   * Total number of residuals in the system
   */
  readonly totalResiduals: number;

  /**
   * Total number of variables in the system
   */
  readonly totalVariables: number;
}

/**
 * Options for the Levenberg-Marquardt solver
 */
export interface LMOptions {
  /** Maximum number of iterations */
  maxIterations: number;

  /** Convergence tolerance for step size */
  tolerance: number;

  /** Convergence tolerance for gradient norm */
  gradientTolerance: number;

  /** Initial damping parameter (lambda) */
  initialDamping: number;

  /** Factor to increase damping on step rejection */
  dampingIncrease: number;

  /** Factor to decrease damping on step acceptance */
  dampingDecrease: number;

  /** Minimum damping value */
  minDamping: number;

  /** Maximum damping value */
  maxDamping: number;

  /** Maximum CG iterations (0 = 2*n) */
  cgMaxIterations: number;

  /** CG convergence tolerance */
  cgTolerance: number;

  /** Whether to print iteration info */
  verbose: boolean;
}

/**
 * Result from the LM solver
 */
export interface LMResult {
  /** Whether the solver converged */
  converged: boolean;

  /** Number of iterations taken */
  iterations: number;

  /** Final cost (sum of squared residuals / 2) */
  finalCost: number;

  /** Initial cost for comparison */
  initialCost: number;

  /** Final variable values */
  variables: number[];
}

/**
 * Default LM options
 */
export const DEFAULT_LM_OPTIONS: LMOptions = {
  maxIterations: 500,
  tolerance: 1e-8,
  gradientTolerance: 1e-8,
  initialDamping: 1e-3,
  dampingIncrease: 10,
  dampingDecrease: 0.1,
  minDamping: 1e-10,
  maxDamping: 1e10,
  cgMaxIterations: 0, // 0 means 2*n
  cgTolerance: 1e-10,
  verbose: false,
};
