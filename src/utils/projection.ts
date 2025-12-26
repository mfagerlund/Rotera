/**
 * Simple camera projection utilities for UI code.
 * Uses plain numbers (not ScalarAutograd) for efficiency.
 */

import type { Viewpoint } from '../entities/viewpoint'
import type { WorldPoint } from '../entities/world-point'
import { quaternionToMatrix } from '../optimization/math-utils-common'

export interface ProjectionResult {
  u: number
  v: number
  depth: number
}

/**
 * Project a 3D world point to 2D pixel coordinates using a viewpoint's camera.
 * Returns null if the point is behind the camera or projection fails.
 */
export function projectToPixel(
  worldXyz: [number, number, number],
  viewpoint: Viewpoint
): ProjectionResult | null {
  const rotationMatrix = quaternionToMatrix(viewpoint.rotation)

  const fx = viewpoint.focalLength
  const fy = viewpoint.focalLength * viewpoint.aspectRatio
  const cx = viewpoint.principalPointX
  const cy = viewpoint.principalPointY
  const skew = viewpoint.skewCoefficient ?? 0
  const camPos = viewpoint.position

  // Transform to camera coordinates: cam = R * (world - camPos)
  const dx = worldXyz[0] - camPos[0]
  const dy = worldXyz[1] - camPos[1]
  const dz = worldXyz[2] - camPos[2]

  const camX = rotationMatrix[0][0] * dx + rotationMatrix[0][1] * dy + rotationMatrix[0][2] * dz
  const camY = rotationMatrix[1][0] * dx + rotationMatrix[1][1] * dy + rotationMatrix[1][2] * dz
  const camZ = rotationMatrix[2][0] * dx + rotationMatrix[2][1] * dy + rotationMatrix[2][2] * dz

  // Handle z-reflected viewpoints (used after right-handed transformation)
  const effectiveCamZ = viewpoint.isZReflected ? -camZ : camZ

  // Check if point is behind camera or too close
  if (effectiveCamZ < 0.1) {
    return null
  }

  const xNorm = camX / effectiveCamZ
  const yNorm = camY / effectiveCamZ

  const u = cx + fx * xNorm + skew * yNorm
  const v = cy - fy * yNorm

  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    return null
  }

  return { u, v, depth: effectiveCamZ }
}

/**
 * Project a WorldPoint to pixel coordinates using a viewpoint's camera.
 * Uses the optimized position if available, otherwise returns null.
 */
export function projectWorldPointToPixel(
  worldPoint: WorldPoint,
  viewpoint: Viewpoint
): ProjectionResult | null {
  const xyz = worldPoint.optimizedXyz
  if (!xyz) {
    return null
  }
  return projectToPixel(xyz, viewpoint)
}

/**
 * Check if a viewpoint has a valid camera pose that can be used for projection.
 */
export function hasValidCameraPose(viewpoint: Viewpoint): boolean {
  return viewpoint.lastResiduals.length > 0 || viewpoint.isPoseLocked
}
