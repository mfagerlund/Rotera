# Calibration Marker Implementation Plan

**Status:** Planning
**Date:** 2026-02-06

## Overview

Integrate ArUco marker detection into Rotera so users can print a calibration sheet, place it next to their object, photograph it, and automatically establish scale + orientation + origin.

**4 predefined calibration sheets**, each with a unique ArUco ID that maps to a known physical size:

| ArUco ID | Marker Edge | Best For |
|----------|------------|----------|
| 0 | 3 cm | Jewelry, small electronics |
| 1 | 5 cm | General purpose (default) |
| 2 | 10 cm | Shoes, tools, medium objects |
| 3 | 20 cm | Furniture, architecture |

Detection is fully automatic — Rotera sees ArUco ID 2, knows the marker is 10 cm.

### Sheet Layout

```
┌──────────────────────────────────────────┐
│ ┌─────────┐                              │
│ │ ░░░░░░░ │                              │
│ │ ░ArUco░ │                              │
│ │ ░░░░░░░ │                              │
│ └─────────⊕━━━━┿━━━━┿━━━━┿━━━━━▸ X     │
│            ┃  5cm  10cm  15cm            │
│            ╂╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌           │
│         5cm┃   ·  ·  ·  ·  ·            │
│            ╂╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌           │
│        10cm┃   ·  ·  ·  ·  ·            │
│            ┃                             │
│            ▾ Z                           │
│       Rotera · Marker #1 · 5cm          │
│  ╔══════════════════════════════╗        │
│  ║ ◄──── verify: 5cm ────►     ║        │
│  ╚══════════════════════════════╝        │
└──────────────────────────────────────────┘
```

- **Origin (⊕)** at inner corner of ArUco marker
- **X axis** runs right along paper edge with ruler markings
- **Z axis** runs down along paper edge with ruler markings
- **Light grid** dots at cm intersections in working area
- **Verification ruler** at bottom — user measures to confirm 100% print scale

### Coordinate Mapping

Origin at marker's inner corner (BR corner of the ArUco square):

| ArUco Corner | Sheet Position | World Coordinate (for 5cm marker) |
|-------------|----------------|-----------------------------------|
| TL | paper corner | (-0.05, 0, -0.05) |
| TR | along top edge | (0, 0, -0.05) |
| **BR** | **origin** | **(0, 0, 0)** |
| BL | along left edge | (-0.05, 0, 0) |

All corners have Y = 0 (sheet is on the ground plane).

---

## Phase 1: Core Detection + Auto-Setup

### 1.1 Add js-aruco2 dependency

- `npm install js-aruco2`
- Library is pure JS, ~50KB, no native deps
- Provides `AR.Detector` for detection and `AR.Dictionary` for SVG generation
- If no type declarations exist, add a minimal `.d.ts` in `src/types/`

### 1.2 Marker size registry

Create `src/calibration/marker-registry.ts`:

```typescript
export interface MarkerDefinition {
  id: number           // ArUco ID
  edgeSizeMeters: number
  label: string        // "3 cm", "5 cm", etc.
}

export const MARKER_DEFINITIONS: MarkerDefinition[] = [
  { id: 0, edgeSizeMeters: 0.03, label: '3 cm' },
  { id: 1, edgeSizeMeters: 0.05, label: '5 cm' },
  { id: 2, edgeSizeMeters: 0.10, label: '10 cm' },
  { id: 3, edgeSizeMeters: 0.20, label: '20 cm' },
]

export function getMarkerDefinition(id: number): MarkerDefinition | undefined {
  return MARKER_DEFINITIONS.find(m => m.id === id)
}

/** World coordinates for the 4 corners (Y=0 floor placement) */
export function getMarkerCornerPositions(def: MarkerDefinition): [Vec3, Vec3, Vec3, Vec3] {
  const s = def.edgeSizeMeters
  return [
    [-s, 0, -s],  // TL
    [0, 0, -s],   // TR
    [0, 0, 0],    // BR = origin
    [-s, 0, 0],   // BL
  ]
}
```

### 1.3 ArUco detection service

Create `src/calibration/detect-markers.ts`:

```typescript
export interface DetectedMarker {
  id: number
  corners: [PixelCoord, PixelCoord, PixelCoord, PixelCoord] // TL, TR, BR, BL
}

/** Detect ArUco markers in a viewpoint image */
export function detectMarkers(viewpoint: Viewpoint): DetectedMarker[]
```

Implementation:
1. Create an offscreen canvas
2. Draw the viewpoint image (from `viewpoint.url` data URL)
3. Get ImageData via `ctx.getImageData()`
4. Run `new AR.Detector({ dictionaryName: 'ARUCO' }).detect(imageData)`
5. Filter to known IDs (0-3)
6. Return detected markers with corner pixel coordinates

### 1.4 Marker-to-entities conversion

Create `src/calibration/apply-marker.ts`:

```typescript
export interface AppliedMarker {
  worldPoints: [WorldPoint, WorldPoint, WorldPoint, WorldPoint]
  imagePoints: [ImagePoint, ImagePoint, ImagePoint, ImagePoint]
  constraints: Constraint[]
}

/** Create world points, image points, and constraints from a detected marker */
export function applyDetectedMarker(
  project: EntityProject,
  viewpoint: Viewpoint,
  detected: DetectedMarker,
  placementMode: 'floor' | 'wall' | 'free'
): AppliedMarker
```

For floor mode, this function:
1. Look up `MarkerDefinition` by `detected.id`
2. Compute 4 world coordinates via `getMarkerCornerPositions()`
3. Check if this marker ID already has WorldPoints in the project (for multi-viewpoint reuse)
4. If new: create 4 WorldPoints named `Marker_{id}_TL`, `_TR`, `_BR`, `_BL`
5. Lock all coordinates on each WorldPoint (all XYZ are known absolutely)
6. Create 4 ImagePoints linking WorldPoints to the viewpoint at detected pixel positions
7. Create constraints for solver robustness:
   - 4× `DistanceConstraint` (edges = marker size)
   - 2× `DistanceConstraint` (diagonals = marker size × √2)
   - `CoplanarPointsConstraint` (all 4 points)
8. Add everything to project
9. Return references for UI feedback

**Multi-viewpoint reuse:** When the same marker ID is detected in a second viewpoint, reuse the existing WorldPoints — only create new ImagePoints for the new viewpoint. This is the key cross-view constraint that makes photogrammetry work.

### 1.5 Marker detection overlay on canvas

In `src/components/image-viewer/`:
- Add a `renderMarkerDetection` renderer that draws detected marker outlines on the canvas
- Green quadrilateral around detected marker corners
- Corner dots with labels (TL/TR/BR/BL)
- Marker ID label at center
- This shows during "detection preview" before the user confirms

### 1.6 UI: "Detect Markers" button

**Location:** Add to the viewpoint action buttons in `ImageNavigationItem.tsx` (the per-viewpoint toolbar), using a crosshair/target icon.

**Flow:**
1. User clicks "Detect Markers" on a viewpoint
2. Run `detectMarkers(viewpoint)` — shows results overlaid on the image
3. If markers found: show confirmation dialog listing detected markers with sizes
4. User picks placement mode (floor/wall/free) — default: floor
5. User confirms → `applyDetectedMarker()` creates all entities
6. Points appear on the image, constraints appear in the constraint manager

**If same marker ID already exists in project:** Dialog notes "Marker #1 already exists — will reuse existing world points and add image points for this viewpoint."

### 1.7 Printable sheet generation

Create `src/calibration/generate-sheet.ts`:

```typescript
/** Generate an SVG string for a printable calibration sheet */
export function generateCalibrationSheet(markerId: number): string
```

The SVG contains:
- ArUco marker (from `AR.Dictionary.generateSVG()`) positioned in top-left
- Origin crosshair at inner corner
- X axis arrow with cm tick marks and labels
- Z axis arrow with cm tick marks and labels
- Light grid dots at cm intersections
- Verification ruler bar at bottom with exact known length
- Title text: "Rotera Calibration Sheet · Marker #1 · 5 cm"
- Print instructions: "Print at 100% scale. Verify with ruler below."

**UI:** "Print Calibration Sheet" in the File menu or a dedicated toolbar button. Opens a dialog with 4 sheet previews. Click to download as SVG (browsers handle SVG printing well), or render to PDF via a simple print dialog.

### 1.8 Entity persistence

The marker's WorldPoints, ImagePoints, and constraints are all standard entities — they serialize/deserialize with the existing system automatically. No new entity types needed for Phase 1.

To track which world points belong to a marker (for multi-viewpoint reuse), use a naming convention: `Marker_{id}_TL` etc. On detection, search existing WorldPoints by name pattern.

**Alternative (cleaner):** Add an optional `markerInfo` field to WorldPoint:
```typescript
markerInfo?: { markerId: number, corner: 'TL' | 'TR' | 'BR' | 'BL' }
```
This is a small entity change but enables robust matching without relying on names.

---

## Phase 2: Polish + Wall Mode

### 2.1 Wall placement mode

When marker is on a wall:
- The marker plane is vertical (e.g., XY plane)
- Marker's top edge aligns with world Y-up
- Corner coordinates shift: Y replaces Z for the vertical axis
- Origin corner is still (0, 0, 0) but the plane is different

### 2.2 Manual corner adjustment

If ArUco detection is slightly off (blurry photo, extreme angle):
- After detection, let user drag corner points to refine positions
- The image point u,v values update live
- Useful for borderline-detectable markers

### 2.3 Marker visualization in world view

In the 3D world view, render the calibration sheet as a textured quad on the ground plane. Helps users verify the marker is where they expect it.

### 2.4 Multi-marker scenes

Support multiple different marker IDs in one scene:
- Sheet 0 on the floor, Sheet 1 on a wall
- Each establishes its own local frame
- If placed at a known relationship (e.g., wall meets floor at 90°), the system gets a full 3-axis reference

---

## Phase 3: Smart Features

### 3.1 Auto-detect on image load

When a new image is loaded, run marker detection automatically in the background. If markers found, show a non-intrusive notification: "Calibration marker detected — click to apply."

### 3.2 Confidence scoring

Report detection confidence based on:
- Marker apparent size in pixels (too small = unreliable)
- Viewing angle (very oblique = less accurate corners)
- Warn user if detection quality is low

### 3.3 A3 / custom paper size sheets

Generate sheets for A3 paper (larger working area for bigger objects).

---

## File Structure

```
src/calibration/
  marker-registry.ts          # 4 predefined markers, sizes, corner coords
  detect-markers.ts           # ArUco detection wrapper
  apply-marker.ts             # Detection → entities conversion
  generate-sheet.ts           # Printable SVG generation

src/components/
  CalibrationSheetDialog.tsx   # Print sheet selection + preview dialog
  MarkerDetectionOverlay.tsx   # Canvas overlay for detection results

src/types/
  js-aruco2.d.ts              # Type declarations (if needed)
```

## Dependencies

- `js-aruco2` — ArUco marker detection + SVG generation (already used in Trakkor)

## What Does NOT Change

- No changes to the optimization/solver code
- No new constraint types
- No new analytical gradient providers
- No changes to the serialization format (Phase 1)
- Entities created are all standard WorldPoints, ImagePoints, and existing constraint types

## Risk / Open Questions

1. **js-aruco2 detection quality** — Works well in Trakkor, but Rotera images may be higher-res photos (not webcam). May need to downscale before detection for performance, then map corners back to full resolution.

2. **Corner accuracy** — ArUco detection gives pixel-level corners. For photogrammetry we want sub-pixel accuracy. The library may already do corner refinement; if not, we may want to add it.

3. **Marker visible in photo but not detected** — Extreme angles, motion blur, or partial occlusion could prevent detection. Phase 2's manual corner adjustment handles this.

4. **`markerInfo` on WorldPoint vs naming convention** — Adding a field to WorldPoint is cleaner but touches the entity layer. Naming convention is zero-change but fragile. Recommend the field approach with careful migration.

5. **Print scale verification** — Users WILL accidentally print with "fit to page" scaling. The verification ruler is critical. Could also add a "measure two points" workflow: user clicks two ruler endpoints and enters the measured distance to auto-correct.
