/**
 * Dense Levenberg-Marquardt Solver
 *
 * Solves nonlinear least squares problems using explicit Jacobians.
 * This is a reference implementation using dense matrix operations.
 * For large-scale problems, use the sparse solver instead.
 */

import {
  ExplicitJacobianSystem,
  LMOptions,
  LMResult,
  DEFAULT_LM_OPTIONS,
} from './types';

/**
 * Solve a nonlinear least squares problem using Levenberg-Marquardt
 *
 * Minimizes: 0.5 * ||r(x)||^2
 * where r(x) is the vector of residuals
 *
 * @param system The system to solve
 * @param options Solver options
 * @returns Solver result
 */
export function solveDenseLM(
  system: ExplicitJacobianSystem,
  options: Partial<LMOptions> = {}
): LMResult {
  const opts: LMOptions = { ...DEFAULT_LM_OPTIONS, ...options };

  let variables = [...system.variables];
  let lambda = opts.initialDamping;

  // Initial state
  let residuals = computeResiduals(system, variables);
  let cost = computeCost(residuals);
  const initialCost = cost;

  if (opts.verbose) {
    console.log(`[LM] Initial cost: ${cost.toFixed(8)}`);
  }

  let iteration = 0;
  let converged = false;

  while (iteration < opts.maxIterations) {
    iteration++;

    // Compute Jacobian
    const J = computeJacobian(system, variables);

    // Compute J^T * J and J^T * r
    const { JtJ, Jtr } = computeNormalEquations(J, residuals);

    // Compute gradient norm for convergence check
    const gradNorm = Math.sqrt(Jtr.reduce((sum, val) => sum + val * val, 0));
    if (gradNorm < opts.gradientTolerance) {
      converged = true;
      if (opts.verbose) {
        console.log(`[LM] Converged: gradient norm ${gradNorm.toExponential(4)} < ${opts.gradientTolerance}`);
      }
      break;
    }

    // Try to find a step that reduces cost
    let stepAccepted = false;
    const maxLambdaRetries = 10;

    for (let retry = 0; retry < maxLambdaRetries; retry++) {
      // Solve (J^T*J + lambda*I) * step = -J^T*r
      const step = solveWithDamping(JtJ, Jtr, lambda);

      // Try the step
      const newVariables = variables.map((v, i) => v + step[i]);
      const newResiduals = computeResiduals(system, newVariables);
      const newCost = computeCost(newResiduals);

      if (newCost < cost) {
        // Accept the step
        variables = newVariables;
        residuals = newResiduals;

        const costReduction = cost - newCost;
        cost = newCost;

        // Decrease damping (trust the linear approximation more)
        lambda = Math.max(lambda * opts.dampingDecrease, opts.minDamping);

        if (opts.verbose && iteration % 10 === 0) {
          console.log(
            `[LM] iter ${iteration}: cost=${cost.toFixed(8)}, lambda=${lambda.toExponential(2)}, reduction=${costReduction.toExponential(4)}`
          );
        }

        // Check cost convergence
        if (costReduction < opts.tolerance * cost) {
          converged = true;
          if (opts.verbose) {
            console.log(`[LM] Converged: cost reduction ${costReduction.toExponential(4)} < tolerance`);
          }
        }

        stepAccepted = true;
        break;
      } else {
        // Reject step, increase damping
        lambda = Math.min(lambda * opts.dampingIncrease, opts.maxDamping);
      }
    }

    if (!stepAccepted) {
      // stalled;
      if (opts.verbose) {
        console.log(`[LM] Stalled: could not find step that reduces cost`);
      }
      break;
    }

    if (converged) {
      break;
    }
  }

  // Update system variables
  for (let i = 0; i < variables.length; i++) {
    system.variables[i] = variables[i];
  }

  return {
    converged: converged,
    iterations: iteration,
    finalCost: cost,
    initialCost,
    variables,
  };
}

/**
 * Compute residuals for given variables
 */
function computeResiduals(system: ExplicitJacobianSystem, variables: number[]): number[] {
  // Temporarily set variables in system
  const originalVariables = [...system.variables];
  for (let i = 0; i < variables.length; i++) {
    system.variables[i] = variables[i];
  }

  const residuals = system.computeAllResiduals();

  // Restore original
  for (let i = 0; i < originalVariables.length; i++) {
    system.variables[i] = originalVariables[i];
  }

  return residuals;
}

/**
 * Compute Jacobian for given variables
 */
function computeJacobian(system: ExplicitJacobianSystem, variables: number[]): number[][] {
  // Temporarily set variables in system
  const originalVariables = [...system.variables];
  for (let i = 0; i < variables.length; i++) {
    system.variables[i] = variables[i];
  }

  const jacobian = system.computeFullJacobian();

  // Restore original
  for (let i = 0; i < originalVariables.length; i++) {
    system.variables[i] = originalVariables[i];
  }

  return jacobian;
}

/**
 * Compute cost = 0.5 * ||r||^2
 */
function computeCost(residuals: number[]): number {
  let sum = 0;
  for (const r of residuals) {
    sum += r * r;
  }
  return 0.5 * sum;
}

/**
 * Compute normal equations: J^T*J and J^T*r
 */
function computeNormalEquations(
  J: number[][],
  r: number[]
): { JtJ: number[][]; Jtr: number[] } {
  const m = J.length; // Number of residuals
  const n = J[0]?.length ?? 0; // Number of variables

  // J^T * J (n x n)
  const JtJ: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < m; k++) {
        sum += J[k][i] * J[k][j];
      }
      JtJ[i][j] = sum;
      JtJ[j][i] = sum; // Symmetric
    }
  }

  // J^T * r (n)
  const Jtr: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < m; k++) {
      sum += J[k][i] * r[k];
    }
    Jtr[i] = sum;
  }

  return { JtJ, Jtr };
}

/**
 * Solve (A + lambda*I) * x = -b using Cholesky decomposition
 */
function solveWithDamping(A: number[][], b: number[], lambda: number): number[] {
  const n = A.length;

  // Add damping: A' = A + lambda * I
  const Adamped: number[][] = A.map((row, i) =>
    row.map((val, j) => (i === j ? val + lambda : val))
  );

  // Solve using Cholesky decomposition
  // L * L^T = A', then L * y = -b, then L^T * x = y
  const L = choleskyDecompose(Adamped);
  if (!L) {
    // Fallback: increase damping and try again with simple solve
    return new Array(n).fill(0);
  }

  // Forward substitution: L * y = -b
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = -b[i];
    for (let j = 0; j < i; j++) {
      sum -= L[i][j] * y[j];
    }
    y[i] = sum / L[i][i];
  }

  // Back substitution: L^T * x = y
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let j = i + 1; j < n; j++) {
      sum -= L[j][i] * x[j];
    }
    x[i] = sum / L[i][i];
  }

  return x;
}

/**
 * Cholesky decomposition: A = L * L^T
 * Returns L (lower triangular) or null if not positive definite
 */
function choleskyDecompose(A: number[][]): number[][] | null {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];

      for (let k = 0; k < j; k++) {
        sum -= L[i][k] * L[j][k];
      }

      if (i === j) {
        if (sum <= 0) {
          // Not positive definite
          return null;
        }
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }

  return L;
}
