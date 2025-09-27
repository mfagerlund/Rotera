# Vanishing Line Constraint Design

## Concept
Vanishing lines help calibrate cameras by exploiting the fact that:
1. Parallel 3D lines converge to vanishing points in images
2. Vanishing points for orthogonal 3D directions lie on vanishing lines
3. Vanishing lines intersect at the principal point

## Implementation Options

### Option 1: Composite Constraints (Using Existing System)
```python
# Manually set up vanishing point constraints
project.add_constraint(AngleConstraint.parallel("3d_line1_a", "3d_line1_b", "3d_line2_a", "3d_line2_b"))
project.add_constraint(ImagePointConstraint(image_id="img1", wp_id="vanishing_point_1", u=vp1_u, v=vp1_v))
project.add_constraint(CollinearConstraint(wp_ids=["vp1", "vp2", "vp3"]))  # Vanishing line
```

### Option 2: Dedicated Vanishing Line Constraint
```python
class VanishingLineConstraint(BaseConstraint):
    type: Literal["vanishing_line"] = "vanishing_line"
    parallel_line_groups: List[List[Tuple[str, str]]]  # Groups of parallel 3D lines
    image_id: str
    vanishing_line_points: List[Tuple[float, float]]  # Expected vanishing line in image

    # Automatically:
    # 1. Enforces 3D line parallelism within groups
    # 2. Projects lines to compute vanishing points
    # 3. Constrains vanishing points to lie on vanishing line
```

### Option 3: Camera Calibration Constraints
```python
class CameraCalibrationConstraint(BaseConstraint):
    type: Literal["camera_calibration"] = "camera_calibration"
    orthogonal_directions: List[Tuple[str, str]]  # 3 orthogonal 3D directions
    image_id: str

    # Automatically handles:
    # - Principal point estimation
    # - Focal length estimation
    # - Vanishing point/line geometry
```

## Advantages of Adding Vanishing Lines

### For Architecture/Buildings:
- **Horizontal lines** → horizon vanishing line
- **Vertical lines** → zenith/nadir vanishing point
- **Facade lines** → facade vanishing points
- **Automatic camera orientation** from building geometry

### For Calibration:
- **Principal point** from vanishing line intersections
- **Focal length** from vanishing point distances
- **Camera orientation** from horizon/vertical vanishing points
- **Distortion detection** from straight line curvature

## Current System Sufficiency

**What we can already do:**
```python
# Force 3D lines parallel
project.add_constraint(AngleConstraint.parallel("line1_a", "line1_b", "line2_a", "line2_b"))

# Force vanishing points on vanishing line
project.add_constraint(CollinearConstraint(wp_ids=["vp1", "vp2", "vp3"]))

# Constrain vanishing points to image observations
project.add_constraint(ImagePointConstraint(image_id="img", wp_id="vp1", u=u_obs, v=v_obs))
```

**What's missing:**
- Automatic vanishing point computation from line projections
- Principal point constraints
- Camera parameter estimation helpers

## Recommendation

**Phase 1: Use existing constraints** for manual vanishing line setup
**Phase 2: Add VanishingLineConstraint** if there's demand
**Phase 3: Add CameraCalibrationConstraint** for full automation

The current system is actually quite capable for vanishing line work, just requires manual setup.