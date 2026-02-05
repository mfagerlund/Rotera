# Scalar-Autograd Removal Plan

**Status:** Ready to execute
**Created:** 2026-02-05
**Scope:** 56 files, ~61 import statements
**Prerequisite:** Analytical solver mode is default and all 301 tests pass

---

## Background

### What is scalar-autograd?

`scalar-autograd` is an automatic differentiation library that computes gradients by tracking computation graphs. The solver uses it to compute Jacobians for Levenberg-Marquardt optimization.

**How it works:**
```typescript
import { V, Value, Vec3 } from 'scalar-autograd'

// Wrap numbers in Value objects
const x = new Value(1.0, 'x', true)  // true = track gradients
const y = new Value(2.0, 'y', true)

// Compute residual (builds computation graph)
const residual = V.sub(V.mul(x, x), y)  // x² - y

// Extract gradient via backpropagation
residual.backward()
const dx = x.gradient  // ∂residual/∂x = 2x = 2.0
```

### Why remove it?

1. **Analytical mode is faster** - Pre-computed gradient formulas vs runtime graph building
2. **Simpler code** - No Value wrapping, no computation graphs
3. **Already replaced** - Analytical providers handle all constraint types
4. **Maintenance burden** - Two parallel implementations (autodiff + analytical)

### Three Solver Modes (Current State)

| Mode | Gradient Computation | Linear Solver | Status |
|------|---------------------|---------------|--------|
| Dense | Autodiff (scalar-autograd) | Cholesky O(n³) | Legacy |
| Sparse | Autodiff (scalar-autograd) | Conjugate Gradient | Legacy |
| **Analytical** | Pre-computed formulas | Conjugate Gradient | **DEFAULT** |

After this refactor: Only analytical mode remains.

### Architecture Overview

```
User clicks "Solve"
       ↓
optimizeProject() in orchestrator.ts
       ↓
ConstraintSystem.solve()
       ↓
transparentLM() - Levenberg-Marquardt loop
       ↓
[CURRENT: Choose autodiff OR analytical for gradients]
[AFTER: Only analytical providers]
       ↓
Conjugate Gradient linear solver
       ↓
Update variables, check convergence
```

**Analytical providers** (`src/optimization/analytical/providers/`):
- Each constraint type has a provider that computes residuals AND gradients
- Gradients are derived mathematically, not via autodiff
- 19 provider files cover all constraint types

**Entity computeResiduals()** (`src/entities/*/`):
- Each entity has `computeResiduals(valueMap): Value[]` for autodiff
- These methods are NO LONGER CALLED when analytical mode is active
- ~500 lines of code that can be deleted

---

## Phase 1: Simplify Solver Configuration

**Goal:** Remove mode switching, hardcode analytical
**Risk:** Low
**Files:**
- `src/optimization/solver-config.ts`
- `src/optimization/constraint-system/ConstraintSystem.ts`
- `src/components/main-layout/MainToolbar.tsx`
- Several test files

### 1.1 Update solver-config.ts

File: `src/optimization/solver-config.ts`

Current:
```typescript
export type SolverMode = 'dense' | 'sparse' | 'analytical';
let SOLVER_MODE: SolverMode = 'analytical';

export function setSolverMode(mode: SolverMode): void { ... }
export function getSolverMode(): SolverMode { ... }
export function useSparseSolve(): boolean { ... }
export function useAnalyticalSolve(): boolean { ... }
```

Change to:
```typescript
// Solver mode is always analytical (dense/sparse removed)
export type SolverMode = 'analytical';

export function getSolverMode(): SolverMode { return 'analytical'; }
export function setSolverMode(_mode: SolverMode): void { /* no-op for backwards compat */ }
export function useSparseSolve(): boolean { return true; }
export function useAnalyticalSolve(): boolean { return true; }
```

Tasks:
- [ ] Simplify type to just `'analytical'`
- [ ] Make `getSolverMode()` return constant `'analytical'`
- [ ] Make `setSolverMode()` a no-op (keeps test compatibility)
- [ ] Make `useSparseSolve()` and `useAnalyticalSolve()` return constant `true`

### 1.2 Update ConstraintSystem.ts

File: `src/optimization/constraint-system/ConstraintSystem.ts`

Current (around line 425):
```typescript
const analyticalEnabled = this.forceSolverMode === 'analytical'
  ? true
  : useAnalyticalSolve();
```

Change to:
```typescript
const analyticalEnabled = true;  // Always use analytical
```

Tasks:
- [ ] Remove conditional `useAnalyticalSolve()` check
- [ ] Always build and use analytical providers
- [ ] Remove sparse vs dense conditional (always use sparse CG)
- [ ] Clean up any dead code paths

### 1.3 Update UI (MainToolbar.tsx)

File: `src/components/main-layout/MainToolbar.tsx`

Current (around lines 401-420): Three toggle buttons for Dense/Sparse/Analytical

Tasks:
- [ ] Remove the three solver mode toggle buttons
- [ ] Optionally: Keep single "Analytical" label (no toggle needed)
- [ ] Remove `solverMode` state and `setSolverModeState` handler

### 1.4 Update tests using setSolverMode()

These tests switch between modes for comparison. Simplify to only test analytical.

| File | Location | Action |
|------|----------|--------|
| `regression-calibration.test.ts` | `src/optimization/__tests__/` | Remove mode switching tests |
| `analytical-3loose.test.ts` | `src/optimization/__tests__/` | Simplify - no mode comparison |
| `fine-tune.test.ts` | `src/optimization/__tests__/` | Remove mode comparisons |
| `test-balcony-x-line.ts` | `src/optimization/__tests__/` | Simplify |
| `sparse-divergence-debug.test.ts` | `src/optimization/__tests__/` | Delete (debug test) |

Tasks:
- [ ] Update `regression-calibration.test.ts` - remove sparse baseline test
- [ ] Update `analytical-3loose.test.ts` - remove mode switching
- [ ] Update `fine-tune.test.ts` - remove mode comparisons
- [ ] Update or delete `test-balcony-x-line.ts`
- [ ] Delete `sparse-divergence-debug.test.ts`

### Checkpoint 1

```bash
npm test --watchAll=false
```

All tests should pass. If any fail, fix before proceeding.

---

## Phase 2: Remove Autodiff from Solver Core

**Goal:** Delete Value-based gradient computation from the LM solver
**Risk:** Medium
**Files:**
- `src/optimization/autodiff-dense-lm.ts`
- `src/optimization/constraint-system/ConstraintSystem.ts`

### 2.1 Update autodiff-dense-lm.ts

File: `src/optimization/autodiff-dense-lm.ts`

**Delete `computeJacobian()` function** (around lines 92-130):
```typescript
// DELETE THIS ENTIRE FUNCTION
export function computeJacobian(
  variables: Value[],
  residualFn: (vars: Value[]) => Value[]
): { jacobian: number[][]; residuals: number[] } {
  // ... autodiff Jacobian computation
}
```

**Update `transparentLM()` options:**

Current:
```typescript
interface TransparentLMOptions {
  // ...
  useAnalyticalSolve?: boolean;
  analyticalProviders?: AnalyticalResidualProvider[];
}
```

Change to:
```typescript
interface TransparentLMOptions {
  // ...
  analyticalProviders: AnalyticalResidualProvider[];  // Required, not optional
  // Remove useAnalyticalSolve flag entirely
}
```

Tasks:
- [ ] Delete `computeJacobian()` function
- [ ] Remove `useAnalyticalSolve` option from `TransparentLMOptions`
- [ ] Make `analyticalProviders` required (not optional)
- [ ] Remove any code paths that use autodiff for gradients
- [ ] Keep the LM loop logic (it's solver-agnostic)

### 2.2 Simplify ConstraintSystem.solveWithAutodiff()

File: `src/optimization/constraint-system/ConstraintSystem.ts`

Current method name: `solveWithAutodiff()` (misleading now)

Tasks:
- [ ] Rename to `solve()` or keep name for git history
- [ ] Remove Value wrapping of variables
- [ ] Remove `residualFn` that returns `Value[]`
- [ ] Only use analytical providers path

### Checkpoint 2

```bash
npm test --watchAll=false
```

Analytical solve should work identically. If tests fail, the analytical providers may be missing something.

---

## Phase 3: Remove computeResiduals() from Entities

**Goal:** Delete ~500 lines of autodiff residual computation from entity layer
**Risk:** Medium
**Files:** All entity classes in `src/entities/`

### 3.1 Update IOptimizable interface

File: `src/optimization/IOptimizable.ts`

Current:
```typescript
export interface IOptimizable {
  computeResiduals(valueMap: ValueMap): Value[];
  applyOptimizationResult(result: OptimizationResult): void;
}

export type ValueMap = Map<string, Value>;
```

Change to:
```typescript
export interface IOptimizable {
  // computeResiduals REMOVED - analytical providers compute residuals now
  applyOptimizationResult(result: OptimizationResult): void;
}

// ValueMap type REMOVED
```

Tasks:
- [ ] Remove `computeResiduals()` from interface
- [ ] Remove `ValueMap` type definition
- [ ] Keep `applyOptimizationResult()` (still needed to write results back)

### 3.2 Delete computeResiduals() from entities

**WorldPoint.ts** (`src/entities/world-point/WorldPoint.ts`):
- [ ] Delete `computeResiduals()` method (around line 430, ~70 lines)
- [ ] Remove `import { V, Value, Vec3 } from 'scalar-autograd'`

**Line.ts** (`src/entities/line/Line.ts`):
- [ ] Delete `computeResiduals()` method (around line 450, ~80 lines)
- [ ] Remove scalar-autograd imports

**ImagePoint.ts** (`src/entities/imagePoint/ImagePoint.ts`):
- [ ] Delete `computeResiduals()` method (around line 103, ~70 lines)
- [ ] Remove `import { Value, Vec3, Vec4 } from 'scalar-autograd'`

**Viewpoint.ts** (`src/entities/viewpoint/Viewpoint.ts`):
- [ ] Delete `computeResiduals()` method (around line 511, ~55 lines)
- [ ] Remove scalar-autograd imports

### 3.3 Delete computeResiduals() from constraints

File: `src/entities/constraints/base-constraint.ts`
- [ ] Remove `abstract computeResiduals(valueMap: ValueMap): Value[]`

All constraint implementations:

| File | Line | Approx Size |
|------|------|-------------|
| `angle-constraint.ts` | ~111 | ~40 lines |
| `collinear-points-constraint.ts` | ~129 | ~50 lines |
| `coplanar-points-constraint.ts` | ~168 | ~60 lines |
| `distance-constraint.ts` | ~103 | ~30 lines |
| `equal-angles-constraint.ts` | ~130 | ~45 lines |
| `equal-distances-constraint.ts` | ~123 | ~40 lines |
| `fixed-point-constraint.ts` | ~115 | ~35 lines |
| `line-relationship-constraint.ts` | ~44 | ~20 lines |
| `projection-constraint.ts` | ~120 | ~40 lines |

Tasks:
- [ ] Delete `computeResiduals()` from each constraint class
- [ ] Remove scalar-autograd imports from each file

### Checkpoint 3

```bash
npm test --watchAll=false
```

Should still pass - analytical providers do the work now, entity methods were unused.

---

## Phase 4: Remove Autodiff from UI

**Goal:** Delete Value usage from ImageEditor fallback reprojection
**Risk:** Low
**Files:** `src/components/ImageEditor.tsx`

### 4.1 Update ImageEditor.tsx

File: `src/components/ImageEditor.tsx`

Current (around lines 51-78): Fallback reprojection using Value objects
```typescript
// Fallback: compute projection using autodiff
const wpXyz = worldPoint.getEffectiveXyz();
const camPos = new Vec3(V.C(pos[0]), V.C(pos[1]), V.C(pos[2]));
const camQuat = new Vec4(V.C(rot[0]), V.C(rot[1]), V.C(rot[2]), V.C(rot[3]));
const projected = projectWorldPointToPixelQuaternion(...);
```

Change to:
```typescript
// Use stored residuals from last optimization
// If not available, show "not computed" state
if (imagePoint.lastResiduals && imagePoint.lastResiduals.length >= 2) {
  // Use stored projection
} else {
  // Show indicator that optimization hasn't run
}
```

Tasks:
- [ ] Delete fallback reprojection logic (lines ~51-78)
- [ ] Remove `import { projectWorldPointToPixelQuaternion } from '...'`
- [ ] Remove `import { V, Vec3, Vec4 } from 'scalar-autograd'`
- [ ] Always use stored residuals from optimization
- [ ] Handle "not computed" state gracefully in UI

### Checkpoint 4

```bash
npm run dev
# Open UI, load a project, verify point projection displays correctly
```

If UI shows errors, ensure optimization stores residuals properly.

---

## Phase 5: Delete Gradient Validation Tests

**Goal:** Remove tests that compare analytical vs autodiff gradients
**Risk:** Low (tests are for validation, not functionality)
**Files:** Test files in `src/optimization/__tests__/` and `src/optimization/analytical/__tests__/`

### 5.1 Delete test files entirely

These tests exist only to validate analytical gradients match autodiff. With autodiff removed, they serve no purpose.

| File | Location | Reason |
|------|----------|--------|
| `constraint-system-gradient-comparison.test.ts` | `src/optimization/constraint-system/__tests__/` | Compares analytical vs autodiff |
| `reprojection-gradient-comparison.test.ts` | `src/optimization/analytical/__tests__/` | Compares analytical vs autodiff |
| `dcam-gradient-sign-test.test.ts` | `src/optimization/analytical/__tests__/` | Validates dcam gradients vs autodiff |
| `analytical-validation.test.ts` | `src/optimization/analytical/__tests__/` | Validates all analytical vs autodiff |
| `isZReflected-jacobian.test.ts` | `src/optimization/analytical/__tests__/` | Uses Value objects |
| `sparse-divergence-debug.test.ts` | `src/optimization/__tests__/` | Debug test for sparse mode |

Tasks:
- [ ] Delete `constraint-system-gradient-comparison.test.ts`
- [ ] Delete `reprojection-gradient-comparison.test.ts`
- [ ] Delete `dcam-gradient-sign-test.test.ts`
- [ ] Delete `analytical-validation.test.ts`
- [ ] Delete `isZReflected-jacobian.test.ts`
- [ ] Delete `sparse-divergence-debug.test.ts`

### 5.2 Simplify tests that use autodiff for comparison

These tests have useful parts but also compare against autodiff. Keep the useful parts.

| File | Action |
|------|--------|
| `focal-length-gradient.test.ts` | Keep numerical gradient check, remove autodiff comparison |
| `chain-rule-perturbed.test.ts` | Keep numerical gradient check, remove autodiff comparison |
| `provider-gradients.test.ts` | Keep numerical gradient check, remove autodiff comparison |
| `transparent-lm.test.ts` | Remove `computeJacobian` tests |
| `quaternion.test.ts` | Rewrite without Vec3/Vec4 (use plain arrays) |

Tasks:
- [ ] Update `focal-length-gradient.test.ts` - remove autodiff, keep numerical
- [ ] Update `chain-rule-perturbed.test.ts` - remove autodiff, keep numerical
- [ ] Update `provider-gradients.test.ts` - remove autodiff, keep numerical
- [ ] Update `transparent-lm.test.ts` - remove `computeJacobian` tests
- [ ] Update `quaternion.test.ts` - use `[number, number, number]` instead of Vec3

### Checkpoint 5

```bash
npm test --watchAll=false
```

Test count will decrease. Remaining tests should pass.

---

## Phase 6: Remove Remaining Imports

**Goal:** Delete all scalar-autograd imports from codebase
**Risk:** Low
**Files:** ~30 remaining files with imports

### 6.1 Core optimization files

| File | Action |
|------|--------|
| `src/optimization/autodiff-dense-lm.ts` | Remove imports (may be empty after Phase 2) |
| `src/optimization/camera-projection.ts` | Remove Value/Vec imports, use number[] |
| `src/optimization/Quaternion.ts` | Remove Vec4 import, use [number,number,number,number] |
| `src/optimization/constraint-system/utils.ts` | Remove imports |

### 6.2 Residual type files

Check `src/optimization/residuals/` directory:
- [ ] Remove Value imports from any remaining files
- [ ] Delete files that are no longer used

### 6.3 Analytical module (should already be clean)

Check `src/optimization/analytical/`:
- [ ] Verify no scalar-autograd imports remain
- [ ] These should already use pure number types

### 6.4 Search for any remaining imports

```bash
grep -r "from 'scalar-autograd'" src/
grep -r "from \"scalar-autograd\"" src/
```

Tasks:
- [ ] Remove imports from each file found
- [ ] Replace Vec3/Vec4 with tuple types: `[number, number, number]`
- [ ] Replace Value with number

### Checkpoint 6

```bash
grep -r "scalar-autograd" src/
# Should return nothing

npm run type-check
# Should pass with no scalar-autograd types
```

---

## Phase 7: Remove Dependency

**Goal:** Clean removal from package.json and node_modules
**Risk:** Low
**Files:** `package.json`

### 7.1 Remove from package.json

File: `package.json`

Delete this line from `dependencies`:
```json
"scalar-autograd": "^0.1.9",
```

### 7.2 Clean install

```bash
rm -rf node_modules package-lock.json
npm install
```

### 7.3 Final verification

```bash
# All tests pass
npm test --watchAll=false

# Type check passes
npm run type-check

# Lint passes
npm run lint

# Duplication check
npm run duplication
# Target: < 3%

# Verify no references remain
grep -r "scalar-autograd" .
# Should only find this plan document and maybe CHANGELOG
```

### Checkpoint 7 (Final)

All checks green. scalar-autograd is fully removed.

---

## Risk Mitigation

### If tests fail after Phase 2-3

**Symptom:** Tests that were passing now fail with wrong optimization results

**Cause:** Analytical providers may be missing edge cases that autodiff handled

**Fix:**
1. Identify which constraint type is failing
2. Check the analytical provider for that constraint
3. Fix the provider's residual or gradient computation
4. Do NOT restore autodiff - fix the analytical implementation

### If UI breaks after Phase 4

**Symptom:** Points don't display correctly in ImageEditor

**Cause:** ImageEditor was relying on fallback reprojection (autodiff path)

**Fix:**
1. Ensure optimization always stores residuals on ImagePoint
2. Check `ImagePoint.lastResiduals` is populated after solve
3. Add explicit "run optimization first" UI state if needed

### If type errors after Phase 6

**Symptom:** TypeScript errors about missing Value type

**Cause:** Some file still imports or uses Value type

**Fix:**
1. Search for `Value` type usage: `grep -r ": Value" src/`
2. Replace with `number`
3. Search for `Vec3`, `Vec4` usage
4. Replace with tuple types `[number, number, number]`

---

## Files Summary

### Will be heavily modified (16 core files)

1. `src/optimization/solver-config.ts` - Simplify to analytical-only
2. `src/optimization/constraint-system/ConstraintSystem.ts` - Remove mode switching
3. `src/optimization/autodiff-dense-lm.ts` - Remove autodiff gradient computation
4. `src/optimization/IOptimizable.ts` - Remove computeResiduals interface
5. `src/components/main-layout/MainToolbar.tsx` - Remove mode toggle UI
6. `src/components/ImageEditor.tsx` - Remove fallback reprojection
7. `src/entities/world-point/WorldPoint.ts` - Delete computeResiduals
8. `src/entities/line/Line.ts` - Delete computeResiduals
9. `src/entities/imagePoint/ImagePoint.ts` - Delete computeResiduals
10. `src/entities/viewpoint/Viewpoint.ts` - Delete computeResiduals
11. `src/entities/constraints/base-constraint.ts` - Remove abstract method
12. `src/entities/constraints/angle-constraint.ts`
13. `src/entities/constraints/distance-constraint.ts`
14. `src/entities/constraints/coplanar-points-constraint.ts`
15. `src/entities/constraints/collinear-points-constraint.ts`
16. + 5 more constraint files

### Will be deleted (6-10 test files)

- Gradient comparison tests (analytical vs autodiff)
- Autodiff validation tests
- Debug tests for sparse/dense modes

### Will have imports removed (~30 files)

- Various optimization helper files
- Remaining test files
- Any utilities using Vec3/Vec4

---

## Success Criteria

All must be true before considering this complete:

- [ ] `npm test --watchAll=false` - All remaining tests pass
- [ ] `npm run type-check` - No TypeScript errors
- [ ] `npm run lint` - No lint errors
- [ ] `npm run duplication` - < 3% duplication
- [ ] `grep -r "scalar-autograd" src/` - Returns nothing
- [ ] UI solve works correctly on existing projects
- [ ] Regression test fixtures produce identical results to before

---

## Estimated Scope

| Phase | Files Modified | Lines Deleted | Lines Added |
|-------|---------------|---------------|-------------|
| 1 | 8 | ~100 | ~20 |
| 2 | 2 | ~150 | ~10 |
| 3 | 15 | ~500 | ~0 |
| 4 | 1 | ~30 | ~10 |
| 5 | 10 | ~800 | ~0 |
| 6 | 30 | ~60 | ~30 |
| 7 | 1 | ~1 | ~0 |
| **Total** | **~50** | **~1640** | **~70** |

Net result: **~1570 lines of code removed**
