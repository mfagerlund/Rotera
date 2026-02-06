export interface MarkerDefinition {
  id: number
  edgeSizeMeters: number
  label: string
}

export const MARKER_DEFINITIONS: MarkerDefinition[] = [
  { id: 0, edgeSizeMeters: 0.03, label: '3 cm' },
  { id: 1, edgeSizeMeters: 0.05, label: '5 cm' },
  { id: 2, edgeSizeMeters: 0.10, label: '10 cm' },
  { id: 3, edgeSizeMeters: 0.20, label: '20 cm' },
]

export const KNOWN_MARKER_IDS = new Set(MARKER_DEFINITIONS.map(m => m.id))

export function getMarkerDefinition(id: number): MarkerDefinition | undefined {
  return MARKER_DEFINITIONS.find(m => m.id === id)
}

export type MarkerCornerLabel = 'TL' | 'TR' | 'BR' | 'BL'
export const MARKER_CORNER_LABELS: MarkerCornerLabel[] = ['TL', 'TR', 'BR', 'BL']

/**
 * Gap between marker BR corner and the axis origin, in meters.
 * Rounded up from the ArUco quiet zone (s/7) to the nearest 1cm for clean coordinates.
 * E.g. 3cm marker: s/7 = 4.3mm → gap = 1cm. R ends up at (-1,0,-1) in cm.
 */
export function getMarkerGapMeters(def: MarkerDefinition): number {
  return Math.ceil(def.edgeSizeMeters / 7 * 100) / 100
}

/**
 * World coordinates for the 4 ArUco corners.
 * Origin (0,0,0) is at the axis intersection on the calibration sheet.
 * BR corner = reference point R, offset by the gap.
 * ArUco corners are ordered: TL, TR, BR, BL (clockwise from top-left).
 *
 * Floor mode (Y=0 plane):
 *   TL ----------- TR
 *    |               |
 *   BL ----------- BR/R --- gap --- O (0,0,0)
 *                             |
 *                            gap
 */
export function getMarkerCornerPositions(
  def: MarkerDefinition,
  placement: 'floor' | 'wall'
): [[number, number, number], [number, number, number], [number, number, number], [number, number, number]] {
  const s = def.edgeSizeMeters
  const g = getMarkerGapMeters(def)
  if (placement === 'floor') {
    return [
      [-s - g, 0, -s - g], // TL
      [-g, 0, -s - g],     // TR
      [-g, 0, -g],         // BR = reference point R
      [-s - g, 0, -g],     // BL
    ]
  }
  // Wall mode: marker on vertical XY plane
  // Origin at axis intersection, marker extends left (-X) and up (+Y)
  return [
    [-s - g, s + g, 0], // TL
    [-g, s + g, 0],     // TR
    [-g, g, 0],         // BR = reference point R
    [-s - g, g, 0],     // BL
  ]
}
