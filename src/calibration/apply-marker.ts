import type { Project } from '../entities/project'
import { WorldPoint } from '../entities/world-point'
import { ImagePoint } from '../entities/imagePoint'
import type { Viewpoint } from '../entities/viewpoint'
import { DistanceConstraint } from '../entities/constraints/distance-constraint'
import { CoplanarPointsConstraint } from '../entities/constraints/coplanar-points-constraint'
import { Constraint } from '../entities/constraints'
import type { DetectedMarker } from './detect-markers'
import {
  getMarkerDefinition,
  getMarkerCornerPositions,
  MARKER_CORNER_LABELS,
  type MarkerCornerLabel
} from './marker-registry'

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
  if (corner === 'BR') return 'O' // Origin point — aligns with axis intersection on the sheet
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
 * - Creates distance + coplanar constraints
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
    .map(([x, y, z]) => [x * scale, y * scale, z * scale] as [number, number, number]) as
    [[number, number, number], [number, number, number], [number, number, number], [number, number, number]]
  const markerColor = '#00e5ff' // Cyan for marker corner points
  const originColor = '#ff9800' // Orange for origin point (BR corner)

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
    const s = def.edgeSizeMeters * scale
    const diag = s * Math.SQRT2

    // Edge distance constraints (TL-TR, TR-BR, BR-BL, BL-TL)
    const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]]
    for (const [a, b] of edges) {
      const nameA = MARKER_CORNER_LABELS[a] === 'BR' ? 'O' : MARKER_CORNER_LABELS[a]
      const nameB = MARKER_CORNER_LABELS[b] === 'BR' ? 'O' : MARKER_CORNER_LABELS[b]
      const dc = DistanceConstraint.create(
        `Marker_${detected.id}_edge_${nameA}_${nameB}`,
        worldPoints[a], worldPoints[b], s
      )
      project.addConstraint(dc)
      constraints.push(dc)
    }

    // Diagonal distance constraints (TL-BR, TR-BL)
    const diags: [number, number][] = [[0, 2], [1, 3]]
    for (const [a, b] of diags) {
      const diagNameA = MARKER_CORNER_LABELS[a] === 'BR' ? 'O' : MARKER_CORNER_LABELS[a]
      const diagNameB = MARKER_CORNER_LABELS[b] === 'BR' ? 'O' : MARKER_CORNER_LABELS[b]
      const dc = DistanceConstraint.create(
        `Marker_${detected.id}_diag_${diagNameA}_${diagNameB}`,
        worldPoints[a], worldPoints[b], diag
      )
      project.addConstraint(dc)
      constraints.push(dc)
    }

    // Coplanar constraint
    const coplanar = CoplanarPointsConstraint.create(
      `Marker_${detected.id}_coplanar`,
      [...worldPoints]
    )
    project.addConstraint(coplanar)
    constraints.push(coplanar)
  }

  return { worldPoints, imagePoints, constraints, reused }
}
