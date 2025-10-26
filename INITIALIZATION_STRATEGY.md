# Camera and World Point Initialization During Optimization

## Overview

The optimization process uses a multi-stage initialization pipeline to establish initial 3D positions for world points and camera poses before running the bundle adjustment solver.

## Process Flow

```
optimizeProject()
  ├── Initialize World Points (Step 1-6)
  ├── Initialize Cameras (PnP or Essential Matrix)
  └── Run ConstraintSystem.solve()
```

---

## WORLD POINT INITIALIZATION

### Unified Initialization Pipeline

**Location:** `src/optimization/unified-initialization.ts`  
**Entry Point:** `initializeWorldPoints(points, lines, constraints, options)`

#### Step 1: Set Locked Points
- World points with fully locked coordinates (user-defined)
- Copy lockedXyz to optimizedXyz for all locked points

#### Step 2: Infer from Constraints
- Lines with targetLength + direction constraint
- Propagate positions through chains of constrained lines
- Directions: "x-aligned", "vertical", "z-aligned", "horizontal"
- Runs up to 10 iterations through the constraint graph

#### Step 3: Triangulate from Images
- World points visible in 2+ cameras with initialized positions
- Ray-ray triangulation: `triangulateRayRay()`
  - Unproject image points to rays in world space
  - Find closest point on two skew lines
  - Use fallbackDepth=10.0 if rays parallel

#### Step 4: Propagate Through Line Graph
- BFS through line connectivity from any initialized points
- Initialize uninitialized neighbors along connected lines
- Random direction + line.targetLength (or sceneScale * 0.2)

#### Step 5: Coplanar Groups
- Points in CoplanarPointsConstraint (4+ per plane)
- Arrange in grid on parallel planes
- planeZ = (index - numPlanes/2) * sceneScale * 0.3

#### Step 6: Random Fallback
- Uninitialized points get random 3D position in cube
- uniform(-0.5*sceneScale, 0.5*sceneScale) per axis

---

## CAMERA INITIALIZATION

### Strategy A: Perspective-n-Point (PnP)

**Location:** `src/optimization/pnp.ts`  
**Function:** `initializeCameraWithPnP(viewpoint, allWorldPoints)`

#### Requirements
- Camera with visible world points
- 3+ world points with optimizedXyz (4+ preferred)

#### Algorithm

Phase 1: Geometric Initial Guess
- Find all visible world points with optimizedXyz
- Compute centroid of visible points
- Estimate camera distance: max(maxDist * 2.5, 10)
- Position: [centroid.x, centroid.y, centroid.z - distance]
- Rotation: [1, 0, 0, 0] (identity/forward)

Phase 2: Refinement via Bundle Adjustment
- Create ConstraintSystem with world points FIXED
- Add this camera to optimization (pose only)
- Add reprojection constraints for visible points
- Run 100 iterations with tolerance 1e-6

Phase 3: Error Assessment
- Log initial and final reprojection error
- Return success/failure

#### When Used

1. First pass: If 4+ locked points visible
2. Second pass: After world point init, before optimization

#### Strengths
- Works with any point count (4+)
- Uses pre-initialized world points
- Bundle adjustment refinement
- Error metrics for diagnostics

---

### Strategy B: Essential Matrix Decomposition

**Location:** `src/optimization/essential-matrix.ts`  
**Function:** `initializeCamerasWithEssentialMatrix(camera1, camera2, baselineScale)`

#### Requirements
- Two uninitialized cameras
- 8+ shared image correspondences
- Correct matching (robust to outliers via 8+ points)

#### Algorithm

Phase 1: Build Correspondence Set
- Find world points visible in both cameras
- Normalize image coordinates via calibration

Phase 2: Estimate Essential Matrix
- 8-point algorithm from correspondences
- Solve A^T*A via eigendecomposition
- Enforce rank-2 via SVD

Phase 3: Decompose Essential Matrix
- 4 possible (R, t) pairs from SVD
- t = 3rd column of U (translation direction)

Phase 4: Cheirality Test
- For each decomposition, triangulate all points
- Count points in front of both cameras
- Select decomposition with max count

Phase 5: Set Camera Poses
- Camera 1: position=[0,0,0], rotation=[1,0,0,0]
- Camera 2: position=normalize(t)*baselineScale, rotation=quat(R)

#### When Used

```typescript
if no locked points AND 2+ uninitialized cameras:
  initializeCamerasWithEssentialMatrix(cam1, cam2, 10.0)
  // Other cameras then use PnP
```

#### Strengths
- No prior world points needed
- Initializes 2 cameras simultaneously
- Robust to matching errors (8+ points)

#### Limitations
- Translation scale ambiguous (baselineScale=10.0)
- Requires 8+ correspondences
- Only handles 2 cameras at a time

---

## Scale Parameters

- **Scene Scale:** 10.0 (default)
  - Bounds for random placement
  - Spacing in line propagation and coplanar grids
  
- **Baseline Scale:** 10.0 (default)
  - Essential Matrix translation scaling
  - Typically equals scene scale
  - Can be calibrated from known camera baseline

---

## Integration in optimize-project.ts

```typescript
optimizeProject(project, options: {
  autoInitializeCameras: true,
  autoInitializeWorldPoints: true
})

// 1. Initialize world points (Step 1-6)
unifiedInitialize(points, lines, constraints, { sceneScale: 10.0 })

// 2. Initialize cameras
// - Try PnP with locked points
// - Try Essential Matrix if needed
// - Try PnP with triangulated points

// 3. Run main optimization
system = new ConstraintSystem()
system.addPoint(...)
system.addLine(...)
system.addCamera(...)
system.addImagePoint(...)
system.addConstraint(...)
result = system.solve()

// 4. Detect outliers
detectOutliers(project, threshold=3.0)
```

---

## Console Output Examples

Unified Initialization:
```
[Step 1] Set 2 locked points
[Step 2] Inferred 5 points from constraints
[Step 3] Triangulated 8 points from images
[Step 4] Propagated 12 points through line graph
[Step 5] Initialized 3 points in 1 coplanar group
[Step 6] Random fallback for 4 points
[Unified Initialization] Complete: 34/34 points initialized
```

PnP Initialization:
```
PnP: Initialized Camera1 using 15 points
  Centroid: [5.234, -2.100, 8.567]
  Initial reprojection error: 45.23 px
  Final reprojection error: 2.15 px (47 iterations)
  Position: [5.234, -2.100, -22.558]
```

Essential Matrix:
```
[Essential Matrix] Found 24 correspondences
[Essential Matrix] Cheirality test for 4 decompositions:
  Solution 1: 24/24 points in front (SELECTED)
  Solution 2: 2/24 points in front
  Solution 3: 0/24 points in front
  Solution 4: 18/24 points in front
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/optimization/unified-initialization.ts` | World point initialization (6 steps) |
| `src/optimization/pnp.ts` | PnP camera initialization |
| `src/optimization/essential-matrix.ts` | Essential matrix decomposition |
| `src/optimization/triangulation.ts` | Ray-ray triangulation helpers |
| `src/optimization/optimize-project.ts` | Main orchestrator |
| `src/components/OptimizationPanel.tsx` | UI integration |
| `src/optimization/constraint-system.ts` | Main solver |

---

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| PnP needs 4+ points | Not enough world points init | Run world point init, add locked points |
| Essential Matrix needs 8+ | Cameras share <8 correspondences | Add more observations, different pair |
| High reprojection errors | Poor placement/matching errors | Check console logs, verify image points |
| Optimization doesn't converge | Degenerate initial config | Add constraints or locked points |

