// Union type for all constraint DTOs

import type { PointId, LineId, PlaneId } from '../../../types/ids'
import type { BaseConstraintDto } from './BaseConstraintDto'

// Distance between two points
export interface DistancePointPointDto extends BaseConstraintDto {
  type: 'distance_point_point'
  pointA: PointId
  pointB: PointId
  targetDistance: number
}

// Distance from point to line
export interface DistancePointLineDto extends BaseConstraintDto {
  type: 'distance_point_line'
  point: PointId
  line: LineId
  targetDistance: number
}

// Distance from point to plane
export interface DistancePointPlaneDto extends BaseConstraintDto {
  type: 'distance_point_plane'
  point: PointId
  plane: PlaneId
  targetDistance: number
}

// Angle between three points
export interface AnglePointPointPointDto extends BaseConstraintDto {
  type: 'angle_point_point_point'
  pointA: PointId
  vertex: PointId
  pointC: PointId
  targetAngle: number // in degrees
}

// Angle between two lines
export interface AngleLineLineDto extends BaseConstraintDto {
  type: 'angle_line_line'
  lineA: LineId
  lineB: LineId
  targetAngle: number // in degrees
}

// Parallel lines
export interface ParallelLinesDto extends BaseConstraintDto {
  type: 'parallel_lines'
  lineA: LineId
  lineB: LineId
}

// Perpendicular lines
export interface PerpendicularLinesDto extends BaseConstraintDto {
  type: 'perpendicular_lines'
  lineA: LineId
  lineB: LineId
}

// Collinear points
export interface CollinearPointsDto extends BaseConstraintDto {
  type: 'collinear_points'
  points: PointId[]
}

// Coplanar points
export interface CoplanarPointsDto extends BaseConstraintDto {
  type: 'coplanar_points'
  points: PointId[]
}

// Fixed point position
export interface FixedPointDto extends BaseConstraintDto {
  type: 'fixed_point'
  point: PointId
  targetPosition: [number, number, number]
}

// NOTE: HorizontalLineDto and VerticalLineDto have been removed - horizontal/vertical constraints are now line properties

// Equal distances
export interface EqualDistancesDto extends BaseConstraintDto {
  type: 'equal_distances'
  distancePairs: Array<{
    pointA: PointId
    pointB: PointId
  }>
}

// Equal angles
export interface EqualAnglesDto extends BaseConstraintDto {
  type: 'equal_angles'
  angleTriplets: Array<{
    pointA: PointId
    vertex: PointId
    pointC: PointId
  }>
}

// Union type for all constraint DTOs
export type ConstraintDto =
  | DistancePointPointDto
  | DistancePointLineDto
  | DistancePointPlaneDto
  | AnglePointPointPointDto
  | AngleLineLineDto
  | ParallelLinesDto
  | PerpendicularLinesDto
  | CollinearPointsDto
  | CoplanarPointsDto
  | FixedPointDto
  | EqualDistancesDto
  | EqualAnglesDto

// Multi-constraint container for storage
export interface MultiConstraintDto {
  constraints: ConstraintDto[]
}