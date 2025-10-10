# PRD: TypeScript-Based Optimization Migration

**Document ID:** 0001
**Created:** 2025-10-10
**Status:** Draft
**Priority:** High

## Executive Summary

Complete migration of Pictorigo's Python-based bundle adjustment backend to a browser-native TypeScript implementation using the ScalarAutograd automatic differentiation library. This enables a pure client-side photogrammetry application with no server dependencies.

**Key Principle:** NO LEGACY - Complete clean rewrite, no backward compatibility, no Python remnants.

## Goals and Non-Goals

### Goals
- ✅ Remove ALL Python code - complete elimination of backend server
- ✅ Implement browser-native 3D photogrammetry optimization
- ✅ Use ScalarAutograd's Levenberg-Marquardt solver
- ✅ Entity-driven architecture (entities ARE the optimization variables)
- ✅ Support robust loss functions (Huber, Cauchy, Tukey) for outlier rejection
- ✅ Maintain existing DTO serialization with 6-char IDs
- ✅ Minimal frontend changes (swap API calls from Python to TypeScript)
- ✅ Deploy as single-page application (GitHub Pages/Netlify compatible)

### Non-Goals
- ❌ Backward compatibility with Python-based projects
- ❌ 2D sketching/CAD features (3D photogrammetry focus only)
- ❌ Node.js backend or server infrastructure
- ❌ Support for legacy file formats
- ❌ UI redesign (frontend changes minimal)

## Background

### Current Architecture
- **Frontend:** React/TypeScript with Three.js 3D visualization
- **Backend:** Python FastAPI server with scipy-based bundle adjustment
- **Problem:** Server dependency, deployment complexity, Python maintenance burden

### Inspiration
ScalarAutograd's `sketch-demo` proves entity-driven constraint solving works brilliantly in the browser:
- 200-500x faster than Adam optimizer
- Direct entity references (no ID mapping)
- Entities hold Vec3/Vec2 of Value objects directly
- Composite residuals (entities can produce multiple constraints)

## Technical Design

### Core Architecture

#### Entity-Driven Design
**Key Innovation:** Entities directly hold `Vec3`/`Vec2` of `Value` objects - NO ValueMap needed!

```typescript
// Traditional approach (sketch-demo uses this for 2D):
// ValueMap: { [id: string]: Value } + separate entities with IDs

// Our approach for 3D:
interface WorldPoint {
  position: Vec3;  // Vec3 of Value objects!
  pinned: boolean;
  xLocked: boolean;  // Per-axis locking
  yLocked: boolean;
  zLocked: boolean;
  // ... other properties
}

// Creating a world point:
const freePoint = {
  position: new Vec3(V.W(1.0), V.W(2.0), V.W(3.0)),  // All axes free
  // ...
};

const partiallyLocked = {
  position: new Vec3(V.C(0.0), V.W(2.0), V.W(3.0)),  // X locked at 0
  xLocked: true,
  yLocked: false,
  zLocked: false,
  // ...
};
```

#### Type System
See `tasks/typescript-optimization-migration-types.ts` for complete definitions.

**Core Entities:**
- `WorldPoint` - 3D points with per-axis locking (xLocked, yLocked, zLocked)
- `ImagePoint` - 2D observations linking WorldPoint to Image
- `Image` - Camera with intrinsics/extrinsics
- `Camera` - Position (Vec3) + Rotation (Quaternion of Values)
- `Line` - Connects two WorldPoints, has intrinsic constraints
- `Plane` - Defined by 3+ WorldPoints

**Constraints:**
- **Intrinsic:** Embedded in entities (Line direction, target length)
- **Inter-entity:** Distance, Angle, Parallel, Perpendicular, Collinear, Coplanar, Equal distances/angles

#### Camera Model

```typescript
interface Camera {
  // Intrinsics (constant)
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  distortion: number[];  // [k1, k2, p1, p2, k3]

  // Extrinsics (optimizable)
  position: Vec3;  // V.W() or V.C()
  rotation: Quaternion;  // {w, x, y, z} all Value objects
  fixed: boolean;
}
```

**Rotation Representation:** Quaternions (w, x, y, z)
- More stable than Euler angles (no gimbal lock)
- Differentiable using ScalarAutograd's Value type
- Standard in 3D graphics/photogrammetry

**Note:** ScalarAutograd's `Matrix3x3` is for eigenvalue computation (coplanarity constraints), NOT rotation matrices.

#### Residual Functions

Each entity/constraint implements the `ResidualFunction` interface:

```typescript
interface ResidualFunction {
  id: string;
  name: string;
  entityType: 'world-point' | 'image-point' | 'line' | 'plane' | 'constraint';
  sourceEntity: WorldPoint | ImagePoint | Line | Plane | Constraint;
  compute(): Value[];  // Accesses entity.position directly!
  numResiduals(): number;
}
```

**Examples:**

1. **Reprojection Residual** (2 residuals per ImagePoint):
```typescript
compute(): Value[] {
  const worldPos = this.imagePoint.worldPoint.position; // Vec3
  const projected = projectPoint(worldPos, this.imagePoint.image.camera);
  const observed = this.imagePoint.uv; // Vec2

  return [
    V.sub(projected.x, observed.x),  // u error
    V.sub(projected.y, observed.y)   // v error
  ];
}
```

2. **Line Constraint Residual** (0-2 residuals per Line):
```typescript
compute(): Value[] {
  const residuals: Value[] = [];
  const startPos = this.line.start.position;
  const endPos = this.line.end.position;

  // Length constraint
  if (this.line.constraints.targetLength) {
    const actualLength = endPos.sub(startPos).magnitude;
    residuals.push(V.sub(actualLength, V.C(this.line.constraints.targetLength)));
  }

  // Direction constraint
  if (this.line.constraints.direction === 'horizontal') {
    const dir = endPos.sub(startPos).normalize();
    residuals.push(dir.z); // z component should be 0
  }

  return residuals;
}
```

### Optimization Solver

**Algorithm:** Levenberg-Marquardt (from ScalarAutograd)
- Proven 200-500x faster than Adam for constraint problems
- Handles both camera poses and 3D point positions
- Supports sparse Jacobian patterns (but ScalarAutograd does dense - acceptable for browser problems)

**Robust Loss Functions:**
- Huber: `Losses.huber(residual, scale)`
- Tukey: `Losses.tukey(residual, scale)`
- Cauchy: Implement using ScalarAutograd primitives
- Essential for outlier rejection in photogrammetry

**Solver Options:**
```typescript
interface SolverOptions {
  maxIterations?: number;        // default: 100
  tolerance?: number;            // default: 1e-6
  initialDamping?: number;       // default: 1e-3
  adaptiveDamping?: boolean;     // default: true
  verbose?: boolean;             // default: false
  robustLoss?: 'none' | 'huber' | 'cauchy' | 'tukey';
  robustLossScale?: number;
}
```

### Data Serialization

**Storage Layer:** DTOs with 6-char IDs (existing format)
**Runtime Layer:** Direct entity references (no IDs)

```typescript
// Storage (serialization.ts)
interface WorldPointDTO {
  id: string;  // 6-char ID like "wp_abc"
  name: string;
  x: number;
  y: number;
  z: number;
  pinned: boolean;
  xLocked: boolean;
  yLocked: boolean;
  zLocked: boolean;
  // ... other properties
  observationIds: string[];  // References to ImagePointDTOs
}

// Runtime (types.ts)
interface WorldPoint {
  name: string;
  position: Vec3;  // Vec3 of Value objects!
  pinned: boolean;
  xLocked: boolean;
  yLocked: boolean;
  zLocked: boolean;
  observations: ImagePoint[];  // Direct references!
}
```

**Conversion Functions:**
- `toDTO(entity)` - Convert runtime entity to DTO with IDs
- `fromDTO(dto)` - Convert DTO to runtime entity with Vec3/Vec2 of Values

### Per-Axis Locking

WorldPoints support locking individual axes:

```typescript
interface WorldPoint {
  position: Vec3;  // Contains V.W() or V.C() per axis
  pinned: boolean;   // If true, all axes locked
  xLocked: boolean;  // If true, position.x uses V.C()
  yLocked: boolean;  // If true, position.y uses V.C()
  zLocked: boolean;  // If true, position.z uses V.C()
  // ...
}
```

**Use Cases:**
- Ground plane: Lock z=0 for all ground points
- Known X coordinate: Lock x, optimize y and z
- Sliding constraint: Lock one axis, free others

## Implementation Plan

### Phase 1: Core Solver (Week 1-2)

**1.1 Camera Projection Functions**
- [ ] Implement quaternion-to-rotation-matrix conversion
- [ ] Implement 3D-to-2D projection with distortion
- [ ] Write unit tests against known camera parameters

**1.2 Residual Functions**
- [ ] `ReprojectionResidual` - image-based constraints
- [ ] `LineResidual` - length and direction constraints
- [ ] `PlaneResidual` - coplanarity using Matrix3x3.smallestEigenvalue()
- [ ] `DistanceConstraint`, `AngleConstraint`, etc.

**1.3 Residual Collection**
- [ ] `collectResiduals(project: Project): ResidualFunction[]`
- [ ] Apply robust loss functions (Huber, Tukey)
- [ ] Build total cost function: `Σ ρ(residual²)`

**1.4 Solver Integration**
- [ ] Integrate ScalarAutograd's LM solver
- [ ] Implement `solve(project: Project, options: SolverOptions): SolveResult`
- [ ] Entity diagnostics for UI feedback

**Testing:**
- Synthetic scenes with known solutions
- Compare against Python solver outputs (golden examples)
- Validate each residual type independently

### Phase 2: Data Layer (Week 3)

**2.1 DTO Definitions**
- [ ] Define DTOs in `serialization.ts` (with 6-char IDs)
- [ ] Mirror existing Python backend DTO structure (for testing)

**2.2 Conversion Functions**
- [ ] `worldPointToDTO(wp: WorldPoint, id: string): WorldPointDTO`
- [ ] `worldPointFromDTO(dto: WorldPointDTO): WorldPoint`
- [ ] Repeat for Image, Camera, Line, Plane, Constraint
- [ ] Handle circular references (WorldPoint ↔ ImagePoint ↔ Image)

**2.3 Project Serialization**
- [ ] `projectToJSON(project: Project): string`
- [ ] `projectFromJSON(json: string): Project`
- [ ] File format validation

**Testing:**
- Round-trip serialization tests
- Load existing projects (if any golden examples exist)

### Phase 3: Frontend Integration (Week 4)

**3.1 Optimization Service**
- [ ] Replace Python API calls with TypeScript solver calls
- [ ] `optimizationService.solve(project)` - pure client-side
- [ ] Progress reporting (iteration callbacks)

**3.2 UI Updates**
- [ ] Display solver diagnostics (EntityDiagnostic)
- [ ] Show per-entity error breakdown
- [ ] Convergence visualization

**3.3 File Operations**
- [ ] Remove server-based save/load
- [ ] Implement browser-based file save (download JSON)
- [ ] Implement browser-based file load (upload JSON)

**Testing:**
- End-to-end workflow tests
- Load golden example projects
- Visual validation of results

### Phase 4: Polish (Week 5)

**4.1 Performance**
- [ ] Profile solver performance
- [ ] Optimize hot paths if needed
- [ ] Consider Web Workers for background solving

**4.2 Documentation**
- [ ] API documentation
- [ ] Architecture guide
- [ ] Migration guide (for developers, not users - NO LEGACY!)

**4.3 Deployment**
- [ ] Remove Python backend entirely
- [ ] Configure for static site deployment
- [ ] Deploy to GitHub Pages or Netlify

## Success Criteria

### Functional Requirements
- ✅ TypeScript solver matches Python solver accuracy (test on golden examples)
- ✅ All constraint types working (reprojection, distance, angle, etc.)
- ✅ Robust loss functions reduce outlier influence
- ✅ Frontend works without Python dependency
- ✅ Projects can be saved/loaded in browser

### Performance Requirements
- ✅ Solver converges in <2 seconds for typical scenes (10-20 points, 3-5 images)
- ✅ UI remains responsive during optimization
- ✅ File load/save instantaneous (<100ms for typical project)

### Quality Requirements
- ✅ Each residual type has unit tests
- ✅ Golden example projects load and solve correctly
- ✅ No Python code remains in codebase
- ✅ Static site deployment works

## Testing Strategy

### Unit Tests
- Camera projection math (quaternion → rotation, 3D → 2D)
- Each residual type independently
- DTO conversion round-trips
- Robust loss functions

### Integration Tests
- Solve synthetic scenes with known solutions
- Example: 4 corners of square, 2 cameras at known poses
- Verify point positions converge to ground truth

### Golden Example Tests
Create 2-3 golden example projects:
1. **Simple scene:** 4 coplanar points, 2 cameras
2. **Room reconstruction:** 8 corner points, 4 images
3. **With constraints:** Points + lines with fixed lengths

For each:
- Save expected final point positions
- Run TypeScript solver
- Verify results match expected positions within tolerance

### Manual QA
- Load each golden example in UI
- Visually verify 3D reconstruction
- Check solver diagnostics display correctly
- Test save/load workflow

## Risks and Mitigations

### Risk 1: Performance
**Risk:** Browser solver too slow for real-time use
**Likelihood:** Low (sketch-demo proves browser LM is fast)
**Mitigation:** Profile and optimize; use Web Workers if needed

### Risk 2: Numerical Stability
**Risk:** Quaternion normalization, division by zero, etc.
**Likelihood:** Medium (photogrammetry is numerically sensitive)
**Mitigation:**
- Use ScalarAutograd's `reciprocal(x, epsilon)`
- Add epsilon to square roots: `V.sqrt(V.add(x, V.C(1e-12)))`
- Clamp quaternions before acos: `V.clamp(x, -0.99999, 0.99999)`

### Risk 3: Missing Python Features
**Risk:** Python solver has features not documented
**Likelihood:** Low (most logic is in scipy bundle adjustment)
**Mitigation:** Comprehensive testing against Python outputs; accept small differences

### Risk 4: ScalarAutograd Limitations
**Risk:** ScalarAutograd missing needed features
**Likelihood:** Low (has LM, Losses, Vec3, matrix ops)
**Mitigation:** Extend ScalarAutograd if needed (it's also TypeScript)

## Open Questions

1. **Camera initialization:** How to get initial camera poses? (Current Python code uses what method?)
   - Answer: Likely manual placement or structure-from-motion. Keep existing initialization strategy.

2. **Distortion model:** Are we using Brown-Conrady (k1-k5, p1-p2)? Full model or simplified?
   - Answer: Array of 5 coefficients `[k1, k2, p1, p2, k3]` - standard Brown-Conrady

3. **Scaling:** What's the expected scene scale? (Affects numerical conditioning)
   - Answer: Meters for distances. Scale to unit cube if needed for stability.

## Dependencies

### External Libraries
- **ScalarAutograd** (C:\Dev\ScalarAutograd) - automatic differentiation + LM solver
- **React/TypeScript** - existing frontend framework
- **Three.js** - existing 3D visualization

### Internal Modules
- `types.ts` - core entity definitions (already created)
- `serialization.ts` - DTO definitions and conversion (to be created)
- `residuals/` - residual function implementations (to be created)
- `solver.ts` - main solver entrypoint (to be created)
- `camera.ts` - projection math (to be created)

## Timeline

- **Week 1-2:** Phase 1 (Core Solver)
- **Week 3:** Phase 2 (Data Layer)
- **Week 4:** Phase 3 (Frontend Integration)
- **Week 5:** Phase 4 (Polish & Deployment)

**Total Duration:** 5 weeks (1 developer)

## Future Enhancements (Out of Scope)

- Structure-from-motion (automatic camera pose initialization)
- Multi-threaded solving (Web Workers)
- GPU acceleration (WebGL/WebGPU shaders)
- Advanced constraints (symmetry, patterns)
- 2D sketching integration (if we ever want hybrid 2D/3D)

## Appendix

### Glossary

- **Bundle Adjustment:** Simultaneous optimization of camera poses and 3D point positions
- **Reprojection Error:** Difference between observed 2D point and projected 3D point
- **Levenberg-Marquardt:** Optimization algorithm for non-linear least squares
- **Robust Loss Function:** Function that reduces influence of outliers (Huber, Tukey, Cauchy)
- **Entity-Driven:** Architecture where entities directly hold optimization variables
- **Value:** ScalarAutograd's type representing a differentiable scalar
- **Vec3/Vec2:** ScalarAutograd's vector types containing Value objects
- **DTO:** Data Transfer Object (serialization format with IDs)

### References

- ScalarAutograd documentation: https://github.com/user/ScalarAutograd
- sketch-demo: C:\Dev\ScalarAutograd\examples\sketch-demo
- Existing types: C:\Dev\Pictorigo\tasks\typescript-optimization-migration-types.ts
- Questions & answers: C:\Dev\Pictorigo\tasks\typescript-optimization-migration-questions.md

---

**Document Status:** Ready for Review
**Next Steps:**
1. Review and approve PRD
2. Begin Phase 1 implementation
3. Create detailed task breakdown for each phase
