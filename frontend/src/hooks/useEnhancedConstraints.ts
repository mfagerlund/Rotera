// Enhanced constraint system for new UI paradigm

import { useState, useCallback, useMemo } from 'react'
import {
  EnhancedConstraint,
  ConstraintType,
  ConstraintTypeDefinition,
  ConstraintStatus,
  ConstraintParameter
} from '../types/geometry'
import { EntityManager } from '../types/entities'

// Constraint type definitions with full metadata
const CONSTRAINT_TYPE_DEFINITIONS: Record<ConstraintType, ConstraintTypeDefinition> = {
  // Point constraints
  point_fixed_position: {
    type: 'point_fixed_position',
    name: 'Fix Position',
    description: 'Fix a point at specific 3D coordinates',
    icon: '📌',
    category: 'positioning',
    requirements: {
      points: { min: 1, max: 1 }
    },
    parameterDefinitions: {
      x: { name: 'X', type: 'number', unit: 'm', required: false, description: 'X coordinate' },
      y: { name: 'Y', type: 'number', unit: 'm', required: false, description: 'Y coordinate' },
      z: { name: 'Z', type: 'number', unit: 'm', required: false, description: 'Z coordinate' }
    },
    defaultGlyph: '📌',
    color: '#F44336'
  },

  point_on_line: {
    type: 'point_on_line',
    name: 'Point on Line',
    description: 'Constrain a point to lie on a line',
    icon: '•─',
    category: 'positioning',
    requirements: {
      points: { min: 1, max: 1 },
      lines: { min: 1, max: 1 }
    },
    parameterDefinitions: {},
    defaultGlyph: '•',
    color: '#2196F3'
  },

  point_on_plane: {
    type: 'point_on_plane',
    name: 'Point on Plane',
    description: 'Constrain a point to lie on a plane',
    icon: '•◱',
    category: 'positioning',
    requirements: {
      points: { min: 1, max: 1 },
      planes: { min: 1, max: 1 }
    },
    parameterDefinitions: {},
    defaultGlyph: '•',
    color: '#9C27B0'
  },

  // Distance constraints
  distance_point_point: {
    type: 'distance_point_point',
    name: 'Distance',
    description: 'Set distance between two points',
    icon: '↔',
    category: 'dimensioning',
    requirements: {
      points: { min: 2, max: 2 }
    },
    parameterDefinitions: {
      distance: { name: 'Distance', type: 'number', unit: 'm', required: true, min: 0, description: 'Distance between points' }
    },
    defaultGlyph: '↔',
    color: '#4CAF50'
  },

  // Alignment constraints
  points_horizontal: {
    type: 'points_horizontal',
    name: 'Horizontal',
    description: 'Make points horizontally aligned',
    icon: '⟷',
    category: 'geometric',
    requirements: {
      points: { min: 2, max: 10 }
    },
    parameterDefinitions: {},
    defaultGlyph: '⟷',
    color: '#FF9800'
  },

  points_vertical: {
    type: 'points_vertical',
    name: 'Vertical',
    description: 'Make points vertically aligned',
    icon: '↕',
    category: 'geometric',
    requirements: {
      points: { min: 2, max: 10 }
    },
    parameterDefinitions: {},
    defaultGlyph: '↕',
    color: '#FF9800'
  },

  points_collinear: {
    type: 'points_collinear',
    name: 'Collinear',
    description: 'Make points lie on the same line',
    icon: '─',
    category: 'geometric',
    requirements: {
      points: { min: 3, max: 20 }
    },
    parameterDefinitions: {},
    defaultGlyph: '─',
    color: '#607D8B'
  },

  // Angular constraints
  angle_three_points: {
    type: 'angle_three_points',
    name: 'Angle',
    description: 'Set angle between three points',
    icon: '∠',
    category: 'dimensioning',
    requirements: {
      points: { min: 3, max: 3 }
    },
    parameterDefinitions: {
      angle: { name: 'Angle', type: 'number', unit: '°', required: true, min: 0, max: 360, description: 'Angle in degrees' }
    },
    defaultGlyph: '∠',
    color: '#E91E63'
  },

  // Line constraints
  lines_parallel: {
    type: 'lines_parallel',
    name: 'Parallel',
    description: 'Make lines parallel',
    icon: '∥',
    category: 'geometric',
    requirements: {
      lines: { min: 2, max: 5 }
    },
    parameterDefinitions: {},
    defaultGlyph: '∥',
    color: '#3F51B5'
  },

  lines_perpendicular: {
    type: 'lines_perpendicular',
    name: 'Perpendicular',
    description: 'Make lines perpendicular',
    icon: '⊥',
    category: 'geometric',
    requirements: {
      lines: { min: 2, max: 2 }
    },
    parameterDefinitions: {},
    defaultGlyph: '⊥',
    color: '#3F51B5'
  },

  // Shape constraints
  shape_rectangle: {
    type: 'shape_rectangle',
    name: 'Rectangle',
    description: 'Form a rectangle with four points',
    icon: '▭',
    category: 'geometric',
    requirements: {
      points: { min: 4, max: 4 }
    },
    parameterDefinitions: {},
    defaultGlyph: '▭',
    color: '#795548'
  },

  shape_circle: {
    type: 'shape_circle',
    name: 'Circle',
    description: 'Make points lie on a circle',
    icon: '○',
    category: 'geometric',
    requirements: {
      points: { min: 3, max: 20 }
    },
    parameterDefinitions: {
      radius: { name: 'Radius', type: 'number', unit: 'm', required: false, min: 0, description: 'Circle radius (optional)' }
    },
    defaultGlyph: '○',
    color: '#FF5722'
  },

  // Legacy constraints (for backwards compatibility)
  distance: {
    type: 'points_distance',
    name: 'Distance (Legacy)',
    description: 'Legacy distance constraint',
    icon: '↔',
    category: 'dimensioning',
    requirements: { points: { min: 2, max: 2 } },
    parameterDefinitions: {
      distance: { name: 'Distance', type: 'number', unit: 'm', required: true, min: 0, description: 'Distance' }
    }
  },

  fixed: {
    type: 'point_fixed_coord',
    name: 'Fixed (Legacy)',
    description: 'Legacy fixed position constraint',
    icon: '📌',
    category: 'positioning',
    requirements: { points: { min: 1, max: 1 } },
    parameterDefinitions: {
      x: { name: 'X', type: 'number', unit: 'm', required: false, description: 'X coordinate' },
      y: { name: 'Y', type: 'number', unit: 'm', required: false, description: 'Y coordinate' },
      z: { name: 'Z', type: 'number', unit: 'm', required: false, description: 'Z coordinate' }
    }
  },

  // ... other legacy types
  angle: { type: 'points_equal_distance', name: 'Angle (Legacy)', description: '', icon: '∠', category: 'dimensioning', requirements: {}, parameterDefinitions: {} },
  perpendicular: { type: 'lines_perpendicular', name: 'Perpendicular (Legacy)', description: '', icon: '⊥', category: 'geometric', requirements: {}, parameterDefinitions: {} },
  parallel: { type: 'lines_parallel', name: 'Parallel (Legacy)', description: '', icon: '∥', category: 'geometric', requirements: {}, parameterDefinitions: {} },
  collinear: { type: 'points_colinear', name: 'Collinear (Legacy)', description: '', icon: '─', category: 'geometric', requirements: {}, parameterDefinitions: {} },
  rectangle: { type: 'points_coplanar', name: 'Rectangle (Legacy)', description: '', icon: '▭', category: 'geometric', requirements: {}, parameterDefinitions: {} },
  circle: { type: 'points_equal_distance', name: 'Circle (Legacy)', description: '', icon: '○', category: 'geometric', requirements: {}, parameterDefinitions: {} }
} as any

export const useEnhancedConstraints = (
  constraints: EnhancedConstraint[],
  entityManager: EntityManager,
  onAddConstraint: (constraint: EnhancedConstraint) => void,
  onUpdateConstraint: (id: string, updates: Partial<EnhancedConstraint>) => void,
  onDeleteConstraint: (id: string) => void
) => {
  const [activeConstraintType, setActiveConstraintType] = useState<ConstraintType | null>(null)
  const [constraintParameters, setConstraintParameters] = useState<Record<string, ConstraintParameter>>({})
  const [hoveredConstraintId, setHoveredConstraintId] = useState<string | null>(null)

  // Get constraint type definition
  const getConstraintTypeDefinition = useCallback((type: ConstraintType): ConstraintTypeDefinition | null => {
    return CONSTRAINT_TYPE_DEFINITIONS[type] || null
  }, [])

  // Check if selection meets constraint requirements
  const checkSelectionRequirements = useCallback((type: ConstraintType): boolean => {
    const definition = getConstraintTypeDefinition(type)
    if (!definition) return false

    const selection = entityManager.selection
    const selectedCounts = {
      points: selection.entities.filter(e => e.type === 'point').length,
      lines: selection.entities.filter(e => e.type === 'line').length,
      planes: selection.entities.filter(e => e.type === 'plane').length,
      circles: selection.entities.filter(e => e.type === 'points_equal_distance').length
    }

    // Check each requirement
    for (const [entityType, requirement] of Object.entries(definition.requirements)) {
      const count = selectedCounts[entityType as keyof typeof selectedCounts]
      if (count < requirement.min || (requirement.max && count > requirement.max)) {
        return false
      }
    }

    return true
  }, [entityManager.selection, getConstraintTypeDefinition])

  // Get available constraint types for current selection
  const getAvailableConstraintTypes = useCallback((): ConstraintTypeDefinition[] => {
    const available: ConstraintTypeDefinition[] = []

    for (const definition of Object.values(CONSTRAINT_TYPE_DEFINITIONS)) {
      if (checkSelectionRequirements(definition.type)) {
        available.push(definition)
      }
    }

    // Sort by category and name
    return available.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category)
      }
      return a.name.localeCompare(b.name)
    })
  }, [checkSelectionRequirements])

  // Start creating a constraint
  const startConstraintCreation = useCallback((type: ConstraintType) => {
    const definition = getConstraintTypeDefinition(type)
    if (!definition || !checkSelectionRequirements(type)) {
      return false
    }

    setActiveConstraintType(type)

    // Initialize parameters with default values
    const initialParams: Record<string, ConstraintParameter> = {}
    for (const [key, paramDef] of Object.entries(definition.parameterDefinitions)) {
      initialParams[key] = {
        ...paramDef,
        value: paramDef.type === 'boolean' ? false : paramDef.type === 'number' ? (paramDef.min || 0) : ''
      }
    }

    setConstraintParameters(initialParams)
    return true
  }, [getConstraintTypeDefinition, checkSelectionRequirements])

  // Update a parameter value
  const updateParameter = useCallback((key: string, value: any) => {
    setConstraintParameters(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        value
      }
    }))
  }, [])

  // Check if constraint creation is complete
  const isConstraintComplete = useCallback((): boolean => {
    if (!activeConstraintType) return false

    const definition = getConstraintTypeDefinition(activeConstraintType)
    if (!definition) return false

    // Check all required parameters are filled
    for (const [key, paramDef] of Object.entries(definition.parameterDefinitions)) {
      if (paramDef.required) {
        const param = constraintParameters[key]
        if (!param || param.value === undefined || param.value === null || param.value === '') {
          return false
        }

        // Validate numeric constraints
        if (paramDef.type === 'number') {
          const numValue = Number(param.value)
          if (isNaN(numValue)) return false
          if (paramDef.min !== undefined && numValue < paramDef.min) return false
          if (paramDef.max !== undefined && numValue > paramDef.max) return false
        }
      }
    }

    return true
  }, [activeConstraintType, constraintParameters, getConstraintTypeDefinition])

  // Apply the current constraint
  const applyConstraint = useCallback(() => {
    if (!activeConstraintType || !isConstraintComplete()) return

    const definition = getConstraintTypeDefinition(activeConstraintType)
    if (!definition) return

    const selection = entityManager.selection
    const now = new Date().toISOString()

    // Extract parameter values
    const parameterValues: Record<string, any> = {}
    for (const [key, param] of Object.entries(constraintParameters)) {
      parameterValues[key] = param.value
    }

    // Build entity references
    const entities = {
      points: selection.entities.filter(e => e.type === 'point').map(e => e.id),
      lines: selection.entities.filter(e => e.type === 'line').map(e => e.id),
      planes: selection.entities.filter(e => e.type === 'plane').map(e => e.id),
      circles: selection.entities.filter(e => e.type === 'points_equal_distance').map(e => e.id)
    }

    const constraint: EnhancedConstraint = {
      id: crypto.randomUUID(),
      type: activeConstraintType,
      name: definition.name,
      description: definition.description,

      entities,
      parameters: constraintParameters,

      enabled: true,
      isDriving: true,
      weight: 1.0,
      priority: 1,

      status: 'undefined',

      showGlyph: true,
      color: definition.color,

      createdAt: now,
      createdBy: 'user'
    }

    onAddConstraint(constraint)

    // Clear creation state
    setActiveConstraintType(null)
    setConstraintParameters({})
  }, [
    activeConstraintType,
    isConstraintComplete,
    constraintParameters,
    entityManager.selection,
    getConstraintTypeDefinition,
    onAddConstraint
  ])

  // Cancel constraint creation
  const cancelConstraintCreation = useCallback(() => {
    setActiveConstraintType(null)
    setConstraintParameters({})
  }, [])

  // Get constraints affecting a specific entity
  const getConstraintsForEntity = useCallback((entityId: string): EnhancedConstraint[] => {
    return constraints.filter(constraint =>
      constraint.entities.points.includes(entityId) ||
      constraint.entities.lines.includes(entityId) ||
      constraint.entities.planes.includes(entityId) ||
      constraint.entities.circles.includes(entityId)
    )
  }, [constraints])

  // Get constraint display information
  const getConstraintDisplayInfo = useCallback((constraint: EnhancedConstraint) => {
    const definition = getConstraintTypeDefinition(constraint.type)

    return {
      name: constraint.name || definition?.name || constraint.type,
      icon: definition?.icon || '?',
      color: constraint.color || definition?.color || '#666',
      status: constraint.status,
      glyph: definition?.defaultGlyph || '?',
      category: definition?.category || 'unknown'
    }
  }, [getConstraintTypeDefinition])

  // Validate constraints
  const validateConstraints = useCallback(() => {
    const validationResults: Record<string, { isValid: boolean; errors: string[] }> = {}

    for (const constraint of constraints) {
      const errors: string[] = []

      // Check entity references exist
      for (const pointId of constraint.entities.points) {
        if (!entityManager.operations.read(pointId)) {
          errors.push(`Point ${pointId} not found`)
        }
      }

      for (const lineId of constraint.entities.lines) {
        if (!entityManager.operations.read(lineId)) {
          errors.push(`Line ${lineId} not found`)
        }
      }

      // ... check other entity types

      validationResults[constraint.id] = {
        isValid: errors.length === 0,
        errors
      }
    }

    return validationResults
  }, [constraints, entityManager])

  // Group constraints by category
  const constraintsByCategory = useMemo(() => {
    const grouped: Record<string, EnhancedConstraint[]> = {}

    for (const constraint of constraints) {
      const definition = getConstraintTypeDefinition(constraint.type)
      const category = definition?.category || 'unknown'

      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push(constraint)
    }

    return grouped
  }, [constraints, getConstraintTypeDefinition])

  return {
    // State
    activeConstraintType,
    constraintParameters,
    hoveredConstraintId,
    constraints,

    // Type system
    getConstraintTypeDefinition,
    getAvailableConstraintTypes,
    constraintsByCategory,

    // Creation workflow
    startConstraintCreation,
    updateParameter,
    isConstraintComplete,
    applyConstraint,
    cancelConstraintCreation,

    // Queries
    getConstraintsForEntity,
    getConstraintDisplayInfo,
    checkSelectionRequirements,

    // Validation
    validateConstraints,

    // State setters
    setHoveredConstraintId,

    // Legacy compatibility
    isCreatingConstraint: !!activeConstraintType
  }
}