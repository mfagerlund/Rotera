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

import { Value, V, nonlinearLeastSquares } from 'scalar-autograd';
import type { ValueMap } from './IOptimizable';
import type { WorldPoint } from '../entities/world-point/WorldPoint';
import type { Line } from '../entities/line/Line';
import type { Viewpoint } from '../entities/viewpoint/Viewpoint';
import type { ImagePoint } from '../entities/imagePoint/ImagePoint';
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
  private cameras: Set<Viewpoint> = new Set();
  private imagePoints: Set<ImagePoint> = new Set();
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
   * Add a viewpoint (camera) to the constraint system.
   * Viewpoints add their pose (and optionally intrinsics) as optimizable parameters.
   */
  addCamera(viewpoint: Viewpoint): void {
    this.cameras.add(viewpoint);
  }

  /**
   * Add an image point to the constraint system.
   * Image points compute reprojection residuals.
   */
  addImagePoint(imagePoint: ImagePoint): void {
    this.imagePoints.add(imagePoint);
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

      // Determine weighting strategy based on constraints
      const hasGeometricConstraints = this.constraints.size > 0 ||
                                       Array.from(this.lines).some(line =>
                                         line.direction !== 'free' || line.hasFixedLength());

      // NOTE: When geometric constraints exist, reprojection errors are downweighted.
      // This prioritizes geometric accuracy (line lengths, angles) over exact pixel matches.
      // If cameras are unlocked, they may drift to satisfy geometry, causing high reprojection errors.
      // Solution: Lock cameras if you trust their initial PnP positions, or increase this weight.
      const reprojectionWeight = 1.0;

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

      // IMAGE POINT REPROJECTION CONSTRAINTS (down-weighted when geometric constraints exist)
      for (const imagePoint of this.imagePoints) {
        const reprojectionResiduals = imagePoint.computeResiduals(valueMap);
        const weighted = reprojectionResiduals.map(r =>
          V.mul(r, V.C(reprojectionWeight))
        );
        residuals.push(...weighted);
      }

      // EXPLICIT USER CONSTRAINTS
      for (const constraint of this.constraints) {
        try {
          const constraintResiduals = constraint.computeResiduals(valueMap);
          residuals.push(...constraintResiduals);
        } catch (error) {
          console.error(`[ConstraintSystem] Error computing residuals for constraint ${constraint.getName()}:`, error);
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

      const allResiduals: Value[] = [];

      console.log(`[ConstraintSystem] Computing line residuals (${this.lines.size} lines)...`);
      for (const line of this.lines) {
        const lineResiduals = line.computeResiduals(valueMap);
        console.log(`  ${line.name || 'Line'}: ${lineResiduals.length} residuals = [${lineResiduals.map(r => r.data.toFixed(4)).join(', ')}]`);
        allResiduals.push(...lineResiduals);
      }

      console.log(`[ConstraintSystem] Computing camera residuals (${this.cameras.size} cameras)...`);
      for (const camera of this.cameras) {
        if ('computeResiduals' in camera && typeof camera.computeResiduals === 'function') {
          const cameraResiduals = (camera as any).computeResiduals(valueMap);
          console.log(`  ${camera.name}: ${cameraResiduals.length} residuals = [${cameraResiduals.map((r: Value) => r.data.toFixed(4)).join(', ')}]`);
          allResiduals.push(...cameraResiduals);
        }
      }

      console.log(`[ConstraintSystem] Computing image point reprojections (${this.imagePoints.size} image points)...`);
      for (const imagePoint of this.imagePoints) {
        const reprojectionResiduals = imagePoint.computeResiduals(valueMap);
        console.log(`  ${imagePoint.getName()}: ${reprojectionResiduals.length} residuals = [${reprojectionResiduals.map(r => r.data.toFixed(4)).join(', ')}]`);
        allResiduals.push(...reprojectionResiduals);
      }

      console.log(`[ConstraintSystem] Computing constraint residuals (${this.constraints.size} constraints)...`);
      for (const constraint of this.constraints) {
        const constraintResiduals = constraint.computeResiduals(valueMap);
        console.log(`  ${constraint.getName()}: ${constraintResiduals.length} residuals = [${constraintResiduals.map(r => r.data.toFixed(4)).join(', ')}]`);
        allResiduals.push(...constraintResiduals);
      }

      console.log(`[ConstraintSystem] Total residuals: ${allResiduals.length}`);

      const hasNaN = allResiduals.some(r => isNaN(r.data));
      const hasInfinity = allResiduals.some(r => !isFinite(r.data));

      if (hasNaN) {
        console.error('[ConstraintSystem] NaN detected in initial residuals!');
        allResiduals.forEach((r, i) => {
          if (isNaN(r.data)) {
            console.error(`  Residual ${i}: NaN`);
          }
        });
      }

      if (hasInfinity) {
        console.error('[ConstraintSystem] Infinity detected in initial residuals!');
        allResiduals.forEach((r, i) => {
          if (!isFinite(r.data)) {
            console.error(`  Residual ${i}: ${r.data}`);
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

      // Update image points with solved values
      for (const imagePoint of this.imagePoints) {
        imagePoint.applyOptimizationResult(valueMap);
      }

      // Evaluate and store residuals for lines (intrinsic constraints)
      for (const line of this.lines) {
        if ('evaluateAndStoreResiduals' in line && typeof line.evaluateAndStoreResiduals === 'function') {
          (line as any).evaluateAndStoreResiduals(valueMap);
        }
      }

      // Evaluate and store residuals for constraints
      for (const constraint of this.constraints) {
        const residuals = constraint.computeResiduals(valueMap);
        constraint.lastResiduals = residuals.map(r => r.data);
      }

      // Validate push/pop symmetry in verbose mode
      if (this.verbose) {
        this.validateResidualSymmetry(valueMap);
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
   * Validate that entities pop the same number of residuals they push.
   * This ensures architectural invariant: push count == pop count.
   *
   * @param valueMap - The ValueMap with solved values
   */
  private validateResidualSymmetry(valueMap: ValueMap): void {
    const pushCounts = new Map<any, { count: number; name: string }>();

    // Count pushed residuals for lines
    for (const line of this.lines) {
      const residuals = line.computeResiduals(valueMap);
      pushCounts.set(line, {
        count: residuals.length,
        name: (line as any).name || 'Line'
      });
    }

    // Count pushed residuals for cameras
    for (const camera of this.cameras) {
      if ('computeResiduals' in camera && typeof camera.computeResiduals === 'function') {
        const residuals = (camera as any).computeResiduals(valueMap);
        pushCounts.set(camera, {
          count: residuals.length,
          name: (camera as any).name || 'Camera'
        });
      }
    }

    // Count pushed residuals for image points
    for (const imagePoint of this.imagePoints) {
      const residuals = imagePoint.computeResiduals(valueMap);
      pushCounts.set(imagePoint, {
        count: residuals.length,
        name: imagePoint.getName()
      });
    }

    // Count pushed residuals for constraints
    for (const constraint of this.constraints) {
      const residuals = constraint.computeResiduals(valueMap);
      pushCounts.set(constraint, {
        count: residuals.length,
        name: constraint.getName()
      });
    }

    // Verify pop counts match push counts
    let hasViolations = false;
    for (const [entity, info] of pushCounts) {
      if ('lastResiduals' in entity) {
        const actualCount = (entity as any).lastResiduals?.length ?? 0;
        if (actualCount !== info.count) {
          console.error(
            `[ConstraintSystem] Push/pop mismatch for "${info.name}": ` +
            `pushed ${info.count}, popped ${actualCount}`
          );
          hasViolations = true;
        }
      } else if (info.count > 0) {
        console.warn(
          `[ConstraintSystem] "${info.name}" pushed ${info.count} residuals ` +
          `but has no lastResiduals field to pop them into`
        );
        hasViolations = true;
      }
    }

    if (!hasViolations) {
      console.log('[ConstraintSystem] ✓ All entities have symmetric push/pop residuals');
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
