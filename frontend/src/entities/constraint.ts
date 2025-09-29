// Polymorphic constraint system - main export file
// Re-exports all constraint types and utilities from the polymorphic system

// Export everything from the new constraint system
export * from './constraints'

// Legacy type aliases for backward compatibility
export type ConstraintType =
  | 'distance_point_point'
  | 'distance_point_line'
  | 'distance_point_plane'
  | 'angle_point_point_point'
  | 'angle_line_line'
  | 'parallel_lines'
  | 'perpendicular_lines'
  | 'collinear_points'
  | 'coplanar_points'
  | 'fixed_point'
  | 'equal_distances'
  | 'equal_angles'