// Projection constraint - projects 3D world point to 2D image pixel
// This is the fundamental constraint in photogrammetry and bundle adjustment

import type { ConstraintId, PointId, CameraId } from '../../types/ids';
import type { ValidationResult, ValidationError } from '../../validation/validator';
import type { ValueMap } from '../../optimization/IOptimizable';
import { V, type Value } from 'scalar-autograd';
import { projectWorldPointToPixel } from '../../optimization/camera-projection';
import { ValidationHelpers } from '../../validation/validator';
import type { WorldPoint } from '../world-point/WorldPoint';
import {
  Constraint,
  type ConstraintRepository,
  type BaseConstraintDto,
  type ConstraintDto,
  type ConstraintEvaluation,
} from './base-constraint';

export interface ProjectionConstraintDto {
  cameraId: CameraId;
  observedU: number; // Observed pixel x coordinate
  observedV: number; // Observed pixel y coordinate
}

export interface ProjectionConstraintData extends BaseConstraintDto {
  entities: {
    points: [PointId]; // Single 3D world point
    lines?: undefined;
    planes?: undefined;
  };
  parameters: BaseConstraintDto['parameters'] & {
    cameraId: CameraId;
    observedU: number;
    observedV: number;
  };
}

export class ProjectionConstraint extends Constraint {
  protected data: ProjectionConstraintData;

  private constructor(repo: ConstraintRepository, data: ProjectionConstraintData) {
    super(repo, data);
    this.data = data;
  }

  static create(
    id: ConstraintId,
    name: string,
    worldPoint: WorldPoint,
    cameraId: CameraId,
    observedU: number,
    observedV: number,
    repo: ConstraintRepository,
    options: {
      tolerance?: number;
      priority?: number;
      isEnabled?: boolean;
      isDriving?: boolean;
      group?: string;
      tags?: string[];
      notes?: string;
    } = {}
  ): ProjectionConstraint {
    const now = new Date().toISOString();
    const data: ProjectionConstraintData = {
      id,
      name,
      type: 'projection_point_camera',
      status: 'satisfied',
      entities: {
        points: [worldPoint.id as PointId],
      },
      parameters: {
        cameraId,
        observedU,
        observedV,
        tolerance: options.tolerance ?? 1.0, // 1 pixel tolerance by default
        priority: options.priority ?? 5,
      },
      isEnabled: options.isEnabled ?? true,
      isDriving: options.isDriving ?? true, // Projection constraints usually drive optimization
      group: options.group,
      tags: options.tags,
      notes: options.notes,
      createdAt: now,
      updatedAt: now,
    };
    const constraint = new ProjectionConstraint(repo, data);
    constraint._points.add(worldPoint);
    constraint._entitiesPreloaded = true;
    return constraint;
  }

  static fromDto(dto: ConstraintDto, repo: ConstraintRepository): ProjectionConstraint {
    if (!dto.projectionConstraint) {
      throw new Error('Invalid ProjectionConstraint DTO: missing projectionConstraint data');
    }

    if (!dto.entities.points || dto.entities.points.length !== 1) {
      throw new Error('ProjectionConstraint requires exactly 1 point');
    }

    const data: ProjectionConstraintData = {
      ...dto,
      entities: {
        points: [dto.entities.points[0]],
      },
      parameters: {
        ...dto.parameters,
        cameraId: dto.projectionConstraint.cameraId,
        observedU: dto.projectionConstraint.observedU,
        observedV: dto.projectionConstraint.observedV,
      },
    };

    return new ProjectionConstraint(repo, data);
  }

  getConstraintType(): string {
    return 'projection_point_camera';
  }

  evaluate(): ConstraintEvaluation {
    // TODO: Implement non-optimized projection evaluation
    // This would require accessing the Camera entity
    return { value: 0, satisfied: true };
  }

  validateConstraintSpecific(): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate camera ID exists
    // (This would need cameraExists check in ValidationContext)

    // Validate observed coordinates are reasonable
    // (Could check against image bounds if we had access to the image/camera)

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary:
        errors.length === 0
          ? 'Projection constraint validation passed'
          : `Projection constraint validation failed: ${errors.length} errors`,
    };
  }

  getRequiredEntityCounts(): { points: number } {
    return { points: 1 };
  }

  toConstraintDto(): ConstraintDto {
    const baseDto: ConstraintDto = {
      ...this.data,
      entities: {
        points: [...this.data.entities.points],
      },
      parameters: { ...this.data.parameters },
      distanceConstraint: undefined,
      angleConstraint: undefined,
      parallelLinesConstraint: undefined,
      perpendicularLinesConstraint: undefined,
      fixedPointConstraint: undefined,
      collinearPointsConstraint: undefined,
      coplanarPointsConstraint: undefined,
      equalDistancesConstraint: undefined,
      equalAnglesConstraint: undefined,
      projectionConstraint: {
        cameraId: this.data.parameters.cameraId,
        observedU: this.data.parameters.observedU,
        observedV: this.data.parameters.observedV,
      },
    };
    return baseDto;
  }

  clone(newId: ConstraintId, newName?: string): ProjectionConstraint {
    const clonedData: ProjectionConstraintData = {
      ...this.data,
      id: newId,
      name: newName || `${this.data.name} (copy)`,
      entities: {
        points: [...this.data.entities.points],
      },
      parameters: { ...this.data.parameters },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return new ProjectionConstraint(this.repo, clonedData);
  }

  // Specific getters/setters
  get worldPoint(): WorldPoint {
    return this.points[0];
  }

  get observedPixel(): [number, number] {
    return [this.data.parameters.observedU, this.data.parameters.observedV];
  }

  setObservedPixel(u: number, v: number): void {
    this.data.parameters.observedU = u;
    this.data.parameters.observedV = v;
    this.updateTimestamp();
  }

  /**
   * Compute residuals for projection constraint.
   *
   * Residual: [projected_u - observed_u, projected_v - observed_v]
   * Should be [0, 0] when the 3D point projects exactly to the observed pixel.
   *
   * This is the fundamental constraint in bundle adjustment.
   */
  computeResiduals(valueMap: ValueMap): Value[] {
    const worldPointVec = valueMap.points.get(this.worldPoint);

    if (!worldPointVec) {
      console.warn(`Projection constraint ${this.data.id}: world point not found in valueMap`);
      return [];
    }

    // Find camera in valueMap
    let cameraValues: ReturnType<typeof valueMap.cameras.get> | undefined;
    for (const [camera, values] of valueMap.cameras) {
      if (camera.id === this.data.parameters.cameraId) {
        cameraValues = values;
        break;
      }
    }

    if (!cameraValues) {
      console.warn(`Projection constraint ${this.data.id}: camera not found in valueMap`);
      return [];
    }

    // Project world point through camera
    const projection = projectWorldPointToPixel(
      worldPointVec,
      cameraValues.position,
      cameraValues.rotation,
      cameraValues.focalLength,
      cameraValues.aspectRatio,
      cameraValues.principalPointX,
      cameraValues.principalPointY,
      cameraValues.skew,
      cameraValues.k1,
      cameraValues.k2,
      cameraValues.k3,
      cameraValues.p1,
      cameraValues.p2
    );

    if (!projection) {
      // Point is behind camera or projection failed
      // Return large residual to discourage this configuration
      return [V.C(1000), V.C(1000)];
    }

    const [projected_u, projected_v] = projection;

    // Residuals: projected - observed (should be 0)
    const residual_u = V.sub(projected_u, V.C(this.data.parameters.observedU));
    const residual_v = V.sub(projected_v, V.C(this.data.parameters.observedV));

    return [residual_u, residual_v];
  }
}
