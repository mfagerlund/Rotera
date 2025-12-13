// Constraint creation and management hook for context-sensitive toolbar

import { useState, useCallback, useMemo } from 'react'
import { AvailableConstraint } from '../types/ui-types'
import { Constraint } from '../entities/constraint'
import { Line } from '../entities/line'
import { WorldPoint } from '../entities/world-point'
import { ISelectable } from '../types/selectable'
import { getConstraintPointIds } from '../types/utils'
import { getConstraintDisplayName } from '../utils/constraintDisplay'

// Legacy ConstraintType from types/project for backward compatibility
type ConstraintType =
  | 'point_fixed_coord' | 'point_locked' | 'point_on_line' | 'point_on_plane'
  | 'line_axis_aligned' | 'line_length' | 'line_passes_through' | 'line_in_plane'
  | 'plane_parallel_to_axis' | 'plane_offset'
  | 'points_distance' | 'points_equal' | 'points_coincident'
  | 'lines_parallel' | 'lines_perpendicular' | 'lines_colinear' | 'lines_intersect'
  | 'line_plane_parallel' | 'line_plane_perpendicular' | 'line_plane_intersect'
  | 'planes_parallel' | 'planes_perpendicular' | 'planes_coincident'
  | 'points_colinear' | 'points_coplanar' | 'points_equal_distance'
  | 'symmetry'

export const useConstraints = (
  constraints: Constraint[],
  onAddConstraint: (constraint: Constraint) => void,
  onUpdateConstraint: (constraint: Constraint, updates: { name?: string; parameters?: Record<string, unknown> }) => void,
  onDeleteConstraint: (constraint: Constraint) => void,
) => {
  const [activeConstraintType, setActiveConstraintType] = useState<string | null>(null)
  const [constraintParameters, setConstraintParameters] = useState<Record<string, any>>({})
  const [hoveredConstraintId, setHoveredConstraintId] = useState<string | null>(null)

  // Get all constraints with enabled/disabled status
  const getAllConstraints = useCallback((selected: ISelectable[]): AvailableConstraint[] => {
    const selectedPoints = selected.filter(s => s.getType() === 'point') as WorldPoint[]
    const selectedLines = selected.filter(s => s.getType() === 'line') as Line[]

    const pointCount = selectedPoints.length
    const lineCount = selectedLines.length

    return [
      {
        type: 'point_fixed_coord',
        icon: '📌',
        tooltip: 'Fix point position in 3D space',
        enabled: pointCount === 1 && lineCount === 0
      },
      {
        type: 'points_distance',
        icon: '↔',
        tooltip: 'Set distance between points',
        enabled: pointCount === 2 && lineCount === 0
      },
      // NOTE: Horizontal/vertical alignment is now handled through line creation with constraint properties
      {
        type: 'points_colinear',
        icon: '─',
        tooltip: 'Make points lie on same line',
        enabled: pointCount === 3 && lineCount === 0
      },
      {
        type: 'points_equal_distance',
        icon: '∠',
        tooltip: 'Set angle between points/lines',
        enabled: (pointCount === 3 && lineCount === 0) || lineCount === 2
      },
      {
        type: 'points_coplanar',
        icon: '▭',
        tooltip: 'Form rectangle with four corners',
        enabled: pointCount === 4 && lineCount === 0
      },
      {
        type: 'plane',
        icon: '◱',
        tooltip: 'Make points coplanar',
        enabled: pointCount >= 3 && lineCount === 0
      },
      {
        type: 'lines_parallel',
        icon: '∥',
        tooltip: 'Make lines parallel',
        enabled: lineCount === 2
      },
      {
        type: 'lines_perpendicular',
        icon: '⊥',
        tooltip: 'Make lines perpendicular',
        enabled: lineCount === 2
      },
      {
        type: 'points_equal_distance',
        icon: '○',
        tooltip: `Make points lie on circle`,
        enabled: pointCount >= 3
      }
    ]
  }, [])

  // Get available constraints based on current selection
  const getAvailableConstraints = useCallback((selected: ISelectable[]): AvailableConstraint[] => {
    const selectedPoints = selected.filter(s => s.getType() === 'point') as WorldPoint[]
    const selectedLines = selected.filter(s => s.getType() === 'line') as Line[]

    const constraints: AvailableConstraint[] = []
    const pointCount = selectedPoints.length
    const lineCount = selectedLines.length

    // 1 point selected
    if (pointCount === 1 && lineCount === 0) {
      constraints.push({
        type: 'point_fixed_coord',
        icon: '📌',
        tooltip: 'Fix point position in 3D space',
        enabled: true
      })
    }

    // 2 points selected
    if (pointCount === 2 && lineCount === 0) {
      constraints.push(
        {
          type: 'points_distance',
          icon: '↔',
          tooltip: 'Set distance between points',
          enabled: true
        },
        // NOTE: Horizontal/vertical alignment is now handled through line creation with constraint properties
      )
    }

    // 3 points selected
    if (pointCount === 3 && lineCount === 0) {
      constraints.push(
        {
          type: 'points_colinear',
          icon: '─',
          tooltip: 'Make points lie on same line',
          enabled: true
        },
        {
          type: 'points_equal_distance',
          icon: '∠',
          tooltip: 'Set angle between three points',
          enabled: true
        },
        {
          type: 'plane',
          icon: '◱',
          tooltip: 'Make points coplanar',
          enabled: true
        }
      )
    }

    // 4 points selected
    if (pointCount === 4 && lineCount === 0) {
      constraints.push(
        {
          type: 'points_coplanar',
          icon: '▭',
          tooltip: 'Form rectangle with four corners',
          enabled: true
        },
        {
          type: 'plane',
          icon: '◱',
          tooltip: 'Make points coplanar',
          enabled: true
        }
      )
    }

    // 5+ points selected
    if (pointCount >= 5 && lineCount === 0) {
      constraints.push(
        {
          type: 'plane',
          icon: '◱',
          tooltip: 'Make points coplanar',
          enabled: true
        }
      )
    }

    // 2 lines selected (4 points forming 2 lines)
    if (lineCount === 2) {
      constraints.push(
        {
          type: 'lines_parallel',
          icon: '∥',
          tooltip: 'Make lines parallel',
          enabled: true
        },
        {
          type: 'lines_perpendicular',
          icon: '⊥',
          tooltip: 'Make lines perpendicular',
          enabled: true
        },
        {
          type: 'points_equal_distance',
          icon: '∠',
          tooltip: 'Set angle between lines',
          enabled: true
        }
      )
    }

    // Circle constraints (3+ points)
    if (pointCount >= 3) {
      constraints.push({
        type: 'points_equal_distance',
        icon: '○',
        tooltip: `Make ${pointCount} points lie on circle`,
        enabled: true
      })
    }

    return constraints
  }, [])

  // Start creating a constraint of the given type
  const startConstraintCreation = useCallback((
    type: string,
    selected: ISelectable[]
  ) => {
    setActiveConstraintType(type)

    // Initialize parameters based on constraint type and selection
    const initialParams = getInitialConstraintParameters(type, selected)
    setConstraintParameters(initialParams)
  }, [])

  // Update a constraint parameter
  const updateParameter = useCallback((key: string, value: any) => {
    setConstraintParameters(prev => ({
      ...prev,
      [key]: value
    }))
  }, [])

  // Apply the current constraint being created
  const applyConstraint = useCallback(() => {
    if (!activeConstraintType) return

    // NOTE: This creates a plain object that matches the legacy Constraint interface
    // The actual conversion to Constraint entity class happens in the project store
    const constraint: any = {
      id: crypto.randomUUID(),
      type: activeConstraintType as ConstraintType,
      enabled: true,
      isDriving: true,
      weight: 1.0,
      status: 'satisfied',
      entities: {
        points: [],
        lines: [],
        planes: []
      },
      parameters: {},
      createdAt: new Date().toISOString(),
      ...constraintParameters
    }

    onAddConstraint(constraint)

    // Clear constraint creation state
    setActiveConstraintType(null)
    setConstraintParameters({})
  }, [activeConstraintType, constraintParameters, onAddConstraint])

  // Cancel constraint creation
  const cancelConstraintCreation = useCallback(() => {
    setActiveConstraintType(null)
    setConstraintParameters({})
  }, [])

  // Check if constraint creation is complete (has all required parameters)
  const isConstraintComplete = useCallback(() => {
    if (!activeConstraintType) return false

    switch (activeConstraintType) {
      case 'points_distance':
        return !!constraintParameters.distance
      case 'point_fixed_coord': {
        // Allow 0 values and require at least one coordinate to be set
        const hasX = constraintParameters.x !== undefined && constraintParameters.x !== null && constraintParameters.x !== ''
        const hasY = constraintParameters.y !== undefined && constraintParameters.y !== null && constraintParameters.y !== ''
        const hasZ = constraintParameters.z !== undefined && constraintParameters.z !== null && constraintParameters.z !== ''
        return hasX || hasY || hasZ
      }
      case 'points_coplanar':
        return true // No additional parameters required
      case 'lines_parallel':
      case 'lines_perpendicular':
      case 'points_colinear':
      case 'plane':
        return true // No additional parameters required
      case 'points_equal_distance':
        return !!constraintParameters.angle
      default:
        return false
    }
  }, [activeConstraintType, constraintParameters])

  // Constraint display helpers
  const getConstraintDisplayNameCallback = useCallback((constraint: Constraint) => {
    return getConstraintDisplayName(constraint)
  }, [])

  const getConstraintSummary = useCallback((constraint: Constraint) => {
    const constraintType = constraint.getConstraintType()

    switch (constraintType) {
      case 'distance_point_point':
        return `Distance constraint between points`
      case 'angle_point_point_point':
        return `Angle constraint`
      case 'perpendicular_lines':
        return `Perpendicular line relationship`
      case 'parallel_lines':
        return `Parallel line relationship`
      case 'collinear_points':
        return `Points on same line`
      case 'coplanar_points':
        return `4-corner rectangle shape`
      case 'fixed_point':
        return `Fixed position constraint`
      case 'equal_distances':
        return `Equal distance pairs`
      case 'equal_angles':
        return `Equal angle triplets`
      case 'projection':
        return `Projection constraint`
      default:
        return 'Geometric constraint'
    }
  }, [])

  const getConstraintPointIdsCallback = useCallback(getConstraintPointIds, [])

  return {
    // State
    activeConstraintType,
    constraintParameters,
    hoveredConstraintId,
    constraints,

    // Actions
    getAvailableConstraints,
    getAllConstraints,
    startConstraintCreation,
    updateParameter,
    applyConstraint,
    cancelConstraintCreation,
    setHoveredConstraintId,

    // Constraint management
    editConstraint: onUpdateConstraint,
    deleteConstraint: onDeleteConstraint,

    // Utilities
    isConstraintComplete,
    getConstraintDisplayName: getConstraintDisplayNameCallback,
    getConstraintSummary,
    getConstraintPointIds: getConstraintPointIdsCallback,
    isCreatingConstraint: !!activeConstraintType
  }
}

// Helper function to get initial parameters for a constraint type
type ConstraintParameters = Record<string, any>

function getInitialConstraintParameters(
  type: string,
  selected: ISelectable[]
): ConstraintParameters {
  const selectedPoints = selected.filter(s => s.getType() === 'point') as WorldPoint[]
  const selectedLines = selected.filter(s => s.getType() === 'line') as Line[]

  const params: ConstraintParameters = {}

  switch (type) {
    case 'points_distance':
      if (selectedPoints.length >= 2) {
        params.pointA = selectedPoints[0]
        params.pointB = selectedPoints[1]
      }
      break

    case 'points_equal_distance':
      if (selectedPoints.length >= 3 && selectedPoints.length <= 3) {
        // Angle constraint: 3 points where middle is vertex
        params.vertex = selectedPoints[1] // Middle point is vertex
        params.line1_end = selectedPoints[0]
        params.line2_end = selectedPoints[2]
      } else if (selectedLines.length >= 2) {
        // Angle between two lines - pass the Line objects directly
        params.line1 = selectedLines[0]
        params.line2 = selectedLines[1]
      } else if (selectedPoints.length > 3) {
        // Circle constraint: multiple points
        params.points = selectedPoints
      }
      break

    case 'lines_perpendicular':
    case 'lines_parallel':
      if (selectedLines.length >= 2) {
        // Pass Line objects directly
        params.line1 = selectedLines[0]
        params.line2 = selectedLines[1]
      }
      break

    case 'points_colinear':
      params.points = selectedPoints
      break

    case 'points_coplanar':
      if (selectedPoints.length >= 4) {
        params.cornerA = selectedPoints[0]
        params.cornerB = selectedPoints[1]
        params.cornerC = selectedPoints[2]
        params.cornerD = selectedPoints[3]
      }
      break

    case 'point_fixed_coord':
      if (selectedPoints.length >= 1) {
        params.point = selectedPoints[0]
      }
      break
  }

  return params
}