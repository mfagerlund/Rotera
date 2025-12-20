/**
 * Vanishing Points Module
 *
 * This module provides vanishing point detection and camera initialization
 * from vanishing lines. The main entry point is initializeCameraWithVanishingPoints.
 */

// Types
export type {
  VPLineData,
  VanishingPoint,
  LineQualityIssue,
  ValidationResult
} from './types'

// Detection and computation
export {
  collectDirectionConstrainedLines,
  computeVanishingPoint,
  computeAngleBetweenVPs,
  estimateFocalLength,
  estimatePrincipalPoint
} from './detection'

// Rotation computation
export {
  computeRotationsFromVPs,
  computeRotationFromVPs,
  flipRotationAxes
} from './rotation'

// Camera position solving
export {
  computeCameraPosition,
  isPointInFrontOfCamera
} from './camera-solve'

// Validation
export {
  validateVanishingPoints,
  canInitializeWithVanishingPoints,
  computeLineLength,
  computeAngleBetweenLines,
  validateLineQuality,
  validateAxisLineDistribution
} from './validation'

// Main initialization
export {
  initializeCameraWithVanishingPoints
} from './initialization'
