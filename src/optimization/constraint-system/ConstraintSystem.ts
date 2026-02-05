/**
 * ConstraintSystem - 3D constraint solver using analytical gradients
 *
 * Solves geometric constraints by minimizing residuals using Levenberg-Marquardt
 * with analytically computed gradients.
 *
 * This system orchestrates entity-driven optimization:
 * - VariableLayoutBuilder collects entities and builds variable indices
 * - Analytical providers compute residuals and gradients directly
 * - Solver uses sparse conjugate gradient for efficiency
 */

import { transparentLM } from '../autodiff-dense-lm';
import type { IOptimizableCamera } from '../IOptimizable';
import type { WorldPoint } from '../../entities/world-point/WorldPoint';
import { Line } from '../../entities/line/Line';
import type { ImagePoint } from '../../entities/imagePoint/ImagePoint';
import { Constraint } from '../../entities/constraints/base-constraint';
import type { VanishingLine, VanishingLineAxis } from '../../entities/vanishing-line';
import { computeVanishingPoint } from '../vanishing-points';
import type { SolverResult, SolverOptions } from './types';

// Analytical providers
import type { AnalyticalResidualProvider, VariableLayout, ResidualOwner } from '../analytical/types';
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
   * Distribute residuals from providers to their owning entities.
   * Each provider knows which entity it belongs to (via owner field)
   * and which residual index within that entity's lastResiduals array.
   *
   * @param providers - The analytical providers with owner info
   * @param variables - The final variable values after solve
   */
  private distributeResiduals(
    providers: AnalyticalResidualProvider[],
    variables: Float64Array
  ): void {
    // Group residuals by owner entity
    const entityResiduals = new Map<unknown, { maxIndex: number; values: Map<number, number> }>();

    for (const provider of providers) {
      if (!provider.owner) continue;

      const { entity, residualIndex } = provider.owner;
      const residualValue = provider.computeResidual(variables);

      if (!entityResiduals.has(entity)) {
        entityResiduals.set(entity, { maxIndex: -1, values: new Map() });
      }

      const entry = entityResiduals.get(entity)!;
      entry.values.set(residualIndex, residualValue);
      entry.maxIndex = Math.max(entry.maxIndex, residualIndex);
    }

    // Assign residuals to each entity's lastResiduals array
    for (const [entity, { maxIndex, values }] of entityResiduals) {
      const residualsArray = new Array<number>(maxIndex + 1).fill(0);
      for (const [idx, val] of values) {
        residualsArray[idx] = val;
      }

      // Set lastResiduals on the entity (Line, Constraint, or ImagePoint)
      if ('lastResiduals' in (entity as object)) {
        (entity as { lastResiduals: number[] }).lastResiduals = residualsArray;
      }
    }
  }

  /**
   * Solve all constraints in the system.
   * Updates point positions to satisfy constraints.
   *
   * Entity-driven approach:
   * 1. Points add themselves to ValueMap (per-axis locking)
   * 2. Analytical providers compute residuals and gradients
   * 3. Solver optimizes all variables using Levenberg-Marquardt
   * 4. Points extract optimized values
   * 5. Residuals are distributed back to entities from provider results
   */
  solve(): SolverResult {
    return this.solveWithAutodiff();
  }

  /**
   * Solve using analytical gradients (scalar-autograd removed in Phase 5).
   */
  private solveWithAutodiff(): SolverResult {
    // Capture initial positions for regularization BEFORE building layout
    this.initialPositions.clear();
    if (this.regularizationWeight > 0) {
      for (const point of this.points) {
        if (point.optimizedXyz && !point.isFullyConstrained()) {
          this.initialPositions.set(point, [...point.optimizedXyz] as [number, number, number]);
        }
      }
    }

    try {
      // Build analytical providers and layout (determines variable count)
      const { providers, layout } = this.buildAnalyticalProviders();
      const numVariables = layout.numVariables;

      if (this.verbose) {
        console.log(`[ConstraintSystem] Variables: ${numVariables} total from layout`);
      }

      // If no variables to optimize, check if constraints are satisfied using analytical providers
      if (numVariables === 0) {
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

        // Apply optimization results to set optimizedXyz for fully-locked points
        // Since all points are fully constrained, use their effective (locked/inferred) values directly
        for (const point of this.points) {
          const effective = point.getEffectiveXyz();
          if (effective[0] !== null && effective[1] !== null && effective[2] !== null) {
            point.applyOptimizationResult({
              xyz: [effective[0], effective[1], effective[2]] as [number, number, number]
            });
          }
        }

        return {
          converged: isReasonable,
          iterations: 0,
          residual: residualMagnitude,
          error: isReasonable ? null : 'Over-constrained (no free variables)',
        };
      }

      // Solve using Levenberg-Marquardt with analytical gradients and sparse CG
      // Use gradientTolerance for early stopping when progress stalls.
      // This helps with weakly-constrained points (e.g., single-view coplanar)
      // where the cost decreases very slowly but the solution is already good.

      // Collect quaternion indices from all cameras for renormalization
      const quaternionIndices: Array<readonly [number, number, number, number]> = [];
      for (const camera of this.cameras) {
        if (!camera.isPoseLocked) {
          const quatIndices = layout.getCameraQuatIndices(camera.name);
          quaternionIndices.push(quatIndices);
        }
      }

      if (this.verbose) {
        console.log(`[ConstraintSystem] Built ${providers.length} analytical providers, ${numVariables} variables`);
      }

      const result = transparentLM(layout.initialValues, null, {
        costTolerance: this.tolerance,
        gradientTolerance: this.tolerance * 10, // Stop when gradient is small
        maxIterations: this.maxIterations,
        initialDamping: this.damping,
        adaptiveDamping: true,
        verbose: this.verbose,
        useSparseLinearSolve: true,  // Always use sparse CG
        analyticalProviders: providers,
        useAnalyticalSolve: true,    // Always use analytical gradients
        // Pass quaternion indices for explicit renormalization after each step.
        // This prevents numerical drift from causing quaternion magnitude to diverge
        // from 1.0, which can lead to convergence to reflected local minima.
        quaternionIndices: quaternionIndices.length > 0 ? quaternionIndices : undefined,
      });

      // Get final variables from solver result
      const finalVariables = new Float64Array(result.variableValues);

      // Update points with solved values (using Phase 4 variable-based approach)
      for (const point of this.points) {
        point.applyOptimizationResultFromVariables(
          finalVariables,
          () => layout.getWorldPointIndices(point),
          (axis) => layout.getLockedWorldPointValue(point, axis)
        );
      }

      // Update cameras with solved values (using Phase 4 variable-based approach)
      for (const camera of this.cameras) {
        if ('applyOptimizationResultFromVariables' in camera && typeof camera.applyOptimizationResultFromVariables === 'function') {
          const posIndices = layout.getCameraPosIndices(camera.name);
          const quatIndices = layout.getCameraQuatIndices(camera.name);
          const intrinsicsIndices = layout.getCameraIntrinsicsIndices(camera.name);
          const intrinsicsValues = layout.getCameraIntrinsicsValues(camera.name);
          camera.applyOptimizationResultFromVariables(
            finalVariables,
            posIndices,
            quatIndices,
            intrinsicsIndices,
            intrinsicsValues
          );
        }
      }

      // Update image points with reprojected positions (using entity properties, no autodiff)
      for (const imagePoint of this.imagePoints) {
        imagePoint.computeReprojectedPositionFromEntities(this.useIsZReflected);
      }

      // Distribute residuals from analytical providers to entities
      // This replaces the old computeResiduals calls on lines, constraints, and image points
      this.distributeResiduals(providers, finalVariables);

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

    // Helper to add owner info to providers
    const addOwner = (
      provider: AnalyticalResidualProvider,
      entity: unknown,
      residualIndex: number
    ): AnalyticalResidualProvider => {
      (provider as { owner?: ResidualOwner }).owner = { entity, residualIndex };
      return provider;
    };

    // 3. Add line direction and length providers
    for (const line of this.lines) {
      const pointAInfo = getPointInfo(line.pointA);
      const pointBInfo = getPointInfo(line.pointB);
      let lineResidualIndex = 0;

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
        for (const p of directionProviders) {
          providers.push(addOwner(p, line, lineResidualIndex++));
        }
      }

      // Length constraint (if set)
      if (line.targetLength !== undefined) {
        const lengthProvider = createLineLengthProvider(
          pointAInfo.indices,
          pointBInfo.indices,
          line.targetLength,
          GEOMETRIC_SCALE,
          createPointGetter(pointAInfo.indices, pointAInfo.locked),
          createPointGetter(pointBInfo.indices, pointBInfo.locked)
        );
        providers.push(addOwner(lengthProvider, line, lineResidualIndex++));
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
          for (const p of collinearProviders) {
            providers.push(addOwner(p, line, lineResidualIndex++));
          }
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
      // Returns 2 providers: [u residual, v residual]
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
      // ImagePoint residuals: [du, dv] at indices 0, 1
      for (let i = 0; i < reprojectionProviders.length; i++) {
        providers.push(addOwner(reprojectionProviders[i], imagePoint, i));
      }
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
      let constraintResidualIndex = 0;

      if (constraint instanceof DistanceConstraint) {
        const pointAInfo = getPointInfo(constraint.pointA);
        const pointBInfo = getPointInfo(constraint.pointB);

        const distProvider = createDistanceProvider(
          pointAInfo.indices,
          pointBInfo.indices,
          constraint.targetDistance,
          createPointGetter(pointAInfo.indices, pointAInfo.locked),
          createPointGetter(pointBInfo.indices, pointBInfo.locked)
        );
        providers.push(addOwner(distProvider, constraint, constraintResidualIndex++));
      } else if (constraint instanceof AngleConstraint) {
        const pointAInfo = getPointInfo(constraint.pointA);
        const vertexInfo = getPointInfo(constraint.vertex);
        const pointCInfo = getPointInfo(constraint.pointC);

        // Convert target angle from degrees to radians
        const targetAngleRadians = (constraint.targetAngle * Math.PI) / 180;

        const angleProvider = createAngleProvider(
          pointAInfo.indices,
          vertexInfo.indices,
          pointCInfo.indices,
          targetAngleRadians,
          createPointGetter(pointAInfo.indices, pointAInfo.locked),
          createPointGetter(vertexInfo.indices, vertexInfo.locked),
          createPointGetter(pointCInfo.indices, pointCInfo.locked)
        );
        providers.push(addOwner(angleProvider, constraint, constraintResidualIndex++));
      } else if (constraint instanceof CoplanarPointsConstraint) {
        const pointInfos = constraint.points.map(p => getPointInfo(p));
        const pointIndices = pointInfos.map(info => info.indices);

        const coplanarProviders = createCoplanarProviders(
          pointIndices,
          (vars) => pointInfos.map(info =>
            createPointGetter(info.indices, info.locked)(vars)
          )
        );
        for (const p of coplanarProviders) {
          providers.push(addOwner(p, constraint, constraintResidualIndex++));
        }
      } else if (constraint instanceof FixedPointConstraint) {
        const pointInfo = getPointInfo(constraint.point);

        const fixedPointProviders = createFixedPointProviders(
          pointInfo.indices,
          constraint.targetXyz,
          createPointGetter(pointInfo.indices, pointInfo.locked)
        );
        for (const p of fixedPointProviders) {
          providers.push(addOwner(p, constraint, constraintResidualIndex++));
        }
      } else if (constraint instanceof EqualDistancesConstraint) {
        // Build point pair info for each pair
        const pairs = constraint.distancePairs.map(([p1, p2]) => ({
          p1Indices: getPointInfo(p1).indices,
          p2Indices: getPointInfo(p2).indices,
          getP1: createPointGetter(getPointInfo(p1).indices, getPointInfo(p1).locked),
          getP2: createPointGetter(getPointInfo(p2).indices, getPointInfo(p2).locked),
        }));

        const equalDistProviders = createEqualDistancesProviders(pairs);
        for (const p of equalDistProviders) {
          providers.push(addOwner(p, constraint, constraintResidualIndex++));
        }
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
        for (const p of equalAnglesProviders) {
          providers.push(addOwner(p, constraint, constraintResidualIndex++));
        }
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
            for (const p of collinearProviders) {
              providers.push(addOwner(p, constraint, constraintResidualIndex++));
            }
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
