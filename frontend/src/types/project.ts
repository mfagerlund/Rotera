// Core project data types for Fusion 360-inspired UI

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
  type: string
  enabled: boolean
  [key: string]: any  // Constraint-specific parameters
}

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
}

export interface Project {
  id: string
  name: string
  worldPoints: Record<string, WorldPoint>
  images: Record<string, ProjectImage>
  cameras: Record<string, Camera>
  constraints: Constraint[]
  nextWpNumber: number    // For auto-naming WP1, WP2...
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

// Selection and interaction types
export interface Line {
  pointA: string
  pointB: string
}

export interface SelectionState {
  selectedPoints: string[]
  selectedLines: Line[]
  selectionMode: 'points' | 'lines' | 'auto'
}

// Constraint creation types
export interface ConstraintCreationState {
  type: string | null
  selectedPoints: string[]
  selectedLines: Line[]
  parameters: Record<string, any>
  isActive: boolean
}

// Template system
export interface ConstraintTemplate {
  id: string
  name: string
  description: string
  constraints: Array<{
    type: string
    parameters: Record<string, any>
    pointRoles: string[] // e.g., ['corner1', 'corner2', 'corner3', 'corner4']
  }>
  requiredPoints: number
  category: string
}

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  thumbnail?: string
  constraints: Constraint[]
  worldPoints: WorldPoint[]
  settings: Partial<ProjectSettings>
  category: string
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
  type: 'distance' | 'angle' | 'area'
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
  symmetryPlane: {
    pointA: string
    pointB: string
    pointC: string
  }
}