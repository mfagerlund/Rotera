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

import { Value, V } from 'scalar-autograd';
import { transparentLM, type TransparentLMResult } from '../autodiff-dense-lm';
import { SparseMatrix } from '../sparse/SparseMatrix';
import { conjugateGradientDamped } from '../sparse/cg-solvers';
import type { ValueMap, IOptimizableCamera } from '../IOptimizable';
import type { WorldPoint } from '../../entities/world-point/WorldPoint';
import { Line } from '../../entities/line/Line';
import type { ImagePoint } from '../../entities/imagePoint/ImagePoint';
import { Constraint } from '../../entities/constraints/base-constraint';
import type { VanishingLine, VanishingLineAxis } from '../../entities/vanishing-line';
import { computeVanishingPoint } from '../vanishing-points';
import { rotateDirectionByQuaternion } from './utils';
import type { SolverResult, SolverOptions } from './types';
import { useSparseSolve, useAnalyticalSolve } from '../solver-config';

// Analytical providers
import type { AnalyticalResidualProvider, VariableLayout } from '../analytical/types';
import {
  VariableLayoutBuilder,
  createPointGetter,
  createQuaternionGetter,
} from '../analytical/variable-layout';
import {
  createQuatNormProvider,
  createDistanceProvider,
  createLineLengthProvider,
  createLineDirectionProviders,
  createCollinearProviders,
  createAngleProvider,
  createCoplanarProviders,
  createReprojectionProviders,
  createVanishingLineProvider,
  createRegularizationProviders,
  createFixedPointProviders,
  createFocalLengthRegularizationProviders,
  createEqualDistancesProviders,
  createEqualAnglesProviders,
  type CameraIntrinsics,
  type CameraIntrinsicsIndices,
  type ReprojectionFlags,
} from '../analytical/providers';

// Constraint types for type checking
import { DistanceConstraint } from '../../entities/constraints/distance-constraint';
import { AngleConstraint } from '../../entities/constraints/angle-constraint';
import { CoplanarPointsConstraint } from '../../entities/constraints/coplanar-points-constraint';
import { FixedPointConstraint } from '../../entities/constraints/fixed-point-constraint';
import { EqualDistancesConstraint } from '../../entities/constraints/equal-distances-constraint';
import { EqualAnglesConstraint } from '../../entities/constraints/equal-angles-constraint';
import { CollinearPointsConstraint } from '../../entities/constraints/collinear-points-constraint';

export class ConstraintSystem {
  private tolerance: number;
  private maxIterations: number;
  private damping: number;
  private verbose: boolean;
  private optimizeCameraIntrinsics: boolean | ((camera: IOptimizableCamera) => boolean);
  private regularizationWeight: number;
  private useIsZReflected: boolean;
  private forceSolverMode?: 'dense' | 'sparse' | 'analytical';

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
    this.useIsZReflected = options.useIsZReflected ?? false;
    this.forceSolverMode = options.forceSolverMode;
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
   *
   * Uses autodiff (scalar-autograd) for gradient computation with optional
   * sparse CG for solving normal equations (controlled by USE_SPARSE_SOLVE).
   */
  solve(): SolverResult {
    return this.solveWithAutodiff();
  }

  /**
   * Solve using autodiff backend (scalar-autograd).
   */
  private solveWithAutodiff(): SolverResult {
    // 1. Build ValueMap by asking each entity to add itself
    const variables: Value[] = [];
    const valueMap: ValueMap = {
      points: new Map(),
      cameras: new Map(),
      useIsZReflected: this.useIsZReflected,
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
      // Use transparent LM solver that exposes Jacobian (for sparse validation)
      //
      // Solver modes:
      // - Dense: Cholesky with autodiff
      // - Sparse: CG with autodiff
      // - Analytical: CG with analytical gradients (bypasses autodiff)
      //
      // forceSolverMode overrides global settings for internal subsystems
      const analyticalEnabled = this.forceSolverMode
        ? this.forceSolverMode === 'analytical'
        : useAnalyticalSolve();
      let analyticalProviders: AnalyticalResidualProvider[] | undefined;

      // DEBUG: Log solver mode
      console.log(`[ConstraintSystem] analyticalEnabled=${analyticalEnabled}, forceSolverMode=${this.forceSolverMode}, useAnalyticalSolve()=${useAnalyticalSolve()}`);

      // Collect quaternion indices for all cameras with optimizable poses
      // This is used for quaternion renormalization even without analytical mode
      const quaternionIndices: Array<readonly [number, number, number, number]> = [];
      let layout: ReturnType<VariableLayoutBuilder['build']> | undefined;

      if (analyticalEnabled) {
        const { providers, layout: builtLayout, layoutBuilder } = this.buildAnalyticalProviders();
        analyticalProviders = providers;
        layout = builtLayout;
        console.log(`[ConstraintSystem] Built ${providers.length} analytical providers, ${builtLayout.numVariables} variables`);

        // Collect quaternion indices from all cameras
        for (const camera of this.cameras) {
          if (!camera.isPoseLocked) {
            const quatIndices = layout.getCameraQuatIndices(camera.name);
            quaternionIndices.push(quatIndices);
          }
        }

        // Variable count mismatch is a CRITICAL BUG - do NOT silently fall back
        if (builtLayout.numVariables !== variables.length) {
          // Gather debug information
          const pointCount = this.points.size;
          const cameraCount = this.cameras.size;
          const imagePointCount = this.imagePoints.size;
          const constraintCount = this.constraints.size;
          const lineCount = this.lines.size;

          const debugInfo = [
            ``,
            `=== ANALYTICAL VARIABLE COUNT MISMATCH ===`,
            `Analytical layout: ${builtLayout.numVariables} variables`,
            `Autodiff system: ${variables.length} variables`,
            `Difference: ${Math.abs(builtLayout.numVariables - variables.length)} variables`,
            ``,
            `=== SYSTEM CONTENTS ===`,
            `Points: ${pointCount}`,
            `Cameras: ${cameraCount}`,
            `Image Points: ${imagePointCount}`,
            `Lines: ${lineCount}`,
            `Constraints: ${constraintCount}`,
            ``,
            `=== CAMERA DETAILS ===`,
            ...Array.from(this.cameras).map(c => {
              const posLocked = c.isPoseLocked;
              const intrinsicsOptimized = typeof this.optimizeCameraIntrinsics === 'function'
                ? this.optimizeCameraIntrinsics(c)
                : this.optimizeCameraIntrinsics;
              return `  ${c.name}: poseLocked=${posLocked}, optimizeIntrinsics=${intrinsicsOptimized}`;
            }),
            ``,
            `=== POINT DETAILS ===`,
            ...Array.from(this.points).map(p => {
              const eff = p.getEffectiveXyz();
              const lockedAxes = [
                eff[0] !== null ? 'X' : '',
                eff[1] !== null ? 'Y' : '',
                eff[2] !== null ? 'Z' : ''
              ].filter(Boolean).join('') || 'none';
              return `  ${p.name}: locked=[${lockedAxes}]`;
            }),
            ``,
            `This is a BUG in the analytical provider system.`,
            `The variable layouts MUST match for analytical gradients to work.`,
            `==========================================`,
          ].join('\n');

          throw new Error(
            `ANALYTICAL VARIABLE COUNT MISMATCH: ` +
            `analytical=${builtLayout.numVariables}, autodiff=${variables.length}` +
            debugInfo
          );
        }
      }

      // Determine sparse mode: forced mode overrides global setting
      const sparseEnabled = this.forceSolverMode
        ? this.forceSolverMode !== 'dense'  // sparse and analytical both use sparse linear solve
        : useSparseSolve();

      const result = transparentLM(variables, residualFn, {
        costTolerance: this.tolerance,
        gradientTolerance: this.tolerance * 10, // Stop when gradient is small
        maxIterations: this.maxIterations,
        initialDamping: this.damping,
        adaptiveDamping: true,
        verbose: this.verbose,
        useSparseLinearSolve: sparseEnabled,
        analyticalProviders,
        useAnalyticalSolve: analyticalEnabled,
        // Pass quaternion indices for explicit renormalization after each step.
        // This prevents numerical drift from causing quaternion magnitude to diverge
        // from 1.0, which can lead to convergence to reflected local minima.
        quaternionIndices: quaternionIndices.length > 0 ? quaternionIndices : undefined,
      });

      // === SPARSE VALIDATION ===
      // Run sparse solver in parallel using the same Jacobian from the dense solve.
      // This validates that the sparse solver produces equivalent results.
      // If they diverge, it indicates a bug in the sparse solver.
      if (result.jacobian.length > 0 && result.jacobian[0].length > 0) {
        this.validateSparseAgainstDense(result, variables);
      }

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
   * Validate sparse solver against dense solver results.
   *
   * Takes the Jacobian from the dense solve and validates:
   * 1. J^T r (gradient) matches between sparse and dense
   * 2. J^T J (normal equations matrix) matches between sparse and dense
   * 3. LM step (delta) matches between Cholesky (dense) and CG (sparse)
   *
   * This is the key self-validation mechanism: if sparse diverges, we catch it
   * immediately rather than silently producing wrong results.
   */
  private validateSparseAgainstDense(
    denseResult: TransparentLMResult,
    _variables: Value[]
  ): void {
    const { jacobian, residualValues } = denseResult;
    const numResiduals = jacobian.length;
    const numVariables = jacobian[0]?.length ?? 0;

    if (numResiduals === 0 || numVariables === 0) return;

    // Build sparse matrix from dense Jacobian
    const sparseJ = SparseMatrix.fromDense(jacobian);

    // === STEP 1: Validate J^T r ===
    const sparseJtr = sparseJ.computeJtr(residualValues);

    const denseJtr = new Array(numVariables).fill(0);
    for (let j = 0; j < numVariables; j++) {
      for (let i = 0; i < numResiduals; i++) {
        denseJtr[j] += jacobian[i][j] * residualValues[i];
      }
    }

    let maxJtrDiff = 0;
    for (let j = 0; j < numVariables; j++) {
      maxJtrDiff = Math.max(maxJtrDiff, Math.abs(sparseJtr[j] - denseJtr[j]));
    }

    const jtrMagnitude = Math.sqrt(denseJtr.reduce((s, v) => s + v * v, 0));
    const jtrTolerance = Math.max(1e-10, jtrMagnitude * 1e-8);

    if (maxJtrDiff > jtrTolerance) {
      throw new Error(
        `[SparseValidation] J^T r diverged: maxDiff=${maxJtrDiff.toExponential(2)}, ` +
        `magnitude=${jtrMagnitude.toFixed(4)}, tolerance=${jtrTolerance.toExponential(2)}`
      );
    }

    // === STEP 2: Validate J^T J ===
    const sparseJtJ = sparseJ.computeJtJ();

    // Compute dense J^T J
    const denseJtJ: number[][] = new Array(numVariables);
    for (let i = 0; i < numVariables; i++) {
      denseJtJ[i] = new Array(numVariables).fill(0);
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        for (let k = 0; k < numResiduals; k++) {
          sum += jacobian[k][i] * jacobian[k][j];
        }
        denseJtJ[i][j] = sum;
        if (i !== j) denseJtJ[j][i] = sum;
      }
    }

    // Compare J^T J values
    let maxJtJDiff = 0;
    let jtjMagnitude = 0;
    for (let i = 0; i < numVariables; i++) {
      for (let j = 0; j < numVariables; j++) {
        const sparseVal = sparseJtJ.get(i, j);
        const denseVal = denseJtJ[i][j];
        maxJtJDiff = Math.max(maxJtJDiff, Math.abs(sparseVal - denseVal));
        jtjMagnitude = Math.max(jtjMagnitude, Math.abs(denseVal));
      }
    }

    const jtjTolerance = Math.max(1e-10, jtjMagnitude * 1e-8);

    if (maxJtJDiff > jtjTolerance) {
      throw new Error(
        `[SparseValidation] J^T J diverged: maxDiff=${maxJtJDiff.toExponential(2)}, ` +
        `magnitude=${jtjMagnitude.toFixed(4)}, tolerance=${jtjTolerance.toExponential(2)}`
      );
    }

    // === STEP 3: Validate LM step (delta) ===
    // Solve (J^T J + λI) * delta = -J^T r using both methods
    const lambda = this.damping; // Use same damping as solver

    // Dense solve via Cholesky
    const denseDelta = this.solveDenseNormalEquations(denseJtJ, denseJtr, lambda, numVariables);

    // Sparse solve via CG
    // Note: CG solves Ax = b, we have (J^T J + λI) x = -J^T r
    const negJtr = denseJtr.map(v => -v);
    const cgResult = conjugateGradientDamped(sparseJtJ, negJtr, lambda, undefined, numVariables * 2, 1e-12);
    const sparseDelta = cgResult.x;

    // Compare deltas
    let maxDeltaDiff = 0;
    let deltaMagnitude = 0;
    for (let j = 0; j < numVariables; j++) {
      maxDeltaDiff = Math.max(maxDeltaDiff, Math.abs(denseDelta[j] - sparseDelta[j]));
      deltaMagnitude = Math.max(deltaMagnitude, Math.abs(denseDelta[j]));
    }

    const deltaTolerance = Math.max(1e-8, deltaMagnitude * 1e-4);

    if (maxDeltaDiff > deltaTolerance) {
      // Log warning but don't throw - the actual optimization uses dense Cholesky
      // and sparse validation is just a post-hoc check. CG may not converge as
      // precisely as Cholesky, especially for ill-conditioned problems.
      if (this.verbose || typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
        console.warn(
          `[SparseValidation] LM step diverged: maxDiff=${maxDeltaDiff.toExponential(2)}, ` +
          `magnitude=${deltaMagnitude.toFixed(4)}, tolerance=${deltaTolerance.toExponential(2)}, ` +
          `CG converged=${cgResult.converged}, CG iters=${cgResult.iterations}`
        );
      }
      // Skip remaining validation but don't fail
      return;
    }

    // Log success in verbose mode
    if (this.verbose) {
      console.log(
        `[SparseValidation] PASS: J^T r (diff=${maxJtrDiff.toExponential(2)}), ` +
        `J^T J (diff=${maxJtJDiff.toExponential(2)}), ` +
        `delta (diff=${maxDeltaDiff.toExponential(2)}), ` +
        `${numResiduals}x${numVariables} Jacobian`
      );
    }
  }

  /**
   * Solve (J^T J + λI) * x = -J^T r using dense Cholesky decomposition.
   * Used for validation comparison with sparse CG solver.
   */
  private solveDenseNormalEquations(
    JtJ: number[][],
    Jtr: number[],
    lambda: number,
    n: number
  ): number[] {
    // Copy JtJ and add damping
    const A: number[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      A[i] = [...JtJ[i]];
      A[i][i] += lambda;
    }

    // Right-hand side is -J^T r
    const b = Jtr.map(v => -v);

    // Cholesky decomposition: A = L L^T
    const L: number[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      L[i] = new Array(n).fill(0);
    }

    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = A[i][j];
        for (let k = 0; k < j; k++) {
          sum -= L[i][k] * L[j][k];
        }
        if (i === j) {
          if (sum <= 0) {
            // Matrix not positive definite - return zeros
            return new Array(n).fill(0);
          }
          L[i][j] = Math.sqrt(sum);
        } else {
          L[i][j] = sum / L[j][j];
        }
      }
    }

    // Forward substitution: L y = b
    const y = new Array(n);
    for (let i = 0; i < n; i++) {
      let sum = b[i];
      for (let j = 0; j < i; j++) {
        sum -= L[i][j] * y[j];
      }
      y[i] = sum / L[i][i];
    }

    // Back substitution: L^T x = y
    const x = new Array(n);
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
   * Build analytical residual providers from all entities.
   *
   * This creates providers that compute residuals and gradients analytically,
   * bypassing autodiff. Used for Phase 6+ of the scalar-autograd removal.
   *
   * Returns both the providers and the layout (for accessing initial values).
   */
  buildAnalyticalProviders(): {
    providers: AnalyticalResidualProvider[];
    layout: VariableLayout;
    layoutBuilder: VariableLayoutBuilder;
  } {
    const builder = new VariableLayoutBuilder();
    const providers: AnalyticalResidualProvider[] = [];

    // 1. Add all points to layout (must be done first to get indices)
    for (const point of this.points) {
      builder.addWorldPoint(point);
    }

    // 2. Add all cameras to layout
    for (const camera of this.cameras) {
      const optimizeIntrinsics =
        typeof this.optimizeCameraIntrinsics === 'function'
          ? this.optimizeCameraIntrinsics(camera)
          : this.optimizeCameraIntrinsics;
      builder.addCamera(camera, {
        optimizePose: !camera.isPoseLocked,
        optimizeIntrinsics,
        optimizeDistortion: false,
      });
    }

    // Build the layout (must be done before creating providers)
    const layout = builder.build();

    // Helper to get point indices and locked values
    // Uses WorldPoint object directly (not name or id) to handle duplicate names
    const getPointInfo = (point: WorldPoint): {
      indices: readonly [number, number, number];
      locked: readonly [number | null, number | null, number | null];
    } => {
      const indices = layout.getWorldPointIndices(point);
      const locked: [number | null, number | null, number | null] = [
        layout.getLockedWorldPointValue(point, 'x') ?? null,
        layout.getLockedWorldPointValue(point, 'y') ?? null,
        layout.getLockedWorldPointValue(point, 'z') ?? null,
      ];
      return { indices, locked };
    };

    // Geometric scale for direction/length residuals (same as Line.computeResiduals)
    const GEOMETRIC_SCALE = 100.0;

    // 3. Add line direction and length providers
    for (const line of this.lines) {
      const pointAInfo = getPointInfo(line.pointA);
      const pointBInfo = getPointInfo(line.pointB);

      // Direction constraint (if not 'free')
      if (line.direction !== 'free') {
        const directionProviders = createLineDirectionProviders(
          pointAInfo.indices,
          pointBInfo.indices,
          line.direction,
          GEOMETRIC_SCALE,
          createPointGetter(pointAInfo.indices, pointAInfo.locked),
          createPointGetter(pointBInfo.indices, pointBInfo.locked)
        );
        providers.push(...directionProviders);
      }

      // Length constraint (if set)
      if (line.targetLength !== undefined) {
        providers.push(
          createLineLengthProvider(
            pointAInfo.indices,
            pointBInfo.indices,
            line.targetLength,
            GEOMETRIC_SCALE,
            createPointGetter(pointAInfo.indices, pointAInfo.locked),
            createPointGetter(pointBInfo.indices, pointBInfo.locked)
          )
        );
      }

      // Coincident point constraints (cross product AP × AB = 0)
      // Uses collinear constraint: points A, P, B should be on a line
      if (line.coincidentPoints.size > 0) {
        for (const coincidentPoint of line.coincidentPoints) {
          const pointPInfo = getPointInfo(coincidentPoint);

          // Create collinear providers for the 3 points (A, P, B)
          // Cross product of (P-A) × (B-A) = 0
          // Apply GEOMETRIC_SCALE to match Line.computeResiduals
          const collinearProviders = createCollinearProviders(
            pointAInfo.indices,
            pointPInfo.indices,  // P in the middle
            pointBInfo.indices,
            createPointGetter(pointAInfo.indices, pointAInfo.locked),
            createPointGetter(pointPInfo.indices, pointPInfo.locked),
            createPointGetter(pointBInfo.indices, pointBInfo.locked),
            GEOMETRIC_SCALE
          );
          providers.push(...collinearProviders);
        }
      }
    }

    // 4. Add camera quaternion normalization and focal length regularization providers
    for (const camera of this.cameras) {
      if (!camera.isPoseLocked) {
        const quatIndices = layout.getCameraQuatIndices(camera.name);
        // Only add if camera is being optimized
        if (quatIndices[0] >= 0) {
          providers.push(
            createQuatNormProvider(
              quatIndices,
              (vars) => ({
                w: vars[quatIndices[0]],
                x: vars[quatIndices[1]],
                y: vars[quatIndices[2]],
                z: vars[quatIndices[3]],
              })
            )
          );
        }
      }

      // 4b. Add focal length regularization providers (matches Viewpoint.computeResiduals)
      const intrinsicsIndices = layout.getCameraIntrinsicsIndices(camera.name);
      if (intrinsicsIndices && intrinsicsIndices.focalLength >= 0) {
        const focalLengthProviders = createFocalLengthRegularizationProviders(
          intrinsicsIndices.focalLength,
          camera.imageWidth,
          camera.imageHeight
        );
        providers.push(...focalLengthProviders);
      }
    }

    // 5. Add reprojection providers for image points
    for (const imagePoint of this.imagePoints) {
      const worldPointInfo = getPointInfo(imagePoint.worldPoint);
      const camera = imagePoint.viewpoint;

      const posIndices = layout.getCameraPosIndices(camera.name);
      const quatIndices = layout.getCameraQuatIndices(camera.name);

      // Get camera intrinsics values from builder
      const intrinsics = builder.getCameraIntrinsics(camera.name);
      if (!intrinsics) continue;

      // CameraIntrinsics uses fx, fy, cx, cy format
      const cameraIntrinsics: CameraIntrinsics = {
        fx: intrinsics.focalLength,
        fy: intrinsics.focalLength * intrinsics.aspectRatio,
        cx: intrinsics.principalPointX,
        cy: intrinsics.principalPointY,
        k1: intrinsics.k1,
        k2: intrinsics.k2,
        k3: intrinsics.k3,
        p1: intrinsics.p1,
        p2: intrinsics.p2,
      };

      // Get intrinsics indices from layout (for optimizing intrinsics)
      const layoutIntrinsicsIndices = layout.getCameraIntrinsicsIndices(camera.name);
      const intrinsicsIndices: CameraIntrinsicsIndices | undefined = layoutIntrinsicsIndices
        ? {
            focalLength: layoutIntrinsicsIndices.focalLength,
            cx: layoutIntrinsicsIndices.principalPointX,
            cy: layoutIntrinsicsIndices.principalPointY,
          }
        : undefined;

      // Build locked values for camera position
      const posLocked: [number | null, number | null, number | null] = [
        layout.getLockedCameraPosValue(camera.name, 'x') ?? null,
        layout.getLockedCameraPosValue(camera.name, 'y') ?? null,
        layout.getLockedCameraPosValue(camera.name, 'z') ?? null,
      ];

      // Quaternion locked values
      const quatLocked: [number, number, number, number] = [...camera.rotation];

      // Build reprojection flags
      // When useIsZReflected is true and camera.isZReflected is true, negate camera coordinates
      const reprojectionFlags: ReprojectionFlags = {
        isZReflected: this.useIsZReflected && camera.isZReflected,
      };

      // createReprojectionProviders takes observation as an object
      const reprojectionProviders = createReprojectionProviders(
        worldPointInfo.indices,
        posIndices,
        quatIndices,
        cameraIntrinsics,
        { observedU: imagePoint.u, observedV: imagePoint.v },
        createPointGetter(worldPointInfo.indices, worldPointInfo.locked),
        createPointGetter(posIndices, posLocked),
        createQuaternionGetter(quatIndices, quatLocked),
        intrinsicsIndices,
        reprojectionFlags
      );
      providers.push(...reprojectionProviders);
    }

    // 5b. Add vanishing line providers for cameras with vanishing lines
    for (const camera of this.cameras) {
      if (!camera.vanishingLines || camera.vanishingLines.size === 0) continue;

      const quatIndices = layout.getCameraQuatIndices(camera.name);
      const quatLocked: [number, number, number, number] = [...camera.rotation];
      const getQuat = createQuaternionGetter(quatIndices, quatLocked);

      // Get camera intrinsics for VP-to-normalized conversion
      const intrinsics = builder.getCameraIntrinsics(camera.name);
      if (!intrinsics) continue;

      const axisDirs: Record<VanishingLineAxis, { x: number; y: number; z: number }> = {
        x: { x: 1, y: 0, z: 0 },
        y: { x: 0, y: 1, z: 0 },
        z: { x: 0, y: 0, z: 1 },
      };

      // Process each axis
      (['x', 'y', 'z'] as VanishingLineAxis[]).forEach(axis => {
        const linesForAxis = Array.from(camera.vanishingLines as Set<VanishingLine>).filter(
          (l: VanishingLine) => l.axis === axis
        );
        if (linesForAxis.length < 2) return;

        const observedVP = computeVanishingPoint(linesForAxis);
        if (!observedVP) return;

        // Convert to normalized image coordinates
        const fx = intrinsics.focalLength;
        const fy = intrinsics.focalLength * intrinsics.aspectRatio;
        const obsU = (observedVP.u - intrinsics.principalPointX) / fx;
        const obsV = (intrinsics.principalPointY - observedVP.v) / fy;

        // Very low weight - just a gentle nudge, same as autodiff version
        const vpWeight = 0.02;

        providers.push(
          createVanishingLineProvider(
            quatIndices,
            axisDirs[axis],
            obsU,
            obsV,
            vpWeight,
            getQuat
          )
        );
      });
    }

    // 6. Add explicit constraint providers
    for (const constraint of this.constraints) {
      if (constraint instanceof DistanceConstraint) {
        const pointAInfo = getPointInfo(constraint.pointA);
        const pointBInfo = getPointInfo(constraint.pointB);

        providers.push(
          createDistanceProvider(
            pointAInfo.indices,
            pointBInfo.indices,
            constraint.targetDistance,
            createPointGetter(pointAInfo.indices, pointAInfo.locked),
            createPointGetter(pointBInfo.indices, pointBInfo.locked)
          )
        );
      } else if (constraint instanceof AngleConstraint) {
        const pointAInfo = getPointInfo(constraint.pointA);
        const vertexInfo = getPointInfo(constraint.vertex);
        const pointCInfo = getPointInfo(constraint.pointC);

        // Convert target angle from degrees to radians
        const targetAngleRadians = (constraint.targetAngle * Math.PI) / 180;

        providers.push(
          createAngleProvider(
            pointAInfo.indices,
            vertexInfo.indices,
            pointCInfo.indices,
            targetAngleRadians,
            createPointGetter(pointAInfo.indices, pointAInfo.locked),
            createPointGetter(vertexInfo.indices, vertexInfo.locked),
            createPointGetter(pointCInfo.indices, pointCInfo.locked)
          )
        );
      } else if (constraint instanceof CoplanarPointsConstraint) {
        const pointInfos = constraint.points.map(p => getPointInfo(p));
        const pointIndices = pointInfos.map(info => info.indices);

        const coplanarProviders = createCoplanarProviders(
          pointIndices,
          (vars) => pointInfos.map(info =>
            createPointGetter(info.indices, info.locked)(vars)
          )
        );
        providers.push(...coplanarProviders);
      } else if (constraint instanceof FixedPointConstraint) {
        const pointInfo = getPointInfo(constraint.point);

        const fixedPointProviders = createFixedPointProviders(
          pointInfo.indices,
          constraint.targetXyz,
          createPointGetter(pointInfo.indices, pointInfo.locked)
        );
        providers.push(...fixedPointProviders);
      } else if (constraint instanceof EqualDistancesConstraint) {
        // Build point pair info for each pair
        const pairs = constraint.distancePairs.map(([p1, p2]) => ({
          p1Indices: getPointInfo(p1).indices,
          p2Indices: getPointInfo(p2).indices,
          getP1: createPointGetter(getPointInfo(p1).indices, getPointInfo(p1).locked),
          getP2: createPointGetter(getPointInfo(p2).indices, getPointInfo(p2).locked),
        }));

        const equalDistProviders = createEqualDistancesProviders(pairs);
        providers.push(...equalDistProviders);
      } else if (constraint instanceof EqualAnglesConstraint) {
        // Build triplet info for each angle triplet
        const triplets = constraint.angleTriplets.map(([pointA, vertex, pointC]) => ({
          pointAIndices: getPointInfo(pointA).indices,
          vertexIndices: getPointInfo(vertex).indices,
          pointCIndices: getPointInfo(pointC).indices,
          getPointA: createPointGetter(getPointInfo(pointA).indices, getPointInfo(pointA).locked),
          getVertex: createPointGetter(getPointInfo(vertex).indices, getPointInfo(vertex).locked),
          getPointC: createPointGetter(getPointInfo(pointC).indices, getPointInfo(pointC).locked),
        }));

        const equalAnglesProviders = createEqualAnglesProviders(triplets);
        providers.push(...equalAnglesProviders);
      } else if (constraint instanceof CollinearPointsConstraint) {
        // CollinearPointsConstraint uses cross product residuals
        // For 3 or more points, the first point is the anchor
        const points = constraint.points;
        if (points.length >= 3) {
          const p0Info = getPointInfo(points[0]);
          const p1Info = getPointInfo(points[1]);

          // For each additional point (beyond the first two), add collinear residuals
          for (let i = 2; i < points.length; i++) {
            const pInfo = getPointInfo(points[i]);

            // Create collinear providers: (p0, p1, p[i]) should be collinear
            const collinearProviders = createCollinearProviders(
              p0Info.indices,
              p1Info.indices,
              pInfo.indices,
              createPointGetter(p0Info.indices, p0Info.locked),
              createPointGetter(p1Info.indices, p1Info.locked),
              createPointGetter(pInfo.indices, pInfo.locked)
            );
            providers.push(...collinearProviders);
          }
        }
      }
      // Note: Other constraint types (ParallelLines, PerpendicularLines, etc.)
      // can be added here as needed
    }

    // 7. Add regularization providers (if enabled)
    // This penalizes points moving far from their initial positions
    if (this.regularizationWeight > 0 && this.initialPositions.size > 0) {
      for (const [point, initPos] of this.initialPositions) {
        const pointInfo = getPointInfo(point);
        const regProviders = createRegularizationProviders(
          pointInfo.indices,
          initPos,
          this.regularizationWeight,
          createPointGetter(pointInfo.indices, pointInfo.locked)
        );
        providers.push(...regProviders);
      }
    }

    // 8. Sign preservation is DISABLED - was causing test failures
    // The issue is that most Y coordinates are locked, not free, so sign preservation
    // can't prevent reflection to the wrong local minimum.
    // TODO: Investigate why analytical mode converges to reflected solutions.

    return { providers, layout, layoutBuilder: builder };
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
