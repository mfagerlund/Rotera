# Test Execution Times

Generated: 2025-12-19T12:14:12.834Z

| Duration (ms) | Status | Test |
|---------------|--------|------|
|    15175 |      ✓ | Balcony House X vs Z Line comparison > should compare X-line and Z-line initialization and solving |
|    14212 |      ✓ | Regression Fixtures - Essential Matrix > minimal-15-point-3-axis.json should have total error < 2 |
|     9576 |      X | Balcony House Z-Line optimization > should solve Z-axis line constraint with median error < 3px |
|     8920 |      ✓ | GOLDEN: No-Axis No-Lines (Essential Matrix + Free Solve, minimal constraints) > should solve 8+8 two-camera scene with 2 locked points (no lines, no constraints) |
|     8147 |      ✓ | GOLDEN: Essential Matrix with Coplanar Constraint and Free Point > should solve with coplanar constraint and single-view free point |
|     7817 |      ✓ | Optimization Determinism > should produce consistent results for two-camera-vl-non-vl-user.json over 10 runs |
|     7791 |      ✓ | Balcony House X-Line optimization > should solve X-axis line constraint with median error < 3px |
|     7522 |      ✓ | GOLDEN-5: Mixed Constraints > should solve cube with length, direction, and coplanarity constraints simultaneously |
|     6585 |      ✓ | 🧪 OptimizationService > Bundle Adjustment > starts optimization with project data |
|     5178 |      ✓ | Regression Fixtures - Essential Matrix > two-axis-y-sign-ambiguity.json should have total error < 2 |
|     5070 |      ✓ | GOLDEN: No-Axis Lines (Essential Matrix + Free Solve) > should produce deterministic results across multiple runs |
|     4063 |      ✓ | Regression Fixtures - Balcony Houses > Balcony House Z Line.json should have total error < 4 |
|     3965 |      ✓ | GOLDEN: No-Axis Lines (Essential Matrix + Free Solve) > should solve 8+8 two-camera scene without axis constraints on lines |
|     3558 |      ✓ | Regression Fixtures - Balcony Houses > Balcony House Lines.json should have total error < 2 |
|     3428 |      ✓ | Regression Fixtures - Balcony Houses > Balcony House 2 With Balcony Points.json should have total error < 2 |
|     2488 |      ✓ | Corre Essential Matrix Debug > should initialize and optimize the Corre project correctly |
|     1994 |      ✓ | Regression Fixtures - Essential Matrix > minimal-8-point-v2.json should have total error < 2 |
|     1951 |      ✓ | Debug VL Fixture > should debug the No Vanisining Lines Now With VL fixture |
|     1930 |      ✓ | Regression Fixtures - Essential Matrix > minimal-8-point-3-axis.json should have total error < 2 |
|     1799 |      ✓ | Balcony House optimization > should solve full Balcony House with median error < 3px |
|     1787 |      ✓ | Regression Fixtures - Balcony Houses > Balcony House No Lines.json should have total error < 2 |
|     1717 |      ✓ | Multi-camera fixture with C2 PnP initialization > should solve all 3 cameras with reasonable reprojection error |
|     1623 |      ✓ | Debug Two-Camera VL+non-VL > should analyze why it fails |
|     1343 |      ✓ | Regression Fixtures - Balcony Houses > Balcony House Y Line.json should have total error < 2 |
|      947 |      ✓ | Should Be Good fixture > prefers pixel observations when vanishing lines are sign-flipped |
|      875 |      ✓ | Camera Orientation Fix - User Fixture > should handle Y-axis disambiguation via inferred points |
|      714 |      ✓ | Regression Fixtures - Calibration > Fixture With 2 Image 2.json should have total error < 2 |
|      661 |      ✓ | PnP Camera Initialization > should initialize camera using geometric heuristic |
|      639 |      ✓ | Regression Fixtures - Balcony Houses > Balcony House Y and Z Line.json should have total error < 2 |
|      622 |      ✓ | 🧪 OptimizationService > Bundle Adjustment > can cancel optimization |
|      615 |      ✓ | Regression Fixtures - Calibration > No Vanisining Lines.json should have total error < 2.1 |
|      578 |      ✓ | Regression Fixtures - Multi-Camera VL > VL-and-non-VL-two-cameras.json should have total error < 10 |
|      571 |      ✓ | PnP-only initialization from clean state > should produce same result whether or not fixture had pre-populated optimizedXyz |
|      523 |      ✓ | GOLDEN-7: Full Bundle Adjustment (CORRECT VERSION) > should recover cameras and points from PnP initialization |
|      510 |      ✓ | 🧪 OptimizationService > Bundle Adjustment > handles optimization progress updates |
|      493 |      ✓ | PnP-only initialization from clean state > should work WITHOUT vanishing lines when constrained points have lockedXyz |
|      475 |      ✓ | Regression Fixtures - Calibration > Fixture With 2 Images.json should have total error < 3 |
|      468 |      ✓ | Solving Scenarios - Phase 2: Two Camera Systems > Scenario 6: Two Cameras with Scale > should initialize two cameras and resolve scale from locked points |
|      456 |      ✓ | Optimization Determinism > should produce consistent results for single-camera-vl-baseline.json over 10 runs |
|      437 |      ✓ | Regression Fixtures - Balcony Houses > Balcony House X,Y and Z Lines.json should have total error < 2 |
|      369 |      ✓ | GOLDEN-SCENARIO-12: Synthetic Recreation > should achieve near-zero reprojection error with scenario-12 geometry and synthetic image points |
|      355 |      ✓ | Solving Scenarios - Phase 2: Two Camera Systems > Scenario 5: Essential Matrix Initialization > should initialize two cameras using Essential Matrix with arbitrary scale |
|      337 |      ✓ | Inference Single Camera > should solve single camera with inferred coordinates from axis-aligned lines |
|      311 |      ✓ | Should Be Simple fixture > should successfully optimize single camera with 4 locked points |
|      311 |      ✓ | Y Convention Invariance > should produce equal quality for both conventions |
|      309 |      ✓ | 🧪 OptimizationService > Error Handling > provides fallback simulation when backend unavailable |
|      306 |      ✓ | GOLDEN-8: Bundle Adjustment with Geometric Constraints > should achieve better accuracy with geometric constraints than image-only BA |
|      301 |      ✓ | Camera Orientation Fix - User Fixture > should achieve low reprojection error after optimization |
|      301 |      ✓ | Solving Scenarios - Phase 3: Complex Constraints > Scenario 8: Length-Constrained Lines > should initialize cameras and satisfy length constraints |
|      290 |      ✓ | Right-handed coordinate system > should produce right-handed result from "From Below" fixture |
|      273 |      ✓ | Coordinate Sign Invariance > should produce similar quality results for both coordinate systems |
|      267 |      ✓ | Solving Scenarios - Phase 1: Single Camera Initialization > Scenario 2: PnP with Bundle Adjustment > should initialize camera with PnP from locked points and refine partially locked points |
|      263 |      ✓ | Coordinate Sign Invariance > should solve the GOOD fixture (negative Y) with low error |
|      252 |      ✓ | Y Convention Invariance > should work with -Y up convention (original) |
|      214 |      ✓ | 🧪 OptimizationService > Camera Calibration > performs camera calibration |
|      202 |      ✓ | Solving Scenarios - Phase 1: Single Camera Initialization > Scenario 1: Simple PnP (Baseline) > should initialize camera using PnP and achieve low reprojection error |
|      197 |      ✓ | Line Serialization > throws if endpoints not registered |
|      194 |      ✓ | Solving Scenarios - Phase 4: Single Camera with Inferred Coordinates > Scenario 11: Single Camera with VP Initialization Using Inferred Coordinates > should initialize camera using vanishing points with inferred world point coordinates |
|      193 |      ✓ | 7-Point Essential Matrix Algorithm > should block optimization when insufficient correspondences for initial cameras |
|      192 |      ✓ | Coordinate Sign Invariance > should solve the REFLECTED fixture (positive Y) with low error |
|      166 |      ✓ | ProjectionConstraint - Camera Bundle Adjustment > Simple Projection > should optimize camera pose to match multiple observed pixels |
|      165 |      ✓ | Y Convention Invariance > should work with +Y up convention (convert from -Y up by flipping Y and Z) |
|      164 |      ✓ | GOLDEN-1: Two-View Point Reconstruction > should perfectly reconstruct cube corners from two known cameras |
|      158 |      ✓ | Simplest fixture (4 locked points, 9 vanishing lines) > should solve with low reprojection error despite garbage intrinsics in fixture |
|      158 |      ✓ | ImagePoint Serialization > throws if dependencies not registered |
|      155 |      ✓ | GOLDEN-4: Coplanarity Constraints > should enforce coplanarity constraint for multiple planes |
|      154 |      ✓ | GOLDEN-3: Line Direction Constraints > should enforce horizontal, vertical, and axis-aligned direction constraints |
|      139 |      ✓ | GOLDEN-VP: Single Camera with Vanishing Point Initialization > should achieve near-zero reprojection error with analytically generated image points |
|      116 |      ✓ | Solving Scenarios - Phase 3: Complex Constraints > Scenario 7: Mixed VP + PnP > should initialize Camera1 with VP and Camera2 with PnP |
|      115 |      ✓ | 🧪 OptimizationService > Point Cloud Alignment > aligns point clouds successfully |
|      108 |      ✓ | GOLDEN-2: Line-Constrained Reconstruction > should reconstruct cube with line constraints from partial visibility |
|      104 |      ✓ | 🧪 OptimizationService > Constraint Optimization > optimizes constraints on project |
|      100 |      ✓ | ProjectionConstraint - Camera Bundle Adjustment > Bundle Adjustment > should triangulate point from multiple camera views |
|       92 |      ✓ | Corre Essential Matrix Debug > should test Essential Matrix initialization directly |
|       91 |      ✓ | Camera Frustum Alignment > should test with a synthetic camera to isolate the math |
|       90 |      ✓ | Two Images Four Points Fixture > should recognize line constraints and allow optimization |
|       88 |      ✓ | Regression Fixtures - Calibration > Full Solve.json should have total error < 2 |
|       84 |      ✓ | Solving Scenarios - Phase 4: Single Camera with Inferred Coordinates > Axis Sign Correction > should ensure all locked axis signs match after solving |
|       81 |      ✓ | Solving Scenarios - Phase 4: Single Camera with Inferred Coordinates > Scenario 12: Two Locked Points - Debug High Reprojection Error > should achieve low reprojection error with precise clicks |
|       79 |      ✓ | Solving Scenarios - Phase 4: Single Camera with Inferred Coordinates > Scenario 11: Single Camera with VP Initialization Using Inferred Coordinates > should use partial inferred coordinates and solve for unknowns via optimization |
|       70 |      ✓ | Real Data Optimization > should run optimization on real data |
|       66 |      ✓ | 7-Point Essential Matrix Algorithm > should handle 8+ points using 8-point algorithm |
|       66 |      ✓ | Camera Orientation Fix - User Fixture > should initialize camera with VP and have all points IN FRONT of camera |
|       65 |      ✓ | Horizon Sign Invariance > should produce correct camera orientation for good horizon case (Y=+10) |
|       64 |      ✓ | 7-Point Essential Matrix Algorithm > should initialize two cameras from exactly 7 point correspondences |
|       64 |      ✓ | Regression Fixtures - Poor Solves (Investigation Needed) > Three Boxes.json should have total error < 17 |
|       56 |      ✓ | Regression Fixtures - Calibration > Fixture With 2-1 Image 2.json should have total error < 2 |
|       54 |      ✓ | Solving Scenarios - Phase 4: Single Camera with Inferred Coordinates > VP Initialization with Positive Coordinates > should work with Y=+10 (stillwrong fixture) |
|       53 |      ✓ | Perspective Grid Homography > DISABLED - old test using line endpoints |
|       51 |      ✓ | Horizon Sign Invariance > should handle both Y polarities with similar quality (using corrected fixture) |
|       51 |      ✓ | Serialization Integration Tests > complex project round-trip preserves all data |
|       48 |      ✓ | Solving Scenarios - Phase 4: Single Camera with Inferred Coordinates > Axis Sign Correction > should correct X axis sign when locked X is positive but solved is negative |
|       46 |      ✓ | Solving Scenarios - Phase 4: Single Camera with Inferred Coordinates > VP Initialization with Positive Coordinates > should work with Y=-10 (stillwrong fixture) |
|       46 |      ✓ | Solving Scenarios - Phase 4: Single Camera with Inferred Coordinates > Axis Sign Correction > should correct Y axis sign when locked Y is positive but solved is negative |
|       45 |      ✓ | Solving Scenarios - Phase 4: Single Camera with Inferred Coordinates > Axis Sign Correction > should correct Z axis sign when locked Z is positive but solved is negative |
|       43 |      ✓ | ImagePoint Serialization > serializes image point |
|       43 |      ✓ | Rotation Convention Test > should check if quaternion and matrix conversions are consistent |
|       41 |      ✓ | Solving Scenarios - Phase 4: Single Camera with Inferred Coordinates > Scenario 13: Single Fixed Point with Line Length Constraint > should solve when scale is provided via line targetLength |
|       39 |      ✓ | ConstraintSystem - All Constraint Types > Complex scenarios > should solve multiple constraints simultaneously |
|       39 |      ✓ | GOLDEN-6: Camera Intrinsic Optimization > MANUAL TEST: demonstrates camera intrinsic optimization capability |
|       39 |      ✓ | Regression Fixtures - Multi-Camera VL > VL-only-single-camera.json should have total error < 2 |
|       37 |      ✓ | ConstraintSystem - All Constraint Types > CoplanarPointsConstraint > should make 4 points coplanar |
|       36 |      ✓ | Real Data Optimization > should respect line constraints during optimization |
|       32 |      ✓ | Entity Deletion Cleanup Tests > Viewpoint deletion > deleting viewpoint removes all associated image points |
|       32 |      ✓ | Perspective Grid Homography > should verify vanishing lines actually pass through image canvas |
|       32 |      ✓ | Regression Fixtures - Minimal > Minimal VL.json should have total error < 2 |
|       30 |      ✓ | Real Data Optimization > should convert constraints to entities |
|       29 |      ✓ | Real Data Optimization > should convert project data to entities |
|       28 |      ✓ | Solving Scenarios - Phase 4: Single Camera with Inferred Coordinates > VP Initialization with Positive Coordinates > should achieve sub-pixel accuracy with positive locked coordinates and vanishing lines |
|       27 |      ✓ | Entity Deletion Cleanup Tests > Full project teardown > can delete all entities in any order without orphans |
|       26 |      ✓ | 🧪 OptimizationService > Bundle Adjustment > validates optimization options |
|       24 |      ✓ | Horizon Sign Invariance > should produce correct camera orientation for bad horizon case (Y=-10) - CORRECTED FIXTURE |
|       20 |      ✓ | FixedPointConstraint - Solver Integration > should lock point to arbitrary target position |
|       19 |      ✓ | Serialization Integration Tests > project with viewpoints and image points round-trip |
|       19 |      ✓ | Intrinsic Constraints > Multiple Lines with Intrinsic Constraints > should solve multiple lines each with their own intrinsic constraints |
|       16 |      ✓ | Simple Length Constraint Test > should adjust two points to satisfy target length constraint |
|       15 |      ✓ | ProjectionConstraint - Camera Bundle Adjustment > Bundle Adjustment > should jointly optimize camera pose and point positions |
|       14 |      ✓ | SerializationContext > throws if re-registering with different ID |
|       14 |      ✓ | Intrinsic Constraints > Point - Locked (Fixed Position) > should not move locked points when constrained to another point |
|       13 |      ✓ | Viewpoint Serialization > serializes basic viewpoint |
|       13 |      ✓ | Line Serialization > round-trip preserves line properties |
|       12 |      ✓ | ConstraintSystem - All Constraint Types > EqualDistancesConstraint > should enforce equal distances between point pairs |
|       12 |      ✓ | ConstraintSystem - All Constraint Types > EqualAnglesConstraint > should enforce equal angles |
|       12 |      ✓ | FixedPointConstraint - Solver Integration > should lock point to specified 3D coordinates |
|       10 |      ✓ | ConstraintSystem - All Constraint Types > DistanceConstraint > should enforce distance between two points |
|        9 |      ✓ | 7-Point Essential Matrix Algorithm > should fail gracefully with fewer than 7 points |
|        9 |      ✓ | Entity Deletion Cleanup Tests > WorldPoint deletion > deleting world point removes all referencing constraints |
|        9 |      ✓ | Entity Deletion Cleanup Tests > Full project teardown > serialization round-trip after partial deletion |
|        9 |      ✓ | ProjectionConstraint - Camera Bundle Adjustment > Simple Projection > should optimize point position to match observed pixel |
|        9 |      ✓ | Serialization Integration Tests > project with points and lines round-trip |
|        8 |      ✓ | Entity Deletion Cleanup Tests > WorldPoint deletion > deleting world point allows serialization |
|        8 |      ✓ | Entity Deletion Cleanup Tests > Full project teardown > deleting in reverse order of creation |
|        8 |      ✓ | Serialization Integration Tests > project with constraints round-trip |
|        8 |      ✓ | Quaternion > should rotate vector around X axis by 90 degrees |
|        7 |      ✓ | Viewpoint Serialization > round-trip preserves camera parameters |
|        7 |      ✓ | Serialization Integration Tests > empty project round-trip |
|        7 |      ✓ | ConstraintSystem - All Constraint Types > AngleConstraint > should enforce angle at vertex |
|        7 |      ✓ | FixedPointConstraint - Solver Integration > should handle multiple independent fixed points |
|        6 |      ✓ | Intrinsic Constraints > Line - Vertical > should enforce vertical direction intrinsic constraint |
|        6 |      ✓ | Intrinsic Constraints > Line - Z-Aligned > should enforce z-aligned direction intrinsic constraint |
|        6 |      ✓ | Intrinsic Constraints > Line - Combined Constraints > should enforce both direction and length intrinsic constraints |
|        6 |      ✓ | 🧪 OptimizationService > Constraint Optimization > handles project with no constraints |
|        5 |      ✓ | Entity Deletion Cleanup Tests > Viewpoint deletion > deleting viewpoint removes orphaned world points from project state |
|        5 |      ✓ | Entity Deletion Cleanup Tests > Viewpoint deletion > deleting viewpoint allows serialization |
|        5 |      ✓ | Entity Deletion Cleanup Tests > Viewpoint deletion > deleting viewpoint with multiple image points cleans up all references |
|        5 |      ✓ | Entity Deletion Cleanup Tests > WorldPoint deletion > deleting world point removes all connected lines |
|        5 |      ✓ | Entity Deletion Cleanup Tests > Line deletion > deleting line allows serialization |
|        5 |      ✓ | Serialization Integration Tests > JSON structure is clean and readable |
|        5 |      ✓ | ConstraintSystem - All Constraint Types > CollinearPointsConstraint > should make 3 points collinear |
|        5 |      ✓ | WorldPoint Serialization > serializes basic world point |
|        5 |      ✓ | Intrinsic Constraints > Line - Fixed Length > should enforce fixed length intrinsic constraint |
|        5 |      ✓ | Intrinsic Constraints > Line - X-Aligned > should enforce x-aligned direction intrinsic constraint |
|        4 |      ✓ | Entity Deletion Cleanup Tests > WorldPoint deletion > deleting world point removes all associated image points |
|        4 |      ✓ | Line Serialization > serializes basic line |
|        4 |      ✓ | Vec4 > should compute magnitude correctly |
|        4 |      ✓ | Intrinsic Constraints > Line - Horizontal > should enforce horizontal direction intrinsic constraint |
|        4 |      ✓ | Projection-Triangulation Round-Trip > project → triangulate → reproject should give same pixels |
|        4 |      ✓ | FixedPointConstraint - Solver Integration > should report residual magnitude correctly |
|        3 |      ✓ | Entity Deletion Cleanup Tests > Line deletion > deleting line removes references from connected points |
|        3 |      ✓ | Entity Deletion Cleanup Tests > Edge cases > deleting viewpoint with no image points |
|        3 |      ✓ | PnP Camera Initialization > should fail with insufficient points |
|        3 |      ✓ | PnP Camera Initialization > should handle points without optimizedXyz |
|        3 |      ✓ | Viewpoint Serialization > round-trip preserves metadata |
|        3 |      ✓ | Line Serialization > deserialize re-establishes point relationships |
|        3 |      ✓ | ImagePoint Serialization > round-trip preserves data and relationships |
|        3 |      ✓ | ImagePoint Serialization > deserialize establishes bidirectional relationships |
|        3 |      ✓ | SerializationContext > auto-generates IDs |
|        3 |      ✓ | WorldPoint Serialization > round-trip serialization preserves data |
|        3 |      ✓ | Quaternion Normalization Residual > should be non-zero for non-unit quaternions |
|        3 |      ✓ | FixedPointConstraint - Solver Integration > should not move locked points |
|        2 |      ✓ | Entity Deletion Cleanup Tests > Edge cases > deleting non-existent entity is safe |
|        2 |      ✓ | Entity Deletion Cleanup Tests > Edge cases > deleting world point with no connections |
|        2 |      ✓ | Viewpoint Serialization > deserialized viewpoint is registered in context |
|        2 |      ✓ | Camera Frustum Alignment > should project frustum corners to correct pixel positions when viewing from same camera |
|        2 |      ✓ | Perspective Grid Homography > should compute vanishing points from three-boxes.jpg lines |
|        2 |      ✓ | Perspective Grid Homography > should compute quad corners from line intersections |
|        2 |      ✓ | WorldPoint Serialization > deserialized point is registered in context |
|        2 |      ✓ | Real Data Optimization > should load test project successfully |
|        2 |      ✓ | Vec4 > should create vec4 from constants |
|        2 |      ✓ | Vec4 > should normalize quaternion correctly |
|        2 |      ✓ | Quaternion > should convert euler to quaternion and back |
|        2 |      ✓ | Quaternion > should invert rotation with conjugate |
|        2 |      ✓ | 🧪 OptimizationService > Point Cloud Alignment > handles insufficient points for alignment |
|        2 |      ✓ | 🧪 OptimizationService > Statistics and Analysis > calculates optimization statistics |
|        1 |      ✓ | Perspective Grid Homography > should generate reasonable grid lines |
|        1 |      ✓ | SerializationContext > returns same ID for already-registered entity |
|        1 |      ✓ | SerializationContext > retrieves entity by ID |
|        1 |      ✓ | SerializationContext > clear resets context |
|        1 |      ✓ | Simple Two-Camera Solving (Proof of Concept) > should manually solve seed pair with shared points |
|        1 |      ✓ | Bundle Adjustment with Real Fixture > should optimize the real fixture data |
|        1 |      ✓ | WorldPoint Serialization > serializes point with optimized coordinates |
|        1 |      ✓ | WorldPoint Serialization > serializes point with partially locked coordinates |
|        1 |      ✓ | Principal Point Estimation > should return null to preserve user-set principal point values |
|        1 |      ✓ | Principal Point Estimation > should return null when not enough vanishing points |
|        1 |      ✓ | Quaternion > should create identity quaternion |
|        1 |      ✓ | Quaternion > should create unit quaternions from euler angles |
|        1 |      ✓ | Quaternion > should rotate vector around Z axis by 90 degrees |
|        1 |      ✓ | Quaternion > should compose rotations via quaternion multiplication |
|        1 |      ✓ | Quaternion > should have identity quaternion produce no rotation |
|        1 |      ✓ | Quaternion > should create quaternion from axis-angle |
|        1 |      ✓ | Quaternion > should compute conjugate correctly |
|        1 |      ✓ | Quaternion Normalization Residual > should be zero for unit quaternions |
|        1 |      ✓ | 🧪 Testing Setup Verification > should run basic tests |
|        1 |      ✓ | 🧪 Testing Setup Verification > should handle async operations |
|        1 |      ✓ | GOLDEN-6: Camera Intrinsic Optimization > should optimize camera focal length while keeping world geometry fixed |
|        1 |      ✓ | 🧪 OptimizationService > Error Handling > handles network errors gracefully |
|        1 |      ✓ | 🧪 OptimizationService > Statistics and Analysis > analyzes convergence behavior |
|        0 |      - | Inference Three Camera > should solve three cameras using stepped VP + PnP initialization |
|        0 |      ✓ | Perspective Grid Homography > should find which line intersections are actually on-canvas |
|        0 |      ✓ | SerializationContext > uses explicit IDs when provided |
|        0 |      ✓ | SerializationContext > hasEntity works correctly |
|        0 |      ✓ | Quaternion Normalization Residual > should compute gradients correctly |
|        0 |      ✓ | 🧪 Testing Setup Verification > should mock crypto.randomUUID |
|        0 |      ✓ | 🧪 Testing Setup Verification > should mock localStorage |
|        0 |      - | Solving Scenarios - Phase 4: Single Camera with Inferred Coordinates > Scenario 15: Single Camera VP Initialization from Axis-Aligned Lines > should solve using axis-aligned lines as virtual vanishing lines |

## Summary

- Total tests: 215
- Total time: 146968ms
- Slowest test: 15175ms
- Fastest test: 0ms
