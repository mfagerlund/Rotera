// Validation framework for strict data integrity and fail-fast serialization

// EntityId is just a string (entity names are used as unique IDs)
export type EntityId = string

export interface ValidationError {
  code: string
  message: string
  entityId?: EntityId
  entityType?: string
  field?: string
  severity: 'error' | 'warning'
}

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
  summary: string
}

export interface IValidatable {
  validate(context: ValidationContext): ValidationResult
}

export interface ValidationContext {
  // Entity existence checks
  pointExists(id: EntityId): boolean
  lineExists(id: EntityId): boolean
  planeExists(id: EntityId): boolean
  cameraExists(id: EntityId): boolean
  imageExists(id: EntityId): boolean
  constraintExists(id: EntityId): boolean

  // Dependency tracking
  getDependencies(id: EntityId): EntityId[]
  getDependents(id: EntityId): EntityId[]

  // Collection access for cross-entity validation
  getAllPointIds(): EntityId[]
  getAllLineIds(): EntityId[]
  getAllPlaneIds(): EntityId[]
  getAllCameraIds(): EntityId[]
  getAllImageIds(): EntityId[]
  getAllConstraintIds(): EntityId[]
}

export class ValidationEngine {
  static validateProject(entities: IValidatable[], context: ValidationContext): ValidationResult {
    const allErrors: ValidationError[] = []
    const allWarnings: ValidationError[] = []

    // Validate each entity
    for (const entity of entities) {
      const result = entity.validate(context)
      allErrors.push(...result.errors)
      allWarnings.push(...result.warnings)
    }

    // Run project-wide validation rules
    const projectValidation = this.validateProjectIntegrity(context)
    allErrors.push(...projectValidation.errors)
    allWarnings.push(...projectValidation.warnings)

    const isValid = allErrors.length === 0
    const summary = this.createSummary(allErrors, allWarnings)

    return {
      isValid,
      errors: allErrors,
      warnings: allWarnings,
      summary
    }
  }

  private static validateProjectIntegrity(context: ValidationContext): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Check for orphaned entities
    this.checkOrphanedConstraints(context, errors)
    this.checkOrphanedLines(context, errors)
    this.checkCircularDependencies(context, errors)
    this.checkDanglingReferences(context, errors)

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: ''
    }
  }

  private static checkOrphanedConstraints(context: ValidationContext, errors: ValidationError[]): void {
    for (const constraintId of context.getAllConstraintIds()) {
      const dependencies = context.getDependencies(constraintId)
      for (const depId of dependencies) {
        if (!this.entityExists(depId, context)) {
          errors.push({
            code: 'ORPHANED_CONSTRAINT',
            message: `Constraint ${constraintId} references non-existent entity ${depId}`,
            entityId: constraintId,
            entityType: 'constraint',
            severity: 'error'
          })
        }
      }
    }
  }

  private static checkOrphanedLines(context: ValidationContext, errors: ValidationError[]): void {
    for (const lineId of context.getAllLineIds()) {
      const dependencies = context.getDependencies(lineId)
      for (const depId of dependencies) {
        if (!context.pointExists(depId)) {
          errors.push({
            code: 'ORPHANED_LINE',
            message: `Line ${lineId} references non-existent point ${depId}`,
            entityId: lineId,
            entityType: 'line',
            severity: 'error'
          })
        }
      }
    }
  }

  private static checkCircularDependencies(context: ValidationContext, errors: ValidationError[]): void {
    const visited = new Set<EntityId>()
    const stack = new Set<EntityId>()

    const allIds = [
      ...context.getAllPointIds(),
      ...context.getAllLineIds(),
      ...context.getAllPlaneIds(),
      ...context.getAllCameraIds(),
      ...context.getAllImageIds(),
      ...context.getAllConstraintIds()
    ]

    for (const id of allIds) {
      if (!visited.has(id)) {
        this.detectCycle(id, context, visited, stack, errors)
      }
    }
  }

  private static detectCycle(
    id: EntityId,
    context: ValidationContext,
    visited: Set<EntityId>,
    stack: Set<EntityId>,
    errors: ValidationError[]
  ): void {
    visited.add(id)
    stack.add(id)

    const dependencies = context.getDependencies(id)
    for (const depId of dependencies) {
      if (!visited.has(depId)) {
        this.detectCycle(depId, context, visited, stack, errors)
      } else if (stack.has(depId)) {
        errors.push({
          code: 'CIRCULAR_DEPENDENCY',
          message: `Circular dependency detected: ${id} -> ${depId}`,
          entityId: id,
          severity: 'error'
        })
      }
    }

    stack.delete(id)
  }

  private static checkDanglingReferences(context: ValidationContext, errors: ValidationError[]): void {
    // Check that all referenced entities exist
    const allIds = [
      ...context.getAllPointIds(),
      ...context.getAllLineIds(),
      ...context.getAllPlaneIds(),
      ...context.getAllCameraIds(),
      ...context.getAllImageIds(),
      ...context.getAllConstraintIds()
    ]

    for (const id of allIds) {
      const dependencies = context.getDependencies(id)
      for (const depId of dependencies) {
        if (!this.entityExists(depId, context)) {
          errors.push({
            code: 'DANGLING_REFERENCE',
            message: `Entity ${id} references non-existent entity ${depId}`,
            entityId: id,
            severity: 'error'
          })
        }
      }
    }
  }

  private static entityExists(id: EntityId, context: ValidationContext): boolean {
    return (
      context.pointExists(id) ||
      context.lineExists(id) ||
      context.planeExists(id) ||
      context.cameraExists(id) ||
      context.imageExists(id) ||
      context.constraintExists(id)
    )
  }

  private static createSummary(errors: ValidationError[], warnings: ValidationError[]): string {
    if (errors.length === 0 && warnings.length === 0) {
      return 'Project validation passed successfully'
    }

    const parts: string[] = []
    if (errors.length > 0) {
      parts.push(`${errors.length} error${errors.length === 1 ? '' : 's'}`)
    }
    if (warnings.length > 0) {
      parts.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`)
    }

    return `Project validation failed: ${parts.join(', ')}`
  }
}

// Validation error codes
export const ValidationErrorCodes = {
  // Entity validation
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_TYPE: 'INVALID_FIELD_TYPE',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  INVALID_ID_FORMAT: 'INVALID_ID_FORMAT',

  // Referential integrity
  ORPHANED_CONSTRAINT: 'ORPHANED_CONSTRAINT',
  ORPHANED_LINE: 'ORPHANED_LINE',
  DANGLING_REFERENCE: 'DANGLING_REFERENCE',
  CIRCULAR_DEPENDENCY: 'CIRCULAR_DEPENDENCY',

  // Project structure
  DUPLICATE_ID: 'DUPLICATE_ID',
  MISSING_ORIGIN_POINT: 'MISSING_ORIGIN_POINT',
  INVALID_COORDINATE_SYSTEM: 'INVALID_COORDINATE_SYSTEM',

  // Constraints
  CONSTRAINT_MISSING_POINTS: 'CONSTRAINT_MISSING_POINTS',
  CONSTRAINT_INVALID_PARAMETERS: 'CONSTRAINT_INVALID_PARAMETERS',
  CONSTRAINT_SELF_REFERENCE: 'CONSTRAINT_SELF_REFERENCE'
} as const

// Helper functions for common validations
export class ValidationHelpers {
  static createError(
    code: string,
    message: string,
    entityId?: EntityId,
    entityType?: string,
    field?: string
  ): ValidationError {
    return {
      code,
      message,
      entityId,
      entityType,
      field,
      severity: 'error'
    }
  }

  static createWarning(
    code: string,
    message: string,
    entityId?: EntityId,
    entityType?: string,
    field?: string
  ): ValidationError {
    return {
      code,
      message,
      entityId,
      entityType,
      field,
      severity: 'warning'
    }
  }

  static validateRequiredField<T>(
    value: T | null | undefined,
    fieldName: string,
    entityId: EntityId,
    entityType: string
  ): ValidationError | null {
    if (value === null || value === undefined || value === '') {
      return this.createError(
        ValidationErrorCodes.MISSING_REQUIRED_FIELD,
        `Required field '${fieldName}' is missing`,
        entityId,
        entityType,
        fieldName
      )
    }
    return null
  }

  static validateIdFormat(id: string, entityType: string): ValidationError | null {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return this.createError(
        ValidationErrorCodes.INVALID_ID_FORMAT,
        `Invalid ID format for ${entityType}: ${id}`,
        id as EntityId,
        entityType,
        'id'
      )
    }
    return null
  }

  static validateNoDuplicateIds(ids: EntityId[], entityType: string): ValidationError[] {
    const errors: ValidationError[] = []
    const seen = new Set<EntityId>()

    for (const id of ids) {
      if (seen.has(id)) {
        errors.push(
          this.createError(
            ValidationErrorCodes.DUPLICATE_ID,
            `Duplicate ID found: ${id}`,
            id,
            entityType
          )
        )
      }
      seen.add(id)
    }

    return errors
  }
}

// Serialization validation
export class SerializationValidator {
  static validateBeforeSave(context: ValidationContext, entities: IValidatable[]): void {
    const result = ValidationEngine.validateProject(entities, context)

    if (!result.isValid) {
      const errorMessages = result.errors.map(e => `[${e.code}] ${e.message}`).join('\n')
      throw new Error(`Cannot save project with validation errors:\n${errorMessages}`)
    }

    if (result.warnings.length > 0) {
      console.warn('Project saved with warnings:', result.warnings)
    }
  }

  static validateAfterLoad(context: ValidationContext, entities: IValidatable[]): void {
    const result = ValidationEngine.validateProject(entities, context)

    if (!result.isValid) {
      const errorMessages = result.errors.map(e => `[${e.code}] ${e.message}`).join('\n')
      throw new Error(`Cannot load project with validation errors:\n${errorMessages}`)
    }
  }
}