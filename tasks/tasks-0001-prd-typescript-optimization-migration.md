# Task List: TypeScript-Based Optimization Migration

**Generated from:** `0001-prd-typescript-optimization-migration.md`
**Created:** 2025-10-10
**Status:** In Progress

## Relevant Files

### Core Type System
- `tasks/typescript-optimization-migration-types.ts` - Core entity definitions (WorldPoint, Camera, Line, Plane, Constraint, etc.). Already exists with complete type definitions.

### Optimization Core (NEW - Clean Rewrite)
- `frontend/src/optimization/camera-math.ts` - Camera projection math (quaternion→rotation, 3D→2D, distortion). **PARTIALLY COMPLETE** - has quaternion and projection functions.
- `frontend/src/optimization/camera-math.test.ts` - Unit tests for camera projection functions.
- `frontend/src/optimization/residuals/reprojection-residual.ts` - Reprojection error residual function (2 residuals per ImagePoint).
- `frontend/src/optimization/residuals/reprojection-residual.test.ts` - Unit tests for reprojection residuals.
- `frontend/src/optimization/residuals/line-residual.ts` - Line constraint residual functions (direction, length).
- `frontend/src/optimization/residuals/line-residual.test.ts` - Unit tests for line residuals.
- `frontend/src/optimization/residuals/plane-residual.ts` - Plane coplanarity residual using eigenvalue method.
- `frontend/src/optimization/residuals/plane-residual.test.ts` - Unit tests for plane residuals.
- `frontend/src/optimization/residuals/constraint-residuals.ts` - Distance, angle, parallel, perpendicular, collinear, coplanar, equal-distances, equal-angles residuals.
- `frontend/src/optimization/residuals/constraint-residuals.test.ts` - Unit tests for geometric constraint residuals.
- `frontend/src/optimization/residuals/index.ts` - Barrel export for all residual functions.
- `frontend/src/optimization/residual-collection.ts` - Collects all residuals from a Project into ResidualFunction array.
- `frontend/src/optimization/residual-collection.test.ts` - Unit tests for residual collection logic.
- `frontend/src/optimization/robust-losses.ts` - Huber, Tukey, Cauchy loss functions using ScalarAutograd.
- `frontend/src/optimization/robust-losses.test.ts` - Unit tests for robust loss functions.
- `frontend/src/optimization/solver.ts` - Main solver entrypoint: `solve(project: Project, options: SolverOptions): SolveResult`.
- `frontend/src/optimization/solver.test.ts` - Integration tests for solver (synthetic scenes with known solutions).

### Data Serialization Layer
- `frontend/src/serialization/dtos.ts` - DTO definitions with 6-char IDs (WorldPointDTO, ImageDTO, CameraDTO, LineDTO, PlaneDTO, ConstraintDTO, ProjectDTO).
- `frontend/src/serialization/conversion.ts` - Conversion functions (toDTO, fromDTO) for all entity types.
- `frontend/src/serialization/conversion.test.ts` - Round-trip serialization tests.
- `frontend/src/serialization/project-serialization.ts` - Project-level save/load (projectToJSON, projectFromJSON).
- `frontend/src/serialization/project-serialization.test.ts` - Project serialization tests.

### Frontend Integration
- `frontend/src/services/optimization.ts` - **DELETE AND REWRITE** - Currently uses legacy approach. Replace with pure TypeScript solver using ScalarAutograd.
- `frontend/src/services/optimization.test.ts` - Service-level tests for optimization integration.
- `frontend/src/services/fileManager.ts` - **UPDATE** - Replace server-based save/load with browser-based JSON download/upload.
- `frontend/src/components/OptimizationPanel.tsx` - **UPDATE** - Display solver diagnostics (EntityDiagnostic), convergence visualization.
- `frontend/src/components/SolverInterface.tsx` - **UPDATE** - UI for solver options and progress reporting.

### Golden Examples (Test Data)
- `frontend/src/optimization/__test-data__/golden-example-simple-scene.json` - 4 coplanar points, 2 cameras.
- `frontend/src/optimization/__test-data__/golden-example-room-reconstruction.json` - 8 corner points, 4 images.
- `frontend/src/optimization/__test-data__/golden-example-with-constraints.json` - Points + lines with fixed lengths.

### Notes
- **NO LEGACY CODE**: The existing `frontend/src/optimization/optimizer.ts` and `frontend/src/optimization/residuals.ts` are LEGACY. They use `ml-levenberg-marquardt` and primitive number arrays instead of ScalarAutograd's Value types. These files must be **DELETED** and completely rewritten.
- Use `npx jest [optional/path/to/test/file]` to run tests.
- All optimization code must use ScalarAutograd's `Value`, `Vec3`, `Vec2` types for automatic differentiation.
- Entities directly hold `Vec3`/`Vec2` of `Value` objects - NO ValueMap needed.

## Tasks

- [ ] 0.0 Review and finalize core type definitions
  - [x] 0.1 Review proposed core type definitions from PRD (types already exist in `tasks/typescript-optimization-migration-types.ts`)
  - [x] 0.2 Verify entity-driven architecture (entities hold Vec3/Vec2 of Values directly)
  - [x] 0.3 Confirm per-axis locking support (xLocked, yLocked, zLocked) - **COMPLETE**
  - [ ] 0.4 Final approval checkpoint before implementation begins

- [ ] 1.0 Implement camera projection math with ScalarAutograd
  - [x] 1.1 Implement quaternion-to-rotation-matrix conversion using V.square, V.mul, V.add, V.sub - **COMPLETE in camera-math.ts**
  - [x] 1.2 Implement Brown-Conrady distortion model (radial + tangential) using V primitives - **COMPLETE in camera-math.ts**
  - [x] 1.3 Implement full 3D→2D projection pipeline (transform, perspective divide, distortion, intrinsics) - **COMPLETE in camera-math.ts**
  - [x] 1.4 Add numerical stability safeguards (epsilon for division, abs for zc, clamps) - **COMPLETE in camera-math.ts**
  - [x] 1.5 Implement quaternion utility functions (normalize, identity, axisAngleToQuaternion) - **COMPLETE in camera-math.ts**
  - [ ] 1.6 Write comprehensive unit tests against known camera parameters and projection matrices
  - [ ] 1.7 Validate quaternion-to-rotation matrix matches expected results for identity, 90° rotations, arbitrary quaternions

- [ ] 2.0 Implement residual functions using entity-driven architecture
  - [ ] 2.1 Implement ReprojectionResidual class
    - [ ] 2.1.1 Create ReprojectionResidual implementing ResidualFunction interface
    - [ ] 2.1.2 Implement compute() accessing imagePoint.worldPoint.position directly (Vec3)
    - [ ] 2.1.3 Use projectPoint from camera-math.ts to get projected Vec2
    - [ ] 2.1.4 Return [V.sub(projected.x, observed.x), V.sub(projected.y, observed.y)]
    - [ ] 2.1.5 Write unit tests with synthetic world point, camera, and observed UV
  - [ ] 2.2 Implement LineResidual class (composite residual - variable number)
    - [ ] 2.2.1 Create LineResidual implementing ResidualFunction interface
    - [ ] 2.2.2 Access line.start.position and line.end.position directly (Vec3 of Values)
    - [ ] 2.2.3 Implement length constraint: `V.sub(actualLength, V.C(targetLength))`
    - [ ] 2.2.4 Implement direction constraints (horizontal, vertical, x-aligned, z-aligned) using vector components
    - [ ] 2.2.5 Return variable-length array of residuals based on enabled constraints
    - [ ] 2.2.6 Write unit tests for each direction type and length constraint
  - [ ] 2.3 Implement PlaneResidual class using eigenvalue method
    - [ ] 2.3.1 Create PlaneResidual implementing ResidualFunction interface
    - [ ] 2.3.2 Access plane.points[].position (array of Vec3)
    - [ ] 2.3.3 Compute centroid using V.add and V.div
    - [ ] 2.3.4 Build covariance matrix (3x3) from centered points
    - [ ] 2.3.5 Use Matrix3x3.smallestEigenvalue() to get coplanarity measure
    - [ ] 2.3.6 Return single residual (smallest eigenvalue, should be ~0 for coplanar points)
    - [ ] 2.3.7 Write unit tests with 4 coplanar points and 4 non-coplanar points
  - [ ] 2.4 Implement geometric constraint residuals
    - [ ] 2.4.1 DistanceConstraint: `V.sub(distance, V.C(target))` where distance = posB.sub(posA).magnitude
    - [ ] 2.4.2 AngleConstraint: Use V.acos(V.dot(v1.normalize(), v2.normalize())) with clamping
    - [ ] 2.4.3 ParallelLinesConstraint: Cross product of direction vectors should be zero
    - [ ] 2.4.4 PerpendicularLinesConstraint: Dot product of direction vectors should be zero
    - [ ] 2.4.5 CollinearPointsConstraint: Pairwise cross products with first segment direction
    - [ ] 2.4.6 CoplanarPointsConstraint: Use eigenvalue method similar to PlaneResidual
    - [ ] 2.4.7 EqualDistancesConstraint: Pairwise differences between distances
    - [ ] 2.4.8 EqualAnglesConstraint: Pairwise differences between angles
    - [ ] 2.4.9 Write comprehensive unit tests for each constraint type

- [ ] 3.0 Implement residual collection and cost function
  - [ ] 3.1 Implement collectResiduals(project: Project): ResidualFunction[]
    - [ ] 3.1.1 Iterate over project.images[].imagePoints[] and create ReprojectionResidual for each
    - [ ] 3.1.2 Iterate over project.lines[] and create LineResidual for each (if constraints enabled)
    - [ ] 3.1.3 Iterate over project.planes[] and create PlaneResidual for each
    - [ ] 3.1.4 Iterate over project.constraints[] and create appropriate ConstraintResidual for each enabled constraint
    - [ ] 3.1.5 Return flat array of all ResidualFunction instances
  - [ ] 3.2 Implement robust loss function wrapper
    - [ ] 3.2.1 Implement Huber loss using Losses.huber(residual, scale) from ScalarAutograd
    - [ ] 3.2.2 Implement Tukey loss using Losses.tukey(residual, scale) from ScalarAutograd
    - [ ] 3.2.3 Implement Cauchy loss using V.log(V.add(V.C(1), V.square(V.div(residual, scale))))
    - [ ] 3.2.4 Create applyRobustLoss(residual: Value, lossType, scale) helper
    - [ ] 3.2.5 Write tests comparing robust vs non-robust on outlier-heavy data
  - [ ] 3.3 Implement total cost function computation
    - [ ] 3.3.1 Create buildCostFunction(residuals: ResidualFunction[], robustLoss?) that returns totalCost: Value
    - [ ] 3.3.2 For each residual function, call compute() to get Value[] array
    - [ ] 3.3.3 For each residual, apply robust loss (if enabled): ρ(r²) instead of r²
    - [ ] 3.3.4 Sum all weighted squared residuals: Σ ρ(r²) using V.add
    - [ ] 3.3.5 Return single Value representing total cost
  - [ ] 3.4 Write integration tests
    - [ ] 3.4.1 Test residual collection on project with 5 points, 2 images, 3 lines, 1 plane
    - [ ] 3.4.2 Verify correct number of residuals (2 per image point, variable per line, etc.)
    - [ ] 3.4.3 Test cost function produces single Value that can be differentiated

- [ ] 4.0 Integrate Levenberg-Marquardt solver from ScalarAutograd
  - [ ] 4.1 Study ScalarAutograd's LM API
    - [ ] 4.1.1 Review ScalarAutograd examples (especially sketch-demo) for LM usage patterns
    - [ ] 4.1.2 Understand how to pass cost function (Value) and get optimized parameters
    - [ ] 4.1.3 Identify how to set LM options (damping, max iterations, tolerance)
  - [ ] 4.2 Implement solve(project: Project, options: SolverOptions): SolveResult
    - [ ] 4.2.1 Collect all residuals using collectResiduals(project)
    - [ ] 4.2.2 Build cost function with robust loss (if specified in options)
    - [ ] 4.2.3 Call ScalarAutograd's LM solver with cost function
    - [ ] 4.2.4 Extract optimized Values and update entity positions in-place
    - [ ] 4.2.5 Compute final cost and convergence metrics
    - [ ] 4.2.6 Return SolveResult with success, iterations, finalCost, convergenceReason
  - [ ] 4.3 Implement entity diagnostics for UI feedback
    - [ ] 4.3.1 For each entity (WorldPoint, Line, Plane, Constraint), compute per-entity error
    - [ ] 4.3.2 Break down error by component (e.g., Line: length error, direction error)
    - [ ] 4.3.3 Build EntityDiagnostic with totalError, components[], satisfied boolean
    - [ ] 4.3.4 Populate SolveResult.entityDiagnostics Map
    - [ ] 4.3.5 Write tests to verify diagnostics correctly identify which constraints are violated
  - [ ] 4.4 Add iteration callback for progress reporting
    - [ ] 4.4.1 Extend SolverOptions to include optional onIteration callback
    - [ ] 4.4.2 Hook into LM solver's iteration loop (if ScalarAutograd supports callbacks)
    - [ ] 4.4.3 Report current cost, iteration number, and convergence status to callback
    - [ ] 4.4.4 Test with mock callback to verify progress updates

- [ ] 5.0 Create comprehensive test suite for solver
  - [ ] 5.1 Write synthetic scene tests with known solutions
    - [ ] 5.1.1 Test 1: 4 corners of unit square at z=0, 2 cameras at known poses
    - [ ] 5.1.2 Add noise to initial point positions, verify solver converges to ground truth
    - [ ] 5.1.3 Test 2: 8 corners of unit cube, verify all points converge correctly
    - [ ] 5.1.4 Test 3: Line with fixed length - verify length constraint is satisfied after optimization
    - [ ] 5.1.5 Test 4: Plane with 5 points - verify coplanarity after optimization
  - [ ] 5.2 Create golden example projects
    - [ ] 5.2.1 Simple scene: 4 coplanar points, 2 cameras, save as JSON with expected final positions
    - [ ] 5.2.2 Room reconstruction: 8 corner points, 4 images, save as JSON
    - [ ] 5.2.3 With constraints: 12 points forming a grid, lines with fixed lengths, save as JSON
    - [ ] 5.2.4 For each example, run solver and verify results match expected positions within tolerance (1mm)
  - [ ] 5.3 Test robust loss functions
    - [ ] 5.3.1 Create scene with 10% outlier image points (deliberately wrong UV coordinates)
    - [ ] 5.3.2 Compare convergence with no robust loss vs Huber vs Tukey
    - [ ] 5.3.3 Verify robust losses reduce outlier influence (final error lower, inliers fit better)
  - [ ] 5.4 Performance benchmarks
    - [ ] 5.4.1 Benchmark typical scene (10-20 points, 3-5 images) - target <2 seconds
    - [ ] 5.4.2 Benchmark large scene (100 points, 10 images) - document performance
    - [ ] 5.4.3 Profile hot paths if performance is below target

- [ ] 6.0 Implement data serialization layer (DTOs with 6-char IDs)
  - [ ] 6.1 Define DTO interfaces in serialization/dtos.ts
    - [ ] 6.1.1 WorldPointDTO with id, name, x, y, z, pinned, xLocked, yLocked, zLocked, observationIds[]
    - [ ] 6.1.2 ImagePointDTO with id, u, v, worldPointId, imageId
    - [ ] 6.1.3 ImageDTO with id, name, width, height, cameraId, imagePointIds[], imageData?
    - [ ] 6.1.4 CameraDTO with id, fx, fy, cx, cy, distortion[], position (x,y,z), rotation (w,x,y,z), fixed
    - [ ] 6.1.5 LineDTO with id, name, startPointId, endPointId, color, constraints (direction, targetLength)
    - [ ] 6.1.6 PlaneDTO with id, name, pointIds[], color, constraints (orientation, offset)
    - [ ] 6.1.7 ConstraintDTO (union type) with id, type, and type-specific fields using IDs
    - [ ] 6.1.8 ProjectDTO with name, description, worldPoints[], images[], cameras[], lines[], planes[], constraints[], solverOptions
  - [ ] 6.2 Implement conversion functions (entity → DTO)
    - [ ] 6.2.1 worldPointToDTO(wp: WorldPoint, id: string): WorldPointDTO - extract .val() from position.x/y/z
    - [ ] 6.2.2 imagePointToDTO(ip: ImagePoint, id: string, worldPointId: string, imageId: string): ImagePointDTO
    - [ ] 6.2.3 cameraToDTO(camera: Camera, id: string): CameraDTO - extract .val() from position and rotation Values
    - [ ] 6.2.4 imageToDTO(image: Image, id: string, cameraId: string, imagePointIds: string[]): ImageDTO
    - [ ] 6.2.5 lineToDTO(line: Line, id: string, startId: string, endId: string): LineDTO
    - [ ] 6.2.6 planeToDTO(plane: Plane, id: string, pointIds: string[]): PlaneDTO
    - [ ] 6.2.7 constraintToDTO(constraint: Constraint, id: string, entityIdMap): ConstraintDTO
    - [ ] 6.2.8 Write tests for each toDTO function
  - [ ] 6.3 Implement conversion functions (DTO → entity)
    - [ ] 6.3.1 worldPointFromDTO(dto: WorldPointDTO): WorldPoint - create Vec3 with V.W() or V.C() based on locks
    - [ ] 6.3.2 cameraFromDTO(dto: CameraDTO): Camera - create Vec3 and Quaternion from values
    - [ ] 6.3.3 imagePointFromDTO(dto: ImagePointDTO, worldPoint: WorldPoint, image: Image): ImagePoint
    - [ ] 6.3.4 imageFromDTO(dto: ImageDTO, camera: Camera, imagePoints: ImagePoint[]): Image
    - [ ] 6.3.5 lineFromDTO(dto: LineDTO, start: WorldPoint, end: WorldPoint): Line
    - [ ] 6.3.6 planeFromDTO(dto: PlaneDTO, points: WorldPoint[]): Plane
    - [ ] 6.3.7 constraintFromDTO(dto: ConstraintDTO, entityMap): Constraint
    - [ ] 6.3.8 Write tests for each fromDTO function
  - [ ] 6.4 Implement project-level serialization
    - [ ] 6.4.1 projectToJSON(project: Project): string
      - [ ] 6.4.1.1 Generate 6-char IDs for all entities (wp_xxx, ip_xxx, im_xxx, cam_xx, ln_xxx, pl_xxx, cs_xxx)
      - [ ] 6.4.1.2 Build entity ID maps for reference resolution
      - [ ] 6.4.1.3 Convert all entities to DTOs using toDTO functions
      - [ ] 6.4.1.4 Build ProjectDTO with all DTO arrays
      - [ ] 6.4.1.5 JSON.stringify with pretty printing
    - [ ] 6.4.2 projectFromJSON(json: string): Project
      - [ ] 6.4.2.1 Parse JSON to ProjectDTO
      - [ ] 6.4.2.2 Validate DTO structure (all IDs exist, references valid)
      - [ ] 6.4.2.3 Create WorldPoints first (no dependencies)
      - [ ] 6.4.2.4 Create Cameras
      - [ ] 6.4.2.5 Create ImagePoints (references WorldPoints)
      - [ ] 6.4.2.6 Create Images (references Camera and ImagePoints)
      - [ ] 6.4.2.7 Create Lines (references WorldPoints)
      - [ ] 6.4.2.8 Create Planes (references WorldPoints)
      - [ ] 6.4.2.9 Create Constraints (references various entities)
      - [ ] 6.4.2.10 Build and return Project
    - [ ] 6.4.3 Write round-trip tests
      - [ ] 6.4.3.1 Create project with all entity types
      - [ ] 6.4.3.2 Serialize to JSON
      - [ ] 6.4.3.3 Deserialize from JSON
      - [ ] 6.4.3.4 Verify all entities match original (within floating-point tolerance)
      - [ ] 6.4.3.5 Verify all references correctly resolved

- [ ] 7.0 Integrate solver into frontend (replace Python backend)
  - [ ] 7.1 Delete legacy optimization code
    - [ ] 7.1.1 **DELETE** `frontend/src/optimization/optimizer.ts` (uses ml-levenberg-marquardt, violates NO LEGACY)
    - [ ] 7.1.2 **DELETE** `frontend/src/optimization/residuals.ts` (uses primitive arrays, violates NO LEGACY)
    - [ ] 7.1.3 **DELETE** any imports/references to `ml-levenberg-marquardt` library
    - [ ] 7.1.4 Remove `ml-levenberg-marquardt` from package.json dependencies
  - [ ] 7.2 Rewrite optimization service
    - [ ] 7.2.1 Update `services/optimization.ts` to use new solver.ts
    - [ ] 7.2.2 Replace Python API calls with direct calls to solve(project, options)
    - [ ] 7.2.3 Implement async wrapper for UI responsiveness (use setTimeout or Web Worker)
    - [ ] 7.2.4 Add progress callbacks for UI updates during optimization
    - [ ] 7.2.5 Write service-level tests
  - [ ] 7.3 Update OptimizationPanel UI component
    - [ ] 7.3.1 Display solver options (maxIterations, tolerance, robustLoss type/scale)
    - [ ] 7.3.2 Show real-time progress during optimization (iteration, current cost)
    - [ ] 7.3.3 Display EntityDiagnostic results after solve (per-entity error breakdown)
    - [ ] 7.3.4 Show convergence visualization (cost over iterations chart)
    - [ ] 7.3.5 Highlight violated constraints in red, satisfied in green
  - [ ] 7.4 Update file operations to browser-based
    - [ ] 7.4.1 Remove server-based save endpoint calls from fileManager.ts
    - [ ] 7.4.2 Implement browser-based file save using Blob and URL.createObjectURL
    - [ ] 7.4.3 Trigger download via temporary <a> element with download attribute
    - [ ] 7.4.4 Remove server-based load endpoint calls
    - [ ] 7.4.5 Implement browser-based file load using FileReader API
    - [ ] 7.4.6 Add drag-and-drop support for .json project files
    - [ ] 7.4.7 Test save/load workflow end-to-end

- [ ] 8.0 End-to-end testing and quality assurance
  - [ ] 8.1 Load and solve golden example projects
    - [ ] 8.1.1 Load golden-example-simple-scene.json in UI
    - [ ] 8.1.2 Verify initial visualization shows correct points/cameras
    - [ ] 8.1.3 Run optimization, verify convergence
    - [ ] 8.1.4 Visually inspect final 3D reconstruction matches expected geometry
    - [ ] 8.1.5 Repeat for room reconstruction and with-constraints examples
  - [ ] 8.2 Manual QA checklist
    - [ ] 8.2.1 Create new project from scratch (add points, images, cameras)
    - [ ] 8.2.2 Add image point observations (click on images to mark features)
    - [ ] 8.2.3 Add lines with direction constraints
    - [ ] 8.2.4 Add plane with coplanarity constraint
    - [ ] 8.2.5 Run optimization, verify solver diagnostics display correctly
    - [ ] 8.2.6 Save project to JSON file
    - [ ] 8.2.7 Reload project from JSON file, verify all data intact
    - [ ] 8.2.8 Test per-axis locking (lock Z=0 for ground plane points)
  - [ ] 8.3 Performance validation
    - [ ] 8.3.1 Typical scene (10-20 points, 3-5 images) solves in <2 seconds ✅
    - [ ] 8.3.2 UI remains responsive during optimization (no freezing)
    - [ ] 8.3.3 File save/load completes in <100ms for typical project
  - [ ] 8.4 Accuracy validation
    - [ ] 8.4.1 Compare TypeScript solver results with Python solver on same input (if Python solver still available)
    - [ ] 8.4.2 Verify reprojection errors are comparable (within 0.1 pixels)
    - [ ] 8.4.3 Verify 3D point positions match within 1mm
    - [ ] 8.4.4 Document any systematic differences

- [ ] 9.0 Final cleanup and deployment preparation
  - [ ] 9.1 Remove all Python backend code
    - [ ] 9.1.1 Delete Python backend directory (if it exists in repo)
    - [ ] 9.1.2 Remove any Python-related dependencies, Docker configs, deployment scripts
    - [ ] 9.1.3 Verify no Python imports or references remain in codebase
    - [ ] 9.1.4 Update README to remove Python setup instructions
  - [ ] 9.2 Configure for static site deployment
    - [ ] 9.2.1 Verify Vite build produces static HTML/JS/CSS bundle
    - [ ] 9.2.2 Test production build locally (npm run build && npm run preview)
    - [ ] 9.2.3 Configure routing for single-page app (all routes -> index.html)
    - [ ] 9.2.4 Set up deployment to GitHub Pages or Netlify
    - [ ] 9.2.5 Deploy and test in production environment
  - [ ] 9.3 Documentation
    - [ ] 9.3.1 Write user guide for optimization workflow (adding points, running solver)
    - [ ] 9.3.2 Document solver options (when to use robust losses, how to tune parameters)
    - [ ] 9.3.3 Create developer architecture guide explaining entity-driven design
    - [ ] 9.3.4 Document ScalarAutograd integration patterns
    - [ ] 9.3.5 Add troubleshooting section for common issues
  - [ ] 9.4 Final validation
    - [ ] 9.4.1 Run full test suite (npm run test) - all tests pass ✅
    - [ ] 9.4.2 Run type checker (npm run type-check) - no errors ✅
    - [ ] 9.4.3 Run linter (npm run lint) - no errors ✅
    - [ ] 9.4.4 Verify NO Python code remains (grep -r "\.py$" returns empty)
    - [ ] 9.4.5 Verify application works end-to-end in production deployment

## Notes

### Key Principle: NO LEGACY
This is a **complete clean rewrite**. The existing `frontend/src/optimization/optimizer.ts` and `frontend/src/optimization/residuals.ts` are LEGACY CODE that must be **DELETED**. They violate the core architecture:
- Use `ml-levenberg-marquardt` instead of ScalarAutograd
- Use primitive `number[]` arrays instead of `Value` types
- No automatic differentiation
- Not entity-driven

### Entity-Driven Architecture
Entities directly hold `Vec3`/`Vec2` of `Value` objects - NO ValueMap needed! Example:
```typescript
const point: WorldPoint = {
  position: new Vec3(V.W(1.0), V.C(0.0), V.W(2.0)), // x free, y locked at 0, z free
  xLocked: false,
  yLocked: true,
  zLocked: false,
  // ...
};
```

Residual functions access entity positions directly:
```typescript
compute(): Value[] {
  const worldPos = this.imagePoint.worldPoint.position; // Already Vec3 of Values!
  const projected = projectPoint(worldPos, camera);
  return [V.sub(projected.x, observed.x), V.sub(projected.y, observed.y)];
}
```

### Current Status
- **Phase 1.1 (Camera Projection)**: ✅ COMPLETE - camera-math.ts has quaternion, distortion, projection functions
- **Phase 1.2 (Residual Functions)**: 🚧 IN PROGRESS - Starting with this task list
- Types already finalized with per-axis locking support

### Testing Strategy
- Unit tests for each component (camera math, each residual type)
- Integration tests for solver on synthetic scenes
- Golden example projects with known ground truth
- Manual QA workflow testing
