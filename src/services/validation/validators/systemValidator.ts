// System-wide validation

import type { Constraint } from '../../../types/project'
import type { ValidationResult, ValidationSuggestion, ValidationWarning, WorldPointData } from '../types'
import { getConstraintPointIds } from '../../../types/utils'

export function validateSystem(
  worldPoints: Record<string, WorldPointData>,
  constraints: Constraint[]
): ValidationResult {
  const errors: never[] = []
  const warnings: ValidationWarning[] = []
  const suggestions: ValidationSuggestion[] = []

  // Check for overdetermined systems
  const pointsWithXYZ = Object.values(worldPoints).filter(p => p.xyz && !p.isLocked)
  const degreesOfFreedom = pointsWithXYZ.length * 3
  const constraintCount = constraints.length

  if (constraintCount > degreesOfFreedom) {
    warnings.push({
      id: crypto.randomUUID(),
      type: 'warning',
      message: 'Potentially overdetermined system',
      description: `${constraintCount} constraints for ${degreesOfFreedom} degrees of freedom`,
      recommendation: 'Review constraints for conflicts or redundancy'
    })
  }

  // Check for underdetermined systems
  if (constraintCount < degreesOfFreedom - 6) { // Account for 6 DOF for positioning
    suggestions.push({
      id: crypto.randomUUID(),
      type: 'suggestion',
      category: 'completeness',
      message: 'System may be underdetermined',
      description: 'Consider adding more constraints for better accuracy',
      action: 'Add distance or angle constraints between key points'
    })
  }

  // Check for isolated points
  const pointsInConstraints = new Set<string>()
  constraints.forEach(constraint => {
    getConstraintPointIds(constraint).forEach(id => pointsInConstraints.add(id))
  })

  Object.keys(worldPoints).forEach(pointId => {
    if (!pointsInConstraints.has(pointId) && worldPoints[pointId].xyz) {
      suggestions.push({
        id: crypto.randomUUID(),
        type: 'suggestion',
        category: 'completeness',
        message: 'Isolated point detected',
        description: `Point ${worldPoints[pointId].name} is not referenced by any constraints`,
        action: 'Consider adding constraints involving this point'
      })
    }
  })

  return { isValid: errors.length === 0, errors, warnings, suggestions }
}
