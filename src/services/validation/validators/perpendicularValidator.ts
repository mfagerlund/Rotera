// Perpendicular constraint validator

import type { ValidationResult, ValidationError, ValidationWarning, WorldPointData } from '../types'
import { calculateVectorAngle } from '../utils'

export function validatePerpendicularConstraint(
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
      message: 'Missing points for perpendicular constraint',
      description: 'One or more points referenced by this perpendicular constraint do not exist'
    })
    return { isValid: false, errors, warnings, suggestions: [] }
  }

  if (!line1A.xyz || !line1B.xyz || !line2A.xyz || !line2B.xyz) {
    errors.push({
      id: crypto.randomUUID(),
      type: 'error',
      severity: 'high',
      constraintId: constraint.id,
      message: 'Points missing 3D coordinates',
      description: 'Perpendicular constraint requires all four points to have 3D coordinates'
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

  // Calculate angle between vectors (should be 90° for perpendicular lines)
  const angle = calculateVectorAngle(vector1, vector2)
  const perpendicularError = Math.abs(angle - 90)

  if (perpendicularError > 1) { // 1 degree tolerance
    const severity = perpendicularError > 5 ? 'high' : 'medium'
    errors.push({
      id: crypto.randomUUID(),
      type: 'error',
      severity,
      constraintId: constraint.id,
      message: 'Perpendicular constraint violation',
      description: `Lines are not perpendicular (angle: ${angle.toFixed(1)}°, error: ${perpendicularError.toFixed(1)}°)`,
      fixSuggestion: 'Run optimization to adjust point positions'
    })
  }

  return { isValid: errors.length === 0, errors, warnings, suggestions: [] }
}
