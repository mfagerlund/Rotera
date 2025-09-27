Below is a **rock-solid** implementation plan for **Pictorigo**. It’s split into clear milestones with unambiguous deliverables, tasks, and acceptance tests. Keep prose minimal; let checklists rule.

---

# Pictorigo — Full Implementation Plan

## Tech stack

* **Backend (solver/API):** Python 3.11+, FastAPI, NumPy, SciPy, OpenCV (EPnP), pydantic, uvicorn.
* **Math:** double precision, meters, right-handed world frame, pinhole camera.
* **Frontend:** React + TypeScript (strict), Vite, Bootstrap.
* **Plugins:** Blender (Python), Fusion 360 (Python).
* **Project file:** `.pgo` (zip of JSON + thumbnails + originals).

## Global rules (“drunk-monkey guardrails”)

* **Formatting/Lint:** Black, Ruff; ESLint+Prettier; mypy strict; TS strict.
* **Pre-commit hooks:** run format+lint+tests; block merges on failure.
* **Tests:** pytest; min 85% line coverage on backend `pictorigo.core`.
* **CI:** GitHub Actions: lint, typecheck, test, pack.
* **Units:** meters everywhere. No inches.

---

## Milestone M0 — Repo & Scaffolding (Week 1)

**Goal:** Clean skeleton with CI, tests, packaging.

**Deliverables**

* `backend/` FastAPI app stub (`/healthz`), poetry/uv config.
* `pictorigo/core/` package stub with `__init__`, versioning.
* `frontend/` React + TS app (`/healthz` ping).
* `.pgo` spec draft (JSON schemas).
* CI pipeline (actions): lint/type/test/build.

**Tasks**

* Set up repo, pre-commit, issue templates.
* Define coding standards doc.
* Write JSON Schema for: WorldPoint, Image, Camera, Constraint, SolveResult.
* Implement `/healthz`, `/version`.

**Acceptance**

* `git clone && make ci` passes.
* Create/open/save empty project via API+frontend.

---

## Milestone M1 — Core Math Primitives (Week 2)

**Goal:** Deterministic, well-tested geometry layer.

**Deliverables**

* SO(3) via axis-angle & quaternion; SE(3) transforms.
* Camera intrinsics/extrinsics structs; projection/unprojection.
* Robust losses: Huber, Cauchy.
* Jacobian utilities (finite diff & analytic harness).

**Tasks**

* Implement `se3_exp/log`, `quat_normalize`, `compose`, `invert`.
* Implement `project(K, R, t, X) -> (u,v)` with radial k1 (k2 later).
* Unit tests: round-trip, numeric vs analytic Jacobians (|Δ|<1e-6).

**Acceptance**

* All math tests pass; relative errors <1e-6.

---

## Milestone M2 — Data Model & Constraint Types (Week 3)

**Goal:** Immutable IDs; serializable, typed constraints.

**Deliverables**

* Entities:

  * **WorldPoint (WP):** `{id, xyz?}`
  * **Image:** `{id, path, width, height}`
  * **Camera:** `{id, image_id, K, R, t, lock_flags}`
* **Constraints (v1 set):**

  * `ImagePoint(ip)`: `(image_id, wp_id, u, v, sigma?)`
  * `KnownCoord`: `(wp_id, mask_xyz, values)`
  * `Distance`: `(wp_i, wp_j, d)`
  * `AxisAlign`: `(wp_i, wp_j, axis|vector)`
  * `Coplanar`: `([wp_ids])`
  * `PlaneFromThree`: `(wp_a, wp_b, wp_c, set_members=[...])` (optional members)
  * `Equality`: `(wp_a, wp_b)` (merge)
  * `GaugeFix`: `(origin_wp, x_wp, xy_wp, scale_d)` (fixes origin/orientation/scale)
* Schema-validated JSON; migration version tag.

**Tasks**

* Pydantic models + JSON Schema.
* Constraint registry with type ids.
* Validation: id existence, image bounds for IPs.

**Acceptance**

* Serialize/deserialize round-trip stable.
* Invalid projects rejected with explicit errors.

---

## Milestone M3 — Synthetic Scene Generator & TDD Harness (Week 4)

**Goal:** Deterministic testbed; no bitmaps required.

**Deliverables**

* `SceneGen`: make WPs, planes, cameras (axis-aligned or arbitrary).
* Visibility culling, FOV checks, pixel bounds.
* Projection noise injection (optional).

**Tasks**

* Build helpers: `make_box_room`, `make_grid_plane`, `make_two_view`.
* Generate IP constraints from cameras+WPs.

**Acceptance**

* Factory tests create consistent `.pgo` with valid IPs.
* Coverage ≥85% for `SceneGen`.

---

## Milestone M4 — Factor Graph & Residuals (Week 5)

**Goal:** Assemble solve graph; compute residuals+Jacobians.

**Deliverables**

* Variable blocks: WPs (3), Cameras (6 on se3), Intrinsics (fx,fy,cx,cy,k1).
* Residual functors for each constraint type with analytic J.
* Problem builder producing stacked residual/Jacobian.

**Tasks**

* Implement residuals:

  * Reprojection: IP ↔ WP.
  * KnownCoord: masked.
  * Distance: ||Xi−Xj||−d.
  * AxisAlign: angle between (Xi→Xj) and axis.
  * Coplanar: point-to-plane signed distance.
  * PlaneFromThree: derive plane (n,d) from the three seeds; constrain members.
  * Equality: Xi−Xj → 0.
  * GaugeFix: hard pins (origin, axis, scale).
* Robust loss wrapping.

**Acceptance**

* Numeric vs analytic J: max diff <1e-5 over random scenes.
* Residual unit tests per constraint.

---

## Milestone M5 — Solver v1 (SciPy) + DoF/Diagnostics (Week 6)

**Goal:** End-to-end solve with stability & reporting.

**Deliverables**

* Nonlinear least squares (`scipy.optimize.least_squares`, `dogbox`/`lm`).
* Schur-style elimination (optional v1); acceptable speed on ≤200 WPs/≤20 images.
* Diagnostics:

  * Per-constraint residuals.
  * Per-WP covariance approx (inverse Hessian diag).
  * Under-constraint detection via Jacobian rank deficiency (SVD).
* Robust loss control & scaling.

**Tasks**

* Variable packing/unpacking.
* Termination criteria, clamping (det(R)=+1).
* Unit tests: recovery from synthetic ground truth (within tolerances).

**Acceptance**

* Reconstructs synthetic two-view within:

  * Cam center error < 0.02 m @ 5 m baseline.
  * Reprojection RMS < 0.5 px (noise-free).
* Reports under-constrained when gauge fix omitted.

---

## Milestone M6 — Initializers (EPnP) & Incremental Solve (Week 7)

**Goal:** Fast convergence; add images incrementally.

**Deliverables**

* PnP initializer (OpenCV EPnP) when ≥4 3D–2D pairs exist.
* Focal length bootstrap from FOV guess or EXIF (optional).
* Incremental graph updates + warm starts.

**Tasks**

* Wire EPnP; convert to SE(3).
* Strategy: lock intrinsics initially; unlock k1 later.
* Re-solve only affected variables when possible.

**Acceptance**

* Adding a new image with 6 IPs converges in <10 solver iterations (synthetic).
* Fallback to global initialize when PnP conditions unmet.

---

## Milestone M7 — Backend API v1 (Week 8)

**Goal:** Stable endpoints for the UI.

**Deliverables**

* Endpoints:

  * `POST /project`, `GET/PUT /project/{id}`
  * `POST /image` (metadata, path), `GET /image/{id}`
  * `POST/PUT/DELETE /wp`
  * `POST/PUT/DELETE /constraint`
  * `POST /solve` → returns `SolveResult`
  * `GET /diagnostics` (residuals, under-constrained list)
  * `POST /merge_wp`
  * `POST /export` (glTF+JSON bundle)
* WebSocket for solve progress stream.

**Tasks**

* Input validation, error taxonomy.
* Save/load `.pgo`.
* Large payload handling (streaming file save).

**Acceptance**

* OpenAPI spec generated and browsable.
* Contract tests pass (pytest + httpx).

---

## Milestone M8 — Frontend MVP (Week 9–10)

**Goal:** Minimal but robust workflow.

**Deliverables**

* Project open/save UI.
* Image viewer with pan/zoom; IP placement; WP selection.
* Constraint editor (KnownCoord, Distance, AxisAlign, Coplanar, Equality, GaugeFix).
* Camera switcher.
* Diagnostics panel: top residuals, unconstrained vars.
* Residual overlay heatmap (per-image RMS).

**Tasks**

* State: Redux/RTK or Zustand.
* Draggable markers, snapping to WPs.
* Keyboard ops: create/select/delete WPs/IPs.
* “What to add next” hint list (basic rules).

**Acceptance**

* Can reproduce the “room example” end-to-end (two images).
* All UI actions reflected in API and survive save/load.

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
  * (Fusion cameras are limited; do not promise camera import.)

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
* Intrinsics: enable k2 (optional); per-session shared K toggle.
* Better degeneracy detection (colinear, coplanar pathologies).

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

* Sparse structures; block-Jacobian; optional Schur complement for WPs.
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

# Initial Task Board (Week 1–4)

* [ ] M0 repo/CI/pre-commit.
* [ ] M1 math primitives + tests.
* [ ] M2 models+schemas+registry.
* [ ] M3 SceneGen + synthetic suites.
* [ ] Wire a “two-view box room” golden test; DoF check.

---

# Risk & Mitigation

* **PnP failures on near-planar scenes:** detect planarity; request non-coplanar IPs; fallback global init.
* **Unstable intrinsics:** lock K until multi-view observed; enable k1 only after stable.
* **Fusion 360 camera import limits:** don’t promise cameras; export construction geometry instead.
* **Performance ceiling:** implement Schur step; if insufficient, plan M14: C++ backend (Ceres) bridge (out of scope v0.1).

---

This plan is deliberately explicit. Follow the milestones in order. Block merges unless acceptance criteria pass.
