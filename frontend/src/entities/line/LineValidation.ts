// Line validation logic

import type { LineDto, LineDirection, LineConstraintSettings } from './LineDto'
import type { ValidationResult, ValidationError } from '../../validation/validator'
import { ValidationHelpers } from '../../validation/validator'
import type { WorldPoint } from '../world-point'

export class LineValidator {
  // Validate DTO structure
  static validateDto(dto: LineDto): ValidationResult {
    const errors: ValidationError[] = []

    if (!dto.id) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'id is required',
        dto.id,
        'line',
        'id'
      ))
    }

    if (!dto.name) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'name is required',
        dto.id,
        'line',
        'name'
      ))
    }

    if (!dto.pointA) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'pointA is required',
        dto.id,
        'line',
        'pointA'
      ))
    }

    if (!dto.pointB) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'pointB is required',
        dto.id,
        'line',
        'pointB'
      ))
    }

    if (dto.pointA === dto.pointB) {
      errors.push(ValidationHelpers.createError(
        'SELF_REFERENCING_LINE',
        'Line cannot reference the same point twice',
        dto.id,
        'line'
      ))
    }

    // Color validation
    if (dto.color && !/^#[0-9A-Fa-f]{6}$/.test(dto.color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        dto.id,
        'line',
        'color'
      ))
    }

    // Thickness validation
    if (dto.thickness <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_THICKNESS',
        'thickness must be greater than 0',
        dto.id,
        'line',
        'thickness'
      ))
    }

    // Constraint validation
    if (!dto.constraints) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'constraints is required',
        dto.id,
        'line',
        'constraints'
      ))
    } else {
      // Validate constraint structure
      const constraintErrors = this.validateConstraints(dto.constraints, dto.id)
      errors.push(...constraintErrors)
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'DTO validation passed' : `DTO validation failed: ${errors.length} errors`
    }
  }

  // Validate line domain object
  static validateLine(
    id: string,
    name: string,
    pointA: WorldPoint,
    pointB: WorldPoint,
    color: string,
    thickness: number
  ): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Required field validation
    const nameError = ValidationHelpers.validateRequiredField(
      name,
      'name',
      id,
      'line'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(id, 'line')
    if (idError) errors.push(idError)

    // Point validation (objects must exist)
    if (!pointA) {
      errors.push(ValidationHelpers.createError(
        'MISSING_POINT',
        'pointA is required',
        id,
        'line',
        'pointA'
      ))
    }

    if (!pointB) {
      errors.push(ValidationHelpers.createError(
        'MISSING_POINT',
        'pointB is required',
        id,
        'line',
        'pointB'
      ))
    }

    // Check for self-referencing line
    if (pointA === pointB) {
      errors.push(ValidationHelpers.createError(
        'SELF_REFERENCING_LINE',
        'Line cannot reference the same point twice',
        id,
        'line'
      ))
    }

    // Color validation
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        id,
        'line',
        'color'
      ))
    }

    // Thickness validation
    if (thickness <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_THICKNESS',
        'thickness must be greater than 0',
        id,
        'line',
        'thickness'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Line validation passed' : `Line validation failed: ${errors.length} errors`
    }
  }

  // Validate constraint settings
  private static validateConstraints(constraints: LineConstraintSettings, lineId: string): ValidationError[] {
    const errors: ValidationError[] = []

    // Validate direction
    if (!constraints.direction) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'constraints.direction is required',
        lineId,
        'line',
        'constraints.direction'
      ))
    } else {
      const validDirections: LineDirection[] = ['free', 'horizontal', 'vertical', 'x-aligned', 'y-aligned', 'z-aligned']
      if (!validDirections.includes(constraints.direction)) {
        errors.push(ValidationHelpers.createError(
          'INVALID_DIRECTION',
          `constraints.direction must be one of: ${validDirections.join(', ')}`,
          lineId,
          'line',
          'constraints.direction'
        ))
      }
    }

    // Validate target length (optional)
    if (constraints.targetLength !== undefined && constraints.targetLength <= 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TARGET_LENGTH',
        'constraints.targetLength must be greater than 0',
        lineId,
        'line',
        'constraints.targetLength'
      ))
    }

    // Validate tolerance
    if (constraints.tolerance !== undefined && constraints.tolerance < 0) {
      errors.push(ValidationHelpers.createError(
        'INVALID_TOLERANCE',
        'constraints.tolerance must be non-negative',
        lineId,
        'line',
        'constraints.tolerance'
      ))
    }

    return errors
  }
}