/**
 * Test helper functions for optimization tests
 */

import { expect } from '@jest/globals';
import { WorldPoint } from '../../entities/world-point';
import { Viewpoint } from '../../entities/viewpoint';
import { OptimizeProjectResult } from '../optimize-project';

/**
 * Test tolerances for different precision levels
 */
export const Tolerance = {
  TIGHT: 0.1,
  NORMAL: 0.5,
  LOOSE: 1.0,
  VERY_LOOSE: 2.0,
  POSITION: 2.0,
  DIRECTION: 0.2,
  DIRECTION_TIGHT: 0.1,
  DIRECTION_LOOSE: 0.3,
} as const;

/**
 * Assert that a 3D vector is close to expected value within tolerance
 * Uses absolute difference comparison, not Jest's decimal precision
 */
export function expectVec3Close(
  actual: number[],
  expected: number[],
  tolerance: number,
  message?: string
): void {
  expect(actual).toHaveLength(3);
  const diff0 = Math.abs(actual[0] - expected[0]);
  const diff1 = Math.abs(actual[1] - expected[1]);
  const diff2 = Math.abs(actual[2] - expected[2]);
  expect(diff0).toBeLessThanOrEqual(tolerance);
  expect(diff1).toBeLessThanOrEqual(tolerance);
  expect(diff2).toBeLessThanOrEqual(tolerance);
}

/**
 * Assert that a quaternion is close to expected value within tolerance
 * Handles quaternion double-cover (q and -q represent same rotation)
 */
export function expectQuatClose(
  actual: number[],
  expected: number[],
  tolerance: number,
  message?: string
): void {
  expect(actual).toHaveLength(4);

  let minDist = Infinity;

  for (const sign of [1, -1]) {
    const dist = Math.sqrt(
      Math.pow(actual[0] - sign * expected[0], 2) +
      Math.pow(actual[1] - sign * expected[1], 2) +
      Math.pow(actual[2] - sign * expected[2], 2) +
      Math.pow(actual[3] - sign * expected[3], 2)
    );
    minDist = Math.min(minDist, dist);
  }

  expect(minDist).toBeLessThan(tolerance);
}

/**
 * Calculate Euclidean distance between two 3D points
 */
export function distance3D(
  p1: [number, number, number] | number[],
  p2: [number, number, number] | number[]
): number {
  return Math.sqrt(
    Math.pow(p2[0] - p1[0], 2) +
    Math.pow(p2[1] - p1[1], 2) +
    Math.pow(p2[2] - p1[2], 2)
  );
}

/**
 * Calculate distance between two viewpoints based on their positions
 */
export function calculateCameraDistance(camera1: Viewpoint, camera2: Viewpoint): number {
  return distance3D(camera1.position, camera2.position);
}

/**
 * Calculate length of a line between two world points using their optimized positions
 */
export function calculateLineLength(pointA: WorldPoint, pointB: WorldPoint): number | null {
  if (!pointA.optimizedXyz || !pointB.optimizedXyz) {
    return null;
  }
  return distance3D(pointA.optimizedXyz, pointB.optimizedXyz);
}

/**
 * Get normalized direction vector from pointA to pointB
 */
export function getDirection(pointA: WorldPoint, pointB: WorldPoint): [number, number, number] | null {
  if (!pointA.optimizedXyz || !pointB.optimizedXyz) {
    return null;
  }

  const dx = pointB.optimizedXyz[0] - pointA.optimizedXyz[0];
  const dy = pointB.optimizedXyz[1] - pointA.optimizedXyz[1];
  const dz = pointB.optimizedXyz[2] - pointA.optimizedXyz[2];

  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (length < 1e-10) {
    return null;
  }

  return [dx / length, dy / length, dz / length];
}

/**
 * Assert that a line satisfies a direction constraint
 */
export function expectLineDirection(
  pointA: WorldPoint,
  pointB: WorldPoint,
  direction: 'x-aligned' | 'vertical' | 'z-aligned',
  tolerance: number = Tolerance.DIRECTION
): void {
  const dir = getDirection(pointA, pointB);
  expect(dir).not.toBeNull();

  if (!dir) return;

  const [dx, dy, dz] = [Math.abs(dir[0]), Math.abs(dir[1]), Math.abs(dir[2])];

  switch (direction) {
    case 'x-aligned':
      expect(dx).toBeGreaterThan(0.99);
      expect(dy).toBeLessThan(tolerance);
      expect(dz).toBeLessThan(tolerance);
      break;
    case 'vertical':
      expect(dy).toBeGreaterThan(0.99);
      expect(dx).toBeLessThan(tolerance);
      expect(dz).toBeLessThan(tolerance);
      break;
    case 'z-aligned':
      expect(dz).toBeGreaterThan(0.99);
      expect(dx).toBeLessThan(tolerance);
      expect(dy).toBeLessThan(tolerance);
      break;
  }
}

/**
 * Assert that a line has a specific length
 */
export function expectLineLength(
  pointA: WorldPoint,
  pointB: WorldPoint,
  expectedLength: number,
  tolerance: number = Tolerance.TIGHT
): void {
  const length = calculateLineLength(pointA, pointB);
  expect(length).not.toBeNull();

  if (length !== null) {
    expect(length).toBeCloseTo(expectedLength, tolerance);
  }
}

/**
 * Assert common optimization result structure
 */
export function expectOptimizationSuccess(
  result: OptimizeProjectResult,
  expectedCamerasInitialized?: number,
  maxResidual: number = 2.0,
  maxReprojectionError: number = 3.0
): void {
  expect(result.error).toBeNull();
  expect(result.converged).toBe(true);
  expect(result.iterations).toBeGreaterThanOrEqual(0);
  expect(result.residual).toBeLessThan(maxResidual);

  if (expectedCamerasInitialized !== undefined) {
    expect(result.camerasInitialized).toBeDefined();
    expect(result.camerasInitialized).toHaveLength(expectedCamerasInitialized);
  }

  if (result.medianReprojectionError !== undefined) {
    expect(result.medianReprojectionError).toBeLessThan(maxReprojectionError);
  }
}

/**
 * Assert that cameras were initialized by name
 */
export function expectCamerasInitialized(result: OptimizeProjectResult, ...cameraNames: string[]): void {
  expect(result.camerasInitialized).toBeDefined();

  for (const name of cameraNames) {
    expect(result.camerasInitialized).toContain(name);
  }
}

/**
 * Assert that a viewpoint has reasonable initial position (not at origin)
 */
export function expectCameraInitializedAwayFromOrigin(
  camera: Viewpoint,
  minDistance: number = 1.0
): void {
  const distanceFromOrigin = distance3D(camera.position, [0, 0, 0]);
  expect(distanceFromOrigin).toBeGreaterThan(minDistance);
}

/**
 * Assert that a world point has been initialized with optimized coordinates
 */
export function expectWorldPointInitialized(
  point: WorldPoint,
  message?: string
): void {
  expect(point.optimizedXyz).toBeDefined();
  expect(point.optimizedXyz).not.toBeNull();
  if (point.optimizedXyz) {
    expect(point.optimizedXyz).toHaveLength(3);
    expect(point.optimizedXyz.every(v => !isNaN(v) && isFinite(v))).toBe(true);
  }
}

/**
 * Assert that optimization converged before hitting max iterations
 */
export function expectConvergedBeforeMaxIterations(
  result: OptimizeProjectResult,
  maxIterations: number
): void {
  expect(result.converged).toBe(true);
  expect(result.iterations).toBeLessThan(maxIterations);
}

/**
 * Assert that optimization improved the residual significantly
 */
export function expectResidualImproved(
  result: OptimizeProjectResult,
  maxFinalResidual: number
): void {
  expect(result.residual).toBeLessThan(maxFinalResidual);
}
