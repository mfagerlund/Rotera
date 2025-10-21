// Parallel constraint validator

import type { ValidationResult, ValidationError, ValidationWarning, WorldPointData } from '../types'
import { calculateVectorAngle } from '../utils'

export function validateParallelConstraint(
  constraint: any,
  worldPoints: Record<string, WorldPointData>
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const line1A = worldPoints[constraint.line1_wp_a]
  const line1B = worldPoints[constraint.line1_wp_b]
  const line2A = worldPoints[constraint.line2_wp_a]
  const line2B = worldPoints[constraint.line2_wp_b]

  if (!line1A || !line1B || !line2A || !line2B) {
    errors.push({
      id: crypto.randomUUID(),
      type: 'error',
      severity: 'critical',
      constraintId: constraint.id,
      pointIds: [constraint.line1_wp_a, constraint.line1_wp_b, constraint.line2_wp_a, constraint.line2_wp_b].filter(Boolean),
      message: 'Missing points for parallel constraint',
      description: 'One or more points referenced by this parallel constraint do not exist',
      fixSuggestion: 'Update constraint to reference existing points or delete constraint'
    })
    return { isValid: false, errors, warnings, suggestions: [] }
  }

  if (!line1A.xyz || !line1B.xyz || !line2A.xyz || !line2B.xyz) {
    errors.push({
      id: crypto.randomUUID(),
      type: 'error',
      severity: 'high',
      constraintId: constraint.id,
      pointIds: [constraint.line1_wp_a, constraint.line1_wp_b, constraint.line2_wp_a, constraint.line2_wp_b],
      message: 'Points missing 3D coordinates',
      description: 'Parallel constraint requires all four points to have 3D coordinates',
      fixSuggestion: 'Ensure all points have been triangulated or manually positioned'
    })
    return { isValid: false, errors, warnings, suggestions: [] }
  }

  // Calculate vectors for both lines (handle null values)
  const vector1 = [
    (line1B.xyz[0] ?? 0) - (line1A.xyz[0] ?? 0),
    (line1B.xyz[1] ?? 0) - (line1A.xyz[1] ?? 0),
    (line1B.xyz[2] ?? 0) - (line1A.xyz[2] ?? 0)
  ]

  const vector2 = [
    (line2B.xyz[0] ?? 0) - (line2A.xyz[0] ?? 0),
    (line2B.xyz[1] ?? 0) - (line2A.xyz[1] ?? 0),
    (line2B.xyz[2] ?? 0) - (line2A.xyz[2] ?? 0)
  ]

  // Calculate angle between vectors (should be 0° or 180° for parallel lines)
  const angle = calculateVectorAngle(vector1, vector2)
  const parallelAngle = Math.min(angle, 180 - angle)

  if (parallelAngle > 1) { // 1 degree tolerance
    const severity = parallelAngle > 5 ? 'high' : 'medium'
    errors.push({
      id: crypto.randomUUID(),
      type: 'error',
      severity,
      constraintId: constraint.id,
      pointIds: [constraint.line1_wp_a, constraint.line1_wp_b, constraint.line2_wp_a, constraint.line2_wp_b],
      message: 'Parallel constraint violation',
      description: `Lines are not parallel (angle: ${parallelAngle.toFixed(1)}°)`,
      fixSuggestion: 'Run optimization to adjust point positions'
    })
  } else if (parallelAngle > 0.1) {
    warnings.push({
      id: crypto.randomUUID(),
      type: 'warning',
      constraintId: constraint.id,
      pointIds: [constraint.line1_wp_a, constraint.line1_wp_b, constraint.line2_wp_a, constraint.line2_wp_b],
      message: 'Minor parallel constraint deviation',
      description: `Small deviation from parallel: ${parallelAngle.toFixed(2)}°`,
      recommendation: 'Consider running optimization if accuracy is critical'
    })
  }

  return { isValid: errors.length === 0, errors, warnings, suggestions: [] }
}
