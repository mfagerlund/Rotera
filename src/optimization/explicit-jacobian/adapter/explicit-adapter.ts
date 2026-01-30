/**
 * Explicit Jacobian Adapter
 *
 * Bridges the entity-based constraint system to the explicit Jacobian
 * optimization system. Converts entities and constraints to providers,
 * runs optimization, and applies results back to entities.
 */

import type { WorldPoint } from '../../../entities/world-point/WorldPoint';
import type { Line } from '../../../entities/line/Line';
import type { DistanceConstraint } from '../../../entities/constraints/distance-constraint';
import type { AngleConstraint } from '../../../entities/constraints/angle-constraint';
import type { CollinearPointsConstraint } from '../../../entities/constraints/collinear-points-constraint';
import type { CoplanarPointsConstraint } from '../../../entities/constraints/coplanar-points-constraint';
import type { FixedPointConstraint } from '../../../entities/constraints/fixed-point-constraint';
import type { ParallelLinesConstraint } from '../../../entities/constraints/parallel-lines-constraint';
import type { PerpendicularLinesConstraint } from '../../../entities/constraints/perpendicular-lines-constraint';
import type { EqualDistancesConstraint } from '../../../entities/constraints/equal-distances-constraint';
import type { EqualAnglesConstraint } from '../../../entities/constraints/equal-angles-constraint';
import type { IOptimizableCamera } from '../../IOptimizable';
import type { ImagePoint } from '../../../entities/imagePoint/ImagePoint';
import type { ResidualWithJacobian, LMResult } from '../types';
import { VariableLayout, type CameraIndices } from './variable-layout';
import { ProviderFactory } from './provider-factory';
import { ExplicitJacobianSystemImpl } from '../ExplicitJacobianSystem';
import { solveDenseLM } from '../dense-lm';
import { solveSparseLM } from '../../sparse/sparse-lm';
import { getSolverBackend } from '../../solver-config';

/** Options for the explicit optimization */
export interface ExplicitOptimizationOptions {
  /** Maximum iterations */
  maxIterations?: number;
  /** Cost tolerance for convergence */
  tolerance?: number;
  /** Optimize camera poses */
  optimizePose?: boolean;
  /** Optimize camera intrinsics (not fully supported yet) */
  optimizeIntrinsics?: boolean;
  /** Regularization weight (0 = none) */
  regularizationWeight?: number;
  /** Print debug info */
  verbose?: boolean;
}

/** Result of explicit optimization */
export interface ExplicitOptimizationResult {
  /** Whether optimization converged */
  converged: boolean;
  /** Number of iterations */
  iterations: number;
  /** Final cost (sum of squared residuals) */
  finalCost: number;
  /** Initial cost */
  initialCost: number;
  /** Solver used */
  solver: 'dense' | 'sparse';
}

/**
 * Run explicit Jacobian optimization on entity constraints.
 *
 * This is an alternative to the autodiff-based ConstraintSystem.solve().
 * Currently supports:
 * - World point position optimization
 * - Camera pose optimization (position + orientation)
 * - Line direction, length, and coincident point constraints
 * - Distance, angle, collinear, and coplanar constraints
 * - Fixed point, parallel lines, perpendicular lines constraints
 * - Equal distances and equal angles constraints
 * - Reprojection residuals
 *
 * Does NOT yet support:
 * - Camera intrinsic optimization (focal length, distortion)
 * - Vanishing point/line constraints
 */
export function solveWithExplicitJacobian(
  points: WorldPoint[],
  lines: Line[],
  cameras: IOptimizableCamera[],
  imagePoints: ImagePoint[],
  distanceConstraints: DistanceConstraint[],
  angleConstraints: AngleConstraint[],
  collinearConstraints: CollinearPointsConstraint[],
  coplanarConstraints: CoplanarPointsConstraint[],
  fixedPointConstraints: FixedPointConstraint[] = [],
  parallelLinesConstraints: ParallelLinesConstraint[] = [],
  perpendicularLinesConstraints: PerpendicularLinesConstraint[] = [],
  equalDistancesConstraints: EqualDistancesConstraint[] = [],
  equalAnglesConstraints: EqualAnglesConstraint[] = [],
  options: ExplicitOptimizationOptions = {}
): ExplicitOptimizationResult {
  const {
    maxIterations = 500,
    tolerance = 1e-8,
    optimizePose = true,
    optimizeIntrinsics = false,
    regularizationWeight = 0,
    verbose = false,
  } = options;

  // Build variable layout
  const layout = new VariableLayout();

  // Add world points
  for (const point of points) {
    layout.addWorldPoint(point);
  }

  // Add cameras - use object reference as Map key for reliable matching
  const cameraData = new Map<IOptimizableCamera, { camera: IOptimizableCamera; indices: CameraIndices }>();
  for (const camera of cameras) {
    const indices = layout.addCamera(camera, { optimizePose, optimizeIntrinsics });
    cameraData.set(camera, { camera, indices });
  }

  // Store initial positions for regularization
  const initialPositions = new Map<WorldPoint, [number, number, number]>();
  if (regularizationWeight > 0) {
    for (const point of points) {
      const xyz = point.getEffectiveXyz();
      const optimized = point.optimizedXyz;
      initialPositions.set(point, [
        optimized?.[0] ?? xyz[0] ?? 0,
        optimized?.[1] ?? xyz[1] ?? 0,
        optimized?.[2] ?? xyz[2] ?? 0,
      ]);
    }
  }

  // Create providers
  const factory = new ProviderFactory(layout);
  const providers: ResidualWithJacobian[] = [];

  // Line constraints
  for (const line of lines) {
    providers.push(...factory.createLineProviders(line));
  }

  // Camera quaternion normalization
  for (const camera of cameras) {
    const quatProvider = factory.createQuatNormProvider(camera);
    if (quatProvider) {
      providers.push(quatProvider);
    }
  }

  // Vanishing line constraints
  for (const camera of cameras) {
    const camData = cameraData.get(camera);
    if (camData) {
      providers.push(...factory.createVanishingLineProviders(camera, camData.indices, optimizeIntrinsics));
    }
  }

  // Reprojection residuals
  const imagePointsByWorldPoint = new Map<WorldPoint, ImagePoint[]>();
  for (const ip of imagePoints) {
    const worldPoint = ip.worldPoint;
    if (!imagePointsByWorldPoint.has(worldPoint)) {
      imagePointsByWorldPoint.set(worldPoint, []);
    }
    imagePointsByWorldPoint.get(worldPoint)!.push(ip);
  }

  for (const point of points) {
    const pointImagePoints = imagePointsByWorldPoint.get(point) || [];
    providers.push(...factory.createReprojectionProviders(point, pointImagePoints, cameraData, optimizeIntrinsics));
  }

  // Distance constraints
  for (const constraint of distanceConstraints) {
    providers.push(factory.createDistanceProvider(constraint));
  }

  // Angle constraints
  for (const constraint of angleConstraints) {
    providers.push(factory.createAngleProvider(constraint));
  }

  // Collinear constraints
  for (const constraint of collinearConstraints) {
    providers.push(...factory.createCollinearProvider(constraint));
  }

  // Coplanar constraints
  for (const constraint of coplanarConstraints) {
    providers.push(...factory.createCoplanarProvider(constraint));
  }

  // Fixed point constraints
  for (const constraint of fixedPointConstraints) {
    providers.push(factory.createFixedPointConstraintProvider(constraint));
  }

  // Parallel lines constraints
  for (const constraint of parallelLinesConstraints) {
    providers.push(factory.createParallelLinesProvider(constraint));
  }

  // Perpendicular lines constraints
  for (const constraint of perpendicularLinesConstraints) {
    providers.push(factory.createPerpendicularLinesProvider(constraint));
  }

  // Equal distances constraints
  for (const constraint of equalDistancesConstraints) {
    const provider = factory.createEqualDistancesProvider(constraint);
    if (provider) providers.push(provider);
  }

  // Equal angles constraints
  for (const constraint of equalAnglesConstraints) {
    const provider = factory.createEqualAnglesProvider(constraint);
    if (provider) providers.push(provider);
  }

  // Regularization
  if (regularizationWeight > 0) {
    for (const [point, initPos] of initialPositions) {
      const regProvider = factory.createFixedPointProvider(point, initPos, regularizationWeight);
      if (regProvider) {
        providers.push(regProvider);
      }
    }
  }

  if (verbose) {
    console.log(`[ExplicitJacobian] Variables: ${layout.variableCount}, Providers: ${providers.length}`);
  }

  // Build system
  const system = new ExplicitJacobianSystemImpl([...layout.initialValues]);
  for (const provider of providers) {
    system.addResidualProvider(provider);
  }

  // Solve
  const backend = getSolverBackend();
  let result: LMResult;
  let solverUsed: 'dense' | 'sparse';

  if (backend === 'explicit-sparse') {
    result = solveSparseLM(system, { maxIterations, tolerance, verbose });
    solverUsed = 'sparse';
  } else {
    // Default to dense for 'explicit-dense' or 'autodiff' (when called directly)
    result = solveDenseLM(system, { maxIterations, tolerance, verbose });
    solverUsed = 'dense';
  }

  if (verbose) {
    console.log(`[ExplicitJacobian] Converged: ${result.converged}, Iterations: ${result.iterations}`);
    console.log(`[ExplicitJacobian] Cost: ${result.initialCost.toFixed(4)} -> ${result.finalCost.toFixed(4)}`);
  }

  // Apply results back to entities
  const optimizedVars = system.variables;

  // Apply to world points
  for (const point of points) {
    const indices = layout.getPointIndices(point);
    if (!indices) continue;

    const xyz = point.getEffectiveXyz();
    point.optimizedXyz = [
      indices.x >= 0 ? optimizedVars[indices.x] : xyz[0] ?? 0,
      indices.y >= 0 ? optimizedVars[indices.y] : xyz[1] ?? 0,
      indices.z >= 0 ? optimizedVars[indices.z] : xyz[2] ?? 0,
    ];
  }

  // Apply to cameras
  for (const camera of cameras) {
    const indices = layout.getCameraIndices(camera);
    if (!indices) continue;

    if (indices.position.x >= 0) {
      camera.position = [
        optimizedVars[indices.position.x],
        optimizedVars[indices.position.y],
        optimizedVars[indices.position.z],
      ];
    }

    if (indices.quaternion.w >= 0) {
      // Normalize quaternion
      const w = optimizedVars[indices.quaternion.w];
      const x = optimizedVars[indices.quaternion.x];
      const y = optimizedVars[indices.quaternion.y];
      const z = optimizedVars[indices.quaternion.z];
      const norm = Math.sqrt(w * w + x * x + y * y + z * z);

      camera.rotation = [w / norm, x / norm, y / norm, z / norm];
    }

    if (indices.focalLength >= 0) {
      camera.focalLength = optimizedVars[indices.focalLength];
    }
  }

  return {
    converged: result.converged,
    iterations: result.iterations,
    finalCost: result.finalCost,
    initialCost: result.initialCost,
    solver: solverUsed,
  };
}
