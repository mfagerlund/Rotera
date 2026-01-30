/**
 * Sparse Levenberg-Marquardt Solver
 *
 * Uses sparse Jacobian and conjugate gradient to solve the normal equations.
 * More efficient than dense LM for large, sparse problems.
 */

import type { ExplicitJacobianSystem, LMOptions, LMResult } from '../explicit-jacobian/types';
import { DEFAULT_LM_OPTIONS } from '../explicit-jacobian/types';
import { SparseJacobianBuilder } from './sparse-jacobian-builder';
import { preconditionedConjugateGradient } from './cg-solvers';

/**
 * Solve a nonlinear least squares problem using sparse Levenberg-Marquardt.
 *
 * Iteratively solves:
 *   (J^T J + λ I) Δx = -J^T r
 *
 * where J is the Jacobian, r is the residual vector, and λ is the damping factor.
 *
 * Uses conjugate gradient to solve the linear system, which is efficient for
 * sparse systems.
 *
 * @param system The optimization system with variables and residual providers
 * @param options LM solver options
 * @returns Solution result with converged flag, iterations, and final cost
 */
export function solveSparseLM(
  system: ExplicitJacobianSystem,
  options: Partial<LMOptions> = {}
): LMResult {
  // ALWAYS log entry to verify code is reached
  console.log(`[Sparse LM] ENTRY: ${system.variables.length} vars, ${system.residualProviders.length} providers`);

  const opts = { ...DEFAULT_LM_OPTIONS, ...options };
  const {
    maxIterations,
    tolerance,
    gradientTolerance,
    initialDamping,
    dampingIncrease,
    dampingDecrease,
    minDamping,
    maxDamping,
    cgMaxIterations,
    cgTolerance,
  } = opts;

  const jacobianBuilder = new SparseJacobianBuilder();
  const n = system.variables.length;
  let lambda = initialDamping;

  // Compute initial cost
  let residuals = system.computeAllResiduals();
  let cost = computeCost(residuals);
  const initialCost = cost;

  if (opts.verbose) {
    console.log(`[Sparse LM] Initial cost: ${cost.toFixed(6)}, n=${n} variables, ${residuals.length} residuals`);
  }

  // Always warn if there are issues
  const hasNaN = residuals.some(r => isNaN(r) || !isFinite(r));
  if (hasNaN) {
    console.warn(`[Sparse LM] WARNING: Initial residuals contain NaN or Infinity!`);
  }

  let converged = false;
  let iter = 0;

  for (iter = 0; iter < maxIterations; iter++) {
    // Build sparse Jacobian
    const J = jacobianBuilder.build(
      system.residualProviders,
      system.variables,
      n
    );

    // Check for empty Jacobian
    if (J.nonZeroCount === 0) {
      console.warn(`[Sparse LM] WARNING: Jacobian is completely empty! rows=${J.rows}, cols=${J.cols}`);
    }

    // Compute J^T J and J^T r
    const JtJ = J.computeJtJ();
    const Jtr = J.computeJtr(residuals);

    // Check for issues in the first iteration
    if (iter === 0 && J.nonZeroCount > 0) {
      const maxJtr = Math.max(...Jtr.map(Math.abs));
      const jtjDiag = JtJ.getDiagonal();
      const maxDiag = Math.max(...jtjDiag.map(Math.abs));
      const minDiag = Math.min(...jtjDiag.filter(d => d > 0));
      const condEst = maxDiag / Math.max(minDiag, 1e-15);
      if (opts.verbose || maxJtr < 1e-6 || condEst > 1e12) {
        console.log(`[Sparse LM] J: ${J.rows}x${J.cols}, nnz=${J.nonZeroCount}, JtJ maxDiag=${maxDiag.toExponential(3)}, minDiag=${minDiag.toExponential(3)}, condEst=${condEst.toExponential(3)}, maxJtr=${maxJtr.toExponential(3)}`);
      }
    }

    // Check gradient convergence
    let gradNorm = Math.sqrt(Jtr.reduce((sum, v) => sum + v * v, 0));
    if (gradNorm < gradientTolerance) {
      if (opts.verbose) {
        console.log(`[Sparse LM] Converged: gradient norm ${gradNorm.toExponential(3)} < ${gradientTolerance}`);
      }
      converged = true;
      break;
    }

    // Bail out if gradient is astronomically large - indicates numerical instability
    // that no amount of damping can fix
    const CATASTROPHIC_GRAD_NORM = 1e12;
    if (gradNorm > CATASTROPHIC_GRAD_NORM) {
      console.warn(`[Sparse LM] Gradient norm ${gradNorm.toExponential(3)} is catastrophically large, bailing out`);
      break;
    }

    // Scale gradient if too large - prevents numerical instability
    const MAX_GRAD_NORM = 1e6;
    if (gradNorm > MAX_GRAD_NORM) {
      const scale = MAX_GRAD_NORM / gradNorm;
      for (let i = 0; i < Jtr.length; i++) {
        Jtr[i] *= scale;
      }
      gradNorm = MAX_GRAD_NORM;
    }

    // Try to find a step that reduces cost
    let stepAccepted = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!stepAccepted && attempts < maxAttempts) {
      attempts++;

      // Solve (J^T J + λ I) step = -J^T r using CG
      const dampedJtJ = JtJ.addDiagonal(lambda);
      const negJtr = Jtr.map(v => -v);

      const cgMaxIter = cgMaxIterations > 0 ? cgMaxIterations : 2 * n;
      const cgResult = preconditionedConjugateGradient(
        dampedJtJ,
        negJtr,
        undefined,
        cgMaxIter,
        cgTolerance
      );

      const step = cgResult.x;

      // Compute step norm
      const stepNorm = Math.sqrt(step.reduce((sum, v) => sum + v * v, 0));

      // Check step convergence
      if (stepNorm < tolerance) {
        if (opts.verbose) {
          console.log(`[Sparse LM] Converged: step norm ${stepNorm.toExponential(3)} < ${tolerance}`);
        }
        converged = true;
        break;
      }

      // Try the step
      const newVariables = system.variables.map((v, i) => v + step[i]);

      // Temporarily update variables to compute new residuals
      const oldVariables = [...system.variables];
      for (let i = 0; i < n; i++) {
        system.variables[i] = newVariables[i];
      }

      const newResiduals = system.computeAllResiduals();
      const newCost = computeCost(newResiduals);

      if (newCost < cost) {
        // Accept step
        stepAccepted = true;
        residuals = newResiduals;
        cost = newCost;

        // Decrease damping
        lambda = Math.max(minDamping, lambda * dampingDecrease);

        if (opts.verbose) {
          console.log(
            `[Sparse LM] Iter ${iter + 1}: cost ${cost.toFixed(6)}, ` +
            `step ${stepNorm.toExponential(3)}, λ ${lambda.toExponential(3)}, ` +
            `CG iters ${cgResult.iterations}`
          );
        }

        // Check cost convergence
        const costReduction = (initialCost - cost) / Math.max(initialCost, 1e-10);
        if (cost < tolerance * tolerance) {
          if (opts.verbose) {
            console.log(`[Sparse LM] Converged: cost ${cost.toExponential(3)} < ${(tolerance * tolerance).toExponential(3)}`);
          }
          converged = true;
        }
      } else {
        // Reject step, restore variables
        for (let i = 0; i < n; i++) {
          system.variables[i] = oldVariables[i];
        }

        // Increase damping
        lambda = Math.min(maxDamping, lambda * dampingIncrease);

        // Log first rejection in detail to help diagnose
        if (iter === 0 && attempts === 1) {
          const hasNaNStep = step.some(s => isNaN(s) || !isFinite(s));
          const hasNaNNewResid = newResiduals.some(r => isNaN(r) || !isFinite(r));
          console.warn(`[Sparse LM] First step rejected: oldCost=${cost.toFixed(4)}, newCost=${newCost.toFixed(4)}, stepNorm=${stepNorm.toExponential(3)}, hasNaNStep=${hasNaNStep}, hasNaNResid=${hasNaNNewResid}, CG iters=${cgResult.iterations}, CG converged=${cgResult.converged}`);
        }

        if (opts.verbose && attempts === maxAttempts) {
          console.log(`[Sparse LM] Iter ${iter + 1}: step rejected, λ ${lambda.toExponential(3)}`);
        }
      }
    }

    if (converged) break;

    if (!stepAccepted) {
      // Always log when we fail to find a descent step - this is unexpected
      console.warn(`[Sparse LM] Failed to find descent step at iter ${iter} after ${maxAttempts} attempts, cost=${cost.toFixed(4)}, gradNorm=${gradNorm.toExponential(3)}, lambda=${lambda.toExponential(3)}`);
      break;
    }
  }

  // ALWAYS log exit
  console.log(`[Sparse LM] EXIT: converged=${converged}, iter=${iter}, cost=${cost.toFixed(4)}`);

  return {
    converged,
    iterations: iter,
    initialCost,
    finalCost: cost,
    variables: [...system.variables],
  };
}

/**
 * Compute sum of squared residuals (cost = 0.5 * ||r||^2)
 */
function computeCost(residuals: number[]): number {
  let sum = 0;
  for (const r of residuals) {
    sum += r * r;
  }
  return 0.5 * sum;
}
