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
 * World coordinates for the 4 ArUco corners.
 * Origin (0,0,0) is at the axis intersection on the calibration sheet,
 * which is one quiet zone cell (s/7) beyond the BR corner.
 * ArUco corners are ordered: TL, TR, BR, BL (clockwise from top-left).
 *
 * Floor mode (Y=0 plane):
 *   TL ----------- TR
 *    |               |
 *   BL ----------- BR --- q --- O (0,0,0)
 *                          |
 *                          q
 */
export function getMarkerCornerPositions(
  def: MarkerDefinition,
  placement: 'floor' | 'wall'
): [[number, number, number], [number, number, number], [number, number, number], [number, number, number]] {
  const s = def.edgeSizeMeters
  const q = s / 7 // quiet zone = 1 marker cell
  if (placement === 'floor') {
    return [
      [-s - q, 0, -s - q], // TL
      [-q, 0, -s - q],     // TR
      [-q, 0, -q],         // BR (closest to origin)
      [-s - q, 0, -q],     // BL
    ]
  }
  // Wall mode: marker on vertical XY plane
  // Origin at axis intersection, marker extends left (-X) and up (+Y)
  return [
    [-s - q, s + q, 0], // TL
    [-q, s + q, 0],     // TR
    [-q, q, 0],         // BR (closest to origin)
    [-s - q, q, 0],     // BL
  ]
}
