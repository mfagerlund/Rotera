// Constraint creation and management hook for context-sensitive toolbar

import { useState, useCallback, useMemo } from 'react'
import { Constraint, ConstraintType, AvailableConstraint, Line } from '../types/project'
import { getConstraintPointIds } from '../types/utils'

export const useConstraints = (
  constraints: Constraint[],
  onAddConstraint: (constraint: Constraint) => void,
  onUpdateConstraint: (id: string, updates: Partial<Constraint>) => void,
  onDeleteConstraint: (id: string) => void,
  onToggleConstraint: (id: string) => void
) => {
  const [activeConstraintType, setActiveConstraintType] = useState<string | null>(null)
  const [constraintParameters, setConstraintParameters] = useState<Record<string, any>>({})
  const [hoveredConstraintId, setHoveredConstraintId] = useState<string | null>(null)

  // Get all constraints with enabled/disabled status
  const getAllConstraints = useCallback((selectedPoints: string[], selectedLines: Line[]): AvailableConstraint[] => {
    const pointCount = selectedPoints.length
    const lineCount = selectedLines.length

    return [
      {
        type: 'fixed',
        icon: '📌',
        tooltip: 'Fix point position in 3D space',
        enabled: pointCount === 1 && lineCount === 0
      },
      {
        type: 'distance',
        icon: '↔',
        tooltip: 'Set distance between points',
        enabled: pointCount === 2 && lineCount === 0
      },
      {
        type: 'horizontal',
        icon: '⟷',
        tooltip: 'Make points horizontally aligned',
        enabled: pointCount === 2 && lineCount === 0
      },
      {
        type: 'vertical',
        icon: '↕',
        tooltip: 'Make points vertically aligned',
        enabled: pointCount === 2 && lineCount === 0
      },
      {
        type: 'collinear',
        icon: '─',
        tooltip: 'Make points lie on same line',
        enabled: pointCount === 3 && lineCount === 0
      },
      {
        type: 'angle',
        icon: '∠',
        tooltip: 'Set angle between points/lines',
        enabled: (pointCount === 3 && lineCount === 0) || lineCount === 2
      },
      {
        type: 'rectangle',
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
        type: 'parallel',
        icon: '∥',
        tooltip: 'Make lines parallel',
        enabled: lineCount === 2
      },
      {
        type: 'perpendicular',
        icon: '⊥',
        tooltip: 'Make lines perpendicular',
        enabled: lineCount === 2
      },
      {
        type: 'circle',
        icon: '○',
        tooltip: `Make points lie on circle`,
        enabled: pointCount >= 3
      }
    ]
  }, [])

  // Get available constraints based on current selection
  const getAvailableConstraints = useCallback((selectedPoints: string[], selectedLines: Line[]): AvailableConstraint[] => {
    const constraints: AvailableConstraint[] = []
    const pointCount = selectedPoints.length
    const lineCount = selectedLines.length

    // 1 point selected
    if (pointCount === 1 && lineCount === 0) {
      constraints.push({
        type: 'fixed',
        icon: '📌',
        tooltip: 'Fix point position in 3D space',
        enabled: true
      })
    }

    // 2 points selected
    if (pointCount === 2 && lineCount === 0) {
      constraints.push(
        {
          type: 'distance',
          icon: '↔',
          tooltip: 'Set distance between points',
          enabled: true
        },
        {
          type: 'horizontal',
          icon: '⟷',
          tooltip: 'Make points horizontally aligned',
          enabled: true
        },
        {
          type: 'vertical',
          icon: '↕',
          tooltip: 'Make points vertically aligned',
          enabled: true
        }
      )
    }

    // 3 points selected
    if (pointCount === 3 && lineCount === 0) {
      constraints.push(
        {
          type: 'collinear',
          icon: '─',
          tooltip: 'Make points lie on same line',
          enabled: true
        },
        {
          type: 'angle',
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
          type: 'rectangle',
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
          type: 'parallel',
          icon: '∥',
          tooltip: 'Make lines parallel',
          enabled: true
        },
        {
          type: 'perpendicular',
          icon: '⊥',
          tooltip: 'Make lines perpendicular',
          enabled: true
        },
        {
          type: 'angle',
          icon: '∠',
          tooltip: 'Set angle between lines',
          enabled: true
        }
      )
    }

    // Circle constraints (3+ points)
    if (pointCount >= 3) {
      constraints.push({
        type: 'circle',
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
    selectedPoints: string[],
    selectedLines: Line[]
  ) => {
    setActiveConstraintType(type)

    // Initialize parameters based on constraint type and selection
    const initialParams = getInitialConstraintParameters(type, selectedPoints, selectedLines)
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

    const constraint: Constraint = {
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
      case 'distance':
        return !!constraintParameters.distance
      case 'angle':
        return !!constraintParameters.angle
      case 'fixed': {
        // Allow 0 values and require at least one coordinate to be set
        const hasX = constraintParameters.x !== undefined && constraintParameters.x !== null && constraintParameters.x !== ''
        const hasY = constraintParameters.y !== undefined && constraintParameters.y !== null && constraintParameters.y !== ''
        const hasZ = constraintParameters.z !== undefined && constraintParameters.z !== null && constraintParameters.z !== ''
        return hasX || hasY || hasZ
      }
      case 'rectangle':
        return true // No additional parameters required
      case 'parallel':
      case 'perpendicular':
      case 'collinear':
      case 'circle':
      case 'plane':
        return true // No additional parameters required
      default:
        return false
    }
  }, [activeConstraintType, constraintParameters])

  // Constraint display helpers
  const getConstraintDisplayName = useCallback((constraint: Constraint) => {
    switch (constraint.type) {
      case 'distance':
        return `Distance: ${constraint.pointA} ↔ ${constraint.pointB}`
      case 'angle':
        return `Angle: ${constraint.angle_degrees || constraint.angle}°`
      case 'perpendicular':
        return `Perpendicular Lines`
      case 'parallel':
        return `Parallel Lines`
      case 'collinear':
        return `Collinear Points`
      case 'rectangle':
        return `Rectangle Shape`
      case 'circle':
        return `Circle Constraint`
      case 'fixed':
        return `Fixed Point`
      default:
        return `${constraint.type.charAt(0).toUpperCase()}${constraint.type.slice(1)} Constraint`
    }
  }, [])

  const getConstraintSummary = useCallback((constraint: Constraint) => {
    switch (constraint.type) {
      case 'distance':
        return `${constraint.distance}m between points`
      case 'angle':
        return `${constraint.angle_degrees || constraint.angle}° angle constraint`
      case 'perpendicular':
        return `Perpendicular line relationship`
      case 'parallel':
        return `Parallel line relationship`
      case 'collinear':
        return `Points on same line`
      case 'rectangle':
        return `4-corner rectangle shape`
      case 'circle':
        return `Points on circle boundary`
      case 'fixed':
        return `Fixed position constraint`
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
    toggleConstraint: onToggleConstraint,

    // Utilities
    isConstraintComplete,
    getConstraintDisplayName,
    getConstraintSummary,
    getConstraintPointIds: getConstraintPointIdsCallback,
    isCreatingConstraint: !!activeConstraintType
  }
}

// Helper function to get initial parameters for a constraint type
type ConstraintParameters = Record<string, string | number | string[] | boolean | undefined>

function getInitialConstraintParameters(
  type: string,
  selectedPoints: string[],
  selectedLines: Line[]
): ConstraintParameters {
  const params: ConstraintParameters = {}

  switch (type) {
    case 'distance':
      if (selectedPoints.length >= 2) {
        params.pointA = selectedPoints[0]
        params.pointB = selectedPoints[1]
      }
      break

    case 'angle':
      if (selectedPoints.length >= 3) {
        params.vertex = selectedPoints[1] // Middle point is vertex
        params.line1_end = selectedPoints[0]
        params.line2_end = selectedPoints[2]
      } else if (selectedLines.length >= 2) {
        // Angle between two lines
        params.line1_wp_a = selectedLines[0].pointA
        params.line1_wp_b = selectedLines[0].pointB
        params.line2_wp_a = selectedLines[1].pointA
        params.line2_wp_b = selectedLines[1].pointB
      }
      break

    case 'perpendicular':
    case 'parallel':
      if (selectedLines.length >= 2) {
        params.line1_wp_a = selectedLines[0].pointA
        params.line1_wp_b = selectedLines[0].pointB
        params.line2_wp_a = selectedLines[1].pointA
        params.line2_wp_b = selectedLines[1].pointB
      }
      break

    case 'collinear':
      params.wp_ids = selectedPoints
      break

    case 'rectangle':
      if (selectedPoints.length >= 4) {
        params.cornerA = selectedPoints[0]
        params.cornerB = selectedPoints[1]
        params.cornerC = selectedPoints[2]
        params.cornerD = selectedPoints[3]
      }
      break

    case 'circle':
      params.point_ids = selectedPoints
      break

    case 'fixed':
      if (selectedPoints.length >= 1) {
        params.point_id = selectedPoints[0]
      }
      break
  }

  return params
}