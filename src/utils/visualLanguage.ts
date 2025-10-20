// Visual Language Utilities for consistent UI theming and color coding

import React from 'react'
import { ConstraintStatus } from '../entities/constraints/base-constraint'
import { ProjectSettings } from '../entities/project'
import {
  ENTITY_COLORS as CONSTRAINT_STATUS_COLORS,
  CONSTRAINT_GLYPHS as GLYPHS,
  THEME_COLORS,
  FEEDBACK_LEVELS,
  ENTITY_STYLES,
  getConstraintGlyph as getConstraintGlyphFromConstants
} from '../constants/visualLanguage'

// Entity type definitions
export type EntityType = 'point' | 'line' | 'plane' | 'circle'
export type EntityState = 'default' | 'selected' | 'highlighted' | 'construction'
export type WorkspaceType = 'image' | 'world' | 'split'
export type FeedbackLevel = 'minimal' | 'standard' | 'detailed'

// Color scheme interface
export interface ColorScheme {
  entities: {
    point: Record<EntityState, string>
    line: Record<EntityState, string>
    plane: Record<EntityState, string>
    circle: Record<EntityState, string>
  }
  constraints: Record<ConstraintStatus | 'conflicting' | 'redundant' | 'undefined' | 'disabled', string>
  workspaces: Record<WorkspaceType, string>
  states: {
    active: string
    inactive: string
    processing: string
    error: string
    success: string
  }
}

// Default color scheme - derived from ENTITY_COLORS constants
export const defaultColorScheme: ColorScheme = {
  entities: {
    point: {
      default: CONSTRAINT_STATUS_COLORS.worldGeometry,
      selected: CONSTRAINT_STATUS_COLORS.selection,
      highlighted: CONSTRAINT_STATUS_COLORS.warning,
      construction: CONSTRAINT_STATUS_COLORS.construction
    },
    line: {
      default: CONSTRAINT_STATUS_COLORS.satisfied,
      selected: CONSTRAINT_STATUS_COLORS.selection,
      highlighted: CONSTRAINT_STATUS_COLORS.warning,
      construction: CONSTRAINT_STATUS_COLORS.construction
    },
    plane: {
      default: '#9C27B0',
      selected: CONSTRAINT_STATUS_COLORS.selection,
      highlighted: CONSTRAINT_STATUS_COLORS.warning,
      construction: CONSTRAINT_STATUS_COLORS.construction
    },
    circle: {
      default: CONSTRAINT_STATUS_COLORS.imageGuides,
      selected: CONSTRAINT_STATUS_COLORS.selection,
      highlighted: CONSTRAINT_STATUS_COLORS.warning,
      construction: CONSTRAINT_STATUS_COLORS.construction
    }
  },
  constraints: {
    satisfied: CONSTRAINT_STATUS_COLORS.satisfied,
    warning: CONSTRAINT_STATUS_COLORS.warning,
    violated: CONSTRAINT_STATUS_COLORS.violated,
    disabled: CONSTRAINT_STATUS_COLORS.construction,
    conflicting: '#9C27B0',
    redundant: CONSTRAINT_STATUS_COLORS.construction,
    undefined: CONSTRAINT_STATUS_COLORS.worldGeometry
  },
  workspaces: {
    image: CONSTRAINT_STATUS_COLORS.worldGeometry,
    world: CONSTRAINT_STATUS_COLORS.satisfied,
    split: '#9C27B0'
  },
  states: {
    active: CONSTRAINT_STATUS_COLORS.selection,
    inactive: '#757575',
    processing: CONSTRAINT_STATUS_COLORS.warning,
    error: CONSTRAINT_STATUS_COLORS.violated,
    success: CONSTRAINT_STATUS_COLORS.satisfied
  }
}

// High contrast color scheme for accessibility
export const highContrastColorScheme: ColorScheme = {
  entities: {
    point: {
      default: '#0066FF',
      selected: '#FFFF00',
      highlighted: '#FF8800',
      construction: '#666666'
    },
    line: {
      default: '#008800',
      selected: '#FFFF00',
      highlighted: '#FF8800',
      construction: '#666666'
    },
    plane: {
      default: '#AA00AA',
      selected: '#FFFF00',
      highlighted: '#FF8800',
      construction: '#666666'
    },
    circle: {
      default: '#FF4400',
      selected: '#FFFF00',
      highlighted: '#FF8800',
      construction: '#666666'
    }
  },
  constraints: {
    satisfied: '#008800',
    warning: '#FF8800',
    violated: '#CC0000',
    disabled: '#666666',
    conflicting: '#AA00AA',
    redundant: '#666666',
    undefined: '#0066FF'
  },
  workspaces: {
    image: '#0066FF',
    world: '#008800',
    split: '#AA00AA'
  },
  states: {
    active: '#FFFF00',
    inactive: '#666666',
    processing: '#FF8800',
    error: '#CC0000',
    success: '#008800'
  }
}

// Visual Language Manager
export class VisualLanguageManager {
  private colorScheme: ColorScheme
  private settings: ProjectSettings

  constructor(settings: ProjectSettings, highContrast = false) {
    this.settings = settings
    this.colorScheme = highContrast ? highContrastColorScheme : defaultColorScheme
  }

  // Get entity color based on type and state
  getEntityColor(type: EntityType, state: EntityState = 'default'): string {
    return this.colorScheme.entities[type][state]
  }

  // Get constraint color based on status
  getConstraintColor(status: ConstraintStatus): string {
    return this.colorScheme.constraints[status]
  }

  // Get workspace color
  getWorkspaceColor(workspace: WorkspaceType): string {
    return this.colorScheme.workspaces[workspace]
  }

  // Get state color
  getStateColor(state: keyof ColorScheme['states']): string {
    return this.colorScheme.states[state]
  }

  // Generate CSS classes for entity
  getEntityClasses(
    type: EntityType,
    state: EntityState = 'default',
    additionalClasses: string[] = []
  ): string {
    const baseClass = `entity-${type}`
    const stateClass = state !== 'default' ? state : ''

    return [baseClass, stateClass, ...additionalClasses]
      .filter(Boolean)
      .join(' ')
  }

  // Generate CSS classes for constraint
  getConstraintClasses(
    status: ConstraintStatus,
    additionalClasses: string[] = []
  ): string {
    const statusClass = `constraint-${status}`

    return [statusClass, ...additionalClasses]
      .filter(Boolean)
      .join(' ')
  }

  // Generate CSS classes for workspace
  getWorkspaceClasses(
    workspace: WorkspaceType,
    additionalClasses: string[] = []
  ): string {
    const workspaceClass = `workspace-${workspace}`

    return [workspaceClass, ...additionalClasses]
      .filter(Boolean)
      .join(' ')
  }

  // Get constraint glyph - delegates to constants
  getConstraintGlyph(constraintType: string): string {
    return getConstraintGlyphFromConstants(constraintType)
  }

  // Apply visual feedback based on settings
  shouldShowVisualFeedback(feedbackType: 'glyph' | 'highlight' | 'animation'): boolean {
    const level = this.settings.visualFeedbackLevel

    switch (feedbackType) {
      case 'glyph':
        return this.settings.showConstraintGlyphs
      case 'highlight':
        return level !== 'minimal'
      case 'animation':
        return level === 'detailed'
      default:
        return true
    }
  }

  // Get opacity based on feedback level
  getFeedbackOpacity(): number {
    switch (this.settings.visualFeedbackLevel) {
      case 'minimal': return 0.1
      case 'standard': return 0.3
      case 'detailed': return 0.6
      default: return 0.3
    }
  }

  // Generate inline styles for entity
  getEntityStyle(
    type: EntityType,
    state: EntityState = 'default',
    overrides: Partial<CSSStyleDeclaration> = {}
  ): React.CSSProperties {
    const color = this.getEntityColor(type, state)

    const baseStyle: React.CSSProperties = {
      color,
      fill: color,
      stroke: type === 'line' || type === 'plane' ? color : undefined,
      strokeWidth: state === 'selected' ? 3 : state === 'highlighted' ? 4 : 2,
      opacity: state === 'construction' ? 0.7 : 1,
      transition: 'all 0.3s ease',
      ...(overrides as React.CSSProperties)
    }

    // Add filter effects for selected/highlighted states
    if (state === 'selected') {
      baseStyle.filter = `drop-shadow(0 0 4px ${color})`
    } else if (state === 'highlighted') {
      baseStyle.filter = `drop-shadow(0 0 6px ${color})`
    }

    return baseStyle
  }

  // Generate inline styles for constraint
  getConstraintStyle(
    status: ConstraintStatus,
    overrides: Partial<CSSStyleDeclaration> = {}
  ): React.CSSProperties {
    const color = this.getConstraintColor(status)

    return {
      color,
      borderColor: color,
      backgroundColor: `${color}20`, // 20% opacity
      opacity: (status as string) === 'redundant' ? 0.6 : 1,
      transition: 'all 0.3s ease',
      ...(overrides as React.CSSProperties)
    }
  }

  // Update color scheme
  updateColorScheme(newScheme: Partial<ColorScheme>): void {
    this.colorScheme = {
      ...this.colorScheme,
      ...newScheme
    }
  }

  // Update settings
  updateSettings(newSettings: Partial<ProjectSettings>): void {
    this.settings = {
      ...this.settings,
      ...newSettings
    }
  }

  // Getter for the color scheme
  getColorScheme(): ColorScheme {
    return this.colorScheme
  }

  // Export current scheme for persistence
  exportColorScheme(): ColorScheme {
    return { ...this.colorScheme }
  }

  // Import color scheme
  importColorScheme(scheme: ColorScheme): void {
    this.colorScheme = scheme
  }
}

// Utility functions for common operations
export const getEntityDisplayColor = (
  type: EntityType,
  isSelected: boolean,
  isHighlighted: boolean,
  isConstruction: boolean,
  manager: VisualLanguageManager
): string => {
  let state: EntityState = 'default'

  if (isConstruction) state = 'construction'
  else if (isSelected) state = 'selected'
  else if (isHighlighted) state = 'highlighted'

  return manager.getEntityColor(type, state)
}

export const getConstraintDisplayColor = (
  status: ConstraintStatus,
  manager: VisualLanguageManager
): string => {
  return manager.getConstraintColor(status)
}

// CSS variable helpers
export const setCSSColorVariables = (manager: VisualLanguageManager): void => {
  const root = document.documentElement

  // Set entity colors
  Object.entries(manager.getColorScheme().entities).forEach(([entityType, states]) => {
    Object.entries(states).forEach(([state, color]) => {
      root.style.setProperty(`--entity-${entityType}-${state}`, color)
    })
  })

  // Set constraint colors
  Object.entries(manager.getColorScheme().constraints).forEach(([status, color]) => {
    root.style.setProperty(`--constraint-${status}`, color)
  })

  // Set workspace colors
  Object.entries(manager.getColorScheme().workspaces).forEach(([workspace, color]) => {
    root.style.setProperty(`--workspace-${workspace}`, color)
  })

  // Set state colors
  Object.entries(manager.getColorScheme().states).forEach(([state, color]) => {
    root.style.setProperty(`--state-${state}`, color)
  })
}

// Hook for using visual language in React components
export const useVisualLanguage = (settings: ProjectSettings) => {
  const manager = new VisualLanguageManager(settings)

  // Set CSS variables on mount and when settings change
  React.useEffect(() => {
    setCSSColorVariables(manager)
  }, [settings, manager])

  return manager
}

// Export for external use
export default VisualLanguageManager