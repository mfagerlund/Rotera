// Core project data types for CAD-inspired UI

export interface WorldPoint {
  id: string           // UUID for backend
  name: string         // Display name: "WP1", "WP2", etc.
  xyz?: [number, number, number]  // 3D coordinates (optional)
  imagePoints: ImagePoint[]       // Associated image observations
  isVisible: boolean   // Show/hide in UI
  color: string        // Visual distinction
  isOrigin?: boolean   // Mark as coordinate system origin
  isLocked?: boolean   // Prevent modification
  group?: string       // Point group/layer
  tags?: string[]      // User-defined tags
  createdAt?: string   // Creation timestamp
}

export interface ImagePoint {
  imageId: string
  u: number           // Pixel x coordinate
  v: number           // Pixel y coordinate
  wpId: string        // Associated world point
}

export interface ProjectImage {
  id: string
  name: string
  blob: string          // Base64 encoded image data
  width: number
  height: number
  cameraId?: string
}

export interface CameraIntrinsics {
  fx: number
  fy: number
  cx: number
  cy: number
  k1?: number
  k2?: number
  k3?: number
  p1?: number
  p2?: number
}

export interface CameraExtrinsics {
  rotation: [number, number, number]     // Rodrigues rotation vector
  translation: [number, number, number] // Translation vector
}

export interface Camera {
  id: string
  name: string
  intrinsics?: CameraIntrinsics
  extrinsics?: CameraExtrinsics
  calibrationQuality?: number
  calibrationMethod?: 'auto' | 'manual' | 'chessboard'
}

export interface Constraint {
  id: string
  type: ConstraintType
  enabled: boolean
  isDriving: boolean    // vs construction constraint
  weight: number        // Solver weight (0-1)
  residual?: number     // Current error/residual
  status: 'satisfied' | 'warning' | 'violated'
  entities: {
    points?: string[]   // WorldPoint IDs
    lines?: string[]    // Line IDs
    planes?: string[]   // Plane IDs
  }
  parameters: Record<string, any>  // Constraint-specific parameters
  createdAt: string

}

export type ConstraintType =
  // Single entity constraints
  | 'point_fixed_coord' | 'point_locked' | 'point_on_line' | 'point_on_plane'
  | 'line_axis_aligned' | 'line_length' | 'line_passes_through' | 'line_in_plane'
  | 'plane_parallel_to_axis' | 'plane_offset'
  // Two entity constraints
  | 'points_distance' | 'points_equal' | 'points_coincident'
  | 'lines_parallel' | 'lines_perpendicular' | 'lines_colinear' | 'lines_intersect'
  | 'line_plane_parallel' | 'line_plane_perpendicular' | 'line_plane_intersect'
  | 'planes_parallel' | 'planes_perpendicular' | 'planes_coincident'
  // Multi-entity constraints
  | 'points_colinear' | 'points_coplanar' | 'points_equal_distance'
  // Special constraints
  | 'symmetry'

export interface ProjectSettings {
  showPointNames: boolean
  autoSave: boolean
  theme: 'dark' | 'light'
  measurementUnits: 'meters' | 'feet' | 'inches'
  precisionDigits: number
  showConstraintGlyphs: boolean
  showMeasurements: boolean
  autoOptimize: boolean
  gridVisible: boolean
  snapToGrid: boolean
  // New paradigm settings
  defaultWorkspace: 'image' | 'world'
  showConstructionGeometry: boolean
  enableSmartSnapping: boolean
  constraintPreview: boolean
  visualFeedbackLevel: 'minimal' | 'standard' | 'detailed'
  imageSortOrder?: string[]
}

// Workspace and view types
export type WorkspaceType = 'image' | 'world'
export type ViewMode = 'image_view' | 'world_view' | 'split_view'

// Visual language for constraint status
export type ConstraintStatus = 'satisfied' | 'warning' | 'violated'
export type EntityColor = {
  satisfied: string     // Green
  warning: string       // Amber
  violated: string      // Red
  worldGeometry: string // Blue
  imageGuides: string   // Orange
  construction: string  // Gray
  selection: string     // Highlight color
}

// Constraint glyphs for visual feedback
export type ConstraintGlyph =
  | '∥' | '⟂' | '⎓' | '⌖' | '🔒' | '≡' | '↔' | '∠' | '○' | '□' | '△'

export interface Project {
  id: string
  name: string
  worldPoints: Record<string, WorldPoint>
  lines: Record<string, Line>
  planes: Record<string, Plane>
  images: Record<string, ProjectImage>
  cameras: Record<string, Camera>
  constraints: Constraint[]
  nextWpNumber: number    // For auto-naming WP1, WP2...
  nextLineNumber: number  // For auto-naming L1, L2...
  nextPlaneNumber: number // For auto-naming P1, P2...
  settings: ProjectSettings
  coordinateSystem?: {
    origin: string        // World point ID marked as origin
    scale?: number        // Units per meter
    groundPlane?: {
      pointA: string
      pointB: string
      pointC: string
    }
  }
  pointGroups: Record<string, {
    id?: string
    name: string
    color: string
    visible: boolean
    points: string[]
  }>
  optimization?: {
    lastRun?: string
    status: 'not_run' | 'running' | 'converged' | 'failed'
    residuals?: number
    iterations?: number
  }
  groundPlanes?: Array<{
    id: string
    name: string
    pointIds: [string, string, string]
    equation?: [number, number, number, number]
  }>
  history: ProjectHistoryEntry[]
  createdAt: string
  updatedAt: string
}

// New paradigm: Geometric primitives
export interface Line {
  id: string           // UUID for backend
  name: string         // Display name: "L1", "L2", etc.
  pointA: string       // First world point ID
  pointB: string       // Second world point ID
  type: 'segment'  // Line segment
  isVisible: boolean   // Show/hide in UI
  color: string        // Visual distinction
  isConstruction?: boolean  // Construction vs driving geometry
  createdAt?: string   // Creation timestamp
  constraints?: {      // Embedded constraints
    direction: 'free' | 'horizontal' | 'vertical' | 'x-aligned' | 'y-aligned' | 'z-aligned'
    targetLength?: number
    tolerance?: number
  }
}

export interface Plane {
  id: string           // UUID for backend
  name: string         // Display name: "P1", "P2", etc.
  definition: {
    type: 'three_points' | 'two_lines' | 'line_point'
    pointIds?: [string, string, string]  // For three_points
    lineIds?: [string, string]           // For two_lines
    lineId?: string                      // For line_point
    pointId?: string                     // For line_point
  }
  equation?: [number, number, number, number]  // ax + by + cz + d = 0
  isVisible: boolean   // Show/hide in UI
  color: string        // Visual distinction
  isConstruction?: boolean  // Construction vs driving geometry
  createdAt?: string   // Creation timestamp
}

export interface SelectionState {
  selectedPoints: string[]      // WorldPoint IDs
  selectedLines: string[]       // Line IDs
  selectedPlanes: string[]      // Plane IDs
  selectedImagePoints: string[] // ImagePoint IDs
  primarySelection: string | null  // ID of last selected entity (pivot)
  primaryType: 'point' | 'line' | 'plane' | 'imagepoint' | null
  selectionFilters: {
    points: boolean
    lines: boolean
    planes: boolean
    imagePoints: boolean
  }
}

// Constraint creation types
export interface ConstraintCreationState {
  type: string | null
  selectedPoints: string[]
  selectedLines: Line[]
  parameters: Record<string, any>
  isActive: boolean
}


// Available constraint definition
export interface AvailableConstraint {
  type: string
  icon: string
  tooltip: string
  enabled: boolean
}

// Project history for undo/redo
export interface ProjectHistoryEntry {
  id: string
  timestamp: string
  action: string
  description: string
  before?: any
  after?: any
}

// Measurement tools
export interface Measurement {
  id: string
  type: 'points_distance' | 'points_equal_distance' | 'area'
  pointIds: string[]
  value?: number
  units?: string
  label?: string
}

// Export options
export interface ExportOptions {
  format: 'csv' | 'json' | 'ply' | 'obj' | 'xyz'
  includeImages: boolean
  includeConstraints: boolean
  coordinateSystem: 'local' | 'world'
  precision: number
}

// Point cloud visualization
export interface PointCloud {
  points: Array<{
    position: [number, number, number]
    color?: [number, number, number]
    size?: number
    worldPointId: string
  }>
  cameras: Array<{
    position: [number, number, number]
    rotation: [number, number, number]
    fov: number
    imageId: string
  }>
}

// Optimization types
export interface OptimizationProgress {
  iteration: number
  residual?: number
  converged: boolean
  error?: string
}

export interface OptimizationService {
  optimize: (project: Project) => Promise<Project>
  simulateOptimization: (project: Project) => Promise<Project>
}

// Symmetry constraint types
export interface SymmetryConstraint extends Constraint {
  type: 'symmetry'
  pointPairs: Array<[string, string]>
  symmetricPairs: Array<[string, string]>  // Legacy alias
  symmetryType: 'mirror' | 'rotational' | 'translational'
  symmetryPlane: {
    pointA: string
    pointB: string
    pointC: string
  }
}