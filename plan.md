Below is a **rock-solid** implementation plan for **Pictorigo**. It's split into clear milestones with unambiguous deliverables, tasks, and acceptance tests. Keep prose minimal; let checklists rule.

## 📊 Implementation Status

**COMPLETED MILESTONES (8/13):**
- ✅ M0: Repo & Scaffolding
- ✅ M1: Core Math Primitives
- ✅ M2: Data Model & Constraint Types
- ✅ M3: Synthetic Scene Generator & TDD Harness
- ✅ M4: Factor Graph & Residuals
- ✅ M5: Solver v1 (SciPy) + DoF/Diagnostics
- ✅ M6: Initializers (EPnP) & Incremental Solve
- ✅ M7: Backend API v1
- ✅ M8: Frontend MVP

**REMAINING MILESTONES:**
- 🔄 M9: Exporters & Plugins (Week 11–12)
- 🔄 M10: Advanced Constraints & Stability (Week 13–14)
- 🔄 M11: Performance & Quality (Week 15)
- 🔄 M12: UX Polish & Guidance (Week 16)
- 🔄 M13: Docs, Samples, Release 0.1 (Week 17)

**Current Status:** ✅ **VERIFIED WORKING SYSTEM**
- Backend and frontend servers running successfully
- Project creation, synthetic scene generation functional
- Solver converges properly (4 iterations, final cost 2e-10)
- JSON serialization fixed for infinity/NaN values
- Full API endpoints operational
- Ready for advanced features and polish

---

# Pictorigo — Full Implementation Plan

## Tech stack

* **Backend (solver/API):** Python 3.11+, FastAPI, NumPy, SciPy, OpenCV (EPnP), pydantic, uvicorn.
* **Math:** double precision, meters, right-handed world frame, pinhole camera.
* **Solver:** scipy.optimize.least_squares (initial), optional Ceres/GTSAM bridge later.
* **Frontend:** React + TypeScript (strict), Vite, Bootstrap.
* **Plugins:** Blender (full camera/geometry), Fusion 360 (construction geometry only).
* **Project file:** `.pgo` (zip of JSON + thumbnails + originals).

## Global rules (“drunk-monkey guardrails”)

* **Formatting/Lint:** Black, Ruff; ESLint+Prettier; mypy strict; TS strict.
* **Pre-commit hooks:** run format+lint+tests; block merges on failure.
* **Tests:** pytest; min 85% line coverage on backend `pictorigo.core`.
* **CI:** GitHub Actions: lint, typecheck, test, pack.
* **Units:** meters everywhere. No inches.

---

## Milestone M9 — Exporters & Plugins (Week 11–12)

**Goal:** Interop with DCC/CAD.

**Deliverables**

* **glTF 2.0** export:

  * Cameras (K, R, t), empties for WPs, optional meshes.
* **Pictorigo JSON**: full scene+constraints+diagnostics.
* **Blender addon (Python):**

  * Import glTF + JSON; set cameras; create empties; simple overlay panel to cycle cameras.
* **Fusion 360 script (Python):**

  * Import points as construction points; planes/axes from constraints.
  * Export reference geometry/axes and named points for snapping (cameras not supported).

**Tasks**

* Coordinate frame audit (right-handed, Y-up vs Z-up).
* Unit tests: round-trip numeric tolerances.

**Acceptance**

* Blender can render through imported cameras matching within 1 px RMS (synthetic).
* Fusion 360 shows construction points/planes at correct positions.

---

## Milestone M10 — Advanced Constraints & Stability (Week 13–14)

**Goal:** Broaden geometry; improve robustness.

**Deliverables**

* Add: MirrorSymmetry, Cylinder (two circles), Cone (two circles) constraints.
* Intrinsics: enable k2 (optional); per-session shared K (lock focal initially, add k1 when stable).
* Better degeneracy detection (planar scenes, colinear points, tiny baselines, similar depth).

**Tasks**

* Implement residuals + tests for new constraints.
* Heuristics: warn when baselines tiny; when all IPs near a line.

**Acceptance**

* Synthetic shapes solved within tolerances.
* Degeneracy warnings surfaced in UI.

---

## Milestone M11 — Performance & Quality (Week 15)

**Goal:** Reasonable speed on mid-size problems.

**Deliverables**

* Sparse structures; block-Jacobian; Schur complement to marginalize WPs for speed.
* Solver profiling; hotspots documented.
* Caching of projections/Jacobians between iterations when valid.

**Tasks**

* Use `scipy.sparse` where beneficial.
* Memoize constant parts (intrinsics locked).

**Acceptance**

* 20 images / 500 WPs / 2k IPs: solve < 10 s on laptop (baseline target).

---

## Milestone M12 — UX Polish & Guidance (Week 16)

**Goal:** Reduce user errors.

**Deliverables**

* On-image residual vectors.
* Uncertainty ellipsoids (toggle).
* Guided hints (rule-based): “Add non-colinear IP for WP\_17 in Image\_3”, etc.
* Conflict explainer: show top constraints causing tension on a WP.

**Tasks**

* Compute uncertainty from Hessian diag → 3D ellipsoids.
* Simple heuristic advisor.

**Acceptance**

* User can fix an intentionally bad constraint using the hints.
* Usability smoke tests pass.

---

## Milestone M13 — Docs, Samples, Release 0.1 (Week 17)

**Goal:** Shippable preview.

**Deliverables**

* Docs:

  * Getting started
  * Constraint glossary (with diagrams)
  * Troubleshooting degeneracies
  * Plugin install guides
  * `.pgo` format spec v1
* Sample projects (room, cube, object).
* Versioned release artifacts.

**Tasks**

* Record short GIFs (UI flows).
* Fill FAQ.

**Acceptance**

* New dev can reproduce samples within 30 minutes using docs only.

---

# Key Specifications (Appendix)

## Parameterization

* **Camera intrinsics K:** `(fx, fy, cx, cy, k1[, k2])`, no skew initially.
* **Camera pose:** `R ∈ SO(3)` (axis-angle 3-vec), `t ∈ ℝ³`.
* **WP:** `X ∈ ℝ³`.

## Residuals (units)

* **Reprojection:** `r = (û−u, v̂−v)` \[pixels], robust loss.
* **KnownCoord:** masked difference \[m].
* **Distance:** `||Xi−Xj||−d` \[m].
* **AxisAlign:** angle between `(Xi→Xj)` and target axis \[rad].
* **Plane:** signed distance `n·X + d` \[m].
* **Equality:** `Xi−Xj` \[m].
* **GaugeFix:** hard pins via variable locking (0 residuals).

## Gauge fixing (mandatory in tests & UI)

* Pick `WP0 = (0,0,0)`.
* Align `(WP0→WP1)` with +X and set distance `d` (scale).
* Use `WP2` to define XY plane (+Y direction).

## Under/Over-constraint

* Rank(J) via SVD. If nullspace > 0, list degrees and implicated vars.
* Over-constraint handled by robust losses; highlight outliers.

## Error reporting

* Show:

  * Top-10 constraints by residual.
  * Per-WP RMS reprojection.
  * Per-image RMS.
  * Uncertainty (std dev) per WP.

## File format (`.pgo`)

* Zip:

  * `/project.json` (schema-versioned)
  * `/images/{id}.link` (path or hash) or `/images/{id}.jpg` if embedded
  * `/thumbnails/{id}.jpg`
  * `/exports/*`
* `project.json` keys: `world_points`, `images`, `cameras`, `constraints`, `settings`, `diagnostics`.

---

# Risk & Mitigation

* **PnP failures on near-planar scenes:** detect planarity; request non-coplanar IPs; fallback global init.
* **Unstable intrinsics:** lock K until multi-view observed; enable k1 only after stable.
* **Fusion 360 camera import limits:** don’t promise cameras; export construction geometry instead.
* **Performance ceiling:** implement Schur step; if insufficient, plan M14: C++ backend (Ceres) bridge (out of scope v0.1).

---

This plan is deliberately explicit. Follow the milestones in order. Block merges unless acceptance criteria pass.
