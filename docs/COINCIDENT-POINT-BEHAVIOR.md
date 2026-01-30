# Coincident Points: Visual Snapping & Coordinate Inference

**Status:** Requirements / Plan
**Date:** 2025-01-27

## Overview

When a WorldPoint is constrained as coincident with a Line, it must visually and logically lie on that line at all times in the 2D image view. This document covers three areas:

1. **Visual snapping** - coincident points are always rendered on their line
2. **Drag behavior** - dragging a coincident point snaps it to the nearest point on the line; dragging a line endpoint moves its coincident points too
3. **Coordinate inference** - coincident constraints propagate coordinates, just like direction-constrained lines already do

---

## 1. Visual Snapping in 2D View

### Current behavior
A coincident point is rendered at its image point position `(u, v)`, which may not lie on the line's projected segment in the image. The coincident constraint only takes effect during optimization (via cross-product residuals).

### Required behavior
In the 2D view, a coincident point must always appear on the line it is constrained to, regardless of where its raw image point is.

### Approach
When rendering a coincident point (or computing its effective image position), project it onto the **infinite line** through the line's two endpoint image positions. The projection is the closest point on the infinite line (not clamped to the segment).

**Math:** Given line endpoints `A`, `B` in image space and point `P`:
```
AB = B - A
AP = P - A
t = dot(AP, AB) / dot(AB, AB)
snapped = A + t * AB
```

`t` is unclamped - the point can extend beyond the segment endpoints.

### Where to implement
- `worldPointsRenderer.ts` - when drawing a WP that has `coincidentWithLines.size > 0`, compute snapped position for each line and use it
- If a point is coincident with multiple lines, use the **first** line (or average - TBD based on UX testing)

---

## 2. Drag Behavior

### 2a. Dragging a coincident point

**Current:** Dragging moves the image point freely in 2D.

**Required:** When dragging a point that is coincident with a line, constrain the drag so the point stays on the (infinite) line projection. The point slides to the closest position on the line to the cursor.

**Implementation in `usePointDragHandlers.ts`:**
- In `updatePointDrag`, after computing the new `(u, v)` from cursor position:
  - Check if the world point has `coincidentWithLines.size > 0`
  - For each coincident line, project `(u, v)` onto the line's image-space projection
  - Use the projected position instead of the raw cursor position
  - If multiple lines: use the nearest projection (closest to cursor)

### 2b. Dragging a line endpoint

**Current:** Moving a line endpoint (by dragging its image point) does not affect coincident points.

**Required:** When a line endpoint moves, all coincident points on that line should be repositioned to their closest point on the updated line. This maintains the visual constraint without requiring the user to manually adjust each coincident point.

**Implementation in `useDomainOperations.ts` or `moveImagePoint`:**
- After moving an image point, check if the world point is an endpoint of any line
- For each such line, iterate its `coincidentPoints`
- For each coincident point visible in the current viewpoint, reproject it onto the updated line
- Call `imagePoint.setPosition(snappedU, snappedV)` for each

---

## 3. Coordinate Inference Through Coincident Constraints

### Current inference system
`coordinate-inference.ts` propagates coordinates through **direction-constrained lines** between endpoints only. For example, an X-aligned line shares Y and Z between its two endpoints.

Coincident points are **not** part of this propagation. They only participate via optimization residuals.

### Required behavior
Coincident points should participate in coordinate inference, inheriting the same perpendicular-axis coordinates as the line's endpoints.

### Inference rules for coincident points

A coincident point lies on the line, so it shares the same constraints as the line's direction implies:

| Line Direction | Coincident point inherits | Rationale |
|---------------|--------------------------|-----------|
| `x` (X-axis) | Y, Z from endpoints | Point is on X-axis line, so Y and Z match |
| `y` (Y-axis) | X, Z from endpoints | Point is on Y-axis line, so X and Z match |
| `z` (Z-axis) | X, Y from endpoints | Point is on Z-axis line, so X and Y match |
| `xy` (XY plane) | Z from endpoints | Point is in XY plane, so Z matches |
| `xz` (XZ plane) | Y from endpoints | Point is in XZ plane, so Y matches |
| `yz` (YZ plane) | X from endpoints | Point is in YZ plane, so X matches |
| `free` | Nothing | No directional constraint to propagate |

These are **exactly the same rules** as endpoint-to-endpoint inference, extended to coincident points.

### Implementation in `coordinate-inference.ts`

In `inferFromLine()`, after propagating between `pointA` and `pointB`, also propagate to each coincident point using the same axis rules:

```typescript
// After existing endpoint inference...
for (const coincidentPoint of line.coincidentPoints) {
  // Use the same axes as endpoint inference
  // Try to infer from pointA first, then pointB
  for (const axis of sharedAxes) {
    inferAxisFromOther(coincidentPoint, pointA, axis, `coincident with ${line.name}`)
    inferAxisFromOther(coincidentPoint, pointB, axis, `coincident with ${line.name}`)
  }
  // Also propagate FROM coincident point back to endpoints
  for (const axis of sharedAxes) {
    inferAxisFromOther(pointA, coincidentPoint, axis, `coincident with ${line.name}`)
    inferAxisFromOther(pointB, coincidentPoint, axis, `coincident with ${line.name}`)
  }
}
```

This is bidirectional: if the coincident point has a locked coordinate, it propagates to the endpoints too.

### Inference through coplanar constraints

Coplanar constraints (`CoplanarPointsConstraint`) currently do **not** participate in coordinate inference at all - they only produce optimization residuals.

If a coincident point is also part of a coplanar constraint, inference flows like:
1. Line direction propagates perpendicular axes to coincident point
2. The coincident point's coordinates are now available for other lines connected to it
3. Standard iterative propagation handles multi-hop inference

Coplanar constraints themselves don't need inference changes - they constrain a geometric relationship (all points on a plane) that doesn't map to single-axis propagation. The plane normal direction could theoretically propagate one axis, but this adds complexity for marginal benefit. Leave coplanar inference as future work.

---

## 4. Implementation Order

1. **Coordinate inference** (`coordinate-inference.ts`) - extend `inferFromLine()` to include coincident points
2. **Visual snapping** (`worldPointsRenderer.ts`) - render coincident points on their line
3. **Drag snapping** (`usePointDragHandlers.ts`) - constrain drag to line
4. **Endpoint drag cascade** (`useDomainOperations.ts` or similar) - move coincident points when endpoint moves

Each step is independently testable and valuable.

---

## 5. Edge Cases

- **Point coincident with multiple lines:** Snapping uses nearest line projection to cursor. Inference propagates from all lines (may produce conflicts if inconsistent).
- **Both endpoints lack image points in current viewpoint:** Cannot compute line projection - render point at its raw position, skip drag snapping.
- **Line with direction `free`:** No inference propagation, but visual snapping still applies (point still lies on the line geometrically).
- **Coincident point is also a coplanar point:** Both constraints apply. Inference comes from the line; coplanar is handled by optimization residuals.
- **Dragging endpoint of line with many coincident points:** All coincident points update. This should be efficient since it's just projections.
