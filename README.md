# Pictorigo
<!-- TODO: Consider renaming to "grammagon" (gramma=drawing + gon=angle) -->
Poor Man's Photogrammetry

## 🚀 Current Status

**ACTIVE DEVELOPMENT** - Standalone browser application with functional UI and ScalarAutograd solver.

✅ **UI Layer**: React TypeScript interface with project management and visualization
✅ **Domain Layer**: Entity-based model (WorldPoint, Line, Viewpoint, Constraint)
✅ **Solver Layer**: ScalarAutograd (TypeScript) for automatic differentiation and optimization
✅ **Testing**: Comprehensive test suite

**Quick Start:**
```bash
# Standalone browser app (Node.js 20+)
npm install
npm run dev  # Runs on http://localhost:5173
```

**Solver:** Uses ScalarAutograd (TypeScript-based) for automatic differentiation and optimization (C:\Dev\ScalarAutograd), runs entirely in browser.

## Goal

Constraint-driven sparse Structure-from-Motion (SfM) with CAD-like geometric priors. Like fSpy, but with multiple linked cameras, shared world points, and exportable geometry. Distinct from full photogrammetry—focuses on parametric constraints and precise geometric relationships.

## Core concepts

* **World Point (WP):** Unique 3D point with ID; exists independent of any single image.
* **Image:** A calibrated or to-be-calibrated photo.
* **Image Point (IP):** Observation tying a WP to a 2D pixel in a specific image.
* **Constraint:** Any relation over WPs, cameras, or both (e.g., distances, planes).
* **Camera:** Intrinsics + extrinsics (projection matrix) per image.

## Constraints (examples, not exhaustive)

* **IP observation:** (image\_id, wp\_id, u, v).
* **Known coordinates:** Any subset of {x, y, z} fixed for a WP.
* **Distance:** ‖WP\_i − WP\_j‖ = d (meters).
* **Axis alignment:** Vector (WP\_i→WP\_j) aligned with world X/Y/Z or another vector.
* **Horizontal/vertical:** Special cases of axis alignment.
* **Coplanarity / plane membership:** {WP\_i,…} lie on a plane; or define plane from ≥3 WPs.
* **Mirror symmetry:** Two WP sets mirrored about a (known/unknown) plane.
* **Cylindrical/Conical primitives:** ≥2 circular cross-sections forming a cylinder or cone.
* **Equality (merge):** WP\_a ≡ WP\_b (late dedup).

Camera projections are solved from the full constraint graph. IPs cannot exist without their images.

## Solver

* Builds a factor/constraint graph over WPs and cameras.
* Solves by nonlinear least squares with robust losses (Huber/Cauchy).
* Mandatory gauge fixing: origin, scale, and orientation anchoring.
* Tracks:

  * Per-constraint residuals (to flag weak/inconsistent inputs).
  * Per-WP uncertainty ellipsoids.
  * Under-constrained variables (DoF accounting via Jacobian rank).
  * Degeneracy detection (planar scenes, colinear points, tiny baselines).
* Over-constraints are allowed and reduce variance.
* **Two-camera initialization:**
  * **7-point algorithm** for Essential Matrix estimation (minimum 7 point correspondences)
  * **8-point algorithm** as fallback for 8+ correspondences
  * Future: 5-point algorithm (Nistér 2004) could reduce to 5 correspondences but requires solving 10th-degree polynomials
* **Single-camera initialization:** PnP from 3D-2D correspondences when world points already have coordinates
* **Global bundle adjustment:** Refines all parameters jointly after initialization

## Workflow (condensed example)

1. Load an interior photo. Mark a corner as WP₀ = (0,0,0).
2. Mark another floor corner WP₁; constrain (WP₀→WP₁) ‖ X-axis and distance = 5 m.
3. Mark a ceiling point WP₂; constrain WP₂ horizontally aligned with WP₀ (same x,y).
4. Constrain a wall point WP₃ to the plane defined by {WP₀, WP₁, WP₂}.
5. Solve → recover camera pose and initial sparse WPs.
6. Add a second photo; place IPs for existing WPs; re-solve → estimate the new camera quickly from prior constraints.

## Geometry & export

* User can tag WP groups as faces/meshes for export or keep them as abstract primitives.
* Export includes:

  * Sparse WPs, planes/solids (if defined),
  * Camera poses and intrinsics,
  * Per-constraint residuals (optional).
* Plugins: Blender (full camera/geometry support), Fusion 360 (construction geometry and snapping guides only).

## Editing & merge

* Late realization that two WPs are identical → merge (WP\_b takes WP\_a’s references) with automatic graph update.

## Architecture

**Standalone browser application** with three layers running entirely in-browser:

* **UI Layer:** React + TypeScript. Fast image switching, point/constraint editing, residual/uncertainty indicators.
* **Domain Layer:** Entity-based model (WorldPoint, Line, Viewpoint, Constraint classes) with MobX observables for automatic change detection.
* **Solver Layer:** ScalarAutograd (TypeScript) for automatic differentiation and constraint optimization. Supports intrinsic constraints (embedded in geometric entities like lines) and extrinsic constraints (relationships between entities).

All layers run in the browser. No server required.

## Testing strategy

* No bitmaps required. Synthetic scenes:

  * Create known WPs/planes/distances.
  * Generate cameras (including axis-aligned cases) and project visible WPs to IPs.
  * Ensure points are in front of cameras and inside image bounds.
* Unit/integration tests cover each constraint type, mixed constraints, under/over-constrained cases, and WP merge behavior.
* Verify solves recover ground-truth within tolerances.

## Notes

* All distances in meters.
* System continuously reports what's unconstrained, plus largest residuals by constraint and by WP.
