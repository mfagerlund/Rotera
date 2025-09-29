// Unified geometry system for new UI paradigm

export interface BaseEntity {
  id: string
  name: string
  isVisible: boolean
  color: string
  isConstruction?: boolean
  createdAt: string
  updatedAt?: string
}

export interface Point extends BaseEntity {
  type: 'point'
  xyz?: [number, number, number]  // 3D world coordinates
  imagePoints: ImagePoint[]       // 2D observations
  isOrigin?: boolean
  isLocked?: boolean
  group?: string
  tags?: string[]
}

export interface Line extends BaseEntity {
  type: 'line'
  definition: {
    type: 'two_points'
    pointIds: [string, string]
  }
  geometry: 'segment' | 'infinite'
  length?: number  // For segments
}

export interface Plane extends BaseEntity {
  type: 'plane'
  definition: {
    type: 'three_points' | 'two_lines' | 'line_point'
    pointIds?: [string, string, string]
    lineIds?: [string, string]
    lineId?: string
    pointId?: string
  }
  equation?: [number, number, number, number]  // ax + by + cz + d = 0
  isInfinite: boolean
}

export interface Circle extends BaseEntity {
  type: 'points_equal_distance'
  definition: {
    type: 'center_radius' | 'three_points'
    centerId?: string
    radius?: number
    pointIds?: [string, string, string]
  }
  center?: [number, number, number]
  radius?: number
  normal?: [number, number, number]
}

// Union type for all geometric entities
export type GeometricEntity = Point | Line | Plane | Circle

// Enhanced ImagePoint with more metadata
export interface ImagePoint {
  imageId: string
  u: number
  v: number
  wpId: string
  confidence?: number  // Detection confidence
  isManual: boolean   // Manual vs automatic detection
  timestamp: string
}

// Unified constraint parameter system
export interface ConstraintParameter {
  name: string
  type: 'number' | 'boolean' | 'string' | 'entity_ref'
  value: any
  min?: number
  max?: number
  step?: number
  unit?: string
  required: boolean
  description: string
}

// Enhanced constraint definition
export interface EnhancedConstraint {
  id: string
  type: ConstraintType
  name: string
  description?: string

  // Entity references
  entities: {
    points: string[]
    lines: string[]
    planes: string[]
    circles: string[]
  }

  // Unified parameter system
  parameters: Record<string, ConstraintParameter>

  // Constraint properties
  enabled: boolean
  isDriving: boolean
  weight: number
  priority: number

  // Status and feedback
  status: ConstraintStatus
  residual?: number
  error?: string

  // Visual properties
  showGlyph: boolean
  glyphPosition?: [number, number, number]
  color?: string

  // Metadata
  createdAt: string
  updatedAt?: string
  createdBy?: 'user' | 'system' | 'template'
  tags?: string[]
}

// Constraint type definitions with metadata
export interface ConstraintTypeDefinition {
  type: ConstraintType
  name: string
  description: string
  icon: string
  category: 'positioning' | 'dimensioning' | 'geometric' | 'advanced'

  // Entity requirements
  requirements: {
    points?: { min: number; max?: number }
    lines?: { min: number; max?: number }
    planes?: { min: number; max?: number }
    circles?: { min: number; max?: number }
  }

  // Parameter definitions
  parameterDefinitions: Record<string, Omit<ConstraintParameter, 'value'>>

  // Visual properties
  defaultGlyph?: string
  color?: string

  // Validation function
  validate?: (entities: string[], parameters: Record<string, any>) => boolean
}

// Enhanced constraint types with better organization
export type ConstraintType =
  // Point constraints
  | 'point_fixed_position'
  | 'point_on_line'
  | 'point_on_plane'
  | 'point_on_circle'

  // Distance constraints
  | 'distance_point_point'
  | 'distance_point_line'
  | 'distance_point_plane'

  // Alignment constraints
  | 'points_horizontal'
  | 'points_vertical'
  | 'points_collinear'
  | 'points_coplanar'

  // Angular constraints
  | 'angle_three_points'
  | 'angle_two_lines'
  | 'angle_line_plane'

  // Line constraints
  | 'lines_parallel'
  | 'lines_perpendicular'
  | 'lines_intersect'
  | 'line_length'

  // Plane constraints
  | 'planes_parallel'
  | 'planes_perpendicular'
  | 'planes_coincident'

  // Shape constraints
  | 'shape_rectangle'
  | 'shape_circle'
  | 'shape_triangle'
  | 'shape_polygon'

  // Symmetry constraints
  | 'symmetry_point'
  | 'symmetry_line'
  | 'symmetry_plane'

  // Legacy support (will be migrated)
  | 'points_distance' | 'points_equal_distance' | 'lines_perpendicular' | 'lines_parallel'
  | 'points_colinear' | 'points_coplanar' | 'points_equal_distance' | 'point_fixed_coord'

export type ConstraintStatus =
  | 'satisfied'     // Green - constraint is met within tolerance
  | 'warning'       // Yellow - close to tolerance or potential issue
  | 'violated'      // Red - constraint significantly violated
  | 'conflicting'   // Purple - conflicts with other constraints
  | 'redundant'     // Gray - constraint is redundant
  | 'undefined'     // Blue - not yet evaluated

// Constraint solving context
export interface ConstraintSolution {
  constraintId: string
  status: ConstraintStatus
  residual: number
  iterations: number
  convergenceTime: number
  suggestions?: string[]
}

// Entity relationship tracking
export interface EntityRelationship {
  fromId: string
  toId: string
  type: 'contains' | 'intersects' | 'lines_parallel' | 'lines_perpendicular' | 'points_distance'
  constraintIds: string[]
}