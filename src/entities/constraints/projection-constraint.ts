// Projection constraint - projects 3D world point to 2D image pixel
// This is the fundamental constraint in photogrammetry and bundle adjustment

import type { EntityValidationResult } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { V, type Value } from 'scalar-autograd'
import { projectWorldPointToPixel } from '../../optimization/camera-projection'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point'
import type { Viewpoint } from '../viewpoint/Viewpoint'
import type { ImagePoint } from '../imagePoint/ImagePoint'
import {
  Constraint,
  type ConstraintRepository,
  type ConstraintEvaluation
} from './base-constraint'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { ProjectionConstraintDto } from './ConstraintDto'

export class ProjectionConstraint extends Constraint {
  readonly worldPoint: WorldPoint
  readonly viewpoint: Viewpoint
  observedU: number
  observedV: number
  tolerance: number

  private constructor(
    name: string,
    worldPoint: WorldPoint,
    viewpoint: Viewpoint,
    observedU: number,
    observedV: number,
    tolerance: number
  ) {
    super(name)
    this.worldPoint = worldPoint
    this.viewpoint = viewpoint
    this.observedU = observedU
    this.observedV = observedV
    this.tolerance = tolerance

    // Register with entities
    worldPoint.addReferencingConstraint(this)
    // Note: Viewpoint doesn't track constraints (no addReferencingConstraint method)
  }

  static create(
    name: string,
    worldPoint: WorldPoint,
    viewpoint: Viewpoint,
    observedU: number,
    observedV: number,
    options: {
      tolerance?: number
    } = {}
  ): ProjectionConstraint {
    return new ProjectionConstraint(
      name,
      worldPoint,
      viewpoint,
      observedU,
      observedV,
      options.tolerance ?? 1.0 // 1 pixel tolerance by default
    )
  }

  getConstraintType(): string {
    return 'projection_point_camera'
  }

  evaluate(): ConstraintEvaluation {
    // TODO: Implement non-optimized projection evaluation
    // This would require accessing the Camera entity
    return { value: 0, satisfied: true }
  }

  validateConstraintSpecific(): EntityValidationResult {
    const errors = []

    // Validate observed coordinates are finite
    if (!isFinite(this.observedU) || !isFinite(this.observedV)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_OBSERVED_PIXEL',
        'Observed pixel coordinates must be finite numbers',
        this.getName(),
        'constraint',
        'observedPixel'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary:
        errors.length === 0
          ? 'Projection constraint validation passed'
          : `Projection constraint validation failed: ${errors.length} errors`
    }
  }

  get observedPixel(): [number, number] {
    return [this.observedU, this.observedV]
  }

  setObservedPixel(u: number, v: number): void {
    this.observedU = u
    this.observedV = v
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
    const worldPointVec = valueMap.points.get(this.worldPoint)

    if (!worldPointVec) {
      console.warn(`Projection constraint ${this.getName()}: world point not found in valueMap`)
      return []
    }

    const cameraValues = valueMap.cameras.get(this.viewpoint)
    if (!cameraValues) {
      console.warn(`Projection constraint ${this.getName()}: camera not found in valueMap`)
      return []
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
    )

    if (!projection) {
      // Point is behind camera or projection failed
      // Return large residual to discourage this configuration
      return [V.C(1000), V.C(1000)]
    }

    const [projected_u, projected_v] = projection

    // Residuals: projected - observed (should be 0)
    const residual_u = V.sub(projected_u, V.C(this.observedU))
    const residual_v = V.sub(projected_v, V.C(this.observedV))

    return [residual_u, residual_v]
  }

  serialize(context: SerializationContext): ProjectionConstraintDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    const pointId = context.getEntityId(this.worldPoint)
    const viewpointId = context.getEntityId(this.viewpoint)

    if (!pointId || !viewpointId) {
      throw new Error(
        `ProjectionConstraint "${this.name}": Cannot serialize - worldPoint and viewpoint must be serialized first`
      )
    }

    let imagePointId: string | undefined
    for (const imagePoint of this.worldPoint.imagePoints) {
      if (imagePoint.viewpoint === this.viewpoint &&
          Math.abs(imagePoint.u - this.observedU) < 0.001 &&
          Math.abs(imagePoint.v - this.observedV) < 0.001) {
        imagePointId = context.getEntityId(imagePoint as ImagePoint)
        if (imagePointId) break
      }
    }

    if (!imagePointId) {
      throw new Error(
        `ProjectionConstraint "${this.name}": Cannot serialize - no matching ImagePoint found for worldPoint "${this.worldPoint.name}" in viewpoint "${this.viewpoint.name}" at (${this.observedU}, ${this.observedV})`
      )
    }

    return {
      id,
      type: 'projection',
      name: this.name,
      pointId,
      imagePointId,
      viewpointId,
      tolerance: this.tolerance
    }
  }

  static deserialize(dto: ProjectionConstraintDto, context: SerializationContext): ProjectionConstraint {
    const worldPoint = context.getEntity<WorldPoint>(dto.pointId)
    const imagePoint = context.getEntity<ImagePoint>(dto.imagePointId)
    const viewpoint = context.getEntity<Viewpoint>(dto.viewpointId)

    if (!worldPoint || !imagePoint || !viewpoint) {
      throw new Error(
        `ProjectionConstraint "${dto.name}": Cannot deserialize - worldPoint, imagePoint, or viewpoint not found in context`
      )
    }

    const constraint = ProjectionConstraint.create(
      dto.name,
      worldPoint,
      viewpoint,
      imagePoint.u,
      imagePoint.v,
      { tolerance: dto.tolerance }
    )

    context.registerEntity(constraint, dto.id)
    return constraint
  }
}
