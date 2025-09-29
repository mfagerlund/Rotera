// WorldPoint validation logic

import type { WorldPointDto } from './WorldPointDto'
import type { ValidationResult, ValidationError } from '../../validation/validator'
import { ValidationHelpers } from '../../validation/validator'

export class WorldPointValidator {
  // Validate DTO structure
  static validateDto(dto: WorldPointDto): ValidationResult {
    const errors: ValidationError[] = []

    if (!dto.id) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'id is required',
        dto.id,
        'point',
        'id'
      ))
    }

    if (!dto.name) {
      errors.push(ValidationHelpers.createError(
        'MISSING_REQUIRED_FIELD',
        'name is required',
        dto.id,
        'point',
        'name'
      ))
    }

    if (dto.color !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(dto.color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        dto.id,
        'point',
        'color'
      ))
    }

    // Coordinate validation
    if (dto.xyz) {
      if (!Array.isArray(dto.xyz) || dto.xyz.length !== 3) {
        errors.push(ValidationHelpers.createError(
          'INVALID_COORDINATES',
          'xyz must be an array of 3 numbers',
          dto.id,
          'point',
          'xyz'
        ))
      } else if (!dto.xyz.every(coord => typeof coord === 'number' && !isNaN(coord))) {
        errors.push(ValidationHelpers.createError(
          'INVALID_COORDINATES',
          'xyz coordinates must be valid numbers',
          dto.id,
          'point',
          'xyz'
        ))
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      summary: errors.length === 0 ? 'DTO validation passed' : `DTO validation failed: ${errors.length} errors`
    }
  }

  // Validate WorldPoint domain object
  static validateWorldPoint(
    id: string,
    name: string,
    xyz: [number, number, number] | undefined,
    color: string
  ): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Required field validation
    const nameError = ValidationHelpers.validateRequiredField(
      name,
      'name',
      id,
      'point'
    )
    if (nameError) errors.push(nameError)

    const idError = ValidationHelpers.validateIdFormat(id, 'point')
    if (idError) errors.push(idError)

    // Coordinate validation
    if (xyz) {
      if (!Array.isArray(xyz) || xyz.length !== 3) {
        errors.push(ValidationHelpers.createError(
          'INVALID_COORDINATES',
          'xyz must be an array of 3 numbers',
          id,
          'point',
          'xyz'
        ))
      } else if (!xyz.every(coord => typeof coord === 'number' && !isNaN(coord))) {
        errors.push(ValidationHelpers.createError(
          'INVALID_COORDINATES',
          'xyz coordinates must be valid numbers',
          id,
          'point',
          'xyz'
        ))
      }
    }

    // Color validation
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      errors.push(ValidationHelpers.createError(
        'INVALID_COLOR',
        'color must be a valid hex color',
        id,
        'point',
        'color'
      ))
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: errors.length === 0 ? 'Point validation passed' : `Point validation failed: ${errors.length} errors`
    }
  }
}