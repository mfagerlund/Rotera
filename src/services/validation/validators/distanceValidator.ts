// Distance constraint validator

import type { ValidationResult, ValidationError, ValidationWarning, WorldPointData } from '../types'
import { calculateDistance } from '../utils'

export function validateDistanceConstraint(
  constraint: any,
  worldPoints: Record<string, WorldPointData>,
  tolerance: number
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const pointA = worldPoints[constraint.pointA]
  const pointB = worldPoints[constraint.pointB]

  if (!pointA || !pointB) {
    errors.push({
      id: crypto.randomUUID(),
      type: 'error',
      severity: 'critical',
      constraintId: constraint.id,
      pointIds: [constraint.pointA, constraint.pointB].filter(Boolean),
      message: 'Missing points for distance constraint',
      description: 'One or both points referenced by this distance constraint do not exist',
      fixSuggestion: 'Update constraint to reference existing points or delete constraint'
    })
    return { isValid: false, errors, warnings, suggestions: [] }
  }

  if (!pointA.xyz || !pointB.xyz) {
    errors.push({
      id: crypto.randomUUID(),
      type: 'error',
      severity: 'high',
      constraintId: constraint.id,
      pointIds: [constraint.pointA, constraint.pointB],
      message: 'Points missing 3D coordinates',
      description: 'Distance constraint requires both points to have 3D coordinates',
      fixSuggestion: 'Ensure both points have been triangulated or manually positioned'
    })
    return { isValid: false, errors, warnings, suggestions: [] }
  }

  // Calculate actual distance
  const actualDistance = calculateDistance(pointA.xyz, pointB.xyz)
  const expectedDistance = constraint.value

  if (Math.abs(actualDistance - expectedDistance) > tolerance) {
    const error = Math.abs(actualDistance - expectedDistance)
    const relativeError = (error / expectedDistance) * 100

    if (relativeError > 5) { // 5% tolerance
      errors.push({
        id: crypto.randomUUID(),
        type: 'error',
        severity: relativeError > 20 ? 'high' : 'medium',
        constraintId: constraint.id,
        pointIds: [constraint.pointA, constraint.pointB],
        message: 'Distance constraint violation',
        description: `Expected distance: ${expectedDistance.toFixed(3)}, actual: ${actualDistance.toFixed(3)} (error: ${relativeError.toFixed(1)}%)`,
        fixSuggestion: 'Run optimization to adjust point positions'
      })
    } else {
      warnings.push({
        id: crypto.randomUUID(),
        type: 'warning',
        constraintId: constraint.id,
        pointIds: [constraint.pointA, constraint.pointB],
        message: 'Minor distance constraint deviation',
        description: `Small deviation detected: ${relativeError.toFixed(2)}%`,
        recommendation: 'Consider running optimization if accuracy is critical'
      })
    }
  }

  return { isValid: errors.length === 0, errors, warnings, suggestions: [] }
}
