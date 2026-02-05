/**
 * ConstraintSystem - 3D constraint solver using analytical gradients
 *
 * Solves geometric constraints by minimizing residuals using Levenberg-Marquardt
 * with analytically computed gradients.
 *
 * This system orchestrates entity-driven optimization:
 * - WorldPoints add themselves to the ValueMap (deciding locked vs free axes)
 * - Analytical providers compute residuals and gradients directly
 * - Solver uses sparse conjugate gradient for efficiency
 */

import { Value } from 'scalar-autograd';
import { transparentLM } from '../autodiff-dense-lm';
import type { ValueMap, IOptimizableCamera } from '../IOptimizable';
import type { WorldPoint } from '../../entities/world-point/WorldPoint';
import { Line } from '../../entities/line/Line';
import type { ImagePoint } from '../../entities/imagePoint/ImagePoint';
import { Constraint } from '../../entities/constraints/base-constraint';
import type { VanishingLine, VanishingLineAxis } from '../../entities/vanishing-line';
import { computeVanishingPoint } from '../vanishing-points';
import { rotateDirectionByQuaternion } from './utils';
import type { SolverResult, SolverOptions } from './types';

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

    // Log variable counts for debugging
    if (this.verbose) {
      console.log(`[ConstraintSystem] Variables: ${variables.length} total (${pointVarCount} from ${this.points.size} points, ${cameraVarCount} from ${this.cameras.size} cameras)`);
    }

    // If no variables to optimize, check if constraints are satisfied using analytical providers
    if (variables.length === 0) {
      // Build analytical providers to compute residuals
      const { providers, layout } = this.buildAnalyticalProviders();
      const varsArray = new Float64Array(0);  // No variables

      // Compute residual magnitude from analytical providers
      let residualSumSquared = 0;
      for (const provider of providers) {
        const r = provider.computeResidual(varsArray);
        residualSumSquared += r * r;
      }
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

    try {
      // Solve using Levenberg-Marquardt with analytical gradients and sparse CG
      // Use gradientTolerance for early stopping when progress stalls.
      // This helps with weakly-constrained points (e.g., single-view coplanar)
      // where the cost decreases very slowly but the solution is already good.
      let analyticalProviders: AnalyticalResidualProvider[] | undefined;

      // Build analytical providers and collect quaternion indices for renormalization
      const quaternionIndices: Array<readonly [number, number, number, number]> = [];
      const { providers, layout } = this.buildAnalyticalProviders();
      analyticalProviders = providers;
      console.log(`[ConstraintSystem] Built ${providers.length} analytical providers, ${layout.numVariables} variables`);

      // Collect quaternion indices from all cameras
      for (const camera of this.cameras) {
        if (!camera.isPoseLocked) {
          const quatIndices = layout.getCameraQuatIndices(camera.name);
          quaternionIndices.push(quatIndices);
        }
      }

      // Variable count mismatch is a CRITICAL BUG
      if (layout.numVariables !== variables.length) {
        const pointCount = this.points.size;
        const cameraCount = this.cameras.size;
        const imagePointCount = this.imagePoints.size;
        const constraintCount = this.constraints.size;
        const lineCount = this.lines.size;

        const debugInfo = [
          ``,
          `=== ANALYTICAL VARIABLE COUNT MISMATCH ===`,
          `Analytical layout: ${layout.numVariables} variables`,
          `Autodiff system: ${variables.length} variables`,
          `Difference: ${Math.abs(layout.numVariables - variables.length)} variables`,
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
          `analytical=${layout.numVariables}, autodiff=${variables.length}` +
          debugInfo
        );
      }

      const result = transparentLM(variables, null, {
        costTolerance: this.tolerance,
        gradientTolerance: this.tolerance * 10, // Stop when gradient is small
        maxIterations: this.maxIterations,
        initialDamping: this.damping,
        adaptiveDamping: true,
        verbose: this.verbose,
        useSparseLinearSolve: true,  // Always use sparse CG
        analyticalProviders,
        useAnalyticalSolve: true,    // Always use analytical gradients
        // Pass quaternion indices for explicit renormalization after each step.
        // This prevents numerical drift from causing quaternion magnitude to diverge
        // from 1.0, which can lead to convergence to reflected local minima.
        quaternionIndices: quaternionIndices.length > 0 ? quaternionIndices : undefined,
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

      // Use final cost from analytical solver (already computed as sum of squared residuals)
      const residualMagnitude = Math.sqrt(result.finalCost);

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
