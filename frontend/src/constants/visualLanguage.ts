// Visual language constants for the new UI paradigm

import { EntityColor, ConstraintGlyph, ConstraintStatus } from '../types/project'

// Color scheme for entity states and constraint status
export const ENTITY_COLORS: EntityColor = {
  satisfied: '#4CAF50',      // Green - constraints are satisfied
  warning: '#FF9800',        // Amber - high residual/warning
  violated: '#F44336',       // Red - violated/unsolved constraints
  worldGeometry: '#2196F3',  // Blue - world geometry reprojected in images
  imageGuides: '#FF5722',    // Orange - image-only guides (vanishing lines)
  construction: '#9E9E9E',   // Gray - construction geometry
  selection: '#FFC107'       // Yellow/Gold - selected entities
}

// Constraint glyphs for visual feedback
export const CONSTRAINT_GLYPHS = {
  parallel: '∥',
  perpendicular: '⟂',
  axisAligned: '⎓',
  pointOn: '⌖',
  locked: '🔒',
  equal: '≡',
  distance: '↔',
  angle: '∠',
  circle: '○',
  rectangle: '□',
  triangle: '△'
} as const

// Theme-specific color variants
export const THEME_COLORS = {
  dark: {
    background: '#121212',
    surface: '#1E1E1E',
    surfaceVariant: '#2D2D2D',
    onSurface: '#E1E1E1',
    onSurfaceVariant: '#C1C1C1',
    outline: '#404040',
    outlineVariant: '#303030'
  },
  light: {
    background: '#FAFAFA',
    surface: '#FFFFFF',
    surfaceVariant: '#F5F5F5',
    onSurface: '#1C1C1C',
    onSurfaceVariant: '#424242',
    outline: '#E0E0E0',
    outlineVariant: '#C8C8C8'
  }
} as const

// Visual feedback levels
export const FEEDBACK_LEVELS = {
  minimal: {
    showConstraintGlyphs: false,
    showMeasurements: false,
    showSnapCues: true,
    animationDuration: 150
  },
  standard: {
    showConstraintGlyphs: true,
    showMeasurements: true,
    showSnapCues: true,
    animationDuration: 200
  },
  detailed: {
    showConstraintGlyphs: true,
    showMeasurements: true,
    showSnapCues: true,
    showConstructionLines: true,
    showDegreeOfFreedom: true,
    animationDuration: 300
  }
} as const

// Entity sizing and styling
export const ENTITY_STYLES = {
  worldPoint: {
    radius: 6,
    selectedRadius: 8,
    strokeWidth: 1,
    selectedStrokeWidth: 2
  },
  line: {
    strokeWidth: 2,
    selectedStrokeWidth: 3,
    infiniteDashArray: [5, 5],
    constructionDashArray: [3, 3]
  },
  plane: {
    fillOpacity: 0.1,
    selectedFillOpacity: 0.2,
    strokeWidth: 1,
    selectedStrokeWidth: 2
  },
  imagePoint: {
    radius: 4,
    selectedRadius: 6,
    strokeWidth: 1
  }
} as const

// Helper functions for color management
export function getConstraintStatusColor(status: ConstraintStatus): string {
  return ENTITY_COLORS[status]
}

export function getEntityColorForStatus(status: ConstraintStatus): string {
  switch (status) {
    case 'satisfied': return ENTITY_COLORS.satisfied
    case 'warning': return ENTITY_COLORS.warning
    case 'violated': return ENTITY_COLORS.violated
    default: return ENTITY_COLORS.worldGeometry
  }
}

export function getSelectionColor(): string {
  return ENTITY_COLORS.selection
}

export function getConstructionColor(): string {
  return ENTITY_COLORS.construction
}

export function getImageGuideColor(): string {
  return ENTITY_COLORS.imageGuides
}

export function getWorldGeometryColor(): string {
  return ENTITY_COLORS.worldGeometry
}

// Constraint type to glyph mapping
export function getConstraintGlyph(constraintType: string): string {
  switch (constraintType) {
    case 'lines_parallel':
    case 'line_plane_parallel':
    case 'planes_parallel':
      return CONSTRAINT_GLYPHS.parallel

    case 'lines_perpendicular':
    case 'line_plane_perpendicular':
    case 'planes_perpendicular':
      return CONSTRAINT_GLYPHS.perpendicular

    // NOTE: line_axis_aligned constraint moved to Line entity properties
    case 'plane_parallel_to_axis':
      return CONSTRAINT_GLYPHS.axisAligned

    case 'point_on_line':
    case 'point_on_plane':
    case 'line_passes_through':
    case 'line_in_plane':
      return CONSTRAINT_GLYPHS.pointOn

    case 'point_locked':
    case 'point_fixed_coord':
      return CONSTRAINT_GLYPHS.locked

    case 'points_equal':
    case 'points_coincident':
      return CONSTRAINT_GLYPHS.equal

    case 'points_distance':
    case 'line_length':
    case 'plane_offset':
      return CONSTRAINT_GLYPHS.distance

    default:
      return '●' // Default bullet point
  }
}

// Animation easing functions
export const EASING = {
  easeOut: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
  easeIn: 'cubic-bezier(0.4, 0.0, 1, 1)',
  easeInOut: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
  spring: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
} as const

export default {
  ENTITY_COLORS,
  CONSTRAINT_GLYPHS,
  THEME_COLORS,
  FEEDBACK_LEVELS,
  ENTITY_STYLES,
  EASING,
  getConstraintStatusColor,
  getEntityColorForStatus,
  getSelectionColor,
  getConstructionColor,
  getImageGuideColor,
  getWorldGeometryColor,
  getConstraintGlyph
}