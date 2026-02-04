/**
 * Transparent Dense Levenberg-Marquardt Solver
 *
 * Replaces scalar-autograd's black-box nonlinearLeastSquares with
 * a transparent implementation that EXPOSES the Jacobian matrix.
 *
 * This enables parallel validation with sparse solvers - same Jacobian
 * can be fed to both dense and sparse solvers to detect divergence.
 *
 * The Jacobian is computed using autodiff: for each residual, call .backward()
 * and collect the gradients from all variables.
 */

import { Value, V } from 'scalar-autograd';
import type { NonlinearLeastSquaresOptions, NonlinearLeastSquaresResult } from 'scalar-autograd';
import { SparseMatrix } from './sparse/SparseMatrix';
import { conjugateGradientDamped } from './sparse/cg-solvers';
import type { AnalyticalResidualProvider } from './analytical/types';
import { accumulateNormalEquations } from './analytical/accumulate-normal-equations';

// Track CG non-convergence warnings to avoid spamming console
let cgWarningCount = 0;
let cgWarningWorstResidual = 0;

/**
 * Extended result that includes the Jacobian matrix (for validation).
 */
export interface TransparentLMResult extends NonlinearLeastSquaresResult {
  /** Final Jacobian matrix (rows = residuals, cols = variables) */
  jacobian: number[][];
  /** Final residual values */
  residualValues: number[];
  /** Final variable values */
  variableValues: number[];
}

/**
 * Extended options for transparent LM that supports sparse solve.
 */
export interface TransparentLMOptions extends NonlinearLeastSquaresOptions {
  /**
   * When true, use sparse CG instead of dense Cholesky for solving
   * the normal equations (J^T J + λI) x = -J^T r.
   *
   * This is STEP 3 of sparse validation: actually use sparse solve.
   */
  useSparseLinearSolve?: boolean;

  /**
   * When set, also compute normal equations analytically and validate
   * they match the autodiff computation. Does NOT use analytical for solving.
   * This is for parallel validation during migration.
   */
  analyticalProviders?: AnalyticalResidualProvider[];

  /**
   * Tolerance for analytical validation. Default 1e-6.
   */
  analyticalValidationTolerance?: number;

  /**
   * Use analytical providers for solving (not just validation).
   * When true, bypasses autodiff entirely for Jacobian computation.
   * Requires analyticalProviders to be set.
   *
   * Phase 7 of scalar-autograd removal: analytical solve replaces autodiff.
   */
  useAnalyticalSolve?: boolean;

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
}

/**
 * Compute the Jacobian matrix using autodiff.
 *
 * For each residual r_i, we compute dr_i/dx_j for all variables x_j
 * by calling r_i.backward() and reading variable gradients.
 *
 * @param variables - The optimization variables (Value[])
 * @param residualFn - Function that computes residuals from variables
 * @returns Jacobian matrix J[i][j] = dr_i/dx_j
 */
export function computeJacobian(
  variables: Value[],
  residualFn: (vars: Value[]) => Value[]
): { jacobian: number[][]; residuals: number[] } {
  // Compute residuals
  const residualValues = residualFn(variables);
  const numResiduals = residualValues.length;
  const numVariables = variables.length;

  // Initialize Jacobian matrix
  const jacobian: number[][] = new Array(numResiduals);
  const residuals: number[] = new Array(numResiduals);

  // For each residual, compute its gradient w.r.t. all variables
  // This matches scalar-autograd's computeResidualsAndJacobian approach
  for (let i = 0; i < numResiduals; i++) {
    residuals[i] = residualValues[i].data;

    // CRITICAL: Zero the entire computation tree, not just param grads
    // This ensures clean gradient computation through shared intermediate nodes
    Value.zeroGradTree(residualValues[i]);

    // Zero all variable gradients
    for (const v of variables) {
      v.grad = 0;
    }

    // Backward pass from this residual
    residualValues[i].backward();

    // Extract Jacobian row from variable gradients
    jacobian[i] = new Array(numVariables);
    for (let j = 0; j < numVariables; j++) {
      jacobian[i][j] = variables[j].grad;
    }
  }

  return { jacobian, residuals };
}

/**
 * Solve (J^T J + lambda * I) * delta = -J^T r using dense linear algebra.
 *
 * Uses Cholesky decomposition for SPD matrix.
 */
function solveDenseNormalEquations(
  J: number[][],
  r: number[],
  lambda: number,
  numVariables: number
): number[] {
  const numResiduals = r.length;

  // Compute J^T J (symmetric, so we only need upper triangle)
  const JtJ: number[][] = new Array(numVariables);
  for (let i = 0; i < numVariables; i++) {
    JtJ[i] = new Array(numVariables).fill(0);
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < numResiduals; k++) {
        sum += J[k][i] * J[k][j];
      }
      JtJ[i][j] = sum;
      if (i !== j) JtJ[j][i] = sum;
    }
  }

  // Add damping: J^T J + lambda * I
  for (let i = 0; i < numVariables; i++) {
    JtJ[i][i] += lambda;
  }

  // Compute J^T r (negative gradient)
  const Jtr: number[] = new Array(numVariables).fill(0);
  for (let j = 0; j < numVariables; j++) {
    let sum = 0;
    for (let k = 0; k < numResiduals; k++) {
      sum += J[k][j] * r[k];
    }
    Jtr[j] = -sum; // Negative because we want descent direction
  }

  // Solve using Cholesky decomposition (JtJ is SPD when lambda > 0)
  // L L^T x = b
  const L: number[][] = new Array(numVariables);
  for (let i = 0; i < numVariables; i++) {
    L[i] = new Array(numVariables).fill(0);
  }

  // Cholesky decomposition
  for (let i = 0; i < numVariables; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = JtJ[i][j];
      for (let k = 0; k < j; k++) {
        sum -= L[i][k] * L[j][k];
      }
      if (i === j) {
        if (sum <= 0) {
          // Matrix not positive definite - increase damping
          return new Array(numVariables).fill(0);
        }
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }

  // Forward substitution: L y = b
  const y: number[] = new Array(numVariables);
  for (let i = 0; i < numVariables; i++) {
    let sum = Jtr[i];
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
 * Compute J^T * r (gradient of cost function).
 */
function computeJtr(J: number[][], r: number[]): number[] {
  const n = J[0]?.length ?? 0;
  const result = new Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < r.length; i++) {
      result[j] += J[i][j] * r[i];
    }
  }
  return result;
}

/**
 * Compute J^T J from dense Jacobian for validation.
 */
function computeJtJFromDense(J: number[][]): number[][] {
  const m = J.length;
  const n = J[0]?.length ?? 0;
  const JtJ: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < m; k++) {
        sum += J[k][i] * J[k][j];
      }
      JtJ[i][j] = sum;
    }
  }

  return JtJ;
}

/**
 * Solve (JtJ + lambda * I) * delta = negJtr using dense Cholesky.
 * Takes pre-computed normal equations (J^T J and -J^T r) directly.
 *
 * Used by analytical solve path which computes J^T J directly without
 * materializing the Jacobian matrix.
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
 * Used by analytical solve path to evaluate step quality without full J^T J computation.
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
 * Takes pre-computed normal equations directly.
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
        `[AnalyticalSparseLM] CG did not converge: ${cgResult.iterations}/${maxCgIter} iters, ` +
          `residual=${cgResult.residualNorm.toExponential(2)} (further warnings suppressed)`
      );
    }
  }

  return cgResult.x;
}

/**
 * Validate analytical normal equations match autodiff computation.
 * Throws if any mismatch exceeds tolerance.
 */
function validateAnalyticalMatchesAutodiff(
  autodiffJacobian: number[][],
  autodiffResiduals: number[],
  analyticalProviders: AnalyticalResidualProvider[],
  variables: Float64Array,
  numVariables: number,
  tolerance: number,
  iteration: number
): void {
  // Compute autodiff J^T J and -J^T r
  const autodiffJtJ = computeJtJFromDense(autodiffJacobian);
  const autodiffJtr = computeJtr(autodiffJacobian, autodiffResiduals);
  const autodiffNegJtr = autodiffJtr.map((v) => -v);

  // Compute analytical
  const analytical = accumulateNormalEquations(variables, analyticalProviders, numVariables);

  // Compare costs
  const autodiffCost = autodiffResiduals.reduce((sum, r) => sum + r * r, 0);
  if (Math.abs(autodiffCost - analytical.cost) > tolerance) {
    throw new Error(
      `[AnalyticalValidation] Cost mismatch at iter ${iteration}: ` +
        `autodiff=${autodiffCost.toExponential(4)}, analytical=${analytical.cost.toExponential(4)}`
    );
  }

  // Compare J^T J entries
  for (let i = 0; i < numVariables; i++) {
    for (let j = 0; j < numVariables; j++) {
      const autodiffVal = autodiffJtJ[i][j];
      const analyticalVal = analytical.JtJ.get(i, j);
      const diff = Math.abs(autodiffVal - analyticalVal);
      const scale = Math.max(Math.abs(autodiffVal), Math.abs(analyticalVal), 1);
      if (diff > tolerance * scale) {
        throw new Error(
          `[AnalyticalValidation] JtJ mismatch at iter ${iteration}, (${i},${j}): ` +
            `autodiff=${autodiffVal.toExponential(4)}, analytical=${analyticalVal.toExponential(4)}, ` +
            `diff=${diff.toExponential(4)}`
        );
      }
    }
  }

  // Compare -J^T r entries
  for (let i = 0; i < numVariables; i++) {
    const autodiffVal = autodiffNegJtr[i];
    const analyticalVal = analytical.negJtr[i];
    const diff = Math.abs(autodiffVal - analyticalVal);
    const scale = Math.max(Math.abs(autodiffVal), Math.abs(analyticalVal), 1);
    if (diff > tolerance * scale) {
      throw new Error(
        `[AnalyticalValidation] negJtr mismatch at iter ${iteration}, [${i}]: ` +
          `autodiff=${autodiffVal.toExponential(4)}, analytical=${analyticalVal.toExponential(4)}, ` +
          `diff=${diff.toExponential(4)}`
      );
    }
  }
}

/**
 * Solve (J^T J + lambda * I) * delta = -J^T r using sparse CG.
 *
 * This is the sparse alternative to solveDenseNormalEquations.
 * Uses conjugate gradient which is O(n * nnz) vs O(n³) for Cholesky.
 */
function solveSparseNormalEquations(
  J: number[][],
  r: number[],
  lambda: number,
  numVariables: number
): number[] {
  // Build sparse J^T J
  const sparseJ = SparseMatrix.fromDense(J);
  const sparseJtJ = sparseJ.computeJtJ();

  // Compute -J^T r (right-hand side)
  const Jtr = computeJtr(J, r);
  const negJtr = Jtr.map(v => -v);

  // Solve using CG with damping
  // Use more iterations for better convergence on ill-conditioned systems
  const maxCgIter = Math.max(numVariables * 10, 1000);
  const cgResult = conjugateGradientDamped(
    sparseJtJ,
    negJtr,
    lambda,
    undefined,        // Initial guess (zero)
    maxCgIter,
    1e-10             // Practical tolerance (1e-10 is more than enough)
  );

  // Only warn if residual is actually large (not just missing tight tolerance)
  if (!cgResult.converged && cgResult.residualNorm > 1e-8) {
    cgWarningCount++;
    cgWarningWorstResidual = Math.max(cgWarningWorstResidual, cgResult.residualNorm);
    if (cgWarningCount === 1) {
      console.warn(
        `[SparseLM] CG did not converge: ${cgResult.iterations}/${maxCgIter} iters, ` +
        `residual=${cgResult.residualNorm.toExponential(2)} (further warnings suppressed)`
      );
    }
  }

  return cgResult.x;
}

/**
 * Transparent Levenberg-Marquardt solver.
 *
 * This is a drop-in replacement for scalar-autograd's nonlinearLeastSquares
 * that EXPOSES the Jacobian matrix for validation with sparse solvers.
 *
 * Implementation closely matches scalar-autograd's nonlinearLeastSquares.
 *
 * When useSparseLinearSolve is enabled, uses sparse CG instead of dense Cholesky
 * for solving the normal equations. This is STEP 3 of sparse validation.
 */
export function transparentLM(
  variables: Value[],
  residualFn: (vars: Value[]) => Value[],
  options: TransparentLMOptions = {}
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
    analyticalValidationTolerance = 1e-6,
    useAnalyticalSolve = false,
    quaternionIndices,
  } = options;

  // Reset CG warning counter for this solve
  cgWarningCount = 0;
  cgWarningWorstResidual = 0;

  /**
   * Renormalize quaternions to unit length.
   * Prevents numerical drift from accumulating over iterations.
   */
  const renormalizeQuaternions = (
    vars: Value[],
    analyticalVars: Float64Array | null
  ): void => {
    if (!quaternionIndices) return;

    for (const [wIdx, xIdx, yIdx, zIdx] of quaternionIndices) {
      // Skip if any component is locked (-1)
      if (wIdx < 0 || xIdx < 0 || yIdx < 0 || zIdx < 0) continue;

      // Get current quaternion values
      const w = vars[wIdx].data;
      const x = vars[xIdx].data;
      const y = vars[yIdx].data;
      const z = vars[zIdx].data;

      // Compute magnitude
      const mag = Math.sqrt(w * w + x * x + y * y + z * z);
      if (mag < 1e-10) continue; // Avoid division by zero

      // Normalize
      const invMag = 1.0 / mag;
      vars[wIdx].data = w * invMag;
      vars[xIdx].data = x * invMag;
      vars[yIdx].data = y * invMag;
      vars[zIdx].data = z * invMag;

      // Also update analyticalVars if present
      if (analyticalVars) {
        analyticalVars[wIdx] = w * invMag;
        analyticalVars[xIdx] = x * invMag;
        analyticalVars[yIdx] = y * invMag;
        analyticalVars[zIdx] = z * invMag;
      }
    }
  };

  // Validate options
  if (useAnalyticalSolve && !analyticalProviders) {
    throw new Error('useAnalyticalSolve requires analyticalProviders to be set');
  }

  // Validate analytical providers have valid variable indices
  if (useAnalyticalSolve && analyticalProviders) {
    for (let i = 0; i < analyticalProviders.length; i++) {
      const provider = analyticalProviders[i];
      for (const idx of provider.variableIndices) {
        if (idx >= variables.length) {
          throw new Error(
            `[AnalyticalSolve] Provider ${i} has variableIndex ${idx} but only ${variables.length} variables exist. ` +
              `This indicates a mismatch between the analytical layout and autodiff variables.`
          );
        }
      }
    }
  }

  const numVariables = variables.length;
  const startTime = performance.now();
  const maxInnerIterations = 10;

  let prevCost = Infinity;
  let lambda = initialDamping;
  let converged = false;
  let convergenceReason = 'Max iterations reached';
  let iterations = 0;
  let jacobian: number[][] = [];
  let residuals: number[] = [];
  let cost = 0;

  // For analytical solve, track current variable values in Float64Array
  let analyticalVars: Float64Array | null = useAnalyticalSolve
    ? new Float64Array(variables.map((v) => v.data))
    : null;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter;

    // Variables for normal equations (computed differently for autodiff vs analytical)
    let JtJ: SparseMatrix | null = null;
    let negJtr: Float64Array | null = null;
    let gradientNorm: number;

    if (useAnalyticalSolve && analyticalProviders && analyticalVars) {
      // ANALYTICAL PATH: Use providers directly, skip autodiff entirely
      const normalEqs = accumulateNormalEquations(
        analyticalVars,
        analyticalProviders,
        numVariables
      );
      JtJ = normalEqs.JtJ;
      negJtr = normalEqs.negJtr;
      cost = normalEqs.cost;
      residuals = Array.from(normalEqs.residuals);

      // Gradient norm: ||J^T r|| = ||negJtr|| (since negJtr = -J^T r)
      gradientNorm = Math.sqrt(negJtr.reduce((sum, g) => sum + g * g, 0));

      // Keep Value[] in sync for compatibility
      for (let j = 0; j < numVariables; j++) {
        variables[j].data = analyticalVars[j];
      }

      // Empty jacobian for result (we don't materialize it)
      jacobian = [];
    } else {
      // AUTODIFF PATH: Original behavior
      const result = computeJacobian(variables, residualFn);
      jacobian = result.jacobian;
      residuals = result.residuals;
      cost = residuals.reduce((sum, r) => sum + r * r, 0);

      // Validate analytical providers match autodiff (if provided but not solving)
      if (analyticalProviders) {
        const currentVars = new Float64Array(variables.map((v) => v.data));
        validateAnalyticalMatchesAutodiff(
          jacobian,
          residuals,
          analyticalProviders,
          currentVars,
          numVariables,
          analyticalValidationTolerance,
          iter
        );
      }

      // Compute gradient norm ||J^T r||
      const Jtr = computeJtr(jacobian, residuals);
      gradientNorm = Math.sqrt(Jtr.reduce((sum, g) => sum + g * g, 0));
    }

    if (verbose && iter % 10 === 0) {
      console.log(`[TransparentLM] iter=${iter}, cost=${cost.toFixed(6)}, ||grad||=${gradientNorm.toExponential(2)}, lambda=${lambda.toExponential(2)}`);
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
      // Solve for step using either sparse CG or dense Cholesky
      const effectiveLambda = adaptiveDamping ? lambda : 0;

      let delta: number[];

      if (useAnalyticalSolve && JtJ && negJtr) {
        // ANALYTICAL PATH: Solve from pre-computed normal equations
        delta = useSparseLinearSolve
          ? solveSparseFromNormalEquations(JtJ, negJtr, effectiveLambda, numVariables)
          : solveFromNormalEquations(JtJ, negJtr, effectiveLambda, numVariables);
      } else {
        // AUTODIFF PATH: Original behavior
        // Always compute dense delta for validation
        const denseDelta = solveDenseNormalEquations(jacobian, residuals, effectiveLambda, numVariables);

        // Use sparse if enabled, otherwise use dense
        delta = useSparseLinearSolve
          ? solveSparseNormalEquations(jacobian, residuals, effectiveLambda, numVariables)
          : denseDelta;

        // Validate sparse matches dense on every step (when sparse is enabled)
        if (useSparseLinearSolve) {
          let maxDeltaDiff = 0;
          let deltaMagnitude = 0;
          for (let j = 0; j < numVariables; j++) {
            maxDeltaDiff = Math.max(maxDeltaDiff, Math.abs(delta[j] - denseDelta[j]));
            deltaMagnitude = Math.max(deltaMagnitude, Math.abs(denseDelta[j]));
          }
          // Allow 1% relative error or 1e-6 absolute (CG may not achieve machine precision)
          const deltaTolerance = Math.max(1e-6, deltaMagnitude * 0.01);
          if (maxDeltaDiff > deltaTolerance) {
            throw new Error(
              `[SparseLM] Step diverged at iter ${iter}: maxDiff=${maxDeltaDiff.toExponential(2)}, ` +
                `magnitude=${deltaMagnitude.toFixed(4)}, tolerance=${deltaTolerance.toExponential(2)}, ` +
                `lambda=${effectiveLambda.toExponential(2)}`
            );
          }
        }
      }

      // Check step size
      const deltaNorm = Math.sqrt(delta.reduce((sum, d) => sum + d * d, 0));
      if (deltaNorm < paramTolerance) {
        converged = true;
        convergenceReason = 'Parameter tolerance reached';
        break;
      }

      // Save old values and apply step
      const oldValues = variables.map((v) => v.data);
      for (let j = 0; j < numVariables; j++) {
        variables[j].data = oldValues[j] + delta[j];
      }

      // Compute new cost
      let newCost: number;
      if (useAnalyticalSolve && analyticalProviders && analyticalVars) {
        // ANALYTICAL PATH: Update analyticalVars and compute cost from providers
        for (let j = 0; j < numVariables; j++) {
          analyticalVars[j] = oldValues[j] + delta[j];
        }
        newCost = computeCostFromProviders(analyticalVars, analyticalProviders);
      } else {
        // AUTODIFF PATH: Use residualFn
        const newResiduals = residualFn(variables);
        newCost = newResiduals.reduce((sum, r) => sum + r.data * r.data, 0);
      }

      if (adaptiveDamping) {
        if (newCost < cost) {
          // Accept step, decrease damping
          lambda = Math.max(lambda / dampingDecreaseFactor, 1e-10);
          accepted = true;
        } else {
          // Reject step, restore values and increase damping
          for (let j = 0; j < numVariables; j++) {
            variables[j].data = oldValues[j];
          }
          // Also restore analyticalVars if using analytical solve
          if (analyticalVars) {
            for (let j = 0; j < numVariables; j++) {
              analyticalVars[j] = oldValues[j];
            }
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
    renormalizeQuaternions(variables, analyticalVars);

    prevCost = cost;
  }

  // Final cost computation
  // When using analytical solve, use the cost from the last iteration
  // (residualFn may return [] when analytical providers handle all residuals)
  let finalCost: number;
  if (useAnalyticalSolve && analyticalProviders && analyticalVars) {
    // Recompute from providers to get the most accurate final cost
    const finalNormalEqs = accumulateNormalEquations(
      analyticalVars,
      analyticalProviders,
      numVariables
    );
    finalCost = finalNormalEqs.cost;
    residuals = Array.from(finalNormalEqs.residuals);
  } else {
    const finalResiduals = residualFn(variables);
    finalCost = finalResiduals.reduce((sum, r) => sum + r.data * r.data, 0);
  }

  const computationTime = performance.now() - startTime;

  // Log summary of suppressed CG warnings
  if (cgWarningCount > 1) {
    console.warn(
      `[CG] ${cgWarningCount} non-convergence warnings (worst residual: ${cgWarningWorstResidual.toExponential(2)})`
    );
  }

  if (verbose) {
    console.log(`[TransparentLM] ${converged ? 'Converged' : 'Did not converge'}: ${convergenceReason}`);
    console.log(`[TransparentLM] ${iterations} iterations, final cost ${finalCost.toFixed(4)}`);
  }

  return {
    success: converged,
    iterations,
    finalCost,
    convergenceReason,
    computationTime,
    jacobian,
    residualValues: residuals,
    variableValues: variables.map(v => v.data),
  };
}

/**
 * Drop-in replacement for nonlinearLeastSquares that returns
 * standard NonlinearLeastSquaresResult (hides Jacobian).
 *
 * Use transparentLM directly if you need the Jacobian.
 */
export function nonlinearLeastSquaresTransparent(
  variables: Value[],
  residualFn: (vars: Value[]) => Value[],
  options: NonlinearLeastSquaresOptions = {}
): NonlinearLeastSquaresResult {
  const result = transparentLM(variables, residualFn, options);
  return {
    success: result.success,
    iterations: result.iterations,
    finalCost: result.finalCost,
    convergenceReason: result.convergenceReason,
    computationTime: result.computationTime,
  };
}
