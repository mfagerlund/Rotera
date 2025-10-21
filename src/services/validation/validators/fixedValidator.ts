// Fixed constraint validator

import type { ValidationResult, ValidationError, ValidationWarning, WorldPointData } from '../types'

export function validateFixedConstraint(
  constraint: any,
  worldPoints: Record<string, WorldPointData>
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const point = worldPoints[constraint.point_id]

  if (!point) {
    errors.push({
      id: crypto.randomUUID(),
      type: 'error',
      severity: 'critical',
      constraintId: constraint.id,
      pointIds: [constraint.point_id],
      message: 'Missing point for fixed constraint',
      description: 'The point referenced by this fixed constraint does not exist',
      fixSuggestion: 'Update constraint to reference existing point or delete constraint'
    })
    return { isValid: false, errors, warnings, suggestions: [] }
  }

  if (!point.xyz) {
    warnings.push({
      id: crypto.randomUUID(),
      type: 'warning',
      constraintId: constraint.id,
      pointIds: [constraint.point_id],
      message: 'Fixed point without 3D coordinates',
      description: 'Fixed constraint applied to point without 3D coordinates',
      recommendation: 'Ensure the point has been positioned before applying fixed constraint'
    })
  }

  return { isValid: errors.length === 0, errors, warnings, suggestions: [] }
}

export function validateCollinearConstraint(constraint: any): ValidationResult {
  // Implementation for collinear constraint validation
  const errors: ValidationError[] = []
  // Add collinear validation logic here
  return { isValid: true, errors, warnings: [], suggestions: [] }
}

export function validateRectangleConstraint(constraint: any): ValidationResult {
  // Implementation for rectangle constraint validation
  const errors: ValidationError[] = []
  // Add rectangle validation logic here
  return { isValid: true, errors, warnings: [], suggestions: [] }
}

export function validateCircleConstraint(constraint: any): ValidationResult {
  // Implementation for circle constraint validation
  const errors: ValidationError[] = []
  // Add circle validation logic here
  return { isValid: true, errors, warnings: [], suggestions: [] }
}
