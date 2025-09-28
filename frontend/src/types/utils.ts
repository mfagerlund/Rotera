// Utility types to help bridge type gaps and eliminate any usage

import type { Constraint } from './project'

/**
 * Helper to ensure a value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

/**
 * Helper to filter out null/undefined values from arrays
 */
export function filterDefined<T>(array: (T | null | undefined)[]): T[] {
  return array.filter(isDefined)
}

/**
 * Safe way to get a value with a fallback
 */
export function getValueOrDefault<T>(value: T | null | undefined, defaultValue: T): T {
  return isDefined(value) ? value : defaultValue
}

/**
 * Type guard to check if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * Type guard to check if value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value)
}

/**
 * Type guard to check if value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

/**
 * Type guard to check if value is an object (and not null)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Helper to convert unknown error to message string
 */
export function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unknown error occurred'
}

/**
 * Helper to safely access nested object properties
 */
export function safeGet<T>(obj: Record<string, unknown>, path: string, defaultValue: T): T {
  const keys = path.split('.')
  let current: unknown = obj

  for (const key of keys) {
    if (isObject(current) && key in current) {
      current = current[key]
    } else {
      return defaultValue
    }
  }

  return current as T
}

/**
 * Helper type for function parameters that might be any
 */
export type SafeCallback<TArgs extends unknown[] = unknown[], TReturn = void> = (...args: TArgs) => TReturn

/**
 * Helper type for event handlers
 */
export type EventHandler<T = Event> = (event: T) => void

/**
 * Helper type for React component props that might have children
 */
export interface ComponentWithChildren {
  children?: React.ReactNode
}

/**
 * Helper to make all properties of a type optional
 */
export type PartialDeep<T> = {
  [P in keyof T]?: T[P] extends object ? PartialDeep<T[P]> : T[P]
}

/**
 * Helper to make all properties of a type required
 */
export type RequiredDeep<T> = {
  [P in keyof T]-?: T[P] extends object ? RequiredDeep<T[P]> : T[P]
}

/**
 * Helper function to get constraint point IDs with proper type filtering
 */
export function getConstraintPointIds(constraint: Constraint): string[] {
  switch (constraint.type) {
    case 'distance':
      return [constraint.pointA, constraint.pointB].filter((id): id is string => typeof id === 'string')
    case 'angle':
      return [constraint.vertex, constraint.line1_end, constraint.line2_end].filter((id): id is string => typeof id === 'string')
    case 'perpendicular':
    case 'parallel':
      return [constraint.line1_wp_a, constraint.line1_wp_b, constraint.line2_wp_a, constraint.line2_wp_b].filter((id): id is string => typeof id === 'string')
    case 'collinear':
      return constraint.wp_ids || []
    case 'rectangle':
      return [constraint.cornerA, constraint.cornerB, constraint.cornerC, constraint.cornerD].filter((id): id is string => typeof id === 'string')
    case 'circle':
      return constraint.point_ids || []
    case 'fixed':
      return [constraint.point_id].filter((id): id is string => typeof id === 'string')
    case 'horizontal':
    case 'vertical':
      return [constraint.pointA, constraint.pointB].filter((id): id is string => typeof id === 'string')
    default:
      return []
  }
}