import type { BaseDto } from '../serialization/ISerializable'

export interface BaseConstraintDto extends BaseDto {
  id: string
  type: string
  name: string
}

export interface DistanceConstraintDto extends BaseConstraintDto {
  type: 'distance_point_point'
  pointAId: string
  pointBId: string
  targetDistance: number
  tolerance: number
}

export interface AngleConstraintDto extends BaseConstraintDto {
  type: 'angle_point_point_point'
  pointAId: string
  vertexId: string
  pointCId: string
  targetAngle: number
  tolerance: number
}

export interface ParallelLinesConstraintDto extends BaseConstraintDto {
  type: 'parallel_lines'
  line1Id: string
  line2Id: string
  tolerance: number
}

export interface PerpendicularLinesConstraintDto extends BaseConstraintDto {
  type: 'perpendicular_lines'
  line1Id: string
  line2Id: string
  tolerance: number
}

export interface FixedPointConstraintDto extends BaseConstraintDto {
  type: 'fixed_point'
  pointId: string
  targetPosition: [number, number, number]
  tolerance: number
}

export interface CollinearPointsConstraintDto extends BaseConstraintDto {
  type: 'collinear_points'
  pointIds: string[]
  tolerance: number
}

export interface CoplanarPointsConstraintDto extends BaseConstraintDto {
  type: 'coplanar_points'
  pointIds: string[]
  tolerance: number
}

export interface EqualDistancesConstraintDto extends BaseConstraintDto {
  type: 'equal_distances'
  line1Id: string
  line2Id: string
  tolerance: number
}

export interface EqualAnglesConstraintDto extends BaseConstraintDto {
  type: 'equal_angles'
  angle1PointAId: string
  angle1VertexId: string
  angle1PointCId: string
  angle2PointAId: string
  angle2VertexId: string
  angle2PointCId: string
  tolerance: number
}

export interface ProjectionConstraintDto extends BaseConstraintDto {
  type: 'projection'
  pointId: string
  imagePointId: string
  viewpointId: string
  tolerance: number
}

export type ConstraintDto =
  | DistanceConstraintDto
  | AngleConstraintDto
  | ParallelLinesConstraintDto
  | PerpendicularLinesConstraintDto
  | FixedPointConstraintDto
  | CollinearPointsConstraintDto
  | CoplanarPointsConstraintDto
  | EqualDistancesConstraintDto
  | EqualAnglesConstraintDto
  | ProjectionConstraintDto
