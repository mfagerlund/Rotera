// Enhanced project structure for new UI paradigm

import { EntityCollection, EntityManager, EntitySelection } from './entities'
import { EnhancedConstraint, ConstraintTypeDefinition } from './geometry'

// Enhanced project settings with workspace support
export interface EnhancedProjectSettings {
  // Display settings
  showPointNames: boolean
  showPointIds: boolean
  showConstraintGlyphs: boolean
  showMeasurements: boolean
  showConstructionGeometry: boolean

  // Theme and visual
  theme: 'dark' | 'light' | 'auto'
  visualFeedbackLevel: 'minimal' | 'standard' | 'detailed'
  entityColors: EntityColorScheme

  // Units and precision
  measurementUnits: 'meters' | 'feet' | 'inches' | 'millimeters'
  precisionDigits: number
  anglePrecisionDigits: number

  // Workspace behavior
  defaultWorkspace: 'image' | 'world' | 'split'
  autoSwitchWorkspace: boolean
  enableSmartSnapping: boolean
  snapTolerance: number

  // Constraint behavior
  constraintPreview: boolean
  autoOptimize: boolean
  solverMaxIterations: number
  solverTolerance: number

  // Grid and visualization
  gridVisible: boolean
  gridSize: number
  snapToGrid: boolean
  showCoordinateAxes: boolean
  showCameraPoses: boolean

  // Performance
  maxVisibleEntities: number
  levelOfDetail: boolean
  renderQuality: 'low' | 'medium' | 'high'

  // Auto-save and backup
  autoSave: boolean
  autoSaveInterval: number  // minutes
  keepBackups: number
}

export interface EntityColorScheme {
  // Entity states
  default: string
  selected: string
  highlighted: string
  construction: string

  // Entity types
  points: string
  lines: string
  planes: string
  circles: string

  // Constraint status
  satisfied: string
  warning: string
  violated: string
  conflicting: string
  redundant: string
}

// Enhanced image with calibration data
export interface EnhancedImage {
  id: string
  name: string
  blob: string
  width: number
  height: number

  // Camera association
  cameraId: string

  // Calibration status
  isCalibrated: boolean
  calibrationQuality?: number

  // Metadata
  createdAt: string
  updatedAt?: string
  fileSize?: number
  format?: string

  // Processing status
  isProcessed: boolean
  processingErrors?: string[]
}

// Enhanced camera with full calibration support
export interface EnhancedCamera {
  id: string
  name: string

  // Intrinsic parameters
  intrinsics?: {
    fx: number
    fy: number
    cx: number
    cy: number
    k1?: number  // Radial distortion
    k2?: number
    k3?: number
    p1?: number  // Tangential distortion
    p2?: number
  }

  // Extrinsic parameters (pose in world coordinates)
  extrinsics?: {
    rotation: [number, number, number]     // Rodrigues vector
    translation: [number, number, number] // Translation vector
  }

  // Calibration metadata
  calibrationQuality?: number
  calibrationMethod?: 'auto' | 'manual' | 'chessboard' | 'charuco'
  calibrationDate?: string
  calibrationPoints?: number
  reprojectionError?: number

  // Physical properties
  sensorSize?: {
    width: number   // mm
    height: number  // mm
  }
  focalLength?: number  // mm

  // Metadata
  createdAt: string
  updatedAt?: string
}

// Workspace state management
export interface WorkspaceState {
  currentWorkspace: 'image' | 'world' | 'split'

  // Image workspace state
  imageWorkspace: {
    currentImageId: string | null
    scale: number
    pan: { x: number; y: number }
    showImagePoints: boolean
    showProjections: boolean
  }

  // World workspace state
  worldWorkspace: {
    viewMatrix: {
      scale: number
      rotation: { x: number; y: number; z: number }
      translation: { x: number; y: number; z: number }
    }
    renderMode: 'wireframe' | 'solid' | 'textured'
    showAxes: boolean
    showGrid: boolean
    showCameras: boolean
  }

  // Split workspace state
  splitWorkspace: {
    splitDirection: 'horizontal' | 'vertical'
    splitRatio: number  // 0-1
    syncSelection: boolean
    syncNavigation: boolean
  }
}

// Project optimization state
export interface OptimizationState {
  status: 'idle' | 'running' | 'converged' | 'failed' | 'cancelled'
  currentIteration: number
  maxIterations: number
  residual: number
  targetResidual: number
  startTime?: string
  endTime?: string
  lastError?: string

  // Progress tracking
  constraintProgress: Array<{
    constraintId: string
    initialResidual: number
    currentResidual: number
    status: 'converged' | 'improving' | 'stuck' | 'failed'
  }>
}

// Project history for undo/redo
export interface ProjectHistoryEntry {
  id: string
  timestamp: string
  action: string
  description: string

  // State snapshots
  entitiesBefore?: Partial<EntityCollection>
  entitiesAfter?: Partial<EntityCollection>
  constraintsBefore?: EnhancedConstraint[]
  constraintsAfter?: EnhancedConstraint[]

  // Metadata
  affectedEntities: string[]
  affectedConstraints: string[]
  isUserAction: boolean
  canUndo: boolean
  canRedo: boolean
}

// Main enhanced project interface
export interface EnhancedProject {
  // Basic project info
  id: string
  name: string
  description?: string
  version: string  // Schema version for migrations

  // Core data
  entities: EntityCollection
  constraints: EnhancedConstraint[]
  images: Record<string, EnhancedImage>
  cameras: Record<string, EnhancedCamera>

  // Entity management
  entityManager: EntityManager
  selection: EntitySelection

  // Workspace and view state
  workspaceState: WorkspaceState
  settings: EnhancedProjectSettings

  // Constraint system
  constraintTypes: Record<string, ConstraintTypeDefinition>

  // Coordinate system
  coordinateSystem?: {
    origin: string        // Point ID marked as origin
    scale?: number        // Units per meter
    groundPlane?: {
      planeId: string
    }
    transformation?: {
      translation: [number, number, number]
      rotation: [number, number, number]
      scale: number
    }
  }

  // Organization
  groups: Record<string, EntityGroup>
  layers: Record<string, EntityLayer>

  // Analysis and optimization
  optimization: OptimizationState

  // History and versioning
  history: ProjectHistoryEntry[]
  currentHistoryIndex: number

  // Metadata
  createdAt: string
  updatedAt: string
  createdBy?: string
  lastModifiedBy?: string

  // File management
  filePath?: string
  isModified: boolean
  autoSaveEnabled: boolean
  lastSavedAt?: string
}

// Entity grouping system
export interface EntityGroup {
  id: string
  name: string
  description?: string
  color: string
  isVisible: boolean
  isLocked: boolean

  // Entity membership
  entityIds: string[]

  // Hierarchy
  parentGroupId?: string
  childGroupIds: string[]

  // Metadata
  createdAt: string
  tags?: string[]
}

// Layer system for organization
export interface EntityLayer {
  id: string
  name: string
  description?: string
  color: string
  isVisible: boolean
  isLocked: boolean
  opacity: number  // 0-1

  // Entity filters
  entityTypes: Array<'point' | 'line' | 'plane' | 'circle'>

  // Metadata
  createdAt: string
  order: number  // Layer ordering
}


// Export/Import formats
export interface ExportOptions {
  format: 'json' | 'csv' | 'ply' | 'obj' | 'xyz' | 'dxf'
  includeImages: boolean
  includeConstraints: boolean
  includeMetadata: boolean
  coordinateSystem: 'local' | 'world'
  precision: number
  units: 'meters' | 'feet' | 'inches' | 'millimeters'
}

// Project validation
export interface ProjectValidation {
  isValid: boolean
  errors: ProjectError[]
  warnings: ProjectWarning[]
  statistics: ProjectStatistics
}

export interface ProjectError {
  type: 'entity' | 'constraint' | 'reference' | 'calibration'
  severity: 'critical' | 'major' | 'minor'
  message: string
  affectedIds: string[]
  suggestedFix?: string
}

export interface ProjectWarning {
  type: 'performance' | 'quality' | 'optimization'
  message: string
  affectedIds: string[]
  recommendation?: string
}

export interface ProjectStatistics {
  totalEntities: number
  entitiesByType: Record<string, number>
  totalConstraints: number
  constraintsByType: Record<string, number>
  totalImages: number
  calibratedCameras: number
  averageReprojectionError?: number
  optimizationStatus: string
  lastOptimizationTime?: string
}

// Migration support for legacy projects
export interface ProjectMigration {
  fromVersion: string
  toVersion: string
  migrate: (oldProject: any) => EnhancedProject
  canMigrate: (project: any) => boolean
}