import { AR } from 'js-aruco2'
import type { MarkerDefinition } from './marker-registry'
import { MARKER_DEFINITIONS } from './marker-registry'

// A4 dimensions in mm
const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297

// Margins in mm
const MARGIN_MM = 15

/**
 * Generate a printable A4 calibration sheet SVG for a given marker definition.
 * The sheet has the ArUco marker in the top-left corner with origin at its inner corner,
 * X axis extending right and Z axis extending down, with ruler markings and a grid.
 */
export function generateCalibrationSheet(markerId: number): string {
  const def = MARKER_DEFINITIONS.find(m => m.id === markerId)
  if (!def) throw new Error(`Unknown marker ID: ${markerId}`)

  const markerSizeMm = def.edgeSizeMeters * 1000
  const dictionary = new AR.Dictionary('ARUCO')
  const markerSvg = dictionary.generateSVG(def.id)

  // Extract the inner SVG content (strip the outer <svg> wrapper)
  const innerSvgMatch = markerSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)
  const markerInnerContent = innerSvgMatch ? innerSvgMatch[1] : ''

  // ArUco ARUCO dict: markSize=7 (inner marker cells), viewBoxSize=9 (+ 1-cell quiet zone each side)
  // The detectable black border spans 7 viewBox units (cells 1-7, corners at 1 and 8).
  // Scale so the detectable marker edge = markerSizeMm exactly.
  const markSize = 7
  const scaleFactor = markerSizeMm / markSize // mm per viewBox unit
  const quietZoneMm = scaleFactor // 1 cell of white border required for detection

  // Offset SVG so the visible black border starts at the page margin.
  // The left/top quiet zone extends into the margin area (page edge = white contrast).
  const svgX = MARGIN_MM - quietZoneMm
  const svgY = MARGIN_MM - quietZoneMm

  // Axes must start AFTER the quiet zone on the right/bottom side.
  // Drawing anything in the quiet zone breaks ArUco contour detection.
  // Gap = 1 quiet zone cell between the detected BR corner and the axis origin.
  const originX = MARGIN_MM + markerSizeMm + quietZoneMm
  const originY = MARGIN_MM + markerSizeMm + quietZoneMm

  // Available space for axes
  const axisXLength = A4_WIDTH_MM - originX - MARGIN_MM
  const axisZLength = A4_HEIGHT_MM - originY - MARGIN_MM - 30 // Reserve space for footer

  // Grid spacing in mm (matching cm markings)
  const gridSpacingMm = 10
  const tickCount = (sizeMm: number) => Math.floor(sizeMm / gridSpacingMm)

  const xTicks = Math.max(0, tickCount(axisXLength))
  const zTicks = Math.max(0, tickCount(axisZLength))

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${A4_WIDTH_MM}mm" height="${A4_HEIGHT_MM}mm" viewBox="0 0 ${A4_WIDTH_MM} ${A4_HEIGHT_MM}">\n`
  svg += `  <style>@page { margin: 0; size: A4; }</style>\n`
  svg += `  <rect width="${A4_WIDTH_MM}" height="${A4_HEIGHT_MM}" fill="white"/>\n`

  // ArUco marker
  svg += `  <g transform="translate(${svgX},${svgY})">\n`
  svg += `    <g transform="scale(${scaleFactor})">\n`
  svg += `      ${markerInnerContent}\n`
  svg += `    </g>\n`
  svg += `  </g>\n`

  if (xTicks > 0) {
    // X axis (rightward)
    svg += `  <line x1="${originX}" y1="${originY}" x2="${originX + xTicks * gridSpacingMm}" y2="${originY}" stroke="black" stroke-width="0.5"/>\n`
    svg += `  <polygon points="${originX + xTicks * gridSpacingMm + 2},${originY} ${originX + xTicks * gridSpacingMm - 1},${originY - 1.2} ${originX + xTicks * gridSpacingMm - 1},${originY + 1.2}" fill="black"/>\n`
    svg += `  <text x="${originX + xTicks * gridSpacingMm + 4}" y="${originY + 1}" font-size="4" font-family="sans-serif" fill="black">X</text>\n`

    // X axis ticks and labels
    for (let i = 1; i <= xTicks; i++) {
      const x = originX + i * gridSpacingMm
      svg += `  <line x1="${x}" y1="${originY - 1.5}" x2="${x}" y2="${originY + 1.5}" stroke="black" stroke-width="0.3"/>\n`
      svg += `  <text x="${x}" y="${originY - 2.5}" font-size="3" font-family="sans-serif" text-anchor="middle" fill="#666">${i}cm</text>\n`
    }
  }

  if (zTicks > 0) {
    // Z axis (downward)
    svg += `  <line x1="${originX}" y1="${originY}" x2="${originX}" y2="${originY + zTicks * gridSpacingMm}" stroke="black" stroke-width="0.5"/>\n`
    svg += `  <polygon points="${originX},${originY + zTicks * gridSpacingMm + 2} ${originX - 1.2},${originY + zTicks * gridSpacingMm - 1} ${originX + 1.2},${originY + zTicks * gridSpacingMm - 1}" fill="black"/>\n`
    svg += `  <text x="${originX + 2}" y="${originY + zTicks * gridSpacingMm + 5}" font-size="4" font-family="sans-serif" fill="black">Z</text>\n`

    // Z axis ticks and labels
    for (let i = 1; i <= zTicks; i++) {
      const y = originY + i * gridSpacingMm
      svg += `  <line x1="${originX - 1.5}" y1="${y}" x2="${originX + 1.5}" y2="${y}" stroke="black" stroke-width="0.3"/>\n`
      svg += `  <text x="${originX - 3}" y="${y + 1}" font-size="3" font-family="sans-serif" text-anchor="end" fill="#666">${i}cm</text>\n`
    }
  }

  // Grid dots
  if (xTicks > 0 && zTicks > 0) {
    for (let ix = 1; ix <= xTicks; ix++) {
      for (let iz = 1; iz <= zTicks; iz++) {
        const x = originX + ix * gridSpacingMm
        const y = originY + iz * gridSpacingMm
        svg += `  <circle cx="${x}" cy="${y}" r="0.3" fill="#ccc"/>\n`
      }
    }
  }

  // Verification ruler at bottom
  const rulerY = A4_HEIGHT_MM - MARGIN_MM - 8
  const verifyLengthMm = markerSizeMm
  const rulerX = MARGIN_MM
  svg += `  <line x1="${rulerX}" y1="${rulerY}" x2="${rulerX + verifyLengthMm}" y2="${rulerY}" stroke="black" stroke-width="0.5"/>\n`
  svg += `  <line x1="${rulerX}" y1="${rulerY - 2}" x2="${rulerX}" y2="${rulerY + 2}" stroke="black" stroke-width="0.5"/>\n`
  svg += `  <line x1="${rulerX + verifyLengthMm}" y1="${rulerY - 2}" x2="${rulerX + verifyLengthMm}" y2="${rulerY + 2}" stroke="black" stroke-width="0.5"/>\n`
  svg += `  <text x="${rulerX + verifyLengthMm / 2}" y="${rulerY - 3}" font-size="3.5" font-family="sans-serif" text-anchor="middle" fill="black">Verify: ${def.label} (print at 100% scale)</text>\n`

  // Footer text
  const footerY = A4_HEIGHT_MM - MARGIN_MM
  svg += `  <text x="${A4_WIDTH_MM / 2}" y="${footerY}" font-size="4" font-family="sans-serif" text-anchor="middle" fill="#999">Rotera Calibration Sheet  ·  Marker #${def.id}  ·  ${def.label}</text>\n`

  svg += `</svg>`
  return svg
}

export function downloadCalibrationSheet(markerId: number): void {
  const def = MARKER_DEFINITIONS.find(m => m.id === markerId)
  if (!def) throw new Error(`Unknown marker ID: ${markerId}`)

  const svg = generateCalibrationSheet(markerId)
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `rotera-calibration-marker-${def.id}-${def.label.replace(' ', '')}.svg`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function getAllMarkerDefinitions(): MarkerDefinition[] {
  return MARKER_DEFINITIONS
}
