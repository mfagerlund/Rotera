Strong idea. Feasible. Key points:

* **Scope & Positioning:** It’s “constraint-driven sparse SfM” with CAD-like priors. Distinct from full photogrammetry; closer to fSpy×bundle-adjustment×parametric constraints.

* **Variables:** Cameras (R,t; shared intrinsics K with k1,k2; no skew to start), World Points (WP), optional Planes/Primitives.

* **Core residuals:**

  * Reprojection (IP ↔ WP).
  * Point-to-plane.
  * Distance between WPs.
  * Axis/parallel/perpendicular (vector alignment).
  * Optional symmetry/cylinder/cone later.

* **Gauge fixing:** Always anchor origin, scale, and orientation (e.g., WP₀=0, WP₁ on +X with known distance, a third constraint for +Y/+Z). Without this, solutions drift.

* **Initialization:** EPnP per image from 3–6 WPs with known 3D; then global non-linear least squares. Use robust losses (Huber/Cauchy).

* **Degeneracies to handle:** Planar scenes, near-colinear points, tiny baselines, all points at similar depth, intrinsics unconstrained. Detect and warn early.

* **Under/over-constraint reporting:** DoF accounting per variable; show unconstrained modes and largest residuals. Good that you plan per-WP uncertainty.

* **Solver tech:** Factor graph / bundle adjustment. In Python, start with `scipy.optimize.least_squares` + analytic Jacobians; move to Ceres/GTSAM if needed. Schur complement to marginalize WPs for speed.

* **Intrinsics strategy:** Lock focal/aspect initially; add k1 when stable. Per-session shared K unless evidence requires per-image variation.

* **Merging WPs:** Treat as equality constraints or ID unification with constraint rewire; re-solve incrementally.

* **UX:**

  * Residual heatmap on images.
  * “What to add next” hints (e.g., “Add 1 non-colinear point in Image 2”).
  * Quick camera switching with ghost overlays.
  * Confidence ellipsoids optional.

* **Export reality:** Blender is straightforward (glTF + cameras + empties). Fusion 360 is trickier for cameras; export reference geometry/axes and named points—snapping works.

* **TDD plan (good):** Synthetic scenes, axis-aligned cameras, visibility checks. Unit tests per constraint; mixed-constraint integrations; noise robustness.

* **MVP cut:** Images + IPs + distances + partial coordinates + planes + axis alignment. Defer symmetry/cones/cylinders.

* **Numerics:** Normalize units (meters), scale residuals, clamp angles, use double precision. Guard against flipping (det(R)=+1).

* **Roadmap (succinct):**

  1. Backend solver with TDD on synthetic data.
  2. Incremental re-solve + DoF/diagnostics.
  3. Minimal React UI for IP placement and constraint editing.
  4. Blender export plugin.
  5. Advanced constraints/primitives and nicer UX.

If you keep the MVP tight and the solver solid, this will work.
