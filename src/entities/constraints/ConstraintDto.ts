import type { BaseDto } from '../serialization/ISerializable'

export interface ConstraintDto extends BaseDto {
  id: string
  type: string
  name: string
}

export interface DistanceConstraintDto extends ConstraintDto {
  type: 'distance_point_point'
  pointAId: string
  pointBId: string
  targetDistance: number
  tolerance: number
}

export interface AngleConstraintDto extends ConstraintDto {
  type: 'angle_point_point_point'
  pointAId: string
  vertexId: string
  pointCId: string
  targetAngle: number
  tolerance: number
}

export interface ParallelLinesConstraintDto extends ConstraintDto {
  type: 'parallel_lines'
  line1Id: string
  line2Id: string
  tolerance: number
}

export interface PerpendicularLinesConstraintDto extends ConstraintDto {
  type: 'perpendicular_lines'
  line1Id: string
  line2Id: string
  tolerance: number
}

export interface FixedPointConstraintDto extends ConstraintDto {
  type: 'fixed_point'
  pointId: string
  targetPosition: [number, number, number]
  tolerance: number
}

export interface CollinearPointsConstraintDto extends ConstraintDto {
  type: 'collinear_points'
  pointIds: string[]
  tolerance: number
}

export interface CoplanarPointsConstraintDto extends ConstraintDto {
  type: 'coplanar_points'
  pointIds: string[]
  tolerance: number
}

export interface EqualDistancesConstraintDto extends ConstraintDto {
  type: 'equal_distances'
  line1Id: string
  line2Id: string
  tolerance: number
}

export interface EqualAnglesConstraintDto extends ConstraintDto {
  type: 'equal_angles'
  angle1PointAId: string
  angle1VertexId: string
  angle1PointCId: string
  angle2PointAId: string
  angle2VertexId: string
  angle2PointCId: string
  tolerance: number
}

export interface ProjectionConstraintDto extends ConstraintDto {
  type: 'projection'
  pointId: string
  imagePointId: string
  viewpointId: string
  tolerance: number
}
