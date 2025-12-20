/**
 * Validation functions for optimization.
 * Ensures project meets minimum requirements before optimization.
 */

import { Project } from '../entities/project';
import { WorldPoint } from '../entities/world-point';
import type { ValidationResult } from './initialization-types';

// Type guard to check if constraint has points field
export function hasPointsField(c: unknown): c is { points: WorldPoint[] } {
  return typeof c === 'object' && c !== null && 'points' in c && Array.isArray((c as { points: unknown }).points);
}

/**
 * Validate that the project has the minimum requirements for optimization.
 *
 * TIER 1: At least one fully constrained point (locked or inferred).
 * TIER 2: Scale constraint (2+ locked points OR line with targetLength).
 */
export function validateProjectConstraints(project: Project): ValidationResult {
  const worldPointArray = Array.from(project.worldPoints) as WorldPoint[];
  const lockedPoints = worldPointArray.filter(wp => wp.isFullyConstrained());

  // TIER 1: Must have at least one fully locked point to anchor the scene
  if (lockedPoints.length === 0) {
    return {
      valid: false,
      error: 'No fully locked world points found. At least one point must have all three ' +
        'coordinates (X, Y, Z) locked to anchor the scene. Lock a point at the origin [0,0,0] ' +
        'or another known position.',
      lockedPoints: 0,
      hasScaleConstraint: false,
    };
  }

  // TIER 2: Must have scale constraint
  const hasLengthConstrainedLine = Array.from(project.lines).some(
    line => line.targetLength !== undefined && line.targetLength > 0
  );
  const hasScaleConstraint = lockedPoints.length >= 2 || hasLengthConstrainedLine;

  if (!hasScaleConstraint) {
    return {
      valid: false,
      error: 'No scale constraint found. The scene needs a known distance to establish scale. Provide either:\n' +
        '  - Two fully locked world points (the distance between them defines scale), OR\n' +
        '  - A line with a defined length (targetLength)',
      lockedPoints: lockedPoints.length,
      hasScaleConstraint: false,
    };
  }

  return {
    valid: true,
    lockedPoints: lockedPoints.length,
    hasScaleConstraint: true,
  };
}
