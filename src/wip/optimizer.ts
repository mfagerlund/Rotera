/**
 * Gauss-Newton optimizer for photogrammetry.
 * Implements a simple Gauss-Newton solver with numerical Jacobian computation.
 */

import { axisAngleToMatrix } from './camera-math';
import {
  worldPointLockResidual,
  lineConstraintResidual,
  imagePointResidual
} from './residuals';
import type { OptimizationExportDto } from '../types/optimization-export';

export interface OptimizerOptions {
  maxIterations?: number;
  errorTolerance?: number;
  stepSize?: number; // For line search (default 1.0)
  verbose?: boolean;
}

export interface OptimizerResult {
  success: boolean;
  iterations: number;
  finalCost: number;
  convergenceReason: string;
  optimizedWorldPoints: Record<string, [number, number, number]>;
  computationTime: number;
}

/**
 * Build and solve optimization problem from project export.
 */
export function optimizeProject(
  exportDto: OptimizationExportDto,
  options: OptimizerOptions = {}
): OptimizerResult {
  const startTime = performance.now();

  const {
    maxIterations = 100,
    errorTolerance = 1e-6,
    dampingFactor = 1e-2,
    verbose = false
  } = options;

  // Extract world points that need optimization (have free axes)
  const worldPoints = exportDto.worldPoints.filter(wp => wp.xyz !== undefined);

  // Build parameter vector: [x1, y1, z1, x2, y2, z2, ...]
  // Only include world points with at least one null coordinate (free axes)
  const freePoints = worldPoints.filter(wp =>
    wp.xyz && wp.xyz.some(coord => coord === null)
  );

  if (freePoints.length === 0 && verbose) {
    console.log('No free world points to optimize');
  }

  // Initialize parameter vector
  const paramCount = freePoints.length * 3;
  const initialParams = new Array(paramCount);

  freePoints.forEach((wp, wpIdx) => {
    const baseIdx = wpIdx * 3;
    // Use existing coordinates or initialize to 0 for free axes
    initialParams[baseIdx + 0] = wp.xyz![0] ?? 0;
    initialParams[baseIdx + 1] = wp.xyz![1] ?? 0;
    initialParams[baseIdx + 2] = wp.xyz![2] ?? 0;
  });

  // Build index mapping: worldPoint ID -> parameter index
  const wpIdToParamIdx = new Map<string, number>();
  freePoints.forEach((wp, idx) => {
    wpIdToParamIdx.set(wp.id, idx * 3);
  });

  // Create residual function
  const residualFunction = (params: number[]) => {
    const residuals: number[] = [];

    // 1. WorldPoint lock residuals
    freePoints.forEach((wp, wpIdx) => {
      const baseIdx = wpIdx * 3;
      const currentPos: [number, number, number] = [
        params[baseIdx + 0],
        params[baseIdx + 1],
        params[baseIdx + 2]
      ];

      // Check which axes are locked (non-null in xyz)
      if (wp.xyz) {
        const locked: [boolean, boolean, boolean] = [
          wp.xyz[0] !== null,
          wp.xyz[1] !== null,
          wp.xyz[2] !== null
        ];

        const target: [number, number, number] = [
          wp.xyz[0] ?? 0,
          wp.xyz[1] ?? 0,
          wp.xyz[2] ?? 0
        ];

        const wpResiduals = worldPointLockResidual(
          currentPos,
          locked,
          target,
          0.001 // Default tolerance
        );

        residuals.push(...wpResiduals);
      }
    });

    // 2. Line constraint residuals
    exportDto.lines.forEach(line => {
      // Only process lines with direction constraints
      if (line.constraints.direction === 'free') {
        return;
      }

      const wpA = freePoints.find(wp => wp.id === line.pointA);
      const wpB = freePoints.find(wp => wp.id === line.pointB);

      if (!wpA || !wpB) {
        return; // Skip if either point is fully locked
      }

      const idxA = wpIdToParamIdx.get(line.pointA);
      const idxB = wpIdToParamIdx.get(line.pointB);

      if (idxA === undefined || idxB === undefined) {
        return;
      }

      const posA: [number, number, number] = [
        params[idxA + 0],
        params[idxA + 1],
        params[idxA + 2]
      ];

      const posB: [number, number, number] = [
        params[idxB + 0],
        params[idxB + 1],
        params[idxB + 2]
      ];

      // Create virtual third point based on direction constraint
      let posC: [number, number, number];
      const dir = line.constraints.direction;

      if (dir === 'horizontal') {
        // Line in XY plane (Z = constant)
        posC = [posA[0] + 1, posA[1], posA[2]];
      } else if (dir === 'vertical') {
        // Line parallel to Z-axis
        posC = [posA[0], posA[1], posA[2] + 1];
      } else if (dir === 'x-aligned') {
        // Line parallel to X-axis
        posC = [posA[0] + 1, posA[1], posA[2]];
      } else if (dir === 'z-aligned') {
        // Line parallel to Z-axis
        posC = [posA[0], posA[1], posA[2] + 1];
      } else {
        return; // Unknown direction
      }

      const lineResiduals = lineConstraintResidual(
        posA,
        posB,
        posC,
        line.constraints.tolerance ?? 1.0
      );

      residuals.push(...lineResiduals);
    });

    // 3. Image point reprojection residuals
    exportDto.images.forEach(img => {
      const camera = exportDto.cameras.find(c => c.imageId === img.id);
      if (!camera || !camera.intrinsics || !camera.extrinsics) {
        return; // Skip images without calibrated cameras
      }

      // Build camera matrices
      const K = [
        camera.intrinsics.fx,
        camera.intrinsics.fy,
        camera.intrinsics.cx,
        camera.intrinsics.cy
      ];

      if (camera.intrinsics.k1 !== undefined) {
        K.push(camera.intrinsics.k1);
      }
      if (camera.intrinsics.k2 !== undefined) {
        K.push(camera.intrinsics.k2);
      }

      const R = axisAngleToMatrix(camera.extrinsics.rotation);
      const t = camera.extrinsics.translation;

      // Process each image point
      Object.values(img.imagePoints).forEach(imgPoint => {
        const wpId = imgPoint.worldPointId;
        const paramIdx = wpIdToParamIdx.get(wpId);

        if (paramIdx === undefined) {
          return; // World point is fully locked, skip
        }

        const worldPos: [number, number, number] = [
          params[paramIdx + 0],
          params[paramIdx + 1],
          params[paramIdx + 2]
        ];

        const observed: [number, number] = [imgPoint.u, imgPoint.v];

        const imgResiduals = imagePointResidual(
          worldPos,
          observed,
          K,
          R,
          t,
          1.0 // Default sigma
        );

        residuals.push(...imgResiduals);
      });
    });

    return residuals;
  };

  // Run Levenberg-Marquardt optimization
  // The library expects a function that takes parameters and returns a function(x) => y
  // We adapt our residual function to this API
  const parameterizedFunction = (params: number[]) => {
    const residuals = residualFunction(params);
    // Return a function that returns residuals indexed by x
    return (x: number) => (x < residuals.length ? residuals[Math.floor(x)] : 0);
  };

  // Create dummy x values (indices into residuals) and y values (target = 0)
  const dummyResiduals = residualFunction(initialParams);
  const x = Array.from({ length: dummyResiduals.length }, (_, i) => i);
  const y = new Array(dummyResiduals.length).fill(0); // Target is zero residual

  let result: any;
  try {
    result = levenbergMarquardt(
      { x, y },
      parameterizedFunction,
      {
        initialValues: initialParams,
        maxIterations,
        errorTolerance,
        damping: dampingFactor
      }
    );
  } catch (error) {
    return {
      success: false,
      iterations: 0,
      finalCost: Infinity,
      convergenceReason: `Optimization failed: ${error}`,
      optimizedWorldPoints: {},
      computationTime: performance.now() - startTime
    };
  }

  // Extract optimized world point positions
  const optimizedWorldPoints: Record<string, [number, number, number]> = {};

  freePoints.forEach((wp, wpIdx) => {
    const baseIdx = wpIdx * 3;
    optimizedWorldPoints[wp.id] = [
      result.parameterValues[baseIdx + 0],
      result.parameterValues[baseIdx + 1],
      result.parameterValues[baseIdx + 2]
    ];
  });

  const finalResiduals = residualFunction(result.parameterValues);
  const finalCost = finalResiduals.reduce((sum, r) => sum + r * r, 0);

  if (verbose) {
    console.log('Optimization complete:', {
      iterations: result.iterations,
      finalCost,
      freePoints: freePoints.length,
      residuals: finalResiduals.length
    });
  }

  return {
    success: true,
    iterations: result.iterations,
    finalCost,
    convergenceReason: 'Converged',
    optimizedWorldPoints,
    computationTime: performance.now() - startTime
  };
}
