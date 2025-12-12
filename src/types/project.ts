// ⚠️ DEPRECATED - DO NOT ADD NEW IMPORTS FROM THIS FILE
// This file contains legacy DTO types that are being phased out
//
// For new code, use:
// - Entity classes from entities/* (WorldPoint, Line, Viewpoint, Constraint)
// - DTOs from entities/*/Dto.ts for serialization only
// - EntityProject from types/project-entities
//
// Remaining imports (3 files) are for:
// - Plane interface (PlanesManager - requires separate migration)
// - Constraint type (validation service compatibility)
//
// All other types have been moved to:
// - UI types: types/ui-types.ts
// - Entity classes: entities/*

// ============================================================================
// LEGACY: Constraint Types (used by validation services)
// ============================================================================

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

// ============================================================================
// LEGACY: Plane Interface (used by PlanesManager - requires migration)
// ============================================================================

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
  color: string        // Visual distinction
  isConstruction?: boolean  // Construction vs driving geometry
  createdAt?: string   // Creation timestamp
}

// ============================================================================
// LEGACY: Symmetry Constraint (extends Constraint)
// ============================================================================

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
