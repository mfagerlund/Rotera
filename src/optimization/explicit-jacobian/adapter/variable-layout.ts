/**
 * Variable Layout
 *
 * Maps entities (WorldPoints, Cameras) to flat variable array indices.
 * Handles per-axis locking for world points and selective camera parameter optimization.
 */

import type { WorldPoint } from '../../../entities/world-point/WorldPoint';
import type { IOptimizableCamera } from '../../IOptimizable';

/** Indices for a 3D point's free axes in the variable array */
export interface Point3DIndices {
  /** Index for X coordinate, or -1 if locked */
  x: number;
  /** Index for Y coordinate, or -1 if locked */
  y: number;
  /** Index for Z coordinate, or -1 if locked */
  z: number;
}

/** Indices for camera variables */
export interface CameraIndices {
  /** Position indices (x, y, z), -1 if pose is locked */
  position: Point3DIndices;
  /** Quaternion indices (w, x, y, z), -1 if pose is locked */
  quaternion: { w: number; x: number; y: number; z: number };
  /** Focal length index, -1 if not optimized */
  focalLength: number;
}

/**
 * Maps entities to their variable indices in the flat optimization array.
 */
export class VariableLayout {
  private nextIndex = 0;
  private pointIndices = new Map<WorldPoint, Point3DIndices>();
  private cameraIndices = new Map<IOptimizableCamera, CameraIndices>();

  /** Assigns temporary unique IDs to entities for this layout instance */
  private entityIdCounter = 0;
  private entityIds = new WeakMap<object, number>();

  /** Initial values array built during layout */
  public initialValues: number[] = [];

  /** Get or assign a temporary unique ID for an entity */
  private getEntityId(entity: object): number {
    let id = this.entityIds.get(entity);
    if (id === undefined) {
      id = this.entityIdCounter++;
      this.entityIds.set(entity, id);
    }
    return id;
  }

  /**
   * Add a world point to the layout.
   * Only adds variables for unlocked axes.
   */
  addWorldPoint(point: WorldPoint): Point3DIndices {
    const xyz = point.getEffectiveXyz();
    const optimizedXyz = point.optimizedXyz;

    const indices: Point3DIndices = {
      x: point.isXLocked() ? -1 : this.nextIndex++,
      y: point.isYLocked() ? -1 : this.nextIndex++,
      z: point.isZLocked() ? -1 : this.nextIndex++,
    };

    // Add initial values for free axes
    if (indices.x >= 0) {
      this.initialValues.push(optimizedXyz?.[0] ?? xyz[0] ?? 0);
    }
    if (indices.y >= 0) {
      this.initialValues.push(optimizedXyz?.[1] ?? xyz[1] ?? 0);
    }
    if (indices.z >= 0) {
      this.initialValues.push(optimizedXyz?.[2] ?? xyz[2] ?? 0);
    }

    this.pointIndices.set(point, indices);
    return indices;
  }

  /**
   * Add a camera to the layout.
   * Only adds variables for unlocked pose/intrinsics.
   */
  addCamera(
    camera: IOptimizableCamera,
    options: { optimizePose: boolean; optimizeIntrinsics: boolean }
  ): CameraIndices {
    const indices: CameraIndices = {
      position: { x: -1, y: -1, z: -1 },
      quaternion: { w: -1, x: -1, y: -1, z: -1 },
      focalLength: -1,
    };

    if (options.optimizePose && !camera.isPoseLocked) {
      // Position [x, y, z]
      indices.position.x = this.nextIndex++;
      indices.position.y = this.nextIndex++;
      indices.position.z = this.nextIndex++;
      this.initialValues.push(camera.position[0], camera.position[1], camera.position[2]);

      // Quaternion [w, x, y, z]
      indices.quaternion.w = this.nextIndex++;
      indices.quaternion.x = this.nextIndex++;
      indices.quaternion.y = this.nextIndex++;
      indices.quaternion.z = this.nextIndex++;
      this.initialValues.push(
        camera.rotation[0],
        camera.rotation[1],
        camera.rotation[2],
        camera.rotation[3]
      );
    }

    if (options.optimizeIntrinsics) {
      indices.focalLength = this.nextIndex++;
      this.initialValues.push(camera.focalLength);
    }

    this.cameraIndices.set(camera, indices);
    return indices;
  }

  /** Get indices for a world point */
  getPointIndices(point: WorldPoint): Point3DIndices | undefined {
    return this.pointIndices.get(point);
  }

  /** Get indices for a camera */
  getCameraIndices(camera: IOptimizableCamera): CameraIndices | undefined {
    return this.cameraIndices.get(camera);
  }

  /** Total number of variables */
  get variableCount(): number {
    return this.nextIndex;
  }

  /** All world points in the layout */
  get worldPoints(): WorldPoint[] {
    return Array.from(this.pointIndices.keys());
  }

  /** All cameras in the layout */
  get cameras(): IOptimizableCamera[] {
    return Array.from(this.cameraIndices.keys());
  }

  /**
   * Get full 3D indices for a point, using either the variable index
   * or a virtual index pointing to a constant slot.
   * This is useful when creating providers that need all 3 coordinates.
   */
  getFullPoint3DIndices(
    point: WorldPoint,
    constantSlots: Map<string, number>
  ): [number, number, number] {
    const indices = this.pointIndices.get(point);
    if (!indices) {
      throw new Error(`Point not in layout`);
    }

    const xyz = point.getEffectiveXyz();
    const pointId = this.getEntityId(point);

    // Get or create constant slots for locked axes
    const getConstantSlot = (axis: 'x' | 'y' | 'z', value: number): number => {
      const key = `point_${pointId}_${axis}`;
      if (!constantSlots.has(key)) {
        const slot = this.initialValues.length;
        this.initialValues.push(value);
        constantSlots.set(key, slot);
        this.nextIndex++;
      }
      return constantSlots.get(key)!;
    };

    return [
      indices.x >= 0 ? indices.x : getConstantSlot('x', xyz[0] ?? 0),
      indices.y >= 0 ? indices.y : getConstantSlot('y', xyz[1] ?? 0),
      indices.z >= 0 ? indices.z : getConstantSlot('z', xyz[2] ?? 0),
    ];
  }
}
