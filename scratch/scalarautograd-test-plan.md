# ScalarAutograd Integration - Implementation & Test Plan

**Created:** 2025-10-18
**Status:** Planning Phase
**Project:** Pictorigo (3D Photogrammetry Constraint Solver)

---

## 🚀 START HERE - HOW TO USE THIS PLAN

**For a new Claude Code session:**
1. Point Claude to this file: `scratch/scalarautograd-test-plan.md`
2. Say: **"Implement Phase 1"** (or whichever phase you're ready for)
3. Claude will follow the implementation tasks, create files, write tests, and verify results

**For continuing work:**
- Phases are sequential - complete Phase 1 before Phase 2, etc.
- Each phase has clear success criteria
- Tests must pass before moving to next phase

**Current Status:** Ready to begin Phase 1 (Setup & Infrastructure)

---

## 🎯 PLAN OVERVIEW

**Goal:** Integrate **ScalarAutograd** as Pictorigo's constraint solver - ScalarAutograd is a TypeScript library with **built-in least-squares optimization (Levenberg-Marquardt)** for solving geometric constraints.

**What this plan covers:**
1. **Integrating ScalarAutograd's existing solver** (we use it, don't implement it)
2. **Writing residual functions** for all constraint types (intrinsic and extrinsic)
3. **Comprehensive test suite** using real Pictorigo classes (end-to-end tests)
4. **Camera bundle adjustment** using ScalarAutograd's automatic differentiation

**Current State:** Pictorigo has frontend constraint definitions but incomplete solver integration (code in `frontend/src/wip/`). This plan provides a complete path to production-ready solver.

**What ScalarAutograd Provides (ALREADY BUILT-IN):**
- ✅ Levenberg-Marquardt least-squares solver
- ✅ Automatic differentiation (Jacobian computation)
- ✅ Optimization convergence logic

**What We Need to Implement:**
- Residual functions for each constraint type
- ConstraintSystem class to manage entities and build problem
- Integration layer to call ScalarAutograd's API

---

## 📚 Background: ScalarAutograd

**ScalarAutograd** is a TypeScript-based automatic differentiation library located at `C:\Dev\ScalarAutograd`.

**Key Features:**
- Automatic gradient computation via computational graph
- **Built-in least-squares solver** (Levenberg-Marquardt algorithm) - ALREADY IMPLEMENTED
- Value tracking for backpropagation
- Similar to Python's `autograd` but native TypeScript

**IMPORTANT:** ScalarAutograd already provides the complete least-squares optimization infrastructure. We don't need to implement the solver - we only need to:
1. Formulate our constraints as residual functions
2. Call ScalarAutograd's existing solver API
3. Extract the optimized results

**Reference Implementation:**
The ScalarAutograd repository includes a **2D sketch constraint solver demo** at `C:\Dev\ScalarAutograd\demos\sketch-demo\` that demonstrates the complete pattern we need to follow.

**Key Files to Study and Imitate:**

1. **`src/SketchSolver.ts`** - Main solver class (DO use this, NOT AdamSketchSolver)
   - Shows how to collect variables from entities (points, circles)
   - Builds residual function that calls `nonlinearLeastSquares`
   - Handles pinned vs free points (pinned = constant, free = variable)
   - Updates entity state after solving
   - Returns SolverResult with convergence info

2. **`src/ConstraintResiduals.ts`** - Residual function implementations
   - Each constraint type → residual function
   - Uses `V.W()` for variables, `V.C()` for constants
   - Returns array of `Value[]` (residuals should be 0 when satisfied)
   - Examples: parallel (cross product), perpendicular (dot product), distance, angle, etc.

3. **`src/__tests__/SketchSolver.spec.ts`** - End-to-end tests
   - Creates Point, Line, Circle objects
   - Sets up Project with entities and constraints
   - Calls `solver.solve(project)`
   - Verifies point positions and convergence
   - This is EXACTLY the test pattern we want for Pictorigo

4. **`src/types/Entities.ts`** - Entity definitions (Point, Line, Circle)
5. **`src/types/Constraints.ts`** - Constraint type definitions

**Our Approach:**
- **Imitate SketchSolver.ts** → Create `ConstraintSystem` class for Pictorigo (3D instead of 2D)
- **Imitate ConstraintResiduals.ts** → Create residual functions for our constraints (3D geometry + cameras)
- **Imitate SketchSolver.spec.ts** → Create end-to-end tests using WorldPoint, Line, Constraint classes

---

## 🏗️ ARCHITECTURE: How ScalarAutograd Replaces Current Solver

**Current State:**
- Frontend: Constraint definitions in `frontend/src/entities/constraints/`
- Solver: Incomplete integration in `frontend/src/wip/optimizer.ts`

**New Architecture with ScalarAutograd:**

```
┌─────────────────────────────────────────────────────────────┐
│ Pictorigo Frontend (TypeScript)                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  User Creates Constraints → WorldPoint, Line, etc. classes  │
│    ↓                                                          │
│  ConstraintSystem (NEW - to be implemented)                  │
│    • Collects all WorldPoints, Lines, Constraints           │
│    • Extracts intrinsic constraints from Lines              │
│    • Maps each constraint → residual function               │
│    ↓                                                          │
│  ScalarAutograd Problem Builder                              │
│    • Variables: Point.xyz values (flattened to 1D array)    │
│    • Residuals: One function per constraint                 │
│    • Locks: Fixed points marked as constants                │
│    ↓                                                          │
│  ScalarAutograd Solver (BUILT-IN - already implemented)      │
│    • Algorithm: Levenberg-Marquardt least-squares           │
│    • Minimize: Σ residual(x)²                                │
│    • Autodiff: Automatic Jacobian computation (built-in)    │
│    ↓                                                          │
│  Solution Updater                                            │
│    • Extract optimized point positions                      │
│    • Call point.applyOptimizationResult()                   │
│    • Update all WorldPoint.xyz values                       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Key Component: ConstraintSystem (To Be Implemented)

**Location:** `frontend/src/optimization/constraint-system.ts`

**Responsibilities:**
```typescript
export class ConstraintSystem {
  private points: Map<string, WorldPoint> = new Map()
  private lines: Map<string, Line> = new Map()
  private constraints: Constraint[] = []

  // Add entities
  addPoint(point: WorldPoint): void
  addLine(line: Line): void  // Automatically extract intrinsic constraints
  addConstraint(constraint: Constraint): void

  // Solve using ScalarAutograd
  solve(): SolveResult {
    // 1. Build variable vector from all point.xyz values
    // 2. Create residual functions from constraints
    // 3. Call ScalarAutograd least-squares solver
    // 4. Update point positions with solution
    // 5. Return convergence info
  }
}

interface SolveResult {
  converged: boolean
  iterations: number
  finalResidual: number
  error?: string
}
```

**This is the bridge between Pictorigo's constraint classes and ScalarAutograd's solver.**

**Least-Squares Formulation:**
Each constraint produces a **residual function** `r(x)` where `x` are the variables (point positions, etc.).
- `r(x) = 0` when constraint is satisfied
- ScalarAutograd minimizes `Σ r(x)²` using automatic differentiation for gradients

**Constraint Types:**
- **Intrinsic Constraints:** Embedded in geometric entities (line direction, line length, fixed point coordinates)
- **Extrinsic Constraints:** Relationships between separate entities (distance, angle, parallel, perpendicular, etc.)

---

## 🎯 Testing Philosophy

### Core Principle
Each test should use **Pictorigo's actual domain classes** to create a complete geometric system, apply constraints, solve using ScalarAutograd, and verify the solved state.

**NOT unit tests** - these are end-to-end tests using real classes
**NOT integration tests** - everything is TypeScript, no external systems

### Full Test Structure Pattern (Using Pictorigo Classes)

```typescript
import { WorldPoint } from '../entities/world-point/WorldPoint'
import { Line } from '../entities/line/Line'
import { DistanceConstraint } from '../entities/constraints/distance-constraint'
import { ConstraintSystem } from '../optimization/constraint-system'

describe('Distance Constraint - Point to Point', () => {
  it('should solve distance constraint between two points', () => {
    // === 1. CREATE GEOMETRIC ENTITIES (using Pictorigo classes) ===
    const pointA = WorldPoint.create('wp1', 'A', {
      xyz: [0, 0, 0],
      isLocked: true  // Lock one point to prevent drift
    })

    const pointB = WorldPoint.create('wp2', 'B', {
      xyz: [10, 0, 0]  // Initially 10 units away
    })

    // === 2. CREATE CONSTRAINT (using Pictorigo constraint class) ===
    const distanceConstraint = DistanceConstraint.create(
      'c1',
      'AB Distance',
      pointA.getId(),
      pointB.getId(),
      5.0,  // Target distance = 5 units
      mockRepo, // ConstraintRepository for entity lookup
      { tolerance: 1e-6 }
    )

    // === 3. BUILD CONSTRAINT SYSTEM ===
    const system = new ConstraintSystem()
    system.addPoint(pointA)
    system.addPoint(pointB)
    system.addConstraint(distanceConstraint)

    // === 4. SOLVE (this calls ScalarAutograd internally) ===
    const result = system.solve()

    // === 5. VERIFY SOLUTION ===
    // Check solver converged
    expect(result.converged).toBe(true)
    expect(result.iterations).toBeLessThan(50)

    // Check point A didn't move (it's locked)
    expect(pointA.xyz).toEqual([0, 0, 0])

    // Check point B moved to satisfy constraint
    const finalDistance = pointA.distanceTo(pointB)
    expect(finalDistance).toBeCloseTo(5.0, 6) // 1e-6 tolerance

    // Check constraint is satisfied
    const evaluation = distanceConstraint.evaluate()
    expect(evaluation.satisfied).toBe(true)
    expect(evaluation.value).toBeCloseTo(5.0, 6)
  })
})
```

### Test Pattern for Intrinsic Constraints (Line Direction)

```typescript
describe('Line Direction Constraint - Horizontal', () => {
  it('should constrain line to be horizontal', () => {
    // === 1. CREATE POINTS ===
    const pointA = WorldPoint.create('wp1', 'A', {
      xyz: [0, 0, 0],
      isLocked: true
    })

    const pointB = WorldPoint.create('wp2', 'B', {
      xyz: [3, 4, 5]  // NOT horizontal initially
    })

    // === 2. CREATE LINE WITH INTRINSIC CONSTRAINT ===
    const line = Line.create('line1', 'L1', pointA, pointB, {
      constraints: {
        direction: 'horizontal',  // Intrinsic constraint
        tolerance: 1e-6
      }
    })

    // === 3. BUILD SYSTEM ===
    const system = new ConstraintSystem()
    system.addPoint(pointA)
    system.addPoint(pointB)
    system.addLine(line)  // System extracts intrinsic constraints from line

    // === 4. SOLVE ===
    const result = system.solve()

    // === 5. VERIFY ===
    expect(result.converged).toBe(true)

    // Point B should have moved to Z=0 (horizontal means parallel to XY plane)
    expect(pointB.xyz![2]).toBeCloseTo(0, 6)

    // Line direction should have Z-component ≈ 0
    const direction = line.getDirection()  // Returns normalized vector
    expect(direction[2]).toBeCloseTo(0, 6)
  })
})
```

### Test Pattern for Combined Constraints

```typescript
describe('Combined Constraints - Triangle with Fixed Sides', () => {
  it('should solve triangle with three distance constraints', () => {
    // === 1. CREATE THREE POINTS ===
    const pointA = WorldPoint.create('wp1', 'A', {
      xyz: [0, 0, 0],
      isLocked: true  // Lock to establish coordinate frame
    })

    const pointB = WorldPoint.create('wp2', 'B', {
      xyz: [1, 1, 1]  // Arbitrary starting position
    })

    const pointC = WorldPoint.create('wp3', 'C', {
      xyz: [2, 0, 1]  // Arbitrary starting position
    })

    // === 2. CREATE EXTRINSIC CONSTRAINTS (3-4-5 right triangle) ===
    const distAB = DistanceConstraint.create('c1', 'AB', pointA.getId(), pointB.getId(), 3.0, mockRepo)
    const distBC = DistanceConstraint.create('c2', 'BC', pointB.getId(), pointC.getId(), 4.0, mockRepo)
    const distCA = DistanceConstraint.create('c3', 'CA', pointC.getId(), pointA.getId(), 5.0, mockRepo)

    // === 3. BUILD SYSTEM ===
    const system = new ConstraintSystem()
    system.addPoint(pointA)
    system.addPoint(pointB)
    system.addPoint(pointC)
    system.addConstraint(distAB)
    system.addConstraint(distBC)
    system.addConstraint(distCA)

    // === 4. SOLVE ===
    const result = system.solve()

    // === 5. VERIFY ALL THREE CONSTRAINTS ===
    expect(result.converged).toBe(true)

    expect(pointA.distanceTo(pointB)).toBeCloseTo(3.0, 6)
    expect(pointB.distanceTo(pointC)).toBeCloseTo(4.0, 6)
    expect(pointC.distanceTo(pointA)).toBeCloseTo(5.0, 6)

    // All constraints should report satisfied
    expect(distAB.evaluate().satisfied).toBe(true)
    expect(distBC.evaluate().satisfied).toBe(true)
    expect(distCA.evaluate().satisfied).toBe(true)
  })
})
```

### Key Differences from Unit Tests

1. **Use real Pictorigo classes**: `WorldPoint`, `Line`, `DistanceConstraint`, etc.
2. **Build complete system**: `ConstraintSystem` manages all entities and constraints
3. **Call actual solver**: `system.solve()` runs ScalarAutograd optimization
4. **Verify object state**: Check that the actual `WorldPoint.xyz` values have been updated
5. **Verify constraints**: Call `constraint.evaluate()` to confirm satisfaction

**This is the pattern for all 30+ tests across all constraint types.**

---

## 🔧 INTRINSIC CONSTRAINT TESTS

Intrinsic constraints are properties of individual geometric entities (lines, points).

### Test Suite 1: Fixed Point Constraint
**Type:** Extrinsic (WorldPoint)
**Description:** Lock a point to specific [x, y, z] coordinates

#### Test 1.1: Lock Point to Origin
```typescript
import { WorldPoint } from '../entities/world-point/WorldPoint'
import { FixedPointConstraint } from '../entities/constraints/fixed-point-constraint'
import { ConstraintSystem } from '../optimization/constraint-system'

describe('FixedPointConstraint', () => {
  it('should lock point to specified 3D coordinates', () => {
    // === 1. CREATE POINT (unsatisfied initial state) ===
    const point = WorldPoint.create('wp1', 'P1', {
      xyz: [5, 3, 7]  // Arbitrary position, NOT at origin
    })

    // === 2. CREATE FIXED POINT CONSTRAINT ===
    const constraint = FixedPointConstraint.create(
      'c1',
      'Lock P1 to Origin',
      point.getId(),
      [0, 0, 0],  // Target position
      mockRepo,
      { tolerance: 1e-6 }
    )

    // === 3. BUILD SYSTEM ===
    const system = new ConstraintSystem()
    system.addPoint(point)
    system.addConstraint(constraint)

    // === 4. SOLVE ===
    const result = system.solve()

    // === 5. VERIFY ===
    expect(result.converged).toBe(true)
    expect(result.iterations).toBeLessThan(10) // Should converge very quickly

    // Point should now be at origin
    expect(point.xyz).toEqual([0, 0, 0])

    // Constraint should report satisfied
    const evaluation = constraint.evaluate()
    expect(evaluation.satisfied).toBe(true)
    expect(Math.abs(evaluation.value)).toBeLessThan(1e-6) // Residual near zero
  })
})
```

#### Test 1.2: Lock Point on Each Axis Independently
**Question:** Should we test locking individual axes (e.g., only X fixed, Y and Z free)?
**Recommendation:** ✅ YES - This is valuable for testing partial constraints. Useful for scenarios like "point must be on ground plane (Z=0) but free in XY".

```typescript
it('should lock only Z-axis (point constrained to ground plane)', () => {
  const point = WorldPoint.create('wp1', 'P1', {
    xyz: [5, 3, 7]  // Initially above ground
  })

  // Lock only Z coordinate to 0 (ground plane)
  const constraint = FixedPointConstraint.create(
    'c1',
    'Ground Plane',
    point.getId(),
    [null, null, 0],  // Only Z is fixed, X and Y are free
    mockRepo
  )

  const system = new ConstraintSystem()
  system.addPoint(point)
  system.addConstraint(constraint)

  const result = system.solve()

  // Z should be 0, X and Y should be unchanged (or free to move)
  expect(point.xyz![2]).toBeCloseTo(0, 6)
  // X and Y might change if other constraints exist, but in this case should stay
  expect(point.xyz![0]).toBeCloseTo(5, 6)
  expect(point.xyz![1]).toBeCloseTo(3, 6)
})
```

---

### Test Suite 2: Line Direction Constraints
**Type:** Intrinsic (Line)
**Description:** Constrain line direction (horizontal, vertical, x-aligned, z-aligned)

#### Test 2.1: Horizontal Line Constraint
```typescript
describe('LineDirectionConstraint - Horizontal', () => {
  it('should constrain line to horizontal (parallel to XY plane)', () => {
    // Setup: Two points, one locked, one free
    const pointA = createWorldPoint('A', [0, 0, 0], locked: true)
    const pointB = createWorldPoint('B', [3, 4, 5]) // Initially NOT horizontal
    const line = createLine('L1', pointA, pointB, {
      direction: 'horizontal',  // Must be parallel to XY plane (dz = 0)
      targetLength: undefined   // Length is free
    })

    // Solve
    const result = solve({ points: [pointA, pointB], lines: [line] })

    // Verify: B should move to make line horizontal
    expect(result.points.B.xyz[2]).toBeCloseTo(0, tolerance: 1e-6) // Z matches A's Z

    // Verify: Line direction vector has z-component ≈ 0
    const direction = normalize(result.points.B.xyz - result.points.A.xyz)
    expect(direction[2]).toBeCloseTo(0, tolerance: 1e-6)
  })
})
```

#### Test 2.2: Vertical Line Constraint
```typescript
it('should constrain line to vertical (parallel to Z axis)', () => {
  // Setup
  const pointA = createWorldPoint('A', [0, 0, 0], locked: true)
  const pointB = createWorldPoint('B', [3, 4, 5]) // Initially NOT vertical
  const line = createLine('L1', pointA, pointB, {
    direction: 'vertical',  // Must be parallel to Z axis (dx=0, dy=0)
  })

  // Solve
  const result = solve({ points: [pointA, pointB], lines: [line] })

  // Verify: B should be directly above/below A
  expect(result.points.B.xyz[0]).toBeCloseTo(0, tolerance: 1e-6) // X matches
  expect(result.points.B.xyz[1]).toBeCloseTo(0, tolerance: 1e-6) // Y matches

  // Verify: Line direction is vertical
  const direction = normalize(result.points.B.xyz - result.points.A.xyz)
  expect(direction[0]).toBeCloseTo(0, tolerance: 1e-6)
  expect(direction[1]).toBeCloseTo(0, tolerance: 1e-6)
  expect(Math.abs(direction[2])).toBeCloseTo(1, tolerance: 1e-6)
})
```

#### Test 2.3: X-Aligned Line Constraint
```typescript
it('should constrain line to X axis direction', () => {
  const pointA = createWorldPoint('A', [0, 0, 0], locked: true)
  const pointB = createWorldPoint('B', [3, 4, 5])
  const line = createLine('L1', pointA, pointB, {
    direction: 'x-aligned',  // Parallel to X axis (dy=0, dz=0)
  })

  const result = solve({ points: [pointA, pointB], lines: [line] })

  // Verify: B aligned with A in X direction only
  expect(result.points.B.xyz[1]).toBeCloseTo(0, tolerance: 1e-6)
  expect(result.points.B.xyz[2]).toBeCloseTo(0, tolerance: 1e-6)
})
```

#### Test 2.4: Z-Aligned Line Constraint
```typescript
it('should constrain line to Z axis direction', () => {
  // Same pattern as vertical (Z-aligned is same as vertical in this system)
  // Test for completeness and clarity
})
```

**Question:** Are horizontal/vertical/x-aligned/z-aligned sufficient, or do we need arbitrary axis alignment?
**Recommendation:** ✅ Start with these 4 cardinal directions. Arbitrary axis alignment can be added later as an enhancement.

---

### Test Suite 3: Line Length Constraints
**Type:** Intrinsic (Line)
**Description:** Fix line to specific length

#### Test 3.1: Fixed Length Constraint (Simple)
```typescript
describe('LineLengthConstraint', () => {
  it('should constrain line to exact target length', () => {
    // Setup: Two points at distance 10
    const pointA = createWorldPoint('A', [0, 0, 0], locked: true)
    const pointB = createWorldPoint('B', [10, 0, 0]) // Distance = 10
    const line = createLine('L1', pointA, pointB, {
      direction: 'free',
      targetLength: 5.0  // Want distance = 5
    })

    // Solve
    const result = solve({ points: [pointA, pointB], lines: [line] })

    // Verify: Distance is now 5.0
    const distance = euclideanDistance(result.points.A.xyz, result.points.B.xyz)
    expect(distance).toBeCloseTo(5.0, tolerance: 1e-6)
  })
})
```

#### Test 3.2: Length + Direction Combined
```typescript
it('should satisfy both length and direction constraints simultaneously', () => {
  // Setup: Point B initially at [10, 5, 3]
  const pointA = createWorldPoint('A', [0, 0, 0], locked: true)
  const pointB = createWorldPoint('B', [10, 5, 3])
  const line = createLine('L1', pointA, pointB, {
    direction: 'horizontal',  // Must be in XY plane
    targetLength: 7.0         // Must have length 7
  })

  // Solve
  const result = solve({ points: [pointA, pointB], lines: [line] })

  // Verify: Both constraints satisfied
  expect(result.points.B.xyz[2]).toBeCloseTo(0, tolerance: 1e-6) // Horizontal
  const distance = euclideanDistance(result.points.A.xyz, result.points.B.xyz)
  expect(distance).toBeCloseTo(7.0, tolerance: 1e-6)
})
```

**Question:** What happens when constraints are overconstrained (e.g., 3 locked points forming a triangle with conflicting length constraints)?
**Recommendation:** ⚠️ Test overconstrained systems separately to verify proper error handling or relaxation. Not part of initial "happy path" tests.

---

## 🔗 EXTRINSIC CONSTRAINT TESTS

Extrinsic constraints define relationships between separate entities.

### Test Suite 4: Distance Between Points
**Type:** Extrinsic (Point-Point)
**Description:** Constrain distance between two points

#### Test 4.1: Simple Point-Point Distance
```typescript
describe('DistanceConstraint', () => {
  it('should constrain distance between two points', () => {
    // Setup: Three points, one locked, two free
    const pointA = createWorldPoint('A', [0, 0, 0], locked: true)
    const pointB = createWorldPoint('B', [10, 0, 0])  // Initially far
    const constraint = createDistanceConstraint(pointA, pointB, targetDistance: 5.0)

    // Solve
    const result = solve({
      points: [pointA, pointB],
      constraints: [constraint]
    })

    // Verify
    const distance = euclideanDistance(result.points.A.xyz, result.points.B.xyz)
    expect(distance).toBeCloseTo(5.0, tolerance: 1e-6)
  })
})
```

#### Test 4.2: Triangle with Three Distance Constraints
```typescript
it('should solve triangle with all three side lengths constrained', () => {
  // Setup: Three points in arbitrary positions
  const pointA = createWorldPoint('A', [0, 0, 0])
  const pointB = createWorldPoint('B', [1, 1, 1])
  const pointC = createWorldPoint('C', [2, 0, 1])

  // Lock one point to prevent drift
  pointA.locked = true

  // Constraints: Form a 3-4-5 right triangle
  const distAB = createDistanceConstraint(pointA, pointB, 3.0)
  const distBC = createDistanceConstraint(pointB, pointC, 4.0)
  const distCA = createDistanceConstraint(pointC, pointA, 5.0)

  // Solve
  const result = solve({
    points: [pointA, pointB, pointC],
    constraints: [distAB, distBC, distCA]
  })

  // Verify all three distances
  expect(euclideanDistance(result.points.A.xyz, result.points.B.xyz)).toBeCloseTo(3.0, 1e-6)
  expect(euclideanDistance(result.points.B.xyz, result.points.C.xyz)).toBeCloseTo(4.0, 1e-6)
  expect(euclideanDistance(result.points.C.xyz, result.points.A.xyz)).toBeCloseTo(5.0, 1e-6)
})
```

---

### Test Suite 5: Angle Constraints
**Type:** Extrinsic (Point-Point-Point or Line-Line)
**Description:** Constrain angle between three points or two lines

#### Test 5.1: Three-Point Angle (90 degrees)
```typescript
describe('AngleConstraint', () => {
  it('should constrain angle at vertex to 90 degrees', () => {
    // Setup: Three points forming arbitrary angle
    const pointA = createWorldPoint('A', [0, 0, 0], locked: true)
    const vertex = createWorldPoint('V', [1, 0, 0], locked: true)
    const pointB = createWorldPoint('B', [2, 3, 0]) // Initially not at 90°

    // Constraint: Angle AVB = 90°
    const constraint = createAngleConstraint(pointA, vertex, pointB, targetAngle: 90)

    // Solve
    const result = solve({
      points: [pointA, vertex, pointB],
      constraints: [constraint]
    })

    // Verify: Compute angle using dot product
    const vecVA = normalize(result.points.A.xyz - result.points.V.xyz)
    const vecVB = normalize(result.points.B.xyz - result.points.V.xyz)
    const dotProduct = dot(vecVA, vecVB)
    const angle = Math.acos(dotProduct) * (180 / Math.PI)

    expect(angle).toBeCloseTo(90, tolerance: 0.01) // 0.01 degree tolerance
  })
})
```

#### Test 5.2: Line-Line Angle
```typescript
it('should constrain angle between two lines', () => {
  // Setup: Four points defining two lines
  const p1 = createWorldPoint('P1', [0, 0, 0], locked: true)
  const p2 = createWorldPoint('P2', [1, 0, 0], locked: true)
  const p3 = createWorldPoint('P3', [0, 0, 0], locked: true) // Shares origin
  const p4 = createWorldPoint('P4', [1, 1, 0]) // Initially 45°

  const line1 = createLine('L1', p1, p2)
  const line2 = createLine('L2', p3, p4)

  // Constraint: Lines should be at 60° angle
  const constraint = createLineAngleConstraint(line1, line2, targetAngle: 60)

  // Solve
  const result = solve({
    points: [p1, p2, p3, p4],
    lines: [line1, line2],
    constraints: [constraint]
  })

  // Verify angle between line directions
  const dir1 = normalize(result.points.P2.xyz - result.points.P1.xyz)
  const dir2 = normalize(result.points.P4.xyz - result.points.P3.xyz)
  const angle = Math.acos(dot(dir1, dir2)) * (180 / Math.PI)

  expect(angle).toBeCloseTo(60, tolerance: 0.01)
})
```

---

### Test Suite 6: Parallel Lines
**Type:** Extrinsic (Line-Line)
**Description:** Constrain two lines to be parallel

#### Test 6.1: Simple Parallel Lines
```typescript
describe('ParallelLinesConstraint', () => {
  it('should make two lines parallel', () => {
    // Setup: Two lines, first locked, second free
    const p1 = createWorldPoint('P1', [0, 0, 0], locked: true)
    const p2 = createWorldPoint('P2', [1, 0, 0], locked: true)
    const p3 = createWorldPoint('P3', [0, 1, 0], locked: true)
    const p4 = createWorldPoint('P4', [2, 3, 1]) // Not parallel initially

    const line1 = createLine('L1', p1, p2) // Along X axis
    const line2 = createLine('L2', p3, p4)

    // Constraint: Lines must be parallel
    const constraint = createParallelLinesConstraint(line1, line2)

    // Solve
    const result = solve({
      points: [p1, p2, p3, p4],
      lines: [line1, line2],
      constraints: [constraint]
    })

    // Verify: Direction vectors are parallel (cross product ≈ 0)
    const dir1 = normalize(result.points.P2.xyz - result.points.P1.xyz)
    const dir2 = normalize(result.points.P4.xyz - result.points.P3.xyz)
    const crossProd = cross(dir1, dir2)

    expect(norm(crossProd)).toBeLessThan(1e-6) // Cross product nearly zero

    // Alternative: Check dot product is ±1 (parallel or anti-parallel)
    const dotProd = Math.abs(dot(dir1, dir2))
    expect(dotProd).toBeCloseTo(1.0, tolerance: 1e-6)
  })
})
```

---

### Test Suite 7: Perpendicular Lines
**Type:** Extrinsic (Line-Line)
**Description:** Constrain two lines to be perpendicular

#### Test 7.1: Simple Perpendicular Lines
```typescript
describe('PerpendicularLinesConstraint', () => {
  it('should make two lines perpendicular', () => {
    // Setup
    const p1 = createWorldPoint('P1', [0, 0, 0], locked: true)
    const p2 = createWorldPoint('P2', [1, 0, 0], locked: true)
    const p3 = createWorldPoint('P3', [0, 0, 0], locked: true) // Share origin
    const p4 = createWorldPoint('P4', [1, 1, 0]) // Initially 45°

    const line1 = createLine('L1', p1, p2)
    const line2 = createLine('L2', p3, p4)

    const constraint = createPerpendicularLinesConstraint(line1, line2)

    // Solve
    const result = solve({
      points: [p1, p2, p3, p4],
      lines: [line1, line2],
      constraints: [constraint]
    })

    // Verify: Dot product = 0 (perpendicular)
    const dir1 = normalize(result.points.P2.xyz - result.points.P1.xyz)
    const dir2 = normalize(result.points.P4.xyz - result.points.P3.xyz)

    expect(dot(dir1, dir2)).toBeCloseTo(0, tolerance: 1e-6)
  })
})
```

---

### Test Suite 8: Collinear Points
**Type:** Extrinsic (Point-Point-Point)
**Description:** Constrain three or more points to lie on a line

#### Test 8.1: Three Collinear Points
```typescript
describe('CollinearPointsConstraint', () => {
  it('should constrain three points to be collinear', () => {
    // Setup
    const p1 = createWorldPoint('P1', [0, 0, 0], locked: true)
    const p2 = createWorldPoint('P2', [5, 0, 0], locked: true)
    const p3 = createWorldPoint('P3', [2, 3, 1]) // Off the line initially

    const constraint = createCollinearPointsConstraint([p1, p2, p3])

    // Solve
    const result = solve({
      points: [p1, p2, p3],
      constraints: [constraint]
    })

    // Verify: Cross product of (P2-P1) and (P3-P1) should be zero
    const v1 = result.points.P2.xyz - result.points.P1.xyz
    const v2 = result.points.P3.xyz - result.points.P1.xyz
    const crossProd = cross(v1, v2)

    expect(norm(crossProd)).toBeLessThan(1e-6)
  })
})
```

---

### Test Suite 9: Coplanar Points
**Type:** Extrinsic (Point × 4+)
**Description:** Constrain four or more points to lie on a plane

#### Test 9.1: Four Coplanar Points
```typescript
describe('CoplanarPointsConstraint', () => {
  it('should constrain four points to be coplanar', () => {
    // Setup: Define a plane using first 3 points
    const p1 = createWorldPoint('P1', [0, 0, 0], locked: true)
    const p2 = createWorldPoint('P2', [1, 0, 0], locked: true)
    const p3 = createWorldPoint('P3', [0, 1, 0], locked: true)
    const p4 = createWorldPoint('P4', [0.5, 0.5, 2]) // Out of plane

    const constraint = createCoplanarPointsConstraint([p1, p2, p3, p4])

    // Solve
    const result = solve({
      points: [p1, p2, p3, p4],
      constraints: [constraint]
    })

    // Verify: Compute plane normal from first 3 points
    const v1 = result.points.P2.xyz - result.points.P1.xyz
    const v2 = result.points.P3.xyz - result.points.P1.xyz
    const normal = normalize(cross(v1, v2))

    // Check 4th point is on the plane (distance to plane ≈ 0)
    const v4 = result.points.P4.xyz - result.points.P1.xyz
    const distanceToPlane = Math.abs(dot(v4, normal))

    expect(distanceToPlane).toBeLessThan(1e-6)
  })
})
```

---

### Test Suite 10: Equal Distances
**Type:** Extrinsic (Multiple Point Pairs)
**Description:** Constrain multiple point pairs to have equal distances

#### Test 10.1: Two Equal Distances
```typescript
describe('EqualDistancesConstraint', () => {
  it('should make two point-pair distances equal', () => {
    // Setup: Four points
    const p1 = createWorldPoint('P1', [0, 0, 0], locked: true)
    const p2 = createWorldPoint('P2', [3, 0, 0])
    const p3 = createWorldPoint('P3', [0, 2, 0], locked: true)
    const p4 = createWorldPoint('P4', [0, 7, 0]) // Different distance

    // Constraint: dist(P1, P2) == dist(P3, P4)
    const constraint = createEqualDistancesConstraint([
      { pointA: p1, pointB: p2 },
      { pointA: p3, pointB: p4 }
    ])

    // Solve
    const result = solve({
      points: [p1, p2, p3, p4],
      constraints: [constraint]
    })

    // Verify
    const dist1 = euclideanDistance(result.points.P1.xyz, result.points.P2.xyz)
    const dist2 = euclideanDistance(result.points.P3.xyz, result.points.P4.xyz)

    expect(dist1).toBeCloseTo(dist2, tolerance: 1e-6)
  })
})
```

---

### Test Suite 11: Equal Angles
**Type:** Extrinsic (Multiple Angle Triplets)
**Description:** Constrain multiple angles to be equal

#### Test 11.1: Two Equal Angles
```typescript
describe('EqualAnglesConstraint', () => {
  it('should make two angles equal', () => {
    // Setup: Six points forming two angles
    const a1 = createWorldPoint('A1', [0, 0, 0], locked: true)
    const v1 = createWorldPoint('V1', [1, 0, 0], locked: true)
    const b1 = createWorldPoint('B1', [1, 1, 0])

    const a2 = createWorldPoint('A2', [5, 0, 0], locked: true)
    const v2 = createWorldPoint('V2', [6, 0, 0], locked: true)
    const b2 = createWorldPoint('B2', [6, 2, 0]) // Different angle

    // Constraint: angle(A1-V1-B1) == angle(A2-V2-B2)
    const constraint = createEqualAnglesConstraint([
      { pointA: a1, vertex: v1, pointB: b1 },
      { pointA: a2, vertex: v2, pointB: b2 }
    ])

    // Solve
    const result = solve({
      points: [a1, v1, b1, a2, v2, b2],
      constraints: [constraint]
    })

    // Verify both angles are equal
    const angle1 = computeAngle(result.points.A1, result.points.V1, result.points.B1)
    const angle2 = computeAngle(result.points.A2, result.points.V2, result.points.B2)

    expect(angle1).toBeCloseTo(angle2, tolerance: 0.01)
  })
})
```

---

## 📸 CAMERA REPROJECTION TESTS

Camera constraints are the most complex - they involve projecting 3D world points to 2D image coordinates.

### Test Strategy for Camera Tests

**Setup Pattern:**
1. Create a camera with **known** position and rotation (don't solve for camera initially)
2. Create world points with **known** 3D coordinates (in front of camera)
3. Project world points to image plane to get synthetic image observations
4. Run solver to verify it can recover the system

**Then progressively increase complexity:**
- Test A: Known camera, known world points → Verify projections match
- Test B: Known camera, free world points, observed image points → Solve for world points
- Test C: Free camera, known world points, observed image points → Solve for camera
- Test D: Free camera, free world points, observed image points → Solve both (hardest)

---

### Test Suite 12: Camera Projection (Forward Test)
**Type:** Camera Intrinsic
**Description:** Verify projection math is correct

#### Test 12.1: Simple Projection - No Distortion
```typescript
describe('CameraProjection', () => {
  it('should project world point to image coordinates correctly', () => {
    // Setup: Camera at origin looking down +Z axis
    const camera = createCamera({
      position: [0, 0, 0],
      rotation: quaternionIdentity(), // No rotation
      fx: 1000, fy: 1000, // Focal lengths
      cx: 512, cy: 384,   // Principal point (center of 1024x768 image)
      distortion: [0, 0, 0, 0, 0] // No distortion
    })

    // World point 1 meter in front of camera, 0.1m to the right
    const worldPoint = [0.1, 0, 1.0] // X=0.1, Y=0, Z=1

    // Expected projection: u = fx * (X/Z) + cx = 1000 * (0.1/1.0) + 512 = 612
    //                       v = fy * (Y/Z) + cy = 1000 * (0/1.0) + 384 = 384
    const expectedU = 612
    const expectedV = 384

    // Project
    const [u, v] = projectPoint(worldPoint, camera)

    // Verify
    expect(u).toBeCloseTo(expectedU, tolerance: 0.1)
    expect(v).toBeCloseTo(expectedV, tolerance: 0.1)
  })
})
```

#### Test 12.2: Projection with Radial Distortion
```typescript
it('should project with radial distortion applied', () => {
  const camera = createCamera({
    position: [0, 0, 0],
    rotation: quaternionIdentity(),
    fx: 1000, fy: 1000,
    cx: 512, cy: 384,
    distortion: [0.1, -0.05, 0, 0, 0] // k1=0.1, k2=-0.05 (barrel distortion)
  })

  const worldPoint = [0.2, 0.2, 1.0]

  // Project
  const [u, v] = projectPoint(worldPoint, camera)

  // Verify: Distorted coordinates should differ from pinhole projection
  const [uPinhole, vPinhole] = projectPointPinhole(worldPoint, camera)

  expect(u).not.toBeCloseTo(uPinhole, tolerance: 1.0) // Should be different
  expect(v).not.toBeCloseTo(vPinhole, tolerance: 1.0)

  // Note: Exact expected values depend on distortion model implementation
})
```

**Question:** Should we test all 5 distortion coefficients (k1, k2, p1, p2, k3)?
**Recommendation:** ✅ YES - Test k1 (radial), k1+k2 (combined radial), and p1+p2 (tangential) separately for clarity.

---

### Test Suite 13: Solve for World Points (Camera Known)
**Type:** Camera Extrinsic
**Description:** Given known camera and image observations, solve for 3D world points

#### Test 13.1: Single Point Triangulation
```typescript
describe('SolveWorldPoints - CameraKnown', () => {
  it('should solve for world point position from image observations', () => {
    // Setup: Known camera
    const camera = createCamera({
      position: [0, 0, 0],
      rotation: quaternionIdentity(),
      fx: 1000, fy: 1000,
      cx: 512, cy: 384,
      distortion: [0, 0, 0, 0, 0]
    })

    // Known world point (we'll use this to generate observation)
    const trueWorldPoint = [0.5, 0.3, 2.0]
    const [observedU, observedV] = projectPoint(trueWorldPoint, camera)

    // Now solve: Start with wrong initial guess
    const worldPoint = createWorldPoint('P1', [10, 10, 10]) // Bad initial guess

    // Constraint: Reprojection error should be zero
    const reprojectionConstraint = createReprojectionConstraint(
      worldPoint,
      camera,
      observedU,
      observedV
    )

    // Solve (camera is locked, point is free)
    const result = solve({
      points: [worldPoint],
      cameras: [camera],
      constraints: [reprojectionConstraint]
    })

    // Verify: Solved point should match true position
    expect(result.points.P1.xyz).toBeCloseTo(trueWorldPoint, tolerance: 1e-3)
  })
})
```

#### Test 13.2: Multiple Points from Multiple Images
```typescript
it('should solve for world points observed in multiple images', () => {
  // Setup: Two cameras at different positions
  const camera1 = createCamera({
    position: [0, 0, 0],
    rotation: quaternionIdentity(),
    // ... intrinsics
  })

  const camera2 = createCamera({
    position: [1, 0, 0], // 1 meter to the right
    rotation: quaternionFromAxisAngle([0, 1, 0], -10 * Math.PI/180), // Slight rotation
    // ... intrinsics
  })

  // True world points
  const truePoints = [
    [0.5, 0.3, 2.0],
    [0.8, 0.1, 2.5],
    [-0.2, 0.4, 3.0]
  ]

  // Generate observations
  const observations1 = truePoints.map(p => projectPoint(p, camera1))
  const observations2 = truePoints.map(p => projectPoint(p, camera2))

  // Setup solver with bad initial guesses
  const points = truePoints.map((_, i) =>
    createWorldPoint(`P${i}`, [5, 5, 5]) // Bad guess
  )

  // Create reprojection constraints for all observations
  const constraints = []
  points.forEach((point, i) => {
    constraints.push(
      createReprojectionConstraint(point, camera1, ...observations1[i]),
      createReprojectionConstraint(point, camera2, ...observations2[i])
    )
  })

  // Solve
  const result = solve({ points, cameras: [camera1, camera2], constraints })

  // Verify all points
  points.forEach((point, i) => {
    expect(result.points[point.id].xyz).toBeCloseTo(truePoints[i], tolerance: 1e-3)
  })
})
```

**Question:** Should we test with distortion in multi-camera scenarios?
**Recommendation:** ✅ YES - Add one test with distortion enabled. This is critical for real-world usage.

---

### Test Suite 14: Solve for Camera (World Points Known)
**Type:** Camera Extrinsic
**Description:** Given known world points and image observations, solve for camera position/rotation

#### Test 14.1: Solve Camera Pose (PnP - Perspective-n-Point)
```typescript
describe('SolveCameraPose - PointsKnown', () => {
  it('should solve for camera position and rotation from known 3D-2D correspondences', () => {
    // Setup: Known world points (e.g., calibration target)
    const knownPoints = [
      createWorldPoint('P1', [0, 0, 0], locked: true),
      createWorldPoint('P2', [1, 0, 0], locked: true),
      createWorldPoint('P3', [0, 1, 0], locked: true),
      createWorldPoint('P4', [1, 1, 0], locked: true),
      createWorldPoint('P5', [0.5, 0.5, 0], locked: true)
    ]

    // True camera pose
    const trueCamera = createCamera({
      position: [0.5, 0.5, -2], // 2 meters back, centered
      rotation: quaternionIdentity(),
      fx: 1000, fy: 1000,
      cx: 512, cy: 384,
      distortion: [0, 0, 0, 0, 0]
    })

    // Generate observations
    const observations = knownPoints.map(p =>
      projectPoint(p.xyz, trueCamera)
    )

    // Setup camera with wrong initial pose
    const camera = createCamera({
      position: [0, 0, 0], // Wrong position
      rotation: quaternionIdentity(),
      fx: 1000, fy: 1000, // Intrinsics are known
      cx: 512, cy: 384,
      distortion: [0, 0, 0, 0, 0]
    })

    // Create reprojection constraints
    const constraints = knownPoints.map((point, i) =>
      createReprojectionConstraint(point, camera, ...observations[i])
    )

    // Solve (points locked, camera free)
    const result = solve({
      points: knownPoints,
      cameras: [camera],
      constraints
    })

    // Verify camera pose
    expect(result.cameras[0].position).toBeCloseTo(trueCamera.position, tolerance: 1e-3)

    // Verify rotation (quaternion comparison)
    expect(result.cameras[0].rotation).toBeCloseToQuaternion(trueCamera.rotation, tolerance: 1e-3)
  })
})
```

**Question:** Should we test camera intrinsics optimization (fx, fy, cx, cy) or only extrinsics (position, rotation)?
**Recommendation:** ⚠️ Start with **extrinsics only** (position + rotation). Intrinsics calibration is a separate, more complex problem. Add intrinsics tests as "advanced" suite later.

---

### Test Suite 15: Bundle Adjustment (Camera + Points Both Free)
**Type:** Full Bundle Adjustment
**Description:** Simultaneously solve for cameras and world points

#### Test 15.1: Two-View Bundle Adjustment
```typescript
describe('BundleAdjustment - CameraAndPoints', () => {
  it('should solve for both camera poses and world points simultaneously', () => {
    // Setup: Ground truth
    const trueCamera1 = createCamera({
      position: [0, 0, 0],
      rotation: quaternionIdentity(),
      fx: 1000, fy: 1000, cx: 512, cy: 384,
      distortion: [0, 0, 0, 0, 0]
    })

    const trueCamera2 = createCamera({
      position: [1, 0, 0],
      rotation: quaternionFromAxisAngle([0, 1, 0], -15 * Math.PI/180),
      fx: 1000, fy: 1000, cx: 512, cy: 384,
      distortion: [0, 0, 0, 0, 0]
    })

    const truePoints = [
      [0.5, 0.3, 2.0],
      [0.8, 0.1, 2.5],
      [-0.2, 0.4, 3.0],
      [0.0, 0.0, 2.2]
    ]

    // Generate observations
    const obs1 = truePoints.map(p => projectPoint(p, trueCamera1))
    const obs2 = truePoints.map(p => projectPoint(p, trueCamera2))

    // Initial guess (perturbed from truth)
    const camera1 = perturbCamera(trueCamera1, positionNoise: 0.1, rotationNoise: 5°)
    const camera2 = perturbCamera(trueCamera2, positionNoise: 0.1, rotationNoise: 5°)
    const points = truePoints.map((p, i) =>
      createWorldPoint(`P${i}`, addNoise(p, 0.2))
    )

    // Lock first camera to prevent gauge freedom
    camera1.locked = true

    // Create all reprojection constraints
    const constraints = []
    points.forEach((point, i) => {
      constraints.push(
        createReprojectionConstraint(point, camera1, ...obs1[i]),
        createReprojectionConstraint(point, camera2, ...obs2[i])
      )
    })

    // Solve
    const result = solve({
      points,
      cameras: [camera1, camera2],
      constraints
    })

    // Verify: Cameras and points should converge to true values
    expect(result.cameras[1].position).toBeCloseTo(trueCamera2.position, tolerance: 1e-2)
    points.forEach((point, i) => {
      expect(result.points[point.id].xyz).toBeCloseTo(truePoints[i], tolerance: 1e-2)
    })

    // Verify: Reprojection errors should be near zero
    constraints.forEach(constraint => {
      expect(constraint.residual).toBeLessThan(0.1) // < 0.1 pixels
    })
  })
})
```

**Question:** How do we handle gauge freedom (system can drift/rotate/scale as a whole)?
**Recommendation:** ✅ **Lock one camera** (position + rotation) to establish coordinate frame. This is standard practice in bundle adjustment. Document this clearly in tests.

---

## 🏗️ IMPLEMENTATION PHASES

### Phase 1: Setup & Infrastructure (Week 1)
**Goal:** Integrate ScalarAutograd's existing least-squares solver and implement simplest constraint

**Implementation Tasks:**
1. **Study the sketch demo files** (SketchSolver.ts, ConstraintResiduals.ts, tests)
2. Create ConstraintSystem class (`optimization/constraint-system.ts`)
3. Implement residual function builder using ScalarAutograd API
4. **Implement first residual:** Fixed point constraint
5. Wire up ConstraintSystem.solve() to call `nonlinearLeastSquares`
6. Verify first test passes

**ScalarAutograd API to Use (from sketch demo):**

```typescript
import { V, Value, Vec3 } from 'scalarautograd'; // Vec3 for 3D (Pictorigo)
import { nonlinearLeastSquares } from 'scalarautograd/NonlinearLeastSquares';

// IMPORTANT: Vec3 is ONLY used during solving, NOT for storage!
// Pictorigo stores points as: xyz: [number, number, number]
// Vec3 is a temporary wrapper created during optimization

// Map to track Value objects for each point
const valueMap = new Map<WorldPoint, Vec3>();
const variables: Value[] = [];

// For each point in system:
for (const point of points) {
  if (point.isLocked()) {
    // Locked points are constants (V.C)
    const vec = new Vec3(
      V.C(point.xyz[0]),
      V.C(point.xyz[1]),
      V.C(point.xyz[2])
    );
    valueMap.set(point, vec);
  } else {
    // Free points are variables (V.W)
    const x = V.W(point.xyz[0]);
    const y = V.W(point.xyz[1]);
    const z = V.W(point.xyz[2]);
    const vec = new Vec3(x, y, z);
    valueMap.set(point, vec);
    variables.push(x, y, z); // Add to optimization variables
  }
}

// Residual function (must return Value[]):
const residualFn = (vars: Value[]) => {
  const residuals: Value[] = [];

  // Example: Fixed point constraint
  const pointVec = valueMap.get(point)!;
  const dx = V.sub(pointVec.x, V.C(targetX));
  const dy = V.sub(pointVec.y, V.C(targetY));
  const dz = V.sub(pointVec.z, V.C(targetZ));
  residuals.push(dx, dy, dz); // Should all be 0

  return residuals;
};

// Solve using built-in least-squares:
const result = nonlinearLeastSquares(variables, residualFn, {
  costTolerance: 1e-6,
  maxIterations: 100,
  initialDamping: 1e-3,
  adaptiveDamping: true,
  verbose: false
});

// Extract solution back to storage (plain tuples):
if (result.success) {
  for (const [point, vec] of valueMap) {
    if (!point.isLocked()) {
      point.xyz = [vec.x.data, vec.y.data, vec.z.data]; // Extract from .data
    }
  }
}
```

**Key Point:** Keep your current `xyz: [number, number, number]` storage! Vec3 is only a temporary helper during optimization, just like the sketch demo uses Vec2 temporarily.

**CRITICAL: V.W() vs V.C() - Locked Points Must Use V.C():**

⚠️ **DO NOT use V.W() for locked/pinned points!** The solver will try to optimize them.

```typescript
// ❌ WRONG - Locked point will be optimized:
if (point.isLocked()) {
  const x = V.W(point.xyz[0]);  // WRONG! Solver will change this
  variables.push(x);             // WRONG! Should not be in variables array
}

// ✅ CORRECT - Locked point is constant:
if (point.isLocked()) {
  const vec = new Vec3(V.C(point.xyz[0]), V.C(point.xyz[1]), V.C(point.xyz[2]));
  valueMap.set(point, vec);
  // NOTE: Do NOT add to variables array - locked points are not optimized
}

// ✅ CORRECT - Free point is variable:
else {
  const x = V.W(point.xyz[0]);
  const y = V.W(point.xyz[1]);
  const z = V.W(point.xyz[2]);
  const vec = new Vec3(x, y, z);
  valueMap.set(point, vec);
  variables.push(x, y, z);  // Only free points go in variables array
}
```

**Rule:** Only V.W() values should be added to the `variables` array. V.C() values are constants that never change during optimization.

**Note:** We are NOT implementing a least-squares solver - ScalarAutograd already has Levenberg-Marquardt built-in. We only need to:
- Format our problem (variables + residuals using **V.W() for free, V.C() for locked**)
- Call `nonlinearLeastSquares` with our residual function
- Extract results from `variable.data` after solving

**Test Tasks:**
1. Create test infrastructure (`optimization/__tests__/infrastructure/`)
2. Write fixed point constraint test (simplest validation)
3. Verify end-to-end: constraint → residual → solve → verify

**Success Criteria:**
- ✅ Can create ScalarAutograd optimization problem
- ✅ Can add variables (point positions) and residuals (constraints)
- ✅ Can run least-squares solver
- ✅ Fixed point test passes with <1e-6 error
- ✅ Pattern matches 2D sketch example architecture

**Estimated Effort:** 12-16 hours (includes studying reference example)

---

### Phase 2: Intrinsic Constraints (Week 2)
**Goal:** Implement all line intrinsic constraint residuals

**Implementation Tasks:**
1. **Implement line direction residuals** (`residuals/line-direction.ts`)
   - Horizontal (parallel to XY plane): residual = dz
   - Vertical (parallel to Z axis): residual = [dx, dy]
   - X-aligned: residual = [dy, dz]
   - Z-aligned: residual = [dx, dy] (same as vertical)
2. **Implement line length residual** (`residuals/line-length.ts`)
   - residual = ||p2 - p1|| - targetLength
3. Wire up intrinsic constraints to ScalarAutograd solver

**Test Tasks:**
1. Write Test Suite 2: Line direction constraints (4 tests)
2. Write Test Suite 3: Line length constraints (2 tests)
3. Test combined constraints (direction + length)

**Success Criteria:**
- ✅ All intrinsic constraint tests passing
- ✅ Can satisfy multiple intrinsic constraints simultaneously
- ✅ Solver converges reliably (<50 iterations)

**Estimated Effort:** 12-16 hours

---

### Phase 3: Simple Extrinsic Constraints (Week 3)
**Goal:** Implement point-point and line-line relationship residuals

**Implementation Tasks:**
1. **Implement distance constraint residual** (`residuals/distance.ts`)
   - residual = ||p2 - p1|| - targetDistance
2. **Implement angle constraint residuals** (`residuals/angle.ts`)
   - Three-point angle: residual = arccos(dot(v1, v2)) - targetAngle
   - Line-line angle: residual = arccos(dot(dir1, dir2)) - targetAngle
3. **Implement parallel/perpendicular line residuals** (`residuals/parallel-perpendicular.ts`)
   - Parallel: residual = cross(dir1, dir2) (3D vector, should be zero)
   - Perpendicular: residual = dot(dir1, dir2) (should be zero)

**Test Tasks:**
1. Write Test Suite 4: Distance constraints
2. Write Test Suite 5: Angle constraints
3. Write Test Suite 6: Parallel lines
4. Write Test Suite 7: Perpendicular lines
5. Test combinations (triangle with 3 distances, etc.)

**Success Criteria:**
- ✅ All simple extrinsic tests passing
- ✅ Can solve geometric configurations (triangles, right angles, parallel lines)
- ✅ Least-squares solver handles multiple residuals correctly

**Estimated Effort:** 14-18 hours

---

### Phase 4: Advanced Extrinsic Constraints (Week 4)
**Goal:** Implement multi-entity relationship residuals

**Implementation Tasks:**
1. **Implement collinear points residual** (`residuals/collinear.ts`)
   - residual = ||cross(v1, v2)|| where v1 = p2-p1, v2 = p3-p1
2. **Implement coplanar points residual** (`residuals/coplanar.ts`)
   - residual = dot(p4 - p1, normal) where normal = cross(p2-p1, p3-p1)
3. **Implement equal distances residual** (`residuals/equal-distances.ts`)
   - residual = ||p1-p2|| - ||p3-p4||
4. **Implement equal angles residual** (`residuals/equal-angles.ts`)
   - residual = angle1 - angle2

**Test Tasks:**
1. Write Test Suite 8: Collinear points
2. Write Test Suite 9: Coplanar points
3. Write Test Suite 10: Equal distances
4. Write Test Suite 11: Equal angles

**Success Criteria:**
- ✅ All advanced extrinsic tests passing
- ✅ Can handle multiple entities in single residual
- ✅ Solver handles higher-dimensional constraints

**Estimated Effort:** 12-16 hours

---

### Phase 5: Camera Projection (Week 5-6)
**Goal:** Implement camera projection math (forward problem)

**Implementation Tasks:**
1. **Implement pinhole camera projection** (`camera/projection.ts`)
   - Project 3D point to 2D image: [u, v] = K * [X/Z, Y/Z]
2. **Implement radial distortion** (Brown-Conrady model)
   - distorted_r = r * (1 + k1*r² + k2*r⁴ + k3*r⁶)
3. **Implement tangential distortion**
   - Add p1, p2 terms for decentering distortion
4. **Implement camera rotation** (quaternion → rotation matrix)

**Test Tasks:**
1. Write Test Suite 12: Camera projection tests
   - Test 12.1: Pinhole projection (no distortion)
   - Test 12.2: Radial distortion (k1 only)
   - Test 12.3: Full distortion model (k1+k2+p1+p2)

**Success Criteria:**
- ✅ Projection tests passing with/without distortion
- ✅ Can accurately project points to image plane
- ✅ Math matches ScalarAutograd's autodiff expectations

**Estimated Effort:** 14-18 hours

---

### Phase 6: Inverse Camera Problems (Week 7-8)
**Goal:** Implement reprojection residual and solve inverse problems

**Implementation Tasks:**
1. **Implement reprojection residual** (`residuals/reprojection.ts`)
   - residual = [u_observed - u_projected, v_observed - v_projected]
   - Uses camera projection from Phase 5
   - Autodiff through full projection + distortion chain
2. **Implement gauge freedom handling**
   - Lock first camera or first point to prevent drift
3. **Integrate with ScalarAutograd's least-squares solver**
   - Bundle adjustment setup: many residuals, many variables

**Test Tasks:**
1. Write Test Suite 13: Solve for world points (camera known)
   - Single point triangulation
   - Multiple points from multiple images
2. Write Test Suite 14: Solve for camera pose (points known)
   - PnP (Perspective-n-Point) problem
   - Test with 5+ known points
3. Write Test Suite 15: Bundle adjustment (both free)
   - Two-view bundle adjustment
   - Lock first camera to establish coordinate frame
   - Verify convergence within tolerance

**Success Criteria:**
- ✅ Can solve for 3D points from 2D observations (triangulation)
- ✅ Can solve for camera pose from known 3D-2D correspondences (PnP)
- ✅ Bundle adjustment converges correctly (<0.1px reprojection error)
- ✅ Handles gauge freedom properly (no drift)

**Estimated Effort:** 18-24 hours (camera problems are most complex)

---

## 🔍 IMPLEMENTATION QUESTIONS & RECOMMENDATIONS

### Q1: Test Framework Choice
**Question:** Should we use Jest (current framework) or create specialized test harness?
**Recommendation:** ✅ Use **Jest** with custom matchers for geometric comparisons (e.g., `toBeCloseTo3D`, `toBeCloseToQuaternion`). Keep tests in standard framework for familiarity.

---

### Q2: Tolerance Values
**Question:** What tolerance should we use for "close enough" comparisons?
**Recommendation:**
- **Geometric constraints:** `1e-6` (tight tolerance, solver should be very accurate)
- **Camera reprojection:** `0.1 pixels` (looser, sub-pixel accuracy is good enough)
- **Angles:** `0.01 degrees` (tight enough for most applications)

Document tolerance rationale in each test.

---

### Q3: Initial Guesses
**Question:** How far from solution should initial guesses be?
**Recommendation:**
- **Phase 2-4 (geometric):** Use clearly unsatisfied states but reasonable scale (e.g., point at [10, 5, 3] when target is [0, 0, 0])
- **Phase 5-6 (camera):** Use **small perturbations** from truth (±10% position, ±5° rotation). Camera optimization is nonlinear and can get stuck in local minima with bad initialization.

---

### Q4: Solver Convergence Failures
**Question:** What if solver doesn't converge in a test?
**Recommendation:**
1. First, check if initial guess is reasonable
2. Verify residual formulation is correct (check gradients)
3. Try different solver parameters (step size, max iterations)
4. If still failing, **document as known issue** and investigate separately. Don't let one failing test block all others.

---

### Q5: Test Data Generation
**Question:** Should we use hand-crafted test data or generated data?
**Recommendation:**
- **Geometric tests (Phase 2-4):** ✅ Hand-crafted, simple cases. Makes debugging easier.
- **Camera tests (Phase 5-6):** ✅ Generated from ground truth. Create synthetic scene → project → solve → compare. This ensures observations are self-consistent.

---

### Q6: Jacobian Testing
**Question:** Should we verify analytical Jacobians against numerical differentiation?
**Recommendation:** ✅ YES - Create **Jacobian validation tests** as sub-suite. For each residual:
```typescript
it('should compute correct analytical Jacobian', () => {
  const residual = createResidualFunction(...)
  const analyticalJac = residual.jacobian(variables)
  const numericalJac = computeNumericalJacobian(residual, variables)

  expect(analyticalJac).toBeCloseToMatrix(numericalJac, tolerance: 1e-5)
})
```

This catches implementation bugs early!

---

### Q7: Overconstrained Systems
**Question:** How to handle overconstrained or conflicting constraints?
**Recommendation:**
- **Phase 1-4:** ⚠️ Avoid in initial tests. Test "happy path" first.
- **Later phase:** Create dedicated "stress tests" for conflicting constraints. Solver should minimize total error (least squares) - document expected behavior.

---

### Q8: Camera Model Complexity
**Question:** Should we test full Brown-Conrady distortion (5 params) or simplified model?
**Recommendation:**
- **Start with:** k1 only (radial)
- **Then add:** k1 + k2 (radial)
- **Finally add:** Full model (k1, k2, p1, p2, k3)

Progressive complexity prevents debugging nightmares.

---

### Q9: Multi-Constraint Tests
**Question:** Should we test each constraint in isolation only, or also test combinations?
**Recommendation:** ✅ **Both**:
- **Isolation tests:** Verify each constraint works alone (primary suite)
- **Combination tests:** Verify constraints work together (secondary suite)
  - Example: Triangle with 3 distance constraints
  - Example: Line with both direction AND length constraints
  - Example: Bundle adjustment with intrinsic + extrinsic + reprojection

---

### Q10: Performance Benchmarks
**Question:** Should we track solver performance (iterations, time)?
**Recommendation:** ✅ YES - Add **performance assertions** to prevent regressions:
```typescript
expect(result.iterations).toBeLessThan(50) // Shouldn't need many iterations
expect(result.timeMs).toBeLessThan(100)    // Should be fast
```

This helps catch algorithmic regressions.

---

## 📝 TEST FILE STRUCTURE

Recommended organization:
```
frontend/src/optimization/__tests__/
├── infrastructure/
│   ├── solver-setup.test.ts          # Basic solver infrastructure
│   ├── jacobian-validation.test.ts   # Numerical vs analytical Jacobians
│   └── test-helpers.ts                # Shared utilities
│
├── intrinsic-constraints/
│   ├── fixed-point.test.ts
│   ├── line-direction.test.ts
│   └── line-length.test.ts
│
├── extrinsic-constraints/
│   ├── distance.test.ts
│   ├── angle.test.ts
│   ├── parallel-perpendicular.test.ts
│   ├── collinear-coplanar.test.ts
│   └── equal-constraints.test.ts
│
├── camera/
│   ├── projection.test.ts             # Forward projection
│   ├── solve-points.test.ts          # Inverse: solve for points
│   ├── solve-camera.test.ts          # Inverse: solve for camera
│   └── bundle-adjustment.test.ts     # Solve both
│
└── integration/
    ├── multi-constraint.test.ts       # Combined constraints
    └── performance.test.ts            # Performance benchmarks
```

---

## 🎯 SUCCESS METRICS

**Phase Completion Criteria:**

| Phase | Tests Passing | Coverage | Ready for |
|-------|---------------|----------|-----------|
| Phase 1 | 1/1 (fixed point) | Basic infrastructure | Phase 2 |
| Phase 2 | 6+ (all intrinsic) | Line constraints | Phase 3 |
| Phase 3 | 12+ (simple extrinsic) | Point/line relationships | Phase 4 |
| Phase 4 | 16+ (advanced extrinsic) | Multi-entity constraints | Phase 5 |
| Phase 5 | 20+ (projection) | Camera math | Phase 6 |
| Phase 6 | 30+ (inverse problems) | Full solver | Production |

**Final Success:**
- ✅ All 30+ tests passing
- ✅ All constraints can be satisfied individually
- ✅ Multi-constraint systems converge correctly
- ✅ Camera/bundle adjustment working
- ✅ Performance within acceptable bounds
- ✅ Ready to integrate into main application

---

## 🚀 NEXT STEPS

1. ✅ **Review this plan** - Get user feedback and clarifications
2. **Study the reference example** - Examine ScalarAutograd's 2D sketch solver
3. **Phase 1: Integration** - Create adapter layer and first constraint
4. **Phases 2-4: Geometric constraints** - Implement all residual functions
5. **Phases 5-6: Camera constraints** - Implement projection and bundle adjustment
6. **Production integration** - Connect solver to Pictorigo UI

**Estimated Total Timeline:** 8-12 weeks (assuming ~12-16 hours/week)

**Critical Path:**
- Phase 1 establishes the pattern (critical foundation)
- Phase 6 (camera bundle adjustment) is most complex and required for production

---

## 📋 SUMMARY

**This plan provides:**
1. **Complete ScalarAutograd integration** - Use ScalarAutograd's built-in least-squares solver (Levenberg-Marquardt)
2. **Comprehensive residual implementations** - All intrinsic and extrinsic constraint types
3. **Full test coverage** - 30+ end-to-end tests using real Pictorigo classes
4. **Camera bundle adjustment** - Real photogrammetry problem solving with automatic differentiation
5. **Clear implementation path** - 6 phases from simple (fixed point) to complex (bundle adjustment)

**Key Points:**
- **ScalarAutograd already has least-squares** - We don't implement the solver, just use it
- **Follow 2D sketch example** - ScalarAutograd repo has reference implementation
- **Use real Pictorigo classes** - Tests use WorldPoint, Line, Constraint classes
- **End-to-end testing** - Build system, solve, verify results

**Least-Squares Optimization:** All constraints formulated as residual functions `r(x)`, minimize `Σ r(x)²` using **ScalarAutograd's existing Levenberg-Marquardt solver** with automatic differentiation for gradients.

---

**Document Status:** Ready for Review
**Author:** Claude Code
**Next Action:** User review and approval to begin implementation
