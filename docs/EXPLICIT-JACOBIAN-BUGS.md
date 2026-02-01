# Explicit Jacobian Implementation Bugs

This document describes bugs found in the explicit-jacobian providers when comparing them to the working scalar-autograd (autodiff) implementation.

## Summary

**Both scalar-autograd AND gradient-script work correctly.** The bugs are in:
1. The hand-coded explicit-jacobian provider implementations
2. The mathematical formulas written in the `.gs` source files (not the gradient computation itself)

---

## Bug 1: V Projection Formula Sign Error in Provider

**Files affected:**
- `src/optimization/explicit-jacobian/providers/reprojection-provider.ts`
- `src/optimization/explicit-jacobian/providers/reprojection-with-intrinsics-provider.ts`

**The bug:**
```typescript
// WRONG - what the explicit providers had:
const projectedV = fy * distortedY + cy;

// CORRECT - what autodiff uses (camera-projection.ts line 202):
const v = V.add(params.principalPointY, V.neg(V.mul(fy, y_distorted)));
// Which is: v = cy - fy * distortedY
```

**Why it matters:**
In image coordinates, Y increases downward, while in camera coordinates Y increases upward. The projection formula must flip the sign.

---

## Bug 2: Incomplete isZReflected Handling in Provider

**Files affected:**
- `src/optimization/explicit-jacobian/providers/reprojection-provider.ts`
- `src/optimization/explicit-jacobian/providers/reprojection-with-intrinsics-provider.ts`

**The bug:**
```typescript
// WRONG - what the explicit providers had:
if (config.isZReflected) {
  camX = -camX;
  camZ = -camZ;
}

// CORRECT - what autodiff uses (camera-projection.ts lines 269-271):
if (isZReflected) {
  cameraPoint = new Vec3(V.neg(cameraPoint.x), V.neg(cameraPoint.y), V.neg(cameraPoint.z));
}
// All THREE components must be negated
```

---

## Bug 3: Wrong Formula in .gs Source Files

**Files affected:**
- `src/optimization/residuals/gradients/reprojection-v.gs`

**Important clarification:**
Gradient-script correctly differentiates the formula in the .gs file. The problem is that the .gs file contains the wrong formula (`fy * distortedY + cy` instead of `cy - fy * distortedY`).

The gradient tests pass because they verify that the analytical gradient matches the numerical gradient **of the same (wrong) function**. The gradient computation is correct; the underlying function is wrong.

---

## Bug 4: Missing isZReflected in .gs Source Files

**Files affected:**
- `src/optimization/residuals/gradients/reprojection-u.gs`
- `src/optimization/residuals/gradients/reprojection-v.gs`

**The issue:**
The .gs files simply don't include `isZReflected` as a parameter. Gradient-script can't differentiate what isn't there.

---

## Root Cause

All bugs are transcription errors - the formulas in the explicit providers and .gs files don't match the formulas in the working autodiff code (`camera-projection.ts`).

**ScalarAutograd and gradient-script are working correctly** - they faithfully compute gradients of whatever formulas they're given. The formulas themselves were incorrectly transcribed.

---

## Fix Applied

The explicit providers now use numerical gradients (finite differences) with corrected residual formulas. This bypasses the buggy .gs-generated code entirely.

## Future Work

1. Correct the formulas in the .gs source files to match `camera-projection.ts`
2. Add isZReflected parameter to the .gs files
3. Regenerate the gradient TypeScript files
4. Switch back to analytical gradients for performance
