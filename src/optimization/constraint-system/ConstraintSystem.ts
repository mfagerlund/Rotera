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
import type { ValueMap, IOptimizableCamera } from '../IOptimizable';
import type { WorldPoint } from '../../entities/world-point/WorldPoint';
import { Line } from '../../entities/line/Line';
import type { ImagePoint } from '../../entities/imagePoint/ImagePoint';
import { Constraint } from '../../entities/constraints/base-constraint';
import type { VanishingLine, VanishingLineAxis } from '../../entities/vanishing-line';
import { computeVanishingPoint } from '../vanishing-points';
import { rotateDirectionByQuaternion } from './utils';
import type { SolverResult, SolverOptions } from './types';

export class ConstraintSystem {
  private tolerance: number;
  private maxIterations: number;
  private damping: number;
  private verbose: boolean;
  private optimizeCameraIntrinsics: boolean | ((camera: IOptimizableCamera) => boolean);
  private regularizationWeight: number;

  // Entities in the system
  private points: Set<WorldPoint> = new Set();
  private lines: Set<Line> = new Set();
  private cameras: Set<IOptimizableCamera> = new Set();
  private imagePoints: Set<ImagePoint> = new Set();
  private constraints: Set<Constraint> = new Set();

  // Initial positions for regularization (captured at solve time)
  private initialPositions: Map<WorldPoint, [number, number, number]> = new Map();

  constructor(options: SolverOptions = {}) {
    this.tolerance = options.tolerance ?? 1e-6;
    this.maxIterations = options.maxIterations ?? 500;
    this.damping = options.damping ?? 0.1;
    this.verbose = options.verbose ?? false;
    this.optimizeCameraIntrinsics = options.optimizeCameraIntrinsics ?? false;
    this.regularizationWeight = options.regularizationWeight ?? 0;
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
  addCamera(viewpoint: IOptimizableCamera): void {
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
    this.constraints.add(constraint);
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

    // Capture initial positions for regularization BEFORE adding to ValueMap
    // (since addToValueMap may create new Value objects)
    this.initialPositions.clear();
    if (this.regularizationWeight > 0) {
      for (const point of this.points) {
        if (point.optimizedXyz && !point.isFullyConstrained()) {
          this.initialPositions.set(point, [...point.optimizedXyz] as [number, number, number]);
        }
      }
    }

    // Add points
    let pointVarCount = 0;
    for (const point of this.points) {
      const pointVariables = point.addToValueMap(valueMap);
      pointVarCount += pointVariables.length;
      variables.push(...pointVariables);
    }

    // Add cameras (if they implement IOptimizableCamera)
    let cameraVarCount = 0;
    for (const camera of this.cameras) {
      if ('addToValueMap' in camera && typeof camera.addToValueMap === 'function') {
        const optimizeIntrinsics =
          typeof this.optimizeCameraIntrinsics === 'function'
            ? this.optimizeCameraIntrinsics(camera)
            : this.optimizeCameraIntrinsics;
        const cameraVariables = camera.addToValueMap(valueMap, {
          optimizePose: !camera.isPoseLocked,
          optimizeIntrinsics,
          optimizeDistortion: false,
        });
        cameraVarCount += cameraVariables.length;
        variables.push(...cameraVariables);
      }
    }

    if (this.verbose) {
      console.log(`[ConstraintSystem] Variables: ${variables.length} total (${pointVarCount} from ${this.points.size} points, ${cameraVarCount} from ${this.cameras.size} cameras)`);
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
          const cameraResiduals = camera.computeResiduals(valueMap);
          residuals.push(...cameraResiduals);
        }

        // VANISHING POINT CONSTRAINTS - use angular error (not pixel error)
        // This avoids huge residuals from distant vanishing points
        const cameraValues = valueMap.cameras.get(camera);
        if (cameraValues && camera.vanishingLines && camera.vanishingLines.size > 0) {
          const axisDirs: Record<VanishingLineAxis, [number, number, number]> = {
            x: [1, 0, 0],
            y: [0, 1, 0],
            z: [0, 0, 1],
          };

          (['x', 'y', 'z'] as VanishingLineAxis[]).forEach(axis => {
            const linesForAxis = Array.from(camera.vanishingLines as Set<VanishingLine>).filter(
              (l: VanishingLine) => l.axis === axis
            );
            if (linesForAxis.length < 2) return;

            const observedVP = computeVanishingPoint(linesForAxis);
            if (!observedVP) return;

            // Get predicted world axis direction in camera frame
            const dir = rotateDirectionByQuaternion(cameraValues.rotation, axisDirs[axis]);

            // Convert observed VP to normalized camera coordinates (direction)
            const fx = cameraValues.focalLength;
            const fy = V.mul(cameraValues.focalLength, cameraValues.aspectRatio);
            const obsX = V.div(V.sub(V.C(observedVP.u), cameraValues.principalPointX), fx);
            const obsY = V.div(V.sub(cameraValues.principalPointY, V.C(observedVP.v)), fy);
            const obsZ = V.C(1);

            // Normalize both directions
            const predLen = V.sqrt(V.add(V.add(V.square(dir.x), V.square(dir.y)), V.square(dir.z)));
            const obsLen = V.sqrt(V.add(V.add(V.square(obsX), V.square(obsY)), V.square(obsZ)));

            // Compute dot product (cosine of angle)
            const dot = V.div(
              V.add(V.add(V.mul(dir.x, obsX), V.mul(dir.y, obsY)), V.mul(dir.z, obsZ)),
              V.mul(predLen, obsLen)
            );

            // Angular residual: 1 - cos(angle) is small for aligned directions
            // Very low weight - just a gentle nudge, not a hard constraint
            const vpWeight = V.C(0.02);
            residuals.push(V.mul(V.sub(V.C(1), dot), vpWeight));
          });
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
          if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
            console.error(`[ConstraintSystem] Error computing residuals for constraint ${constraint.getName()}:`, error);
          }
          throw error;
        }
      }

      // REGULARIZATION - penalize points moving far from their initial positions
      // This prevents unconstrained points from diverging to infinity
      if (this.regularizationWeight > 0 && this.initialPositions.size > 0) {
        const regWeight = V.C(this.regularizationWeight);
        for (const [point, initPos] of this.initialPositions) {
          const pointVec = valueMap.points.get(point);
          if (pointVec) {
            // Penalize displacement from initial position (3 residuals per point)
            residuals.push(V.mul(V.sub(pointVec.x, V.C(initPos[0])), regWeight));
            residuals.push(V.mul(V.sub(pointVec.y, V.C(initPos[1])), regWeight));
            residuals.push(V.mul(V.sub(pointVec.z, V.C(initPos[2])), regWeight));
          }
        }
      }

      return residuals;
    };

    // Log variable counts for debugging
    if (this.verbose) {
      console.log(`[ConstraintSystem] Variables: ${variables.length} total (${pointVarCount} from ${this.points.size} points, ${cameraVarCount} from ${this.cameras.size} cameras)`);
    }

    // If no variables to optimize, check if constraints are satisfied
    if (variables.length === 0) {
      const residuals = residualFn([]);
      const residualSumSquared = residuals.reduce(
        (sum, r) => sum + r.data ** 2,
        0
      );
      const residualMagnitude = Math.sqrt(residualSumSquared);

      // With no free variables, we consider the system "converged" if the residual is reasonable.
      // This happens when all world points have inferred coordinates and camera is pose-locked.
      // The residual is the sum of all constraint residuals (reprojection, coplanarity, direction, etc.)
      // A residual under 250 is acceptable for a fully-constrained system.
      const REASONABLE_RESIDUAL_THRESHOLD = 250;
      const isReasonable = residualMagnitude < REASONABLE_RESIDUAL_THRESHOLD;

      // Still need to apply optimization results to set optimizedXyz for fully-locked points
      for (const point of this.points) {
        point.applyOptimizationResultFromValueMap(valueMap);
      }

      return {
        converged: isReasonable,
        iterations: 0,
        residual: residualMagnitude,
        error: isReasonable ? null : 'Over-constrained (no free variables)',
      };
    }

    // Test residual function before optimization
    try {
      const allResiduals: Value[] = [];

      for (const line of this.lines) {
        const lineResiduals = line.computeResiduals(valueMap);
        allResiduals.push(...lineResiduals);
      }

      for (const camera of this.cameras) {
        if ('computeResiduals' in camera && typeof camera.computeResiduals === 'function') {
          const cameraResiduals = camera.computeResiduals(valueMap);
          allResiduals.push(...cameraResiduals);
        }
      }

      for (const imagePoint of this.imagePoints) {
        const reprojectionResiduals = imagePoint.computeResiduals(valueMap);
        allResiduals.push(...reprojectionResiduals);
      }

      for (const constraint of this.constraints) {
        const constraintResiduals = constraint.computeResiduals(valueMap);
        allResiduals.push(...constraintResiduals);
      }

      const hasNaN = allResiduals.some(r => isNaN(r.data));
      const hasInfinity = allResiduals.some(r => !isFinite(r.data));

      if (hasNaN) {
        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
          console.error('[ConstraintSystem] NaN detected in initial residuals!');
          allResiduals.forEach((r, i) => {
            if (isNaN(r.data)) {
              console.error(`  Residual ${i}: NaN`);
            }
          });
        }
      }

      if (hasInfinity) {
        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
          console.error('[ConstraintSystem] Infinity detected in initial residuals!');
          allResiduals.forEach((r, i) => {
            if (!isFinite(r.data)) {
              console.error(`  Residual ${i}: ${r.data}`);
            }
          });
        }
      }
    } catch (error) {
      if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
        console.error('[ConstraintSystem] Error testing residual function:', error);
      }
      throw error;
    }

    try {
      // Solve using Levenberg-Marquardt
      // Use gradientTolerance for early stopping when progress stalls.
      // This helps with weakly-constrained points (e.g., single-view coplanar)
      // where the cost decreases very slowly but the solution is already good.
      const result = nonlinearLeastSquares(variables, residualFn, {
        costTolerance: this.tolerance,
        gradientTolerance: this.tolerance * 10, // Stop when gradient is small
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
          camera.applyOptimizationResultFromValueMap(valueMap);
        }
      }

      // Update image points with solved values
      for (const imagePoint of this.imagePoints) {
        imagePoint.applyOptimizationResult(valueMap);
      }

      // Evaluate and store residuals for lines (intrinsic constraints)
      for (const line of this.lines) {
        if ('evaluateAndStoreResiduals' in line && typeof line.evaluateAndStoreResiduals === 'function') {
          line.evaluateAndStoreResiduals(valueMap);
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
      if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
        console.error("[ConstraintSystem] Optimization threw exception:", error);
      }
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
        name: line.name || 'Line'
      });
    }

    // Count pushed residuals for cameras
    for (const camera of this.cameras) {
      if ('computeResiduals' in camera && typeof camera.computeResiduals === 'function') {
        const residuals = camera.computeResiduals(valueMap);
        pushCounts.set(camera, {
          count: residuals.length,
          name: camera.name || 'Camera'
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
        const lastResiduals = (entity as Line | Constraint).lastResiduals;
        const actualCount = lastResiduals?.length ?? 0;
        if (actualCount !== info.count) {
          if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
            console.error(
              `[ConstraintSystem] Push/pop mismatch for "${info.name}": ` +
              `pushed ${info.count}, popped ${actualCount}`
            );
          }
          hasViolations = true;
        }
      } else if (info.count > 0) {
        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
          console.warn(
            `[ConstraintSystem] "${info.name}" pushed ${info.count} residuals ` +
            `but has no lastResiduals field to pop them into`
          );
        }
        hasViolations = true;
      }
    }

    // All entities have symmetric push/pop residuals
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
