// UI-level types for application state, tools, and user interactions
// These are NOT domain entities or DTOs - they describe UI state and tooling

import { Line } from '../entities/line'
import { Project } from '../entities/project'

// ============================================================================
// Selection State
// ============================================================================

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

// ============================================================================
// Constraint Creation State
// ============================================================================

export interface ConstraintCreationState {
  type: string | null
  selectedPoints: string[]
  selectedLines: Line[]  // Entity references
  parameters: Record<string, any>
  isActive: boolean
}

// ============================================================================
// Available Tools/Constraints
// ============================================================================

export interface AvailableConstraint {
  type: string
  icon: string
  tooltip: string
  enabled: boolean
}

// ============================================================================
// History/Undo-Redo
// ============================================================================

export interface ProjectHistoryEntry {
  id: string
  timestamp: string
  action: string
  description: string
  before?: unknown
  after?: unknown
}

// ============================================================================
// Measurements
// ============================================================================

export interface Measurement {
  id: string
  type: 'points_distance' | 'points_equal_distance' | 'area'
  pointIds: string[]
  value?: number
  units?: string
  label?: string
}

// ============================================================================
// Export/Import
// ============================================================================

export interface ExportOptions {
  format: 'csv' | 'json' | 'ply' | 'obj' | 'xyz'
  includeImages: boolean
  includeConstraints: boolean
  coordinateSystem: 'local' | 'world'
  precision: number
}

// ============================================================================
// 3D Visualization
// ============================================================================

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

// ============================================================================
// Optimization
// ============================================================================

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
