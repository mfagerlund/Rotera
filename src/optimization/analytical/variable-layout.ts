/**
 * Variable Layout Builder
 *
 * Builds a mapping from entities to flat array indices for analytical optimization.
 * Mirrors the logic of entity.addToValueMap() but tracks indices instead of Value objects.
 *
 * Locked/inferred coordinates get index -1 and their values are stored separately.
 * Free coordinates get sequential indices in the variable array.
 */

import type { WorldPoint } from '../../entities/world-point/WorldPoint';
import type { IOptimizableCamera } from '../IOptimizable';
import type { VariableLayout } from './types';

/**
 * Options for adding a camera to the layout.
 */
export interface CameraLayoutOptions {
  optimizePose?: boolean;
  optimizeIntrinsics?: boolean;
  optimizeDistortion?: boolean;
}

/**
 * Builder for constructing VariableLayout from entities.
 */
export class VariableLayoutBuilder {
  private nextIndex = 0;
  private values: number[] = [];

  // Point indices: [x, y, z], -1 for locked
  private pointIndices = new Map<string, [number, number, number]>();
  private pointLockedValues = new Map<string, [number | null, number | null, number | null]>();

  // Camera position indices: [x, y, z], -1 for locked
  private cameraPosIndices = new Map<string, [number, number, number]>();
  private cameraPosLockedValues = new Map<string, [number | null, number | null, number | null]>();

  // Camera quaternion indices: [w, x, y, z], -1 for locked
  private cameraQuatIndices = new Map<string, [number, number, number, number]>();
  private cameraQuatLockedValues = new Map<string, [number, number, number, number]>();

  // Camera intrinsics indices (focal length, principal point, etc.)
  private cameraIntrinsicsIndices = new Map<string, {
    focalLength: number;
    aspectRatio: number;
    principalPointX: number;
    principalPointY: number;
    skew: number;
    k1: number;
    k2: number;
    k3: number;
    p1: number;
    p2: number;
  }>();
  private cameraIntrinsicsValues = new Map<string, {
    focalLength: number;
    aspectRatio: number;
    principalPointX: number;
    principalPointY: number;
    skew: number;
    k1: number;
    k2: number;
    k3: number;
    p1: number;
    p2: number;
  }>();

  /**
   * Add a world point to the layout.
   * Matches WorldPoint.addToValueMap() logic.
   */
  addWorldPoint(point: WorldPoint): void {
    const lockedXyz = point.lockedXyz;
    const inferredXyz = point.inferredXyz;
    const optimizedXyz = point.optimizedXyz;

    const xLocked = point.isXLocked();
    const yLocked = point.isYLocked();
    const zLocked = point.isZLocked();

    // Effective values (locked/inferred take precedence)
    const xValue = lockedXyz[0] ?? inferredXyz[0];
    const yValue = lockedXyz[1] ?? inferredXyz[1];
    const zValue = lockedXyz[2] ?? inferredXyz[2];

    // Allocate indices for free variables
    const xIdx = xLocked ? -1 : this.allocate(optimizedXyz?.[0] ?? 0);
    const yIdx = yLocked ? -1 : this.allocate(optimizedXyz?.[1] ?? 0);
    const zIdx = zLocked ? -1 : this.allocate(optimizedXyz?.[2] ?? 0);

    this.pointIndices.set(point.name, [xIdx, yIdx, zIdx]);
    this.pointLockedValues.set(point.name, [
      xLocked ? xValue : null,
      yLocked ? yValue : null,
      zLocked ? zValue : null,
    ]);
  }

  /**
   * Add a camera to the layout.
   * Matches Viewpoint.addToValueMap() logic.
   */
  addCamera(camera: IOptimizableCamera, options: CameraLayoutOptions = {}): void {
    const {
      optimizePose = !camera.isPoseLocked,
      optimizeIntrinsics = false,
    } = options;

    // Position
    const posIndices: [number, number, number] = optimizePose
      ? [
          this.allocate(camera.position[0]),
          this.allocate(camera.position[1]),
          this.allocate(camera.position[2]),
        ]
      : [-1, -1, -1];

    this.cameraPosIndices.set(camera.name, posIndices);
    this.cameraPosLockedValues.set(camera.name, optimizePose ? [null, null, null] : [...camera.position]);

    // Quaternion (rotation)
    const quatIndices: [number, number, number, number] = optimizePose
      ? [
          this.allocate(camera.rotation[0]),
          this.allocate(camera.rotation[1]),
          this.allocate(camera.rotation[2]),
          this.allocate(camera.rotation[3]),
        ]
      : [-1, -1, -1, -1];

    this.cameraQuatIndices.set(camera.name, quatIndices);
    this.cameraQuatLockedValues.set(camera.name, [...camera.rotation]);

    // Intrinsics (for reprojection provider)
    // Must match Viewpoint.addToValueMap() logic exactly

    // When useSimpleIntrinsics=true (default), only optimize f, cx, cy
    // aspectRatio and skew stay fixed at their current values (typically 1 and 0)
    const optimizeFullIntrinsics = optimizeIntrinsics && !camera.useSimpleIntrinsics;
    // Only optimize principal point if the image might be cropped
    // For uncropped images, PP should be locked to the image center
    const optimizePrincipalPoint = optimizeIntrinsics && camera.isPossiblyCropped;

    // Effective principal point values (same logic as autodiff)
    const effectivePPX = camera.isPossiblyCropped ? camera.principalPointX : camera.imageWidth / 2;
    const effectivePPY = camera.isPossiblyCropped ? camera.principalPointY : camera.imageHeight / 2;

    const intrinsicsIndices = {
      focalLength: optimizeIntrinsics ? this.allocate(camera.focalLength) : -1,
      // Principal point - only optimize if isPossiblyCropped
      principalPointX: optimizePrincipalPoint ? this.allocate(effectivePPX) : -1,
      principalPointY: optimizePrincipalPoint ? this.allocate(effectivePPY) : -1,
      // Full intrinsics - only if useSimpleIntrinsics=false
      aspectRatio: optimizeFullIntrinsics ? this.allocate(camera.aspectRatio) : -1,
      skew: optimizeFullIntrinsics ? this.allocate(0) : -1,  // skewCoefficient not in IOptimizableCamera
      // Distortion (not supported yet in analytical)
      k1: -1,
      k2: -1,
      k3: -1,
      p1: -1,
      p2: -1,
    };
    this.cameraIntrinsicsIndices.set(camera.name, intrinsicsIndices);

    // Extract distortion coefficients from arrays
    const [k1, k2, k3] = camera.radialDistortion;
    const [p1, p2] = camera.tangentialDistortion;

    const intrinsicsValues = {
      focalLength: camera.focalLength,
      aspectRatio: camera.aspectRatio,
      principalPointX: effectivePPX,
      principalPointY: effectivePPY,
      skew: 0, // Skew not in IOptimizableCamera, default to 0
      k1,
      k2,
      k3,
      p1,
      p2,
    };
    this.cameraIntrinsicsValues.set(camera.name, intrinsicsValues);
  }

  private allocate(initialValue: number): number {
    this.values.push(initialValue);
    return this.nextIndex++;
  }

  /**
   * Build the immutable VariableLayout.
   */
  build(): VariableLayout {
    const numVariables = this.nextIndex;
    const initialValues = new Float64Array(this.values);

    // Copy maps for closure
    const pointIndices = new Map(this.pointIndices);
    const pointLockedValues = new Map(this.pointLockedValues);
    const cameraPosIndices = new Map(this.cameraPosIndices);
    const cameraPosLockedValues = new Map(this.cameraPosLockedValues);
    const cameraQuatIndices = new Map(this.cameraQuatIndices);
    const cameraIntrinsicsIndices = new Map(this.cameraIntrinsicsIndices);
    const cameraIntrinsicsValues = new Map(this.cameraIntrinsicsValues);

    return {
      numVariables,
      initialValues,

      getWorldPointIndices(pointId: string): readonly [number, number, number] {
        const indices = pointIndices.get(pointId);
        if (!indices) {
          throw new Error(`WorldPoint "${pointId}" not found in layout`);
        }
        return indices;
      },

      getCameraPosIndices(cameraId: string): readonly [number, number, number] {
        const indices = cameraPosIndices.get(cameraId);
        if (!indices) {
          throw new Error(`Camera "${cameraId}" not found in layout`);
        }
        return indices;
      },

      getCameraQuatIndices(cameraId: string): readonly [number, number, number, number] {
        const indices = cameraQuatIndices.get(cameraId);
        if (!indices) {
          throw new Error(`Camera "${cameraId}" not found in layout`);
        }
        return indices;
      },

      getLockedWorldPointValue(pointId: string, axis: 'x' | 'y' | 'z'): number | undefined {
        const locked = pointLockedValues.get(pointId);
        if (!locked) return undefined;
        const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
        return locked[idx] ?? undefined;
      },

      getLockedCameraPosValue(cameraId: string, axis: 'x' | 'y' | 'z'): number | undefined {
        const locked = cameraPosLockedValues.get(cameraId);
        if (!locked) return undefined;
        const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
        return locked[idx] ?? undefined;
      },

      getCameraIntrinsicsIndices(cameraId: string) {
        return cameraIntrinsicsIndices.get(cameraId);
      },

      getCameraIntrinsicsValues(cameraId: string) {
        return cameraIntrinsicsValues.get(cameraId);
      },
    };
  }

  /**
   * Get intrinsics values for a camera (used by reprojection provider).
   */
  getCameraIntrinsics(cameraId: string): {
    focalLength: number;
    aspectRatio: number;
    principalPointX: number;
    principalPointY: number;
    skew: number;
    k1: number;
    k2: number;
    k3: number;
    p1: number;
    p2: number;
  } | undefined {
    return this.cameraIntrinsicsValues.get(cameraId);
  }

  /**
   * Get the current variable count.
   */
  get variableCount(): number {
    return this.nextIndex;
  }
}

/**
 * Helper to create a point getter function for providers.
 * Returns a function that extracts a 3D point from the variables array,
 * using locked values where appropriate.
 */
export function createPointGetter(
  indices: readonly [number, number, number],
  lockedValues: readonly [number | null, number | null, number | null]
): (variables: Float64Array) => { x: number; y: number; z: number } {
  const [xIdx, yIdx, zIdx] = indices;
  const [xLocked, yLocked, zLocked] = lockedValues;

  return (variables: Float64Array) => ({
    x: xIdx >= 0 ? variables[xIdx] : xLocked!,
    y: yIdx >= 0 ? variables[yIdx] : yLocked!,
    z: zIdx >= 0 ? variables[zIdx] : zLocked!,
  });
}

/**
 * Helper to create a quaternion getter function for providers.
 */
export function createQuaternionGetter(
  indices: readonly [number, number, number, number],
  lockedValues: readonly [number, number, number, number]
): (variables: Float64Array) => { w: number; x: number; y: number; z: number } {
  const [wIdx, xIdx, yIdx, zIdx] = indices;
  const [wLocked, xLocked, yLocked, zLocked] = lockedValues;

  return (variables: Float64Array) => ({
    w: wIdx >= 0 ? variables[wIdx] : wLocked,
    x: xIdx >= 0 ? variables[xIdx] : xLocked,
    y: yIdx >= 0 ? variables[yIdx] : yLocked,
    z: zIdx >= 0 ? variables[zIdx] : zLocked,
  });
}
