/**
 * Analytical Levenberg-Marquardt Solver
 *
 * Solves nonlinear least squares using analytical gradients.
 * The Jacobian is computed by accumulating J^T J and J^T r directly
 * from analytical providers, avoiding materialization of the full J matrix.
 */

import { SparseMatrix } from './sparse/SparseMatrix';
import { conjugateGradientDamped } from './sparse/cg-solvers';
import type { AnalyticalResidualProvider } from './analytical/types';
import { accumulateNormalEquations } from './analytical/accumulate-normal-equations';

/**
 * Options for nonlinear least squares solver.
 */
export interface NonlinearLeastSquaresOptions {
  maxIterations?: number;
  costTolerance?: number;
  paramTolerance?: number;
  gradientTolerance?: number;
  initialDamping?: number;
  adaptiveDamping?: boolean;
  dampingIncreaseFactor?: number;
  dampingDecreaseFactor?: number;
  verbose?: boolean;
}

/**
 * Result from nonlinear least squares solver.
 */
export interface NonlinearLeastSquaresResult {
  success: boolean;
  iterations: number;
  finalCost: number;
  convergenceReason: string;
  computationTime: number;
}

// Track CG non-convergence warnings to avoid spamming console
let cgWarningCount = 0;
let cgWarningWorstResidual = 0;

/**
 * Extended result that includes diagnostic information.
 */
export interface TransparentLMResult extends NonlinearLeastSquaresResult {
  /** Final Jacobian matrix - empty for analytical solve (J not materialized) */
  jacobian: number[][];
  /** Final residual values */
  residualValues: number[];
  /** Final variable values */
  variableValues: number[];
}

/**
 * Options for analytical LM solver.
 */
export interface TransparentLMOptions extends NonlinearLeastSquaresOptions {
  /**
   * When true, use sparse CG instead of dense Cholesky for solving
   * the normal equations (J^T J + λI) x = -J^T r.
   */
  useSparseLinearSolve?: boolean;

  /**
   * Analytical providers that compute residuals and gradients.
   * Required for solving.
   */
  analyticalProviders: AnalyticalResidualProvider[];

  /**
   * Quaternion variable indices for renormalization after each step.
   * Each entry is [w, x, y, z] indices into the variables array.
   * -1 indicates a locked component (skip renormalization for that quaternion).
   *
   * Quaternion renormalization prevents numerical drift from causing
   * the quaternion magnitude to diverge from 1, which can lead to
   * convergence to reflected local minima.
   */
  quaternionIndices?: ReadonlyArray<readonly [number, number, number, number]>;

  // Legacy options (ignored, kept for API compatibility)
  /** @deprecated Always uses analytical solve */
  useAnalyticalSolve?: boolean;
  /** @deprecated Analytical validation no longer needed */
  analyticalValidationTolerance?: number;
}

/**
 * Solve (JtJ + lambda * I) * delta = negJtr using dense Cholesky.
 * Takes pre-computed normal equations (J^T J and -J^T r) directly.
 */
function solveFromNormalEquations(
  JtJ: SparseMatrix,
  negJtr: Float64Array,
  lambda: number,
  numVariables: number
): number[] {
  // Convert sparse J^T J to dense
  const JtJDense = JtJ.toDense();

  // Add damping: J^T J + lambda * I
  for (let i = 0; i < numVariables; i++) {
    JtJDense[i][i] += lambda;
  }

  // Cholesky decomposition: L L^T = JtJ + λI
  const L: number[][] = new Array(numVariables);
  for (let i = 0; i < numVariables; i++) {
    L[i] = new Array(numVariables).fill(0);
  }

  for (let i = 0; i < numVariables; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = JtJDense[i][j];
      for (let k = 0; k < j; k++) {
        sum -= L[i][k] * L[j][k];
      }
      if (i === j) {
        if (sum <= 0) {
          // Matrix not positive definite - return zeros
          return new Array(numVariables).fill(0);
        }
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }

  // Forward substitution: L y = negJtr
  const y: number[] = new Array(numVariables);
  for (let i = 0; i < numVariables; i++) {
    let sum = negJtr[i];
    for (let j = 0; j < i; j++) {
      sum -= L[i][j] * y[j];
    }
    y[i] = sum / L[i][i];
  }

  // Back substitution: L^T x = y
  const x: number[] = new Array(numVariables);
  for (let i = numVariables - 1; i >= 0; i--) {
    let sum = y[i];
    for (let j = i + 1; j < numVariables; j++) {
      sum -= L[j][i] * x[j];
    }
    x[i] = sum / L[i][i];
  }

  return x;
}

/**
 * Compute cost (sum of squared residuals) from analytical providers.
 */
function computeCostFromProviders(
  variables: Float64Array,
  providers: readonly AnalyticalResidualProvider[]
): number {
  let cost = 0;
  for (const provider of providers) {
    const r = provider.computeResidual(variables);
    cost += r * r;
  }
  return cost;
}

/**
 * Solve (JtJ + lambda * I) * delta = negJtr using sparse CG.
 */
function solveSparseFromNormalEquations(
  JtJ: SparseMatrix,
  negJtr: Float64Array,
  lambda: number,
  numVariables: number
): number[] {
  const maxCgIter = Math.max(numVariables * 10, 1000);
  const cgResult = conjugateGradientDamped(
    JtJ,
    Array.from(negJtr),
    lambda,
    undefined, // Initial guess (zero)
    maxCgIter,
    1e-10      // Tolerance
  );

  if (!cgResult.converged && cgResult.residualNorm > 1e-8) {
    cgWarningCount++;
    cgWarningWorstResidual = Math.max(cgWarningWorstResidual, cgResult.residualNorm);
    if (cgWarningCount === 1) {
      console.warn(
        `[AnalyticalLM] CG did not converge: ${cgResult.iterations}/${maxCgIter} iters, ` +
          `residual=${cgResult.residualNorm.toExponential(2)} (further warnings suppressed)`
      );
    }
  }

  return cgResult.x;
}

/**
 * Analytical Levenberg-Marquardt solver.
 *
 * Solves nonlinear least squares using analytical gradients computed
 * by the provided AnalyticalResidualProviders.
 *
 * @param initialValues - Initial variable values
 * @param _residualFn - Legacy parameter, ignored (kept for API compatibility)
 * @param options - Solver options including analyticalProviders (required)
 */
export function transparentLM(
  initialValues: Float64Array,
  _residualFn: unknown,
  options: TransparentLMOptions
): TransparentLMResult {
  const {
    maxIterations = 500,
    costTolerance = 1e-6,
    paramTolerance = 1e-6,
    gradientTolerance = 1e-6,
    initialDamping = 1e-3,
    adaptiveDamping = true,
    dampingIncreaseFactor = 10,
    dampingDecreaseFactor = 10,
    verbose = false,
    useSparseLinearSolve = false,
    analyticalProviders,
    quaternionIndices,
  } = options;

  if (!analyticalProviders || analyticalProviders.length === 0) {
    throw new Error('analyticalProviders is required and must not be empty');
  }

  // Reset CG warning counter for this solve
  cgWarningCount = 0;
  cgWarningWorstResidual = 0;

  const numVariables = initialValues.length;
  const startTime = performance.now();
  const maxInnerIterations = 10;

  // Copy initial values to working array
  const variables = new Float64Array(initialValues);

  // Validate analytical providers have valid variable indices
  for (let i = 0; i < analyticalProviders.length; i++) {
    const provider = analyticalProviders[i];
    for (const idx of provider.variableIndices) {
      if (idx >= numVariables) {
        throw new Error(
          `Provider ${i} has variableIndex ${idx} but only ${numVariables} variables exist. ` +
            `This indicates a mismatch between the analytical layout and variables.`
        );
      }
    }
  }

  /**
   * Renormalize quaternions to unit length.
   * Prevents numerical drift from accumulating over iterations.
   */
  const renormalizeQuaternions = (vars: Float64Array): void => {
    if (!quaternionIndices) return;

    for (const [wIdx, xIdx, yIdx, zIdx] of quaternionIndices) {
      // Skip if any component is locked (-1)
      if (wIdx < 0 || xIdx < 0 || yIdx < 0 || zIdx < 0) continue;

      // Get current quaternion values
      const w = vars[wIdx];
      const x = vars[xIdx];
      const y = vars[yIdx];
      const z = vars[zIdx];

      // Compute magnitude
      const mag = Math.sqrt(w * w + x * x + y * y + z * z);
      if (mag < 1e-10) continue; // Avoid division by zero

      // Normalize
      const invMag = 1.0 / mag;
      vars[wIdx] = w * invMag;
      vars[xIdx] = x * invMag;
      vars[yIdx] = y * invMag;
      vars[zIdx] = z * invMag;
    }
  };

  let prevCost = Infinity;
  let lambda = initialDamping;
  let converged = false;
  let convergenceReason = 'Max iterations reached';
  let iterations = 0;
  let residuals: number[] = [];
  let cost = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter;

    // Compute normal equations from analytical providers
    const normalEqs = accumulateNormalEquations(
      variables,
      analyticalProviders,
      numVariables
    );
    const JtJ = normalEqs.JtJ;
    const negJtr = normalEqs.negJtr;
    cost = normalEqs.cost;
    residuals = Array.from(normalEqs.residuals);

    // Gradient norm: ||J^T r|| = ||negJtr|| (since negJtr = -J^T r)
    const gradientNorm = Math.sqrt(negJtr.reduce((sum, g) => sum + g * g, 0));

    if (verbose && iter % 10 === 0) {
      console.log(`[AnalyticalLM] iter=${iter}, cost=${cost.toFixed(6)}, ||grad||=${gradientNorm.toExponential(2)}, lambda=${lambda.toExponential(2)}`);
    }

    // Check gradient tolerance
    if (gradientNorm < gradientTolerance) {
      converged = true;
      convergenceReason = 'Gradient tolerance reached';
      break;
    }

    // Check cost tolerance (relative change)
    if (Math.abs(prevCost - cost) < costTolerance) {
      converged = true;
      convergenceReason = 'Cost tolerance reached';
      break;
    }

    // Check absolute cost tolerance
    if (cost < costTolerance) {
      converged = true;
      convergenceReason = 'Cost below threshold';
      break;
    }

    // Inner loop for damping adjustment
    let accepted = false;
    let innerIterations = 0;

    while (!accepted && innerIterations < maxInnerIterations) {
      const effectiveLambda = adaptiveDamping ? lambda : 0;

      // Solve normal equations
      const delta = useSparseLinearSolve
        ? solveSparseFromNormalEquations(JtJ, negJtr, effectiveLambda, numVariables)
        : solveFromNormalEquations(JtJ, negJtr, effectiveLambda, numVariables);

      // Check step size
      const deltaNorm = Math.sqrt(delta.reduce((sum, d) => sum + d * d, 0));
      if (deltaNorm < paramTolerance) {
        converged = true;
        convergenceReason = 'Parameter tolerance reached';
        break;
      }

      // Save old values and apply step
      const oldValues = new Float64Array(variables);
      for (let j = 0; j < numVariables; j++) {
        variables[j] = oldValues[j] + delta[j];
      }

      // Compute new cost
      const newCost = computeCostFromProviders(variables, analyticalProviders);

      if (adaptiveDamping) {
        if (newCost < cost) {
          // Accept step, decrease damping
          lambda = Math.max(lambda / dampingDecreaseFactor, 1e-10);
          accepted = true;
        } else {
          // Reject step, restore values and increase damping
          for (let j = 0; j < numVariables; j++) {
            variables[j] = oldValues[j];
          }
          lambda = Math.min(lambda * dampingIncreaseFactor, 1e10);
          innerIterations++;
        }
      } else {
        accepted = true;
      }
    }

    if (converged) break;

    if (!accepted) {
      convergenceReason = 'Damping adjustment failed';
      break;
    }

    // Renormalize quaternions after accepted step to prevent numerical drift
    renormalizeQuaternions(variables);

    prevCost = cost;
  }

  // Final cost computation
  const finalNormalEqs = accumulateNormalEquations(
    variables,
    analyticalProviders,
    numVariables
  );
  const finalCost = finalNormalEqs.cost;
  residuals = Array.from(finalNormalEqs.residuals);

  const computationTime = performance.now() - startTime;

  // Log summary of suppressed CG warnings
  if (cgWarningCount > 1) {
    console.warn(
      `[CG] ${cgWarningCount} non-convergence warnings (worst residual: ${cgWarningWorstResidual.toExponential(2)})`
    );
  }

  if (verbose) {
    console.log(`[AnalyticalLM] ${converged ? 'Converged' : 'Did not converge'}: ${convergenceReason}`);
    console.log(`[AnalyticalLM] ${iterations} iterations, final cost ${finalCost.toFixed(4)}`);
  }

  return {
    success: converged,
    iterations,
    finalCost,
    convergenceReason,
    computationTime,
    jacobian: [],  // Not materialized in analytical solve
    residualValues: residuals,
    variableValues: Array.from(variables),
  };
}

