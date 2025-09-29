// Constraint validation service for geometric consistency

import { WorldPoint, Constraint } from '../types/project'
import { getConstraintPointIds } from '../types/utils'

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  suggestions: ValidationSuggestion[]
}

export interface ValidationError {
  id: string
  type: 'error'
  severity: 'critical' | 'high' | 'medium'
  constraintId?: string
  pointIds?: string[]
  message: string
  description: string
  fixSuggestion?: string
}

export interface ValidationWarning {
  id: string
  type: 'warning'
  constraintId?: string
  pointIds?: string[]
  message: string
  description: string
  recommendation?: string
}

export interface ValidationSuggestion {
  id: string
  type: 'suggestion'
  category: 'performance' | 'accuracy' | 'completeness'
  message: string
  description: string
  action?: string
}

export class ConstraintValidator {
  private worldPoints: Record<string, WorldPoint>
  private constraints: Constraint[]
  private tolerance: number

  constructor(worldPoints: Record<string, WorldPoint>, constraints: Constraint[], tolerance: number = 1e-6) {
    this.worldPoints = worldPoints
    this.constraints = constraints
    this.tolerance = tolerance
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []
    const suggestions: ValidationSuggestion[] = []

    // Validate individual constraints
    this.constraints.forEach(constraint => {
      const constraintResult = this.validateConstraint(constraint)
      errors.push(...constraintResult.errors)
      warnings.push(...constraintResult.warnings)
    })

    // System-wide validation
    const systemResult = this.validateSystem()
    errors.push(...systemResult.errors)
    warnings.push(...systemResult.warnings)
    suggestions.push(...systemResult.suggestions)

    return {
      isValid: errors.filter(e => e.severity === 'critical').length === 0,
      errors,
      warnings,
      suggestions
    }
  }

  private validateConstraint(constraint: Constraint): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    switch (constraint.type) {
      case 'points_distance':
        return this.validateDistanceConstraint(constraint)
      case 'points_equal_distance':
        // This handles both angle and circle constraints - determine by parameters
        if (constraint.parameters.angle !== undefined || constraint.parameters.angle_degrees !== undefined) {
          return this.validateAngleConstraint(constraint)
        } else {
          return this.validateCircleConstraint(constraint)
        }
      case 'lines_perpendicular':
        return this.validatePerpendicularConstraint(constraint)
      case 'lines_parallel':
        return this.validateParallelConstraint(constraint)
      case 'points_colinear':
        return this.validateCollinearConstraint(constraint)
      case 'points_coplanar':
        return this.validateRectangleConstraint(constraint)
      case 'point_fixed_coord':
        return this.validateFixedConstraint(constraint)
      default:
        errors.push({
          id: crypto.randomUUID(),
          type: 'error',
          severity: 'medium',
          constraintId: constraint.id,
          message: 'Unknown constraint type',
          description: `Constraint type '${constraint.type}' is not recognized`,
          fixSuggestion: 'Remove this constraint or update to a valid type'
        })
    }

    return { isValid: errors.length === 0, errors, warnings, suggestions: [] }
  }

  private validateDistanceConstraint(constraint: any): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    const pointA = this.worldPoints[constraint.pointA]
    const pointB = this.worldPoints[constraint.pointB]

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
    const actualDistance = this.calculateDistance(pointA.xyz, pointB.xyz)
    const expectedDistance = constraint.value

    if (Math.abs(actualDistance - expectedDistance) > this.tolerance) {
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

  private validateAngleConstraint(constraint: any): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    const vertex = this.worldPoints[constraint.vertex]
    const line1End = this.worldPoints[constraint.line1_end]
    const line2End = this.worldPoints[constraint.line2_end]

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
    const actualAngle = this.calculateAngle(line1End.xyz, vertex.xyz, line2End.xyz)
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

  private validateParallelConstraint(constraint: any): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    const line1A = this.worldPoints[constraint.line1_wp_a]
    const line1B = this.worldPoints[constraint.line1_wp_b]
    const line2A = this.worldPoints[constraint.line2_wp_a]
    const line2B = this.worldPoints[constraint.line2_wp_b]

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

    // Calculate vectors for both lines
    const vector1 = [
      line1B.xyz[0] - line1A.xyz[0],
      line1B.xyz[1] - line1A.xyz[1],
      line1B.xyz[2] - line1A.xyz[2]
    ]

    const vector2 = [
      line2B.xyz[0] - line2A.xyz[0],
      line2B.xyz[1] - line2A.xyz[1],
      line2B.xyz[2] - line2A.xyz[2]
    ]

    // Calculate angle between vectors (should be 0° or 180° for parallel lines)
    const angle = this.calculateVectorAngle(vector1, vector2)
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

  private validatePerpendicularConstraint(constraint: any): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    const line1A = this.worldPoints[constraint.line1_wp_a]
    const line1B = this.worldPoints[constraint.line1_wp_b]
    const line2A = this.worldPoints[constraint.line2_wp_a]
    const line2B = this.worldPoints[constraint.line2_wp_b]

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

    // Calculate vectors for both lines
    const vector1 = [
      line1B.xyz[0] - line1A.xyz[0],
      line1B.xyz[1] - line1A.xyz[1],
      line1B.xyz[2] - line1A.xyz[2]
    ]

    const vector2 = [
      line2B.xyz[0] - line2A.xyz[0],
      line2B.xyz[1] - line2A.xyz[1],
      line2B.xyz[2] - line2A.xyz[2]
    ]

    // Calculate angle between vectors (should be 90° for perpendicular lines)
    const angle = this.calculateVectorAngle(vector1, vector2)
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

  private validateFixedConstraint(constraint: any): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    const point = this.worldPoints[constraint.point_id]

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


  private validateCollinearConstraint(constraint: any): ValidationResult {
    // Implementation for collinear constraint validation
    const errors: ValidationError[] = []
    // Add collinear validation logic here
    return { isValid: true, errors, warnings: [], suggestions: [] }
  }

  private validateRectangleConstraint(constraint: any): ValidationResult {
    // Implementation for rectangle constraint validation
    const errors: ValidationError[] = []
    // Add rectangle validation logic here
    return { isValid: true, errors, warnings: [], suggestions: [] }
  }

  private validateCircleConstraint(constraint: any): ValidationResult {
    // Implementation for circle constraint validation
    const errors: ValidationError[] = []
    // Add circle validation logic here
    return { isValid: true, errors, warnings: [], suggestions: [] }
  }

  private validateSystem(): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []
    const suggestions: ValidationSuggestion[] = []

    // Check for overdetermined systems
    const pointsWithXYZ = Object.values(this.worldPoints).filter(p => p.xyz && !p.isLocked)
    const degreesOfFreedom = pointsWithXYZ.length * 3
    const constraintCount = this.constraints.length

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
    this.constraints.forEach(constraint => {
      this.getConstraintPointIds(constraint).forEach(id => pointsInConstraints.add(id))
    })

    Object.keys(this.worldPoints).forEach(pointId => {
      if (!pointsInConstraints.has(pointId) && this.worldPoints[pointId].xyz) {
        suggestions.push({
          id: crypto.randomUUID(),
          type: 'suggestion',
          category: 'completeness',
          message: 'Isolated point detected',
          description: `Point ${this.worldPoints[pointId].name} is not referenced by any constraints`,
          action: 'Consider adding constraints involving this point'
        })
      }
    })

    return { isValid: errors.length === 0, errors, warnings, suggestions }
  }

  private getConstraintPointIds = getConstraintPointIds

  private calculateDistance(pointA: number[], pointB: number[]): number {
    const dx = pointA[0] - pointB[0]
    const dy = pointA[1] - pointB[1]
    const dz = pointA[2] - pointB[2]
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  private calculateAngle(pointA: number[], vertex: number[], pointC: number[]): number {
    const va = [pointA[0] - vertex[0], pointA[1] - vertex[1], pointA[2] - vertex[2]]
    const vc = [pointC[0] - vertex[0], pointC[1] - vertex[1], pointC[2] - vertex[2]]

    const dotProduct = va[0] * vc[0] + va[1] * vc[1] + va[2] * vc[2]
    const magA = Math.sqrt(va[0] * va[0] + va[1] * va[1] + va[2] * va[2])
    const magC = Math.sqrt(vc[0] * vc[0] + vc[1] * vc[1] + vc[2] * vc[2])

    if (magA === 0 || magC === 0) return 0

    const cosAngle = Math.max(-1, Math.min(1, dotProduct / (magA * magC)))
    return Math.acos(cosAngle) * (180 / Math.PI)
  }

  private calculateVectorAngle(vector1: number[], vector2: number[]): number {
    const dotProduct = vector1[0] * vector2[0] + vector1[1] * vector2[1] + vector1[2] * vector2[2]
    const mag1 = Math.sqrt(vector1[0] * vector1[0] + vector1[1] * vector1[1] + vector1[2] * vector1[2])
    const mag2 = Math.sqrt(vector2[0] * vector2[0] + vector2[1] * vector2[1] + vector2[2] * vector2[2])

    if (mag1 === 0 || mag2 === 0) return 0

    const cosAngle = Math.max(-1, Math.min(1, dotProduct / (mag1 * mag2)))
    return Math.acos(cosAngle) * (180 / Math.PI)
  }
}

export default ConstraintValidator