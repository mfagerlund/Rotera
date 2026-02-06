# Code Review & Refactor Plan

**Scope:** Scoped RNG + Strategy-as-Candidate system (16 files, ~430 insertions)
**Date:** 2026-02-06
**Duplication:** 2.83% lines / 3.99% tokens (164 clones, target <3% lines)

---

## Summary

Two features were implemented:
1. **Scoped RNG** — `SeededRng` class with `createRng(offset)` isolating random streams per phase
2. **Strategy-as-Candidate** — `init-strategy.ts` + candidate testing varies init strategy as a dimension

Both are well-implemented and all 258 tests pass. Below are issues found from code review and duplication analysis, ranked by severity and impact.

---

## Part A: Code Review Issues

### A1. DEAD FUNCTION: `determineSignFromCameraRay` (phase-4-line-propagation.ts:357-418)

**Severity:** Medium — dead code, 62 lines
**File:** `src/optimization/unified-initialization/phase-4-line-propagation.ts`

This function is defined but never called. It was superseded by `computeRayLineIntersection` which computes both sign AND distance in one step. The function also has verbose `[Sign Debug]` log calls that would spam production logs if it were ever called.

**Action:** Delete `determineSignFromCameraRay` entirely (lines 357-418).

---

### A2. DEAD VARIABLE: `axisIndex` in `computeRayLineIntersection` (phase-4-line-propagation.ts:260)

**Severity:** Low — unused variable
**File:** `src/optimization/unified-initialization/phase-4-line-propagation.ts`

```typescript
const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2  // never read
```

Assigned on line 260 but never referenced — the function uses explicit `if (axis === 'x')` branches instead.

**Action:** Delete line 260.

---

### A3. DEAD `getSeed()` (seeded-random.ts:62-65)

**Severity:** Medium — misleading dead API
**File:** `src/optimization/seeded-random.ts`

`getSeed()` is never imported anywhere. It returns `state` which is the global LCG counter, not the seed — misleading name even if it were used. The `state` variable itself is NOT dead (it's the global LCG state for `random()`).

**Action:** Delete `getSeed()` (lines 62-65). Keep `state`.

---

### A4. VERBOSE LOG in phase-4 (phase-4-line-propagation.ts:98)

**Severity:** Low — production noise
**File:** `src/optimization/unified-initialization/phase-4-line-propagation.ts`

Line 98 unconditionally logs every ray intersection. Should be behind `verbose` guard.

**Action:** Change `log(...)` to `if (verbose) log(...)` or `logDebug(...)`.

---

### A5. `uninitializedCameras` heuristic duplicated (candidate-testing.ts:84-86, orchestrator.ts:156-158)

**Severity:** Low — pre-existing, now in two places
**File:** `src/optimization/optimize-project/candidate-testing.ts`

```typescript
const uninitializedCameras = viewpointArray.filter(vp =>
  vp.position[0] === 0 && vp.position[1] === 0 && vp.position[2] === 0
);
```

**Action:** Consider extracting `isUninitializedCamera(vp)` helper. Not blocking.

---

## Part B: Duplication Findings (jscpd)

**164 clones total.** Grouped by category, with actionable items first.

### B1. CRITICAL: `essential-matrix/svd.ts` — Jacobi eigendecomposition × 3 (108 lines duplicated)

**Severity:** High — biggest single duplication in the codebase
**File:** `src/optimization/essential-matrix/svd.ts`
**Clones:** 51+57 lines, 809+877 tokens

Three functions are near-identical:
- `jacobiEigenDecomposition3x3(A)` — n=3, maxIter=100, tol=1e-10
- `jacobiEigenDecomposition9x9(A)` — n=9, maxIter=200, tol=1e-12
- `jacobiEigenDecomposition4x4(A)` — n=4, maxIter=100, tol=1e-10

The only differences are: `n`, `maxIterations`, `tolerance`, and return shape.

**Action:** Extract a single `jacobiEigenDecomposition(A, maxIter, tol)` that works for any size. Keep the named wrappers as thin aliases for API stability:
```typescript
function jacobiEigenDecomposition(A: number[][], maxIter: number, tol: number) { /* core */ }
export const jacobiEigenDecomposition3x3 = (A: number[][]) => jacobiEigenDecomposition(A, 100, 1e-10);
export const jacobiEigenDecomposition9x9 = (A: number[][]) => jacobiEigenDecomposition(A, 200, 1e-12);
export const jacobiEigenDecomposition4x4 = (A: number[][]) => jacobiEigenDecomposition(A, 100, 1e-10);
```
**Saves:** ~100 lines

---

### B2. HIGH: `quaternionRotateVector` duplicated in 4 places

**Severity:** High — same function copied 4 times
**Files:**
| Location | Signature | Exported? |
|----------|-----------|-----------|
| `src/utils/quaternion.ts:15` | `quaternionRotateVector(q, v)` | YES (canonical) |
| `src/optimization/coordinate-alignment/quaternion-utils.ts:13` | `quaternionRotateVector(q, v)` | YES |
| `src/optimization/triangulation.ts:13` | `quaternionRotateVector(q, v)` | No (private) |
| `src/optimization/camera-initialization/essential-matrix-strategy.ts:108` | `rotateVec(q, v)` inline lambda | No (inline) |

All four implement identical math: `v' = v + 2w(q×v) + 2(q×(q×v))`.

**Action:** Delete the 3 copies. Import from `src/utils/quaternion.ts` everywhere:
- `triangulation.ts` → `import { quaternionRotateVector } from '../utils/quaternion'`
- `essential-matrix-strategy.ts` → `import { quaternionRotateVector } from '../../utils/quaternion'`
- `coordinate-alignment/quaternion-utils.ts` → re-export from `../../utils/quaternion`

**Saves:** ~40 lines

---

### B3. HIGH: `quatRotate` duplicated between project-point-plain.ts and reprojection-provider.ts

**Severity:** High — 27 lines (383 tokens) duplicated
**Files:**
- `src/optimization/analytical/project-point-plain.ts:17` — private `quatRotate`
- `src/optimization/analytical/providers/reprojection-provider.ts:79` — private `quatRotate`

Both implement the same general (non-unit) quaternion rotation formula using `{w,x,y,z}` object types.

**Action:** Extract to a shared utility in `src/optimization/analytical/` and import in both files. Note: this uses `Point3D`/`Quaternion` object types, different from the `number[]` version in `quaternion.ts`.

**Saves:** ~25 lines

---

### B4. MEDIUM: Sampson error computation duplicated (validation.ts:14-54 vs 60-97)

**Severity:** Medium — 20 lines identical inner loop
**File:** `src/optimization/essential-matrix/validation.ts`

`countInliersWithSampsonError` and `computeTotalSampsonError` have identical E×x1, E^T×x2, x2^T×E×x1, and denominator computation. They only differ in what they accumulate (count vs sum).

**Action:** Extract `computeSampsonError(E, x1, x2): number` and call it from both:
```typescript
function computeSampsonError(E: number[][], c: Correspondence): number {
  // shared Ex1, Etx2, x2tEx1, denom computation
  return denom > 1e-10 ? (x2tEx1 * x2tEx1) / denom : Infinity;
}

export function countInliersWithSampsonError(E, correspondences, threshold) {
  return correspondences.filter(c => computeSampsonError(E, c) < threshold).length;
}

export function computeTotalSampsonError(E, correspondences) {
  return correspondences.reduce((sum, c) => {
    const err = computeSampsonError(E, c);
    return sum + (err === Infinity ? 0 : err);
  }, 0);
}
```
**Saves:** ~25 lines

---

### B5. MEDIUM: `computeRayLineIntersection` axis branches × 3 (phase-4-line-propagation.ts:274-343)

**Severity:** Medium — 70 lines of near-identical code (3 clones detected)
**File:** `src/optimization/unified-initialization/phase-4-line-propagation.ts`

The x, y, z branches have identical structure: build tValues from the two non-axis components, average, validate, compute.

**Action:** Parameterize using axis index:
```typescript
const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
const otherIndices = [0, 1, 2].filter(i => i !== axisIdx);
const tValues: number[] = [];
for (const idx of otherIndices) {
  if (Math.abs(ray[idx]) > 0.001) {
    tValues.push((startXyz[idx] - camPos[idx]) / ray[idx]);
  }
}
if (tValues.length > 0) {
  const t = tValues.reduce((a, b) => a + b) / tValues.length;
  const minT = Math.min(...tValues);
  const maxT = Math.max(...tValues);
  if (t > 0 && (tValues.length === 1 || maxT / Math.abs(minT + 0.001) < 10)) {
    const result: [number, number, number] = [...startXyz];
    result[axisIdx] = camPos[axisIdx] + t * ray[axisIdx];
    return result;
  }
}
```
**Saves:** ~45 lines

---

### B6. LOW: Candidate-testing probe option blocks duplicated (candidate-testing.ts)

**Severity:** Low — 13 lines duplicated between tier1 and tier2 probing
**File:** `src/optimization/optimize-project/candidate-testing.ts` (lines 367-379 vs 406-419)

The option-spreading block for calling `optimizeProject` is repeated in tier1 and main probing.

**Action:** Extract `buildProbeOptions(candidate, options, maxIterations)` helper.
**Saves:** ~12 lines

---

### B7. LOW: Gradient files have structural duplication (30+ clones)

**Severity:** Low — inherent in generated/mechanical gradient code
**Files:** `src/optimization/residuals/gradients/*.ts`

These are per-component analytical gradients. Each follows the same pattern (extract params, compute partials, return). Duplication is structural — refactoring would require a gradient generation framework and would risk correctness.

**Action:** None. Accept as inherent structural duplication.

---

### B8. LOW: `vec3.cross` duplicated in `vanishing-points/math-utils.ts`

**Severity:** Low — 8 lines
**Files:** `src/utils/vec3.ts:40` ↔ `src/optimization/vanishing-points/math-utils.ts:15`

**Action:** Import from `utils/vec3` instead of re-implementing.
**Saves:** ~8 lines

---

### B9. LOW: Orchestrator stepped-VP handling duplicated (orchestrator.ts:89-100 vs 185-195)

**Severity:** Low — 10 lines
**File:** `src/optimization/camera-initialization/orchestrator.ts`

The "iterate steppedResult.vpCameras + pnpCameras" block is repeated in `initializeCamerasWithStrategy` and `initializeCamerasLegacy`.

**Action:** Could extract, but low value since both branches have slightly different context. Accept.

---

## Refactor Actions (ordered by impact)

| # | Action | File(s) | Lines saved | Risk |
|---|--------|---------|-------------|------|
| B1 | Unify 3 Jacobi eigendecomposition functions | svd.ts | ~100 | Low |
| A1 | Delete dead `determineSignFromCameraRay` | phase-4-line-propagation.ts | 62 | None |
| B5 | Parameterize axis branches in `computeRayLineIntersection` | phase-4-line-propagation.ts | ~45 | Low |
| B2 | Consolidate 4 copies of `quaternionRotateVector` | 4 files | ~40 | Low |
| B3 | Extract shared `quatRotate` for analytical providers | 2 files | ~25 | Low |
| B4 | Extract `computeSampsonError` from validation.ts | validation.ts | ~25 | Low |
| A3 | Delete dead `getSeed()` | seeded-random.ts | 4 | None |
| A2 | Delete unused `axisIndex` variable | phase-4-line-propagation.ts | 1 | None |
| A4 | Guard ray-intersection log behind verbose | phase-4-line-propagation.ts | 0 (1 change) | None |
| B6 | Extract `buildProbeOptions` helper | candidate-testing.ts | ~12 | None |
| B8 | Import vec3.cross instead of copying | math-utils.ts | ~8 | None |

**Total potential savings:** ~320 lines removed/deduplicated

---

## What's Good

- Scoped RNG offsets are well-spaced (100-700) with clear per-phase assignment
- `SeededRng` class is clean with correct LCG implementation
- Optional `rng?` parameter pattern in utility functions maintains backward compat
- Strategy-as-candidate system cleanly separates strategy dispatch from legacy cascade
- Adjacency map optimization in phase-4 BFS is correct O(N+L)
- Two-tier probing (50-iter → top 8 → 200-iter) is a good heuristic for large candidate sets
- All 258 tests pass, duplication at 2.83% lines
- Gradient duplication (B7) is acceptable — mechanical per-component code
