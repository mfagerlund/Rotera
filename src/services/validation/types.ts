// Validation types and interfaces

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

// Internal type for validation - represents serialized world point data
export interface WorldPointData {
  name: string
  xyz?: (number | null)[]
  isLocked?: boolean
}
