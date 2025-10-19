# TypeScript Bundle Adjustment Conversion Guide

## Executive Summary

**Good News:** The optimization code is remarkably small and self-contained (~7,200 LOC total). You're using an **extremely minimal subset** of Python's scientific stack.

**Core Dependencies:**
- **numpy**: Only basic linear algebra (no advanced features)
- **scipy**: Only `least_squares` function from `scipy.optimize`
- **No deep dependencies**: No PyTorch, TensorFlow, sklearn, pandas, etc.

**Feasibility:** ✅ **Highly Feasible** - With a good linear algebra library (Eigen-like), this is very doable.

---

## What We're Actually Using

### 1. **NumPy Operations (Basic)**

The code only uses fundamental numpy operations:

```python
# Array creation & manipulation
np.array(), np.zeros(), np.ones(), np.eye()
np.concatenate(), np.vstack(), np.column_stack()
np.atleast_1d(), np.atleast_2d()

# Linear algebra
np.linalg.norm()         # Vector magnitude
np.linalg.svd()          # SVD for triangulation
R.T                      # Matrix transpose
R @ X                    # Matrix multiplication
np.outer()               # Outer product
np.trace()               # Matrix trace

# Math operations
np.sin(), np.cos(), np.arccos(), np.tan()
np.sqrt(), np.sum(), np.mean(), np.std()
np.clip(), np.maximum(), np.minimum()
np.abs(), np.diff()

# No advanced features used
```

**TypeScript equivalent:** Any decent linear algebra library (gl-matrix, mathjs, or thin Eigen wrapper)

---

### 2. **SciPy - Only One Function!**

```python
from scipy.optimize import least_squares
from scipy.sparse import csr_matrix  # Only for sparsity pattern
```

**That's it!** We only use:
- `least_squares()` - Levenberg-Marquardt / Trust Region optimization
- `csr_matrix()` - Sparse matrix representation (optional optimization)

---

### 3. **OpenCV - Minimal (Only for PnP initialization)**

```python
import cv2

# Only used for initial camera pose estimation
cv2.solvePnPRansac()  # Perspective-n-Point solver
```

**Note:** This is only for initialization. The main optimization doesn't need it.

---

## Code Structure (7,231 LOC)

```
pictorigo/core/
├── models/              (~1,084 LOC)
│   ├── entities.py      # Camera, WorldPoint, Image classes (155 LOC)
│   ├── constraints.py   # Constraint types (636 LOC)
│   └── project.py       # Project container (293 LOC)
│
├── optimization/        (~1,879 LOC)
│   ├── factor_graph.py  # Core graph structure (399 LOC)
│   ├── problem.py       # Builds factor graph from project (484 LOC)
│   └── residuals.py     # Residual functions for each constraint (987 LOC)
│
├── solver/              (~788 LOC)
│   ├── scipy_solver.py  # Wraps scipy.optimize.least_squares (352 LOC)
│   └── diagnostics.py   # Post-solve analysis (436 LOC)
│
├── math/                (~565 LOC)
│   ├── camera.py        # Project/unproject (137 LOC)
│   ├── se3.py           # SE(3) Lie group ops (110 LOC)
│   ├── quaternions.py   # Quaternion math (~80 LOC)
│   ├── robust.py        # Huber/Cauchy loss (114 LOC)
│   └── jacobians.py     # Numeric differentiation (204 LOC)
│
├── initialization/      (~930 LOC)
│   ├── pnp.py           # Camera pose from 2D-3D correspondences (435 LOC)
│   └── incremental.py   # Sequential initialization (495 LOC)
│
└── synthetic/           (~790 LOC) [OPTIONAL - only for testing]
    └── scene_gen.py     # Test scene generation

Total core code: ~5,246 LOC (excluding synthetic/testing)
```

---

## What You Need in TypeScript

### Option 1: Port Everything (Recommended for Full Control)

**Pros:**
- Complete control over optimization
- No external solver dependencies
- Can optimize for browser performance
- ~5,000 LOC is very manageable

**Core Components to Port:**

1. **Linear Algebra Foundation** (~500 LOC to write from scratch)
   ```typescript
   // Use gl-matrix or write thin wrappers
   class Matrix3 { ... }
   class Vector3 { ... }

   // Core operations needed:
   - Matrix multiplication
   - Matrix transpose
   - Matrix inverse
   - SVD (singular value decomposition)
   - QR decomposition (for least squares)
   - Vector norms and dot products
   ```

2. **Levenberg-Marquardt Solver** (~300-500 LOC core algorithm)
   ```typescript
   class LevenbergMarquardt {
     solve(
       residualFn: (params: number[]) => number[],
       jacobianFn: (params: number[]) => number[][],
       initialParams: number[]
     ): SolveResult
   }
   ```

   **References:**
   - [Ceres Solver](https://github.com/ceres-solver/ceres-solver) - Industry standard (C++)
   - [minpack.js](https://github.com/jwgrenning/minpack.js) - LM in JavaScript
   - [levenberg-marquardt](https://github.com/mljs/levenberg-marquardt) - npm package

3. **Factor Graph** (Port existing ~400 LOC)
   - Already well-structured
   - Pure data structures, no numpy magic
   - Direct 1:1 translation

4. **Residuals** (Port existing ~1,000 LOC)
   - Pure math functions
   - Each residual is 20-50 LOC
   - Jacobians are analytical (already coded)

5. **Camera Math** (Port existing ~250 LOC)
   - Standard pinhole camera model
   - Distortion (radial k1, k2)
   - SE(3) transformations

---

### Option 2: Hybrid (WebAssembly Bridge)

**Compile Python to WASM:**

```typescript
// Use pyodide or compile specific functions
import { loadPyodide } from 'pyodide';

const pyodide = await loadPyodide();
await pyodide.loadPackage(['numpy', 'scipy']);

// Run optimization in WASM
const result = await pyodide.runPython(`
  from scipy.optimize import least_squares
  # ... your code
`);
```

**Pros:**
- Reuse existing Python code
- scipy.optimize already compiled

**Cons:**
- Large bundle size (~10-30 MB)
- Startup latency
- Memory overhead

---

### Option 3: Minimal JS Port + C++ WASM Module

**Keep logic in TS, compile solver to WASM:**

1. Port factor graph, residuals, models to TypeScript
2. Write thin LM solver in C++ with Eigen
3. Compile to WASM with Emscripten
4. Call from TypeScript

```typescript
// TypeScript side
const graph = buildFactorGraph(project);
const { residuals, jacobian } = graph.computeAll();

// WASM side (compiled C++ with Eigen)
const result = wasmSolver.solve(residuals, jacobian, initialParams);
```

**Pros:**
- Best performance
- Small WASM module (~100 KB)
- TypeScript maintains control

**Cons:**
- Need C++ build pipeline
- More complex setup

---

## Specific Function Mappings

### NumPy → TypeScript

```typescript
// numpy → gl-matrix / mathjs
import { mat3, mat4, vec3 } from 'gl-matrix';

// Matrix operations
np.eye(3)              → mat3.identity(mat3.create())
R @ X                  → mat3.multiply(out, R, X)
R.T                    → mat3.transpose(out, R)
np.linalg.norm(v)      → vec3.length(v)
np.concatenate([a, b]) → [...a, ...b]

// Math
np.sin(x)     → Math.sin(x)
np.sqrt(x)    → Math.sqrt(x)
np.sum(arr)   → arr.reduce((a,b) => a+b, 0)
```

### SciPy least_squares → TypeScript

**Option 1: Use existing JS library**
```typescript
import LM from 'ml-levenberg-marquardt';

const result = LM(
  { x: initialParams, y: observations },
  (params) => computeResiduals(params)
);
```

**Option 2: Port from minpack**
```typescript
// Based on MINPACK Fortran → C → JavaScript
// See: https://github.com/jwgrenning/minpack.js
class LevenbergMarquardt {
  solve(options: SolverOptions): SolveResult {
    // Trust region algorithm
    // ~300 LOC core loop
  }
}
```

---

## Recommended Approach

### **Phase 1: Pure TypeScript Port (Recommended)**

**Timeline:** 2-3 weeks for full port

1. **Week 1: Foundation**
   - Set up linear algebra utilities (use gl-matrix)
   - Port factor graph structure
   - Port camera projection math
   - Port SE(3) operations

2. **Week 2: Optimization**
   - Port residual functions (straightforward)
   - Port Jacobian computation
   - Implement or integrate LM solver
   - Test on synthetic data

3. **Week 3: Integration**
   - Connect to frontend DTOs
   - Test on real projects
   - Optimize performance
   - Add worker thread for heavy computation

**Libraries to Use:**
```json
{
  "dependencies": {
    "gl-matrix": "^3.4.3",           // Fast WebGL-optimized linear algebra
    "ml-levenberg-marquardt": "^4.0.0",  // LM solver
    "ndarray": "^1.0.19"             // N-dimensional arrays (optional)
  }
}
```

---

## Performance Considerations

### Current Python Performance (from tests):
- **9 world points, 3 cameras, 23 constraints**
- **Convergence: 4 iterations, ~50 seconds**

### Expected TypeScript Performance:
- **Pure JS/TS:** 2-5x slower (25-250 seconds)
- **With SIMD:** Similar to Python (50-100 seconds)
- **With WASM (C++/Eigen):** Faster than Python (20-40 seconds)

### Optimization Strategies:
1. **Web Workers** - Run optimization in background thread
2. **SIMD** - Use Float32Array + SIMD operations
3. **Sparse Jacobians** - Already supported in factor graph structure
4. **Progressive Refinement** - Show partial results during solve

---

## Code Size Comparison

| Component | Python LOC | TypeScript LOC (est.) |
|-----------|------------|------------------------|
| Models/DTOs | 1,084 | 1,200 (with types) |
| Factor Graph | 399 | 450 |
| Residuals | 987 | 1,100 |
| Math Utilities | 565 | 600 |
| LM Solver | 352 (wrapper) | 400 (port) or 0 (use lib) |
| **Total** | **~3,400** | **~3,750** |

**Note:** This excludes initialization (PnP), which requires OpenCV or equivalent.

---

## Missing Pieces in TypeScript Ecosystem

### ✅ Already Available:
- Linear algebra (gl-matrix, mathjs)
- Basic optimization (ml-levenberg-marquardt)
- Array operations (built-in + lodash)

### ⚠️ Need to Port or Find Alternative:
1. **SVD** - Singular Value Decomposition
   - Used for triangulation
   - Available in `ml-matrix` package

2. **QR Decomposition** - For normal equations
   - Available in `numeric.js`

3. **Sparse Matrices** - For large problems
   - Can use `sparse-matrix` package
   - Or skip if problems stay small (<1000 params)

### ❌ Not Available (Need to Port):
1. **PnP Solver** - Camera pose from 2D-3D
   - Port from OpenCV or use existing implementation
   - Can use EPnP algorithm (~200 LOC)
   - Alternative: Use Three.js camera utilities

---

## Minimal Viable Port

**For fastest time-to-market, port only:**

1. **Core optimization** (~2,000 LOC)
   - Factor graph
   - Residual functions
   - Camera projection
   - Use `ml-levenberg-marquardt` library

2. **Skip initially:**
   - Incremental initialization (use simple random init)
   - PnP solver (initialize cameras manually)
   - Robust loss functions (use squared error only)
   - Diagnostics and analysis tools

**Result:** Working bundle adjustment in ~1 week

---

## Example Code Sketch

```typescript
// Factor graph in TypeScript
class FactorGraph {
  variables: Map<string, Variable> = new Map();
  factors: Map<string, Factor> = new Map();

  computeResiduals(): Float64Array {
    const residuals: number[] = [];
    for (const factor of this.factors.values()) {
      const vars = factor.variableIds.map(id => this.variables.get(id)!.value);
      residuals.push(...factor.computeResidual(vars));
    }
    return new Float64Array(residuals);
  }

  computeJacobian(): { J: number[][], structure: [number, number][] } {
    // Build sparse Jacobian
    // ...
  }
}

// Reprojection residual
class ReprojectionFactor implements Factor {
  computeResidual(vars: { worldPoint: vec3, camR: mat3, camT: vec3, camK: vec4 }): vec2 {
    const projected = projectPoint(vars.camK, vars.camR, vars.camT, vars.worldPoint);
    return vec2.subtract(vec2.create(), projected, this.observed);
  }

  computeJacobian(vars): JacobianBlock {
    // Analytical derivatives (already coded in Python)
    // ...
  }
}

// Solver
import LM from 'ml-levenberg-marquardt';

function solve(graph: FactorGraph): SolveResult {
  const x0 = graph.packVariables();

  const result = LM(
    { x: x0, y: new Array(graph.totalResiduals).fill(0) },
    (params) => {
      graph.unpackVariables(params);
      return Array.from(graph.computeResiduals());
    }
  );

  graph.unpackVariables(result.parameterValues);
  return { success: true, finalCost: result.cost };
}
```

---

## Conclusion

**Recommendation: Pure TypeScript Port**

**Why:**
1. ✅ Tiny dependency surface (only basic linear algebra)
2. ✅ Code is small and well-structured (~5K LOC)
3. ✅ No exotic NumPy/SciPy features used
4. ✅ Good JS libraries available (gl-matrix, ml-levenberg-marquardt)
5. ✅ Full control over performance and optimization
6. ✅ Can run entirely client-side

**Not Recommended: WASM/Python**
- Huge bundle size (10-30 MB for scipy)
- Slower startup
- Overkill for such simple code

**Timeline:**
- Minimal viable: **1 week**
- Full feature parity: **2-3 weeks**
- Production ready: **1 month** (with testing, optimization)

The Python code is already well-designed for porting - it's modular, uses basic operations, and has clear separation of concerns. You picked the right architecture from the start! 🎯
