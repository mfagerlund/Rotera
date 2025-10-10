# Clarifying Questions: TypeScript-based Optimization Migration

There's a misunderstanding that the sketch thing is practically useful - it's only conceptually useful. No need to copy anything but ideas and inspiration!

A golden rule at his point in time is NO LEGACY NO LEGACY NO LEGACY. Don't worry about compatability, no comments about changes. Out with the old, in with the new!

## 1. Primary Migration Goal
**Question:** What is the main objective of this migration?
- A) Replace Python backend entirely with TypeScript (full rewrite, keep frontend as-is) (recommended)
- B) Replace only the optimization solver (Python→TypeScript, keep FastAPI backend)
- C) Unify Pictorigo and ScalarAutograd's sketch-demo into a single hybrid tool
- D) Extract constraint solving into a shared TypeScript library used by both projects

**Your answer:**
**Rationale:** Remove ALL py, it's in git. Total rewrite.

---

## 2. Backend Technology Stack
**Question:** What should handle the backend after migration?
- A) Pure browser-based (no backend server, all optimization in browser) (recommended)
- B) Node.js backend with TypeScript (keep REST API pattern)
- C) C# backend calling TypeScript optimization library (via Node.js process or compiled JS)
- D) Hybrid: browser-based for small problems, offload large problems to server

**Your answer:**
**Rationale:** A
---

## 3. Constraint System Scope
**Question:** Should the constraint system handle 2D, 3D, or both?
- A) 3D only (photogrammetry focus, extend sketch-demo to 3D) (recommended)
- B) Both 2D and 3D (2D sketching + 3D reconstruction)
- C) 2D only (pivot to parametric sketching, drop photogrammetry)
- D) Separate tools: keep 2D sketch-demo separate from 3D Pictorigo

**Your answer:**
**Rationale:** A

---

## 4. Camera/Image Integration
**Question:** How should camera-based constraints (reprojection) be handled?
- A) Extend ScalarAutograd's Vec2/Vec3 with camera projection residuals (recommended)
- B) Keep camera math separate from geometric constraints
- C) Drop image-based constraints entirely (focus on pure CAD-like sketching)
- D) Hybrid: 2D sketch constraints + separate 3D camera optimization

**Your answer:**
**Rationale:** A. Pictorigo's core feature is image-based modeling. Need to integrate reprojection residuals. Formulate camera as position combined with matrix - there's a matrix in SA -if it can be used, extend it to fit the needs. If a similar but diffrently shaped matrix is needed, follow the pattern.

---

## 5. Entity-Driven Architecture
**Question:** How should entities map to optimization variables?
- A) Full entity-driven (Lines/Planes/Circles are composite residuals) (recommended)
- B) Keep atomic constraints (convert entities to primitives like distance/angle)
- C) Hybrid: entity-driven for simple constraints, atomic for complex ones
- D) Let developer choose per constraint type

**Your answer:**
**Rationale:** sketch-demo proves entity-driven works brilliantly. Pictorigo's ENTITY_DRIVEN_OPTIMIZATION.md proposes the same. A. Some contstraints are "atomic", most are intrinsic to higher level concepts. 

---

## 6. Python Code Migration Strategy
**Question:** What happens to existing Python solver code?
- A) Port critical algorithms to TypeScript (keep logic, rewrite syntax)
- B) Replace entirely with ScalarAutograd's LM solver (leverage existing library)
- C) Keep Python backend as option, add TypeScript as alternative
- D) Gradual migration: TypeScript for new features, Python for legacy

**Your answer:**
**Rationale:** remove all py. full clean rewrite.

---

## 7. Data Model & Persistence
**Question:** How should project data be stored and serialized?
- A) DTOs with 6-char IDs (existing Pictorigo format) (recommended)
- B) Merge with sketch-demo's data model (simpler, 2D-focused)
- C) New unified schema supporting both 2D and 3D
- D) Two separate schemas: 2D sketch state + 3D reconstruction state

**Your answer:**
**Rationale:** A. 

---

## 8. Frontend Rebuild Scope
**Question:** Should the frontend be refactored as part of this migration?
- A) Minimal changes (just swap API calls from Python to TypeScript) (recommended)
- B) Significant refactor (adopt sketch-demo's architecture patterns)
- C) Complete rewrite (new UI leveraging browser-based solving)
- D) Merge frontends (unified 2D/3D editor)

**Your answer:**
**Rationale:** A

---

## 9. Performance & Solver Features
**Question:** What solver capabilities are required?
- A) Levenberg-Marquardt only (ScalarAutograd's strength) (recommended)
- B) LM + L-BFGS (for non-least-squares objectives)
- C) LM + Adam/SGD (for iterative refinement)
- D) All solvers from ScalarAutograd (LM, L-BFGS, Adam, AdamW)

**Your answer:**
**Rationale:** A. sketch-demo shows LM is 200-500x faster than Adam for constraints. Focus on what works.

---

## 10. Robust Loss Functions
**Question:** Should the TypeScript solver support robust kernels (Huber, Cauchy)?
- A) Yes, port from Python backend (recommended)
- B) No, keep simple L2 loss only
- C) Add later as optimization (ship MVP without)
- D) Use ScalarAutograd's existing Losses.huber() and Losses.tukey()

**Your answer:**
**Rationale:** D. Pictorigo's README mentions robust losses. Important for outlier rejection.

---

## 11. Testing Strategy
**Question:** How should the migrated solver be validated?
- A) Test against Python solver outputs (ensure identical results) (recommended)
- B) Synthetic scene tests (like existing backend tests)
- C) Manual QA (load projects, verify visually)
- D) All of the above

**Your answer:**
**Rationale:** C. Low energy, have golden examples. Need confidence the TypeScript solver matches Python's accuracy.

---

## 12. Deployment & Distribution
**Question:** How should the final system be packaged?
- A) Single-page app (all client-side, host on GitHub Pages/Netlify) (recommended)
- B) Client + server (frontend + Node.js backend)
- C) Electron app (desktop application)
- D) Multiple options (browser + desktop versions)

**Your answer:**
**Rationale:** A.

---

## 13. Backward Compatibility
**Question:** Should existing Pictorigo projects be compatible?
- A) Yes, must load old Python-based projects (recommended)
- B) No, clean break (conversion tool optional)
- C) Import only (can load old, saves in new format)
- D) Two modes: legacy (Python API) and modern (TypeScript)

**Your answer:**
**Rationale:** NO LEGACY

---

## 14. Development Phases
**Question:** What should the implementation roadmap look like?
- A) Phase 1: Port core solver → Phase 2: Integrate frontend → Phase 3: Polish (recommended)
- B) Big bang: Replace entire backend at once
- C) Gradual: Add TypeScript solver as option, deprecate Python later
- D) Parallel: Build new system alongside old, switch when ready

**Your answer:**
**Rationale:** A.

---

## 15. Success Criteria
**Question:** How will we know the migration is successful?
- A) TypeScript solver matches Python solver accuracy within 1% (recommended)
- B) Solver is faster than Python version
- C) Frontend works without Python dependency
- D) All of the above

**Your answer:**
**Rationale:** Each loss should be tested individually, when we're done, we'll create tests for golden examples.

---

## Additional Context

Please add any additional notes, preferences, or constraints:

**Your notes:**

Don't worry! It'll be fine!