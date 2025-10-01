# ScalarAutograd Extension: Gauss-Newton Solver for Sparse Nonlinear Least Squares

## Executive Summary

This document proposes adding a **Gauss-Newton least squares solver** to ScalarAutograd that leverages automatic differentiation to efficiently solve sparse nonlinear optimization problems. This could be significantly faster than traditional matrix-based approaches for problems with sparse Jacobian structure.

## Motivation

### Current Problem
Bundle adjustment and similar photogrammetry problems require solving:
```
minimize: Σ rᵢ²
where rᵢ = residual functions of parameters
```

Traditional approaches compute Jacobians numerically or require manual derivatives. ScalarAutograd's automatic differentiation can compute exact gradients efficiently, especially for **sparse problems** where each residual depends on only a few parameters.

### Key Insight: Sparsity
In photogrammetry:
- **Image point residual** (reprojection error): depends on ONE world point (3 params) + camera (fixed)
- **Lock residual**: depends on ONE coordinate (1 param)
- **Line constraint**: depends on TWO world points (6 params)

For 100 world points (300 parameters) and 500 residuals, the Jacobian is 500×300 but **extremely sparse** - each row has only 1-6 non-zero entries!

## Proposed API

### High-Level API
```typescript
// Define parameters as autodiff Values
const params = [
  V.W(x1), V.W(y1), V.W(z1),  // World point 1
  V.W(x2), V.W(y2), V.W(z2),  // World point 2
  // ... more parameters
];

// Define residual functions that return Value objects
function residualFunction(params: Value[]): Value[] {
  const residuals: Value[] = [];

  // Image point reprojection residual (depends on params[0:2])
  const r1 = computeReprojectionError(params[0], params[1], params[2]);
  residuals.push(r1);

  // Lock residual (depends on params[0] only)
  const r2 = V.sub(params[0], V.C(10.0)); // Lock x1 to 10
  residuals.push(r2);

  // More residuals...
  return residuals;
}

// Solve with Gauss-Newton
const result = V.gaussNewton(params, residualFunction, {
  maxIterations: 100,
  costTolerance: 1e-6,
  paramTolerance: 1e-6,
  skipSmallResiduals: 1e-9, // Skip residuals with |r| < epsilon
  verbose: true
});

// result.success, result.iterations, result.finalCost
// params are updated in-place
```

## Algorithm

### Gauss-Newton Iteration
```
1. Compute residuals: r = [r₁, r₂, ..., rₘ]
2. Compute Jacobian: J[i,j] = ∂rᵢ/∂pⱼ via autodiff
3. Solve normal equations: (JᵀJ)δ = -Jᵀr
4. Update: p ← p + α·δ (with line search for α)
5. Repeat until converged
```

### Key Optimization: Early Termination
```typescript
function computeResidualsAndJacobian(params: Value[]): {residuals, J, cost} {
  const residuals: number[] = [];
  const J: number[][] = [];
  let totalCost = 0;

  const candidateResiduals = residualFunction(params);

  for (const r of candidateResiduals) {
    // Short-circuit: skip tiny residuals
    if (Math.abs(r.data) < skipThreshold) {
      continue;
    }

    totalCost += r.data * r.data;

    // Only compute Jacobian row for significant residuals
    params.forEach(p => p.grad = 0);
    r.backward();

    residuals.push(r.data);
    J.push(params.map(p => p.grad));
  }

  return { residuals, J, totalCost };
}
```

**Why this is fast:**
- Satisfied constraints (r ≈ 0) don't trigger backward pass
- Sparse Jacobian automatically discovered (most gradients = 0)
- Can exit early if totalCost < threshold during construction

## Implementation Plan

### Phase 1: Core Gauss-Newton Solver
**File:** `src/solvers/GaussNewton.ts`

```typescript
export interface GaussNewtonOptions {
  maxIterations?: number;
  costTolerance?: number;
  paramTolerance?: number;
  skipSmallResiduals?: number;
  lineSearchSteps?: number;
  verbose?: boolean;
}

export interface GaussNewtonResult {
  success: boolean;
  iterations: number;
  finalCost: number;
  convergenceReason: string;
  computationTime: number;
}

export function gaussNewton(
  params: Value[],
  residualFn: (params: Value[]) => Value[],
  options: GaussNewtonOptions = {}
): GaussNewtonResult;
```

**Key functions to implement:**

#### 1. `computeResidualsAndJacobian()`
```typescript
function computeResidualsAndJacobian(
  params: Value[],
  residualFn: (params: Value[]) => Value[],
  skipThreshold: number
): { residuals: number[], J: number[][], cost: number } {

  const residualValues = residualFn(params);
  const residuals: number[] = [];
  const J: number[][] = [];
  let cost = 0;

  for (const r of residualValues) {
    // Early termination: skip satisfied constraints
    if (Math.abs(r.data) < skipThreshold) {
      continue;
    }

    cost += r.data * r.data;

    // Zero all gradients before backward pass
    params.forEach(p => p.grad = 0);

    // Compute one row of Jacobian via backward pass
    r.backward();

    // Extract gradient values (this is the Jacobian row)
    const jacobianRow = params.map(p => p.grad);

    residuals.push(r.data);
    J.push(jacobianRow);
  }

  return { residuals, J, cost };
}
```

**Critical insight**: Each `r.backward()` call walks the computation graph and accumulates `∂r/∂p` into `p.grad` for all parameters. This gives us one complete row of the Jacobian in one pass!

#### 2. `solveNormalEquations()`
```typescript
function solveNormalEquations(J: number[][], r: number[]): number[] {
  // Solve: (J^T J) δ = -J^T r
  const JtJ = computeJtJ(J);
  const Jtr = computeJtr(J, r);
  const negJtr = Jtr.map(x => -x);

  return choleskysolve(JtJ, negJtr);
}

function computeJtJ(J: number[][]): number[][] {
  const m = J.length;      // number of residuals
  const n = J[0].length;   // number of parameters
  const JtJ = Array(n).fill(0).map(() => Array(n).fill(0));

  // JtJ[i,j] = Σ J[k,i] * J[k,j]
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < m; k++) {
        sum += J[k][i] * J[k][j];
      }
      JtJ[i][j] = sum;
    }
  }

  return JtJ;
}

function computeJtr(J: number[][], r: number[]): number[] {
  const m = J.length;
  const n = J[0].length;
  const Jtr = Array(n).fill(0);

  // Jtr[i] = Σ J[k,i] * r[k]
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < m; k++) {
      sum += J[k][i] * r[k];
    }
    Jtr[i] = sum;
  }

  return Jtr;
}
```

#### 3. `lineSearch()`
```typescript
function lineSearch(
  params: Value[],
  delta: number[],
  residualFn: (params: Value[]) => Value[],
  currentCost: number,
  maxSteps: number = 10
): number {

  const originalData = params.map(p => p.data);
  let alpha = 1.0;

  for (let i = 0; i < maxSteps; i++) {
    // Try step: p = p + alpha * delta
    params.forEach((p, idx) => {
      p.data = originalData[idx] + alpha * delta[idx];
    });

    // Compute new cost
    const residuals = residualFn(params);
    const newCost = residuals.reduce((sum, r) => sum + r.data * r.data, 0);

    // Accept if cost decreased
    if (newCost < currentCost) {
      return alpha;
    }

    // Backtrack
    alpha *= 0.5;
  }

  // Restore original if no improvement found
  params.forEach((p, idx) => {
    p.data = originalData[idx];
  });

  return 0; // Failed to find improvement
}
```

#### 4. Main iteration loop
```typescript
export function gaussNewton(
  params: Value[],
  residualFn: (params: Value[]) => Value[],
  options: GaussNewtonOptions = {}
): GaussNewtonResult {

  const {
    maxIterations = 100,
    costTolerance = 1e-6,
    paramTolerance = 1e-6,
    skipSmallResiduals = 1e-9,
    lineSearchSteps = 10,
    verbose = false
  } = options;

  const startTime = performance.now();
  let prevCost = Infinity;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Compute residuals and Jacobian
    const { residuals, J, cost } = computeResidualsAndJacobian(
      params,
      residualFn,
      skipSmallResiduals
    );

    if (verbose) {
      console.log(`Iteration ${iter}: cost=${cost.toFixed(6)}, residuals=${residuals.length}`);
    }

    // Check convergence: cost change
    if (Math.abs(prevCost - cost) < costTolerance) {
      return {
        success: true,
        iterations: iter,
        finalCost: cost,
        convergenceReason: 'Cost tolerance reached',
        computationTime: performance.now() - startTime
      };
    }

    // Check convergence: cost is tiny
    if (cost < costTolerance) {
      return {
        success: true,
        iterations: iter,
        finalCost: cost,
        convergenceReason: 'Cost below threshold',
        computationTime: performance.now() - startTime
      };
    }

    // Solve for update: (J^T J) δ = -J^T r
    let delta: number[];
    try {
      delta = solveNormalEquations(J, residuals);
    } catch (e) {
      return {
        success: false,
        iterations: iter,
        finalCost: cost,
        convergenceReason: `Linear solver failed: ${e}`,
        computationTime: performance.now() - startTime
      };
    }

    // Check convergence: parameter change is tiny
    const deltaNorm = Math.sqrt(delta.reduce((sum, d) => sum + d * d, 0));
    if (deltaNorm < paramTolerance) {
      return {
        success: true,
        iterations: iter,
        finalCost: cost,
        convergenceReason: 'Parameter tolerance reached',
        computationTime: performance.now() - startTime
      };
    }

    // Line search to find step size
    const alpha = lineSearch(params, delta, residualFn, cost, lineSearchSteps);

    if (alpha === 0) {
      return {
        success: false,
        iterations: iter,
        finalCost: cost,
        convergenceReason: 'Line search failed',
        computationTime: performance.now() - startTime
      };
    }

    // Update parameters: p = p + alpha * delta
    params.forEach((p, idx) => {
      p.data += alpha * delta[idx];
    });

    prevCost = cost;
  }

  // Max iterations reached
  const { cost } = computeResidualsAndJacobian(params, residualFn, skipSmallResiduals);
  return {
    success: false,
    iterations: maxIterations,
    finalCost: cost,
    convergenceReason: 'Max iterations reached',
    computationTime: performance.now() - startTime
  };
}
```

### Phase 2: Linear Solver
**File:** `src/solvers/LinearSolver.ts`

For solving (JᵀJ)δ = -Jᵀr, we need:
```typescript
function solvePositiveDefinite(A: number[][], b: number[]): number[]
```

**Options:**
1. **Cholesky decomposition** - fast for positive definite systems
2. **Conjugate Gradient** - iterative, good for large sparse systems
3. **Simple Gaussian elimination** - fallback for small problems

Start with Cholesky since (JᵀJ) is always symmetric positive semi-definite.

### Phase 3: Matrix Utilities
**File:** `src/utils/SparseMatrix.ts`

```typescript
// Matrix operations
function matrixMultiply(A: number[][], B: number[][]): number[][]
function transposeMultiply(J: number[][]): number[][] // Compute JᵀJ efficiently
function vectorNorm(v: number[]): number

// Sparse storage (optional optimization)
interface SparseRow {
  indices: number[];  // Column indices with non-zero values
  values: number[];   // Non-zero values
}
```

**Why sparse storage matters:**
For 500 residuals × 300 params with 6 non-zeros per row:
- Dense: 500 × 300 = 150,000 numbers stored
- Sparse: 500 × 6 = 3,000 numbers stored + indices
- **50x memory reduction!**

## Testing Strategy

### Unit Tests

**Test 1: Simple quadratic**
```typescript
// Minimize (x-5)² + (y-3)²
const x = V.W(0);
const y = V.W(0);

function residuals(params: Value[]) {
  return [
    V.sub(params[0], V.C(5)),  // x - 5
    V.sub(params[1], V.C(3))   // y - 3
  ];
}

const result = V.gaussNewton([x, y], residuals);
expect(result.success).toBe(true);
expect(x.data).toBeCloseTo(5, 6);
expect(y.data).toBeCloseTo(3, 6);
```

**Test 2: Sparse problem**
```typescript
// 10 parameters, but each residual depends on only 2
const params = Array.from({length: 10}, (_, i) => V.W(i));

function residuals(p: Value[]) {
  return [
    V.sub(p[0], p[1]),    // Only depends on p[0], p[1]
    V.sub(p[2], p[3]),    // Only depends on p[2], p[3]
    V.sub(p[4], V.C(10))  // Only depends on p[4]
  ];
}

// Should exploit sparsity automatically
```

**Test 3: Rosenbrock function**
```typescript
// Classic optimization benchmark: (1-x)² + 100(y-x²)²
// Has difficult valley, good test for robustness
```

**Test 4: Early termination**
```typescript
// Residuals with mix of satisfied and unsatisfied constraints
// Verify that satisfied constraints are skipped
```

### Integration Test: Bundle Adjustment

**Test 5: Photogrammetry fixture**
Use the existing `tests/fixtures/project1.json`:
- Multiple world points with locked/free axes
- Image point reprojection residuals
- Line constraints
- Verify convergence and accuracy

## Performance Analysis

### Expected Speedup

For typical photogrammetry problem:
- N = 100 world points (300 parameters)
- M = 500 residuals (average 3 params per residual)

**Traditional numerical Jacobian:**
- O(N × M) = 30,000 function evaluations per iteration

**Autodiff with sparsity:**
- O(M) = 500 backward passes per iteration
- **60x fewer computations!**

**With early termination:**
- Skip ~50% of residuals once nearly converged
- **Additional 2x speedup in final iterations**

### Benchmarks to measure

1. **Time per iteration** vs problem size
2. **Iterations to convergence** vs problem complexity
3. **Memory usage** (dense vs sparse storage)
4. **Comparison** with ml-levenberg-marquardt (if applicable)

## API Integration

Add to `V.ts`:
```typescript
export class V {
  // Existing methods...

  static gaussNewton(
    params: Value[],
    residualFn: (params: Value[]) => Value[],
    options?: GaussNewtonOptions
  ): GaussNewtonResult {
    return gaussNewton(params, residualFn, options);
  }
}
```

## Extensions & Future Work

### Levenberg-Marquardt damping
Add damping factor λ: solve (JᵀJ + λI)δ = -Jᵀr
- Better convergence from poor starting points
- Automatic λ adjustment (increase on failure, decrease on success)

### Trust region methods
Instead of line search, use trust region:
- Solve subproblem: min ||δ|| ≤ Δ : ||Jδ + r||²
- Adjust Δ based on predicted vs actual cost reduction

### Parallel Jacobian computation
Since each backward pass is independent:
- Compute multiple rows in parallel (Web Workers)
- For M residuals on 4 cores: 4x speedup

### Sparse matrix storage
Implement compressed sparse row (CSR) format:
- Store only non-zero entries
- Faster JᵀJ computation
- Less memory for large problems

## Questions for Implementation

1. **Linear solver choice**: Cholesky, CG, or both?
2. **Sparse storage**: Implement now or optimize later?
3. **Line search**: Backtracking or fixed step sizes initially?
4. **API style**: Match existing ScalarAutograd conventions?
5. **Error handling**: What if (JᵀJ) is singular?

## Success Criteria

✅ **Correctness**: Solves test problems to high accuracy
✅ **Performance**: Faster than numerical Jacobian for sparse problems
✅ **Robustness**: Handles singular cases gracefully
✅ **Usability**: Clean API that matches ScalarAutograd style
✅ **Documentation**: Examples showing typical usage

## Conclusion

This extension would make ScalarAutograd a powerful tool for solving sparse nonlinear least squares problems - a common pattern in robotics, computer vision, and scientific computing. The combination of automatic differentiation + sparsity awareness + early termination could provide order-of-magnitude speedups compared to traditional approaches.

**Is this the right direction for ScalarAutograd?**
