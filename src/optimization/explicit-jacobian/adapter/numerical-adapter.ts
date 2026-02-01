/**
 * Numerical Jacobian Adapter
 *
 * Bridges the entity-based constraint system to the sparse solver using
 * numerical differentiation (finite differences) for Jacobian computation.
 *
 * This is used to validate the sparse solver infrastructure independently
 * of the hand-coded analytical gradients.
 */

import type { WorldPoint } from '../../../entities/world-point/WorldPoint';
import type { Line } from '../../../entities/line/Line';
import type { IOptimizableCamera } from '../../IOptimizable';
import type { ImagePoint } from '../../../entities/imagePoint/ImagePoint';
import type { ResidualWithJacobian, LMResult } from '../types';
import { VariableLayout, type CameraIndices } from './variable-layout';
import { NumericalProviderFactory } from './numerical-provider-factory';
import { ExplicitJacobianSystemImpl } from '../ExplicitJacobianSystem';
import { solveSparseLM } from '../../sparse/sparse-lm';

/** Options for numerical optimization */
export interface NumericalOptimizationOptions {
  /** Maximum iterations */
  maxIterations?: number;
  /** Cost tolerance for convergence */
  tolerance?: number;
  /** Optimize camera poses */
  optimizePose?: boolean;
  /** Print debug info */
  verbose?: boolean;
}

/** Result of numerical optimization */
export interface NumericalOptimizationResult {
  /** Whether optimization converged */
  converged: boolean;
  /** Number of iterations */
  iterations: number;
  /** Final cost (sum of squared residuals) */
  finalCost: number;
  /** Initial cost */
  initialCost: number;
}

/**
 * Run sparse solver with numerical Jacobians.
 *
 * This is used to validate that the sparse solver infrastructure works
 * correctly, independent of the hand-coded gradient functions.
 */
export function solveWithNumericalJacobian(
  points: WorldPoint[],
  lines: Line[],
  cameras: IOptimizableCamera[],
  imagePoints: ImagePoint[],
  options: NumericalOptimizationOptions = {}
): NumericalOptimizationResult {
  const {
    maxIterations = 500,
    tolerance = 1e-8,
    optimizePose = true,
    verbose = false,
  } = options;

  // Build variable layout
  const layout = new VariableLayout();

  // Add world points
  for (const point of points) {
    layout.addWorldPoint(point);
  }

  // Add cameras
  const cameraData = new Map<IOptimizableCamera, { camera: IOptimizableCamera; indices: CameraIndices }>();
  for (const camera of cameras) {
    const indices = layout.addCamera(camera, { optimizePose, optimizeIntrinsics: false });
    cameraData.set(camera, { camera, indices });
  }

  // Create numerical providers
  const factory = new NumericalProviderFactory(layout);
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
    providers.push(...factory.createReprojectionProviders(point, pointImagePoints, cameraData));
  }

  // Log setup info
  if (verbose) {
    const logMsg = `[NumericalJacobian] Variables: ${layout.variableCount}, Providers: ${providers.length}, TotalResiduals: ${providers.reduce((sum, p) => sum + p.residualCount, 0)}`;
    console.log(logMsg);
    console.log(`[NumericalJacobian] Points: ${points.length}, Lines: ${lines.length}, Cameras: ${cameras.length}, ImagePoints: ${imagePoints.length}`);
  }

  // Build system
  const system = new ExplicitJacobianSystemImpl([...layout.initialValues]);
  for (const provider of providers) {
    system.addResidualProvider(provider);
  }

  // Debug: compute initial residuals
  if (verbose) {
    const initialResiduals = system.computeAllResiduals();
    const totalCost = 0.5 * initialResiduals.reduce((sum, r) => sum + r * r, 0);
    console.log(`[NumericalJacobian] Initial residuals: ${initialResiduals.length}, total cost: ${totalCost.toFixed(4)}`);

    // Find large residuals
    for (let i = 0; i < initialResiduals.length; i++) {
      if (Math.abs(initialResiduals[i]) > 10) {
        console.log(`[NumericalJacobian]   LARGE r[${i}] = ${initialResiduals[i].toFixed(4)}`);
      }
    }
  }

  // Solve with sparse LM
  const result: LMResult = solveSparseLM(system, { maxIterations, tolerance, verbose });

  if (verbose) {
    console.log(`[NumericalJacobian] Converged: ${result.converged}, Iterations: ${result.iterations}`);
    console.log(`[NumericalJacobian] Cost: ${result.initialCost.toFixed(4)} -> ${result.finalCost.toFixed(4)}`);
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
  }

  return {
    converged: result.converged,
    iterations: result.iterations,
    finalCost: result.finalCost,
    initialCost: result.initialCost,
  };
}
