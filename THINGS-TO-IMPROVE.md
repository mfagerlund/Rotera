# Things to Improve

## Gradient-Script CSE for Normalized Dot Products

**Date:** 2025-01-30

**Context:** When implementing the vanishing line provider analytical Jacobian, gradient-script produced correct but extremely verbose output.

**The Problem:**

The vanishing line residual involves:
```
residual = weight * (1 - dot)
dot = (pred · obs) / (|pred| * |obs|)
pred = quaternion_rotate(axis, q)
```

The chain rule through normalization and quotient rule causes expression explosion. Gradient-script output had expressions like:

```javascript
const _tmp12 = Math.sqrt((axis.x + 2 * q.w * (q.y * axis.z - q.z * axis.y) +
  2 * (q.y * (q.x * axis.y - q.y * axis.x) - q.z * (q.z * axis.x - q.x * axis.z))) *
  (axis.x + 2 * q.w * (q.y * axis.z - q.z * axis.y) + ...
```

The same massive expressions repeated 50+ times instead of being factored into `predX`, `predLen`, etc.

**Workaround Applied:**

Hand-coded the gradient in `src/optimization/residuals/gradients/vanishing-line-gradient.ts` using proper intermediate variables. The math is identical to gradient-script's symbolic derivative.

**Suggested Improvement for Gradient-Script:**

Add pattern recognition for common geometric primitives:

1. **Vector length:** `sqrt(x*x + y*y + z*z)` → recognize and name as `len`
2. **Normalized dot product:** `(a·b) / (|a|*|b|)` → special handling
3. **Quaternion rotation output:** The `axis + 2*qw*c + 2*d` pattern

These patterns appear constantly in graphics/optimization code. Dedicated CSE rules would dramatically improve output quality.

**Files Affected:**
- `src/optimization/residuals/gradients/vanishing-line.gs` - Source file (kept for reference)
- `src/optimization/residuals/gradients/vanishing-line-gradient.ts` - Hand-coded version used in production
