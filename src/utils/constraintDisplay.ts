// Shared utility for constraint display functions

import type { Constraint } from '../entities/constraints/base-constraint'

/**
 * Mapping of constraint types to their display names
 */
const CONSTRAINT_DISPLAY_NAMES: Record<string, string> = {
  // Distance and angle constraints
  'distance': 'Distance',
  'distance_point_point': 'Distance Constraint',
  'angle': 'Angle',
  'angle_point_point_point': 'Angle Constraint',

  // Line relationship constraints
  'parallel_lines': 'Parallel',
  'perpendicular_lines': 'Perpendicular',
  'parallel': 'Parallel Lines',
  'perpendicular': 'Perpendicular Lines',
  'lines_parallel': 'Parallel',
  'lines_perpendicular': 'Perpendicular',

  // Point relationship constraints
  'fixed_point': 'Fixed Point',
  'fixed-point': 'Fixed Position',
  'collinear_points': 'Collinear',
  'collinear': 'Collinear Points',
  'points_colinear': 'Collinear',
  'coplanar_points': 'Coplanar Points',
  'coplanar': 'Rectangle Shape',
  'points_coplanar': 'Rectangle',

  // Equal constraints
  'equal_distances': 'Equal Dist',
  'equal-distances': 'Equal Distances',
  'equal_angles': 'Equal Angles',
  'equal-angles': 'Equal Angles',

  // Projection constraint
  'projection': 'Projection Constraint',
  'projection_point_camera': 'Projection Constraint'
}

/**
 * Get a human-readable display name for a constraint
 *
 * @param constraint - Either a Constraint object or a constraint type string
 * @returns A formatted display name for the constraint
 *
 * @example
 * getConstraintDisplayName('distance_point_point') // Returns 'Distance Constraint'
 * getConstraintDisplayName(distanceConstraint) // Returns 'Distance Constraint'
 * getConstraintDisplayName('custom_type') // Returns 'Custom Type'
 */
export function getConstraintDisplayName(constraint: Constraint | string): string {
  // Get the constraint type string
  const type = typeof constraint === 'string'
    ? constraint
    : constraint.getConstraintType()

  // Try to get from the mapping first
  if (CONSTRAINT_DISPLAY_NAMES[type]) {
    return CONSTRAINT_DISPLAY_NAMES[type]
  }

  // Fallback: capitalize first letter and replace underscores/hyphens with spaces
  return type
    .split(/[_-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
