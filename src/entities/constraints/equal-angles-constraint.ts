// Equal angles constraint

import type { EntityValidationResult, EntityValidationError } from '../../validation/validator'
import type { ValueMap } from '../../optimization/IOptimizable'
import { Vec3, type Value } from 'scalar-autograd'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point/WorldPoint'
import type { SerializationContext } from '../serialization/SerializationContext'
import type { EqualAnglesConstraintDto } from './ConstraintDto'
import { EqualityConstraintBase } from './equality-constraint-base'

export class EqualAnglesConstraint extends EqualityConstraintBase<[WorldPoint, WorldPoint, WorldPoint]> {
  readonly angleTriplets: [WorldPoint, WorldPoint, WorldPoint][]

  private constructor(
    name: string,
    angleTriplets: [WorldPoint, WorldPoint, WorldPoint][],
    tolerance: number
  ) {
    super(name, tolerance)
    this.angleTriplets = angleTriplets

    // Register with all points
    const allPoints = new Set<WorldPoint>()
    angleTriplets.forEach(triplet => {
      allPoints.add(triplet[0])
      allPoints.add(triplet[1])
      allPoints.add(triplet[2])
    })
    allPoints.forEach(point => point.addReferencingConstraint(this))
  }

  static create(
    name: string,
    angleTriplets: [WorldPoint, WorldPoint, WorldPoint][],
    options: {
      tolerance?: number
    } = {}
  ): EqualAnglesConstraint {
    if (angleTriplets.length < 2) {
      throw new Error('EqualAnglesConstraint requires at least 2 angle triplets')
    }

    return new EqualAnglesConstraint(
      name,
      angleTriplets,
      options.tolerance ?? 0.001
    )
  }

  getConstraintType(): string {
    return 'equal_angles'
  }

  protected getItems(): [WorldPoint, WorldPoint, WorldPoint][] {
    return this.angleTriplets
  }

  protected computeValue(triplet: [WorldPoint, WorldPoint, WorldPoint]): number | null {
    const [pointA, vertex, pointC] = triplet
    if (pointA.hasCoordinates() && vertex.hasCoordinates() && pointC.hasCoordinates()) {
      return this.calculateAngleBetweenPoints(pointA, vertex, pointC)
    }
    return null
  }

  protected computeAutogradValue(triplet: [WorldPoint, WorldPoint, WorldPoint], valueMap: ValueMap): Value | undefined {
    const [pointA, vertex, pointC] = triplet

    const pointAVec = valueMap.points.get(pointA)
    const vertexVec = valueMap.points.get(vertex)
    const pointCVec = valueMap.points.get(pointC)

    if (!pointAVec || !vertexVec || !pointCVec) return undefined

    const v1 = pointAVec.sub(vertexVec)
    const v2 = pointCVec.sub(vertexVec)

    return Vec3.angleBetween(v1, v2)
  }

  validateConstraintSpecific(): EntityValidationResult {
    const errors: EntityValidationError[] = []
    const warnings: EntityValidationError[] = []

    if (this.angleTriplets.length < 2) {
      errors.push(ValidationHelpers.createError(
        'INSUFFICIENT_ANGLE_TRIPLETS',
        'Equal angles constraint requires at least 2 angle triplets',
        this.getName(),
        'constraint',
        'angleTriplets'
      ))
    }

    // Validate each angle triplet
    for (let i = 0; i < this.angleTriplets.length; i++) {
      const triplet = this.angleTriplets[i]
      if (!triplet || triplet.length !== 3) {
        errors.push(ValidationHelpers.createError(
          'INVALID_ANGLE_TRIPLET',
          `Angle triplet ${i} must contain exactly 3 points`,
          this.getName(),
          'constraint',
          `angleTriplets[${i}]`
        ))
      } else {
        // Check for duplicate points within the triplet
        const uniquePoints = new Set(triplet)
        if (uniquePoints.size !== 3) {
          errors.push(ValidationHelpers.createError(
            'DUPLICATE_POINTS_IN_TRIPLET',
            `Angle triplet ${i} cannot have duplicate points`,
            this.getName(),
            'constraint',
            `angleTriplets[${i}]`
          ))
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Equal angles constraint validation passed' : `Equal angles constraint validation failed: ${errors.length} errors`
    }
  }

  computeResiduals(valueMap: ValueMap): Value[] {
    return this.computeResidualValues(valueMap)
  }

  serialize(context: SerializationContext): EqualAnglesConstraintDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    if (this.angleTriplets.length !== 2) {
      throw new Error(
        `EqualAnglesConstraint "${this.name}": Cannot serialize - DTO only supports exactly 2 angle triplets, but constraint has ${this.angleTriplets.length}`
      )
    }

    const angle1 = this.angleTriplets[0]
    const angle2 = this.angleTriplets[1]

    const angle1PointAId = context.getEntityId(angle1[0])
    const angle1VertexId = context.getEntityId(angle1[1])
    const angle1PointCId = context.getEntityId(angle1[2])
    const angle2PointAId = context.getEntityId(angle2[0])
    const angle2VertexId = context.getEntityId(angle2[1])
    const angle2PointCId = context.getEntityId(angle2[2])

    if (!angle1PointAId || !angle1VertexId || !angle1PointCId ||
        !angle2PointAId || !angle2VertexId || !angle2PointCId) {
      throw new Error(
        `EqualAnglesConstraint "${this.name}": Cannot serialize - all points must be serialized first`
      )
    }

    return {
      id,
      type: 'equal_angles',
      name: this.name,
      angle1PointAId,
      angle1VertexId,
      angle1PointCId,
      angle2PointAId,
      angle2VertexId,
      angle2PointCId,
      tolerance: this.tolerance,
      lastResiduals: this.lastResiduals.length > 0 ? [...this.lastResiduals] : undefined
    }
  }

  static deserialize(dto: EqualAnglesConstraintDto, context: SerializationContext): EqualAnglesConstraint {
    const angle1PointA = context.getEntity<WorldPoint>(dto.angle1PointAId)
    const angle1Vertex = context.getEntity<WorldPoint>(dto.angle1VertexId)
    const angle1PointC = context.getEntity<WorldPoint>(dto.angle1PointCId)
    const angle2PointA = context.getEntity<WorldPoint>(dto.angle2PointAId)
    const angle2Vertex = context.getEntity<WorldPoint>(dto.angle2VertexId)
    const angle2PointC = context.getEntity<WorldPoint>(dto.angle2PointCId)

    if (!angle1PointA || !angle1Vertex || !angle1PointC ||
        !angle2PointA || !angle2Vertex || !angle2PointC) {
      throw new Error(
        `EqualAnglesConstraint "${dto.name}": Cannot deserialize - points not found in context`
      )
    }

    const constraint = EqualAnglesConstraint.create(
      dto.name,
      [
        [angle1PointA, angle1Vertex, angle1PointC],
        [angle2PointA, angle2Vertex, angle2PointC]
      ],
      { tolerance: dto.tolerance }
    )

    if (dto.lastResiduals) {
      constraint.lastResiduals = [...dto.lastResiduals]
    }

    context.registerEntity(constraint, dto.id)
    return constraint
  }
}