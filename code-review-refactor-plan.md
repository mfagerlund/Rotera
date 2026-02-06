# Remaining Duplication Cleanup

**Date:** 2026-02-06
**Duplication:** 2.83% lines / 3.99% tokens (target <3% lines)

Items A1-A3, B1-B3 from the original review are done.

---

## B4. Sampson error computation duplicated (validation.ts)

**File:** `src/optimization/essential-matrix/validation.ts`

`countInliersWithSampsonError` and `computeTotalSampsonError` share identical inner computation. Extract `computeSampsonError(E, correspondence): number` and call from both.

**Saves:** ~25 lines

---

## B5. `computeRayLineIntersection` axis branches (phase-4-line-propagation.ts)

**File:** `src/optimization/unified-initialization/phase-4-line-propagation.ts`

The x, y, z branches have identical structure. Parameterize using axis index.

**Saves:** ~45 lines

---

## B6. Candidate-testing probe option blocks (candidate-testing.ts)

**File:** `src/optimization/optimize-project/candidate-testing.ts`

Option-spreading block for `optimizeProject` is repeated in tier1 and main probing. Extract `buildProbeOptions` helper.

**Saves:** ~12 lines

---

## B7. Gradient files — ACCEPT

Structural duplication inherent to per-component analytical gradient code. Not worth abstracting.

---

## B8. `vec3.cross` duplicated in vanishing-points/math-utils.ts

**File:** `src/optimization/vanishing-points/math-utils.ts`

Import from `src/utils/vec3.ts` instead of re-implementing.

**Saves:** ~8 lines
