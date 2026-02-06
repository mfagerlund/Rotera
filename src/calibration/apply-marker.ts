import type { Project } from '../entities/project'
import { WorldPoint } from '../entities/world-point'
import { ImagePoint } from '../entities/imagePoint'
import type { Viewpoint } from '../entities/viewpoint'
import { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint'
import { Constraint } from '../entities/constraints'
import type { DetectedMarker } from './detect-markers'
import {
  getMarkerDefinition,
  getMarkerCornerPositions,
  MARKER_CORNER_LABELS,
  type MarkerCornerLabel
} from './marker-registry'

const round6 = (v: number) => Math.round(v * 1e6) / 1e6

export type PlacementMode = 'floor' | 'wall'
export type WorldUnit = 'm' | 'cm' | 'mm'

const UNIT_SCALE: Record<WorldUnit, number> = {
  m: 1,
  cm: 100,
  mm: 1000,
}

export interface AppliedMarkerResult {
  worldPoints: [WorldPoint, WorldPoint, WorldPoint, WorldPoint]
  imagePoints: [ImagePoint, ImagePoint, ImagePoint, ImagePoint]
  constraints: Constraint[]
  reused: boolean
}

function markerPointName(markerId: number, corner: MarkerCornerLabel): string {
  if (corner === 'BR') return 'R' // Reference point at (0,0,0)
  return `Marker_${markerId}_${corner}`
}

function findExistingMarkerPoints(
  project: Project,
  markerId: number
): [WorldPoint, WorldPoint, WorldPoint, WorldPoint] | null {
  const found: (WorldPoint | undefined)[] = MARKER_CORNER_LABELS.map(label => {
    const name = markerPointName(markerId, label)
    for (const wp of project.worldPoints) {
      if (wp.name === name) return wp
    }
    return undefined
  })

  if (found.every(wp => wp !== undefined)) {
    return found as [WorldPoint, WorldPoint, WorldPoint, WorldPoint]
  }
  return null
}

/**
 * Apply a detected marker to the project:
 * - Creates or reuses 4 WorldPoints with locked coordinates
 * - Creates 4 ImagePoints linking them to the viewpoint
 * - Creates coplanar constraint
 */
export function applyDetectedMarker(
  project: Project,
  viewpoint: Viewpoint,
  detected: DetectedMarker,
  placement: PlacementMode,
  unit: WorldUnit = 'm'
): AppliedMarkerResult {
  const def = getMarkerDefinition(detected.id)
  if (!def) {
    throw new Error(`Unknown marker ID: ${detected.id}`)
  }

  const scale = UNIT_SCALE[unit]
  const positions = getMarkerCornerPositions(def, placement)
    .map(([x, y, z]) => [round6(x * scale), round6(y * scale), round6(z * scale)] as [number, number, number]) as
    [[number, number, number], [number, number, number], [number, number, number], [number, number, number]]
  const markerColor = '#00e5ff' // Cyan for marker corner points
  const originColor = '#ff9800' // Orange for reference point (BR corner)

  // Reuse existing WorldPoints if this marker was already detected in another viewpoint
  const existing = findExistingMarkerPoints(project, detected.id)
  const reused = existing !== null

  const worldPoints: [WorldPoint, WorldPoint, WorldPoint, WorldPoint] = existing ?? (
    MARKER_CORNER_LABELS.map((label, i) => {
      const wp = WorldPoint.create(markerPointName(detected.id, label), {
        lockedXyz: positions[i],
        color: label === 'BR' ? originColor : markerColor,
      })
      project.addWorldPoint(wp)
      return wp
    }) as [WorldPoint, WorldPoint, WorldPoint, WorldPoint]
  )

  // Create ImagePoints for this viewpoint
  const imagePoints = detected.corners.map((corner, i) => {
    const ip = ImagePoint.create(worldPoints[i], viewpoint, corner.u, corner.v)
    worldPoints[i].addImagePoint(ip)
    viewpoint.addImagePoint(ip)
    project.addImagePoint(ip)
    return ip
  }) as [ImagePoint, ImagePoint, ImagePoint, ImagePoint]

  // Only create constraints on first detection (not when reusing)
  const constraints: Constraint[] = []
  if (!reused) {
    // All 4 corners have locked positions, so distance constraints are redundant.
    // Only coplanar constraint is needed.
    const coplanar = CoplanarPointsConstraint.create(
      `Marker_${detected.id}_coplanar`,
      [...worldPoints]
    )
    project.addConstraint(coplanar)
    constraints.push(coplanar)
  }

  return { worldPoints, imagePoints, constraints, reused }
}
