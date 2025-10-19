/**
 * ConstraintSystem - 3D constraint solver using ScalarAutograd
 *
 * Inspired by ScalarAutograd's SketchSolver but adapted for 3D photogrammetry.
 * Solves geometric constraints by minimizing residuals using Levenberg-Marquardt.
 *
 * This system orchestrates entity-driven optimization:
 * - WorldPoints add themselves to the ValueMap (deciding locked vs free axes)
 * - Lines compute their own intrinsic residuals (direction, length)
 * - Constraints compute their own residuals
 */

import { Value, nonlinearLeastSquares } from 'scalar-autograd';
import type { ValueMap } from './IOptimizable';
import type { WorldPoint } from '../entities/world-point/WorldPoint';
import type { Line } from '../entities/line/Line';
import type { Camera } from '../entities/camera';
import type { Constraint } from '../entities/constraints/base-constraint';

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
}

export class ConstraintSystem {
  private tolerance: number;
  private maxIterations: number;
  private damping: number;
  private verbose: boolean;

  // Entities in the system
  private points: Set<WorldPoint> = new Set();
  private lines: Set<Line> = new Set();
  private cameras: Set<Camera> = new Set();
  private constraints: Set<Constraint> = new Set();

  constructor(options: SolverOptions = {}) {
    this.tolerance = options.tolerance ?? 1e-6;
    this.maxIterations = options.maxIterations ?? 100;
    this.damping = options.damping ?? 1e-3;
    this.verbose = options.verbose ?? false;
  }

  /**
   * Add a point to the constraint system.
   */
  addPoint(point: WorldPoint): void {
    this.points.add(point);
  }

  /**
   * Add a line to the constraint system.
   * Lines compute their own intrinsic constraints (direction, length).
   */
  addLine(line: Line): void {
    this.lines.add(line);
  }

  /**
   * Add a camera to the constraint system.
   * Cameras add their pose (and optionally intrinsics) as optimizable parameters.
   */
  addCamera(camera: Camera): void {
    this.cameras.add(camera);
  }

  /**
   * Add a constraint to the constraint system.
   */
  addConstraint(constraint: Constraint): void {
    if (constraint.isEnabled) {
      this.constraints.add(constraint);
    }
  }

  /**
   * Solve all constraints in the system.
   * Updates point positions to satisfy constraints.
   *
   * Entity-driven approach:
   * 1. Points add themselves to ValueMap (per-axis locking)
   * 2. Lines compute their intrinsic residuals
   * 3. Constraints compute their residuals
   * 4. Solver optimizes all variables
   * 5. Points extract optimized values with provenance
   */
  solve(): SolverResult {
    // 1. Build ValueMap by asking each entity to add itself
    const variables: Value[] = [];
    const valueMap: ValueMap = {
      points: new Map(),
      cameras: new Map(),
    };

    // Add points
    for (const point of this.points) {
      const pointVariables = point.addToValueMap(valueMap);
      variables.push(...pointVariables);
    }

    // Add cameras (if they implement IValueMapContributor)
    for (const camera of this.cameras) {
      if ('addToValueMap' in camera && typeof camera.addToValueMap === 'function') {
        const cameraVariables = (camera as any).addToValueMap(valueMap);
        variables.push(...cameraVariables);
      }
    }

    // 2. Build residual function from all entities
    const residualFn = (vars: Value[]) => {
      const residuals: Value[] = [];

      // INTRINSIC LINE CONSTRAINTS (direction, length)
      for (const line of this.lines) {
        const lineResiduals = line.computeResiduals(valueMap);
        residuals.push(...lineResiduals);
      }

      // CAMERA INTRINSIC CONSTRAINTS (quaternion normalization)
      for (const camera of this.cameras) {
        if ('computeResiduals' in camera && typeof camera.computeResiduals === 'function') {
          const cameraResiduals = (camera as any).computeResiduals(valueMap);
          residuals.push(...cameraResiduals);
        }
      }

      // EXPLICIT USER CONSTRAINTS
      for (const constraint of this.constraints) {
        try {
          const constraintResiduals = constraint.computeResiduals(valueMap);
          residuals.push(...constraintResiduals);
        } catch (error) {
          console.error(`[ConstraintSystem] Error computing residuals for constraint ${constraint.getId()}:`, error);
          throw error;
        }
      }

      return residuals;
    };

    console.log(`[ConstraintSystem] ${variables.length} variables, ${this.constraints.size} constraints`);

    // If no variables to optimize, check if constraints are satisfied
    if (variables.length === 0) {
      const residuals = residualFn([]);
      const residualSumSquared = residuals.reduce(
        (sum, r) => sum + r.data ** 2,
        0
      );
      const residualMagnitude = Math.sqrt(residualSumSquared);

      return {
        converged: residualMagnitude < this.tolerance,
        iterations: 0,
        residual: residualMagnitude,
        error: residualMagnitude < this.tolerance ? null : 'Over-constrained (no free variables)',
      };
    }

    // Test residual function before optimization
    try {
      console.log('[ConstraintSystem] Testing residual function...');
      const testResiduals = residualFn(variables);
      console.log(`[ConstraintSystem] Initial residuals: ${testResiduals.length} residuals`);
      const hasNaN = testResiduals.some(r => isNaN(r.data));
      if (hasNaN) {
        console.error('[ConstraintSystem] NaN detected in initial residuals!');
        testResiduals.forEach((r, i) => {
          if (isNaN(r.data)) {
            console.error(`  Residual ${i}: NaN`);
          }
        });
      }
    } catch (error) {
      console.error('[ConstraintSystem] Error testing residual function:', error);
      throw error;
    }

    try {
      // Solve using Levenberg-Marquardt
      console.log('[ConstraintSystem] Starting nonlinearLeastSquares...');
      const result = nonlinearLeastSquares(variables, residualFn, {
        costTolerance: this.tolerance,
        maxIterations: this.maxIterations,
        initialDamping: this.damping,
        adaptiveDamping: true,
        verbose: this.verbose,
      });

      // Update points with solved values (using entity-driven approach)
      for (const point of this.points) {
        point.applyOptimizationResultFromValueMap(valueMap);
      }

      // Update cameras with solved values
      for (const camera of this.cameras) {
        if ('applyOptimizationResultFromValueMap' in camera && typeof camera.applyOptimizationResultFromValueMap === 'function') {
          (camera as any).applyOptimizationResultFromValueMap(valueMap);
        }
      }

      // Evaluate and store residuals for lines (intrinsic constraints)
      for (const line of this.lines) {
        if ('evaluateAndStoreResiduals' in line && typeof line.evaluateAndStoreResiduals === 'function') {
          (line as any).evaluateAndStoreResiduals(valueMap);
        }
      }

      // Compute final residual magnitude
      const finalResiduals = residualFn(variables);
      const residualSumSquared = finalResiduals.reduce(
        (sum, r) => sum + r.data ** 2,
        0
      );
      const residualMagnitude = Math.sqrt(residualSumSquared);

      return {
        converged: result.success,
        iterations: result.iterations,
        residual: residualMagnitude,
        error: result.success ? null : result.convergenceReason,
      };
    } catch (error) {
      return {
        converged: false,
        iterations: 0,
        residual: Infinity,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if all constraints are satisfied (within tolerance).
   */
  isValid(): boolean {
    // TODO: Implement validation without modifying state
    return true;
  }

  /**
   * Clear all entities from the system.
   */
  clear(): void {
    this.points.clear();
    this.lines.clear();
    this.cameras.clear();
    this.constraints.clear();
  }
}
