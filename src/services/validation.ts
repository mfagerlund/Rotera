// Constraint validation service for geometric consistency
// This file is kept for backward compatibility
// The actual implementation has been moved to src/services/validation/

export { ConstraintValidator } from './validation/ConstraintValidator'
export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationSuggestion
} from './validation/types'
export { ConstraintValidator as default } from './validation/ConstraintValidator'
