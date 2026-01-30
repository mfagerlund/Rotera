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
    console.log(`[Sparse LM] Initial cost: ${cost.toFixed(6)}`);
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

    // Compute J^T J and J^T r
    const JtJ = J.computeJtJ();
    const Jtr = J.computeJtr(residuals);

    // Check gradient convergence
    const gradNorm = Math.sqrt(Jtr.reduce((sum, v) => sum + v * v, 0));
    if (gradNorm < gradientTolerance) {
      if (opts.verbose) {
        console.log(`[Sparse LM] Converged: gradient norm ${gradNorm.toExponential(3)} < ${gradientTolerance}`);
      }
      converged = true;
      break;
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

        if (opts.verbose && attempts === maxAttempts) {
          console.log(`[Sparse LM] Iter ${iter + 1}: step rejected, λ ${lambda.toExponential(3)}`);
        }
      }
    }

    if (converged) break;

    if (!stepAccepted) {
      if (opts.verbose) {
        console.log(`[Sparse LM] Failed to find descent step after ${maxAttempts} attempts`);
      }
      break;
    }
  }

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
