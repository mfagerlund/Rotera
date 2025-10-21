// Angle constraint validator

import type { ValidationResult, ValidationError, ValidationWarning, WorldPointData } from '../types'
import { calculateAngle } from '../utils'

export function validateAngleConstraint(
  constraint: any,
  worldPoints: Record<string, WorldPointData>
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const vertex = worldPoints[constraint.vertex]
  const line1End = worldPoints[constraint.line1_end]
  const line2End = worldPoints[constraint.line2_end]

  if (!vertex || !line1End || !line2End) {
    errors.push({
      id: crypto.randomUUID(),
      type: 'error',
      severity: 'critical',
      constraintId: constraint.id,
      pointIds: [constraint.vertex, constraint.line1_end, constraint.line2_end].filter(Boolean),
      message: 'Missing points for angle constraint',
      description: 'One or more points referenced by this angle constraint do not exist',
      fixSuggestion: 'Update constraint to reference existing points or delete constraint'
    })
    return { isValid: false, errors, warnings, suggestions: [] }
  }

  if (!vertex.xyz || !line1End.xyz || !line2End.xyz) {
    errors.push({
      id: crypto.randomUUID(),
      type: 'error',
      severity: 'high',
      constraintId: constraint.id,
      pointIds: [constraint.vertex, constraint.line1_end, constraint.line2_end],
      message: 'Points missing 3D coordinates',
      description: 'Angle constraint requires all three points to have 3D coordinates',
      fixSuggestion: 'Ensure all points have been triangulated or manually positioned'
    })
    return { isValid: false, errors, warnings, suggestions: [] }
  }

  // Calculate actual angle
  const actualAngle = calculateAngle(line1End.xyz, vertex.xyz, line2End.xyz)
  const expectedAngle = constraint.value

  const angleDiff = Math.abs(actualAngle - expectedAngle)
  const minAngleDiff = Math.min(angleDiff, 360 - angleDiff) // Handle angle wrapping

  if (minAngleDiff > 1) { // 1 degree tolerance
    const severity = minAngleDiff > 10 ? 'high' : 'medium'
    errors.push({
      id: crypto.randomUUID(),
      type: 'error',
      severity,
      constraintId: constraint.id,
      pointIds: [constraint.vertex, constraint.line1_end, constraint.line2_end],
      message: 'Angle constraint violation',
      description: `Expected angle: ${expectedAngle.toFixed(1)}°, actual: ${actualAngle.toFixed(1)}° (error: ${minAngleDiff.toFixed(1)}°)`,
      fixSuggestion: 'Run optimization to adjust point positions'
    })
  } else if (minAngleDiff > 0.1) {
    warnings.push({
      id: crypto.randomUUID(),
      type: 'warning',
      constraintId: constraint.id,
      pointIds: [constraint.vertex, constraint.line1_end, constraint.line2_end],
      message: 'Minor angle constraint deviation',
      description: `Small deviation detected: ${minAngleDiff.toFixed(2)}°`,
      recommendation: 'Consider running optimization if accuracy is critical'
    })
  }

  return { isValid: errors.length === 0, errors, warnings, suggestions: [] }
}
