# Entity-Driven Optimization Architecture

**Solver:** ScalarAutograd (TypeScript-based automatic differentiation and optimization)

## Philosophy

**Traditional Approach**: Convert high-level geometric entities (lines, planes) into atomic constraints (distance, angle, parallel) before optimization.

**Entity-Driven Approach**: Optimize directly on semantic entities, preserving the UI→optimization→feedback loop with full traceability.

## Constraint Types

**Intrinsic Constraints:** Embedded within geometric entities themselves
- Line direction (horizontal, vertical, axis-aligned)
- Line target length
- Fixed point coordinates
- These are properties of the entity, not separate constraint objects

**Extrinsic Constraints:** Relationships between separate entities
- Distance between two points
- Angle between lines
- Parallel/perpendicular relationships
- Coplanar/collinear relationships
- These exist as separate constraint objects

## The Problem

Current state:
```
User creates: Line L1 {direction: "horizontal", targetLength: 5.0}
  ↓
Frontend converts to: DistanceConstraint + AxisAlignConstraint  ❌ Lost link to L1
  ↓
Backend optimizes: Two separate residual functions
  ↓
Result: Total error = 2.5m
  ❓ Which part of L1 is wrong? Length or direction?
```

**Issues**:
1. ❌ **Lost traceability**: Can't tell user "Line L1 has 2.3m length error"
2. ❌ **Semantic gap**: User thinks in terms of lines, system thinks in atomic constraints
3. ❌ **Double representation**: Line exists in UI, but constraints exist in optimizer
4. ❌ **Hard to debug**: Which constraint came from which UI element?
5. ❌ **Complex mapping**: Need conversion layer both ways

## The Solution: Entity-Driven Residuals

```
User creates: Line L1 {direction: "horizontal", targetLength: 5.0}
  ↓
Single entity exported to backend (no conversion)
  ↓
LineConstraintResidual(line_id="L1", direction="horizontal", targetLength=5.0)
  ↓
Computes composite residual: [length_error, direction_error]
  ↓
Result with traceability: {
  line_id: "L1",
  total_error: 2.5,
  components: [
    {type: "length", error: 2.3},
    {type: "direction", error: 0.2}
  ]
}
```

**Benefits**:
1. ✅ **Full traceability**: Every residual knows its source entity
2. ✅ **ONE source of truth**: UI entities ARE optimization entities
3. ✅ **Natural feedback**: "Line L1: length off by 2.3m, direction off by 0.2°"
4. ✅ **Easier debugging**: See exactly which UI element has problems
5. ✅ **No conversion layer**: Direct mapping from UI to optimization
6. ✅ **Flexible**: Entity can have 0, 1, or multiple constraint components

## Architecture

### Core Concept: Composite Residuals

Each entity type becomes a residual functor that can compute **multiple related residuals**:

```python
class LineConstraintResidual(ResidualFunctor):
    """Composite residual for line entity with embedded constraints."""

    def __init__(
        self,
        factor_id: str,
        line_id: str,              # ✅ Traceability to UI entity
        line_name: str,            # ✅ Human-readable name
        wp_i_id: str,              # Point A
        wp_j_id: str,              # Point B
        constraints: Dict[str, Any]  # ✅ Embedded constraints from UI
    ):
        """Initialize from Line DTO directly.

        constraints = {
            'direction': 'horizontal' | 'vertical' | 'x-aligned' | 'z-aligned' | 'free',
            'targetLength': float (optional),
            'tolerance': float
        }
        """
        super().__init__(factor_id, [wp_i_id, wp_j_id])
        self.line_id = line_id
        self.line_name = line_name
        self.wp_i_id = wp_i_id
        self.wp_j_id = wp_j_id

        self.direction = constraints.get('direction', 'free')
        self.target_length = constraints.get('targetLength')
        self.tolerance = constraints.get('tolerance', 0.001)

    def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
        """Compute composite residual vector.

        Returns variable-length array depending on active constraints:
        - If targetLength set: includes distance residual
        - If direction != 'free': includes direction residual(s)
        """
        Xi = variables[self.wp_i_id]  # Point A position [x, y, z]
        Xj = variables[self.wp_j_id]  # Point B position [x, y, z]

        residuals = []

        # 1. Distance constraint (if specified)
        if self.target_length is not None:
            line_vec = Xj - Xi
            actual_length = np.linalg.norm(line_vec)
            length_error = (actual_length - self.target_length) / self.tolerance
            residuals.append(length_error)

        # 2. Direction constraint (if specified)
        if self.direction != 'free':
            line_vec = Xj - Xi
            line_dir = line_vec / (np.linalg.norm(line_vec) + 1e-10)

            if self.direction == 'horizontal':
                # Line should be parallel to XY plane (z component = 0)
                z_error = line_dir[2] / self.tolerance
                residuals.append(z_error)

            elif self.direction == 'vertical':
                # Line should be parallel to Z axis (x,y components = 0)
                xy_error = np.linalg.norm(line_dir[:2]) / self.tolerance
                residuals.append(xy_error)

            elif self.direction == 'x-aligned':
                # Line should be parallel to X axis
                yz_error = np.linalg.norm(line_dir[1:]) / self.tolerance
                residuals.append(yz_error)

            elif self.direction == 'z-aligned':
                # Line should be parallel to Z axis
                xy_error = np.linalg.norm(line_dir[:2]) / self.tolerance
                residuals.append(xy_error)

        return np.array(residuals)

    def num_residuals(self) -> int:
        """Return number of residuals this factor contributes."""
        count = 0
        if self.target_length is not None:
            count += 1
        if self.direction != 'free':
            count += 1
        return count

    def get_metadata(self) -> Dict[str, Any]:
        """Return traceability metadata."""
        return {
            'entity_type': 'line',
            'entity_id': self.line_id,
            'entity_name': self.line_name,
            'components': [
                {
                    'type': 'distance',
                    'enabled': self.target_length is not None,
                    'target': self.target_length
                },
                {
                    'type': 'direction',
                    'enabled': self.direction != 'free',
                    'target': self.direction
                }
            ]
        }
```

### Usage in Optimization Problem

```python
# In OptimizationProblem.build_factor_graph()

for line_dto in project.lines:
    # No conversion! Use line DTO directly
    if line_dto.constraints:  # Has any constraints
        factor = LineConstraintResidual(
            factor_id=f"line_{line_dto.id}",
            line_id=line_dto.id,
            line_name=line_dto.name,
            wp_i_id=line_dto.pointA,
            wp_j_id=line_dto.pointB,
            constraints=line_dto.constraints
        )
        graph.add_factor(factor)
```

### Result Diagnostics

After optimization, query per-entity residuals:

```python
class SolveResult:
    """Enhanced solve result with entity-level diagnostics."""

    def get_entity_diagnostics(self) -> Dict[str, EntityDiagnostic]:
        """Get per-entity error breakdown."""
        return {
            'line_L1': {
                'entity_type': 'line',
                'entity_name': 'Loop_1',
                'total_error': 2.5,
                'components': [
                    {
                        'type': 'distance',
                        'target': 5.0,
                        'actual': 7.3,
                        'error': 2.3,
                        'satisfied': False
                    },
                    {
                        'type': 'direction',
                        'target': 'horizontal',
                        'deviation_degrees': 11.5,
                        'error': 0.2,
                        'satisfied': True
                    }
                ]
            },
            'imagepoint_WP1_img1': {
                'entity_type': 'imagepoint',
                'total_error': 1.2,
                'components': [
                    {'type': 'reprojection_u', 'error': 0.8},
                    {'type': 'reprojection_v', 'error': 0.9}
                ]
            }
        }
```

## Entity Types

### 1. Line Entity

**UI Representation**:
```typescript
interface Line {
  id: string
  name: string  // "L1", "L2"
  pointA: string
  pointB: string
  constraints?: {
    direction?: 'free' | 'horizontal' | 'vertical' | 'x-aligned' | 'z-aligned'
    targetLength?: number
    tolerance?: number
  }
}
```

**Residual Components**:
- Distance: `|length(B-A) - targetLength|`
- Direction: Alignment with specified axis/plane

**Example**:
```typescript
Line {
  id: "line_123",
  name: "L1",
  pointA: "wp1",
  pointB: "wp2",
  constraints: {
    direction: "horizontal",  // ✅ Parallel to ground
    targetLength: 5.0,        // ✅ Exactly 5 meters
    tolerance: 0.001
  }
}
```

### 2. Plane Entity

**UI Representation**:
```typescript
interface Plane {
  id: string
  name: string  // "P1", "P2"
  definition: {
    type: 'three_points'
    pointIds: [string, string, string]
  }
  constraints?: {
    orientation?: 'horizontal' | 'vertical' | 'free'
    offset?: number  // Distance from origin
  }
}
```

**Residual Components**:
- Coplanarity: All points lie on same plane
- Orientation: Plane normal aligned with axis
- Offset: Distance from origin

### 3. ImagePoint Entity (Already Composite!)

**Current Implementation** (already follows this pattern):
```python
class ReprojectionResidual(ResidualFunctor):
    """Returns 2-element residual: [u_error, v_error]"""

    def compute_residual(self, variables):
        # ...
        return np.array([
            self.observed_u - u_proj,  # Horizontal error
            self.observed_v - v_proj   # Vertical error
        ])
```

**Traceability**:
- Can report: "WP1 in image_01: 2.3px off in u, 1.8px off in v"

### 4. Future: Rectangle/Circle Entities

```python
class RectangleConstraintResidual(ResidualFunctor):
    """Four corners form rectangle."""

    def compute_residual(self, variables):
        # Returns 6 residuals:
        # - 4 right angles (one per corner)
        # - 2 equal opposite sides
        return np.array([
            angle_error_1, angle_error_2, angle_error_3, angle_error_4,
            opposite_sides_1_error, opposite_sides_2_error
        ])
```

## Implementation Plan

### Phase 1: Line Entity Support (First PR)

1. Create `LineResidual` class in `residuals.py`
2. Update `OptimizationProblem` to use lines directly
3. Add entity metadata tracking to factors
4. Enhance `SolveResult` with entity diagnostics
5. Add integration tests for line constraints

**Files to modify**:
- `pictorigo/core/optimization/residuals.py` - Add `LineResidual`
- `pictorigo/core/optimization/problem.py` - Use lines directly
- `pictorigo/core/models/project.py` - Add `SolveResult.get_entity_diagnostics()`
- `tests/integration/test_line_constraints.py` - New test file

### Phase 2: Enhanced Diagnostics

1. Add per-entity error breakdown to solve result
2. Create visualization of which entities are most violated
3. Add "suggest fixes" based on error analysis
4. Export entity errors back to frontend for highlighting

### Phase 3: Plane & Shape Entities

1. Implement `PlaneResidual`
2. Implement `RectangleResidual`
3. Support complex constraint combinations

### Phase 4: Frontend Integration

1. Update frontend to display per-entity errors
2. Highlight violated entities in red
3. Show error tooltips: "L1: 2.3m too long"
4. Add "Fix" buttons that adjust parameters

## Benefits Summary

### For Users
- ✅ **Clear feedback**: "Line L1 is 2.3m too long" instead of "Constraint violation"
- ✅ **Visual debugging**: See exactly which entities have problems
- ✅ **One mental model**: Lines are lines, not "distance + direction constraints"

### For Developers
- ✅ **Simpler code**: No conversion layer between UI and optimizer
- ✅ **Easier debugging**: Full traceability from UI → residual → result
- ✅ **Flexible**: Easy to add new constraint types per entity
- ✅ **Maintainable**: ONE source of truth

### For System
- ✅ **Correct**: No possibility of conversion bugs
- ✅ **Efficient**: Composite residuals can share computation
- ✅ **Scalable**: Easy to add new entity types

## Comparison: Before vs After

### Before (Atomic Constraints)

```
Frontend:
  Line L1 {pointA: wp1, pointB: wp2, direction: "horizontal", length: 5.0}
    ↓ (conversion in export)
  DistanceConstraint {wp_i: wp1, wp_j: wp2, distance: 5.0}
  AxisAlignConstraint {wp_i: wp1, wp_j: wp2, axis: "x"}

Backend:
  Creates two separate factors
  Loses link to "Line L1"

Result:
  Total error: 2.5
  ❓ Can't tell user which part is wrong
```

### After (Entity-Driven)

```
Frontend:
  Line L1 {pointA: wp1, pointB: wp2, direction: "horizontal", length: 5.0}
    ↓ (no conversion!)

Backend:
  LineResidual(line_id="L1", ...)
  Computes [length_error, direction_error]
  Stores metadata: {entity_id: "L1", entity_name: "Loop_1"}

Result:
  entities: {
    "L1": {
      name: "Loop_1",
      errors: {length: 2.3, direction: 0.2},
      total: 2.5
    }
  }
  ✅ User sees: "Line 'Loop_1' is 2.3m too long"
```

## Technical Details

### Factor Graph Compatibility

The existing factor graph already supports this!

**Evidence**:
```python
# In factor_graph.py - Factor.compute_residual()
def compute_residual(self, variables: Dict[str, np.ndarray]) -> np.ndarray:
    """Returns residual VECTOR (can be multi-element)"""
    pass

# ReprojectionResidual already uses this
def compute_residual(self, variables):
    return np.array([u_error, v_error])  # 2 elements!
```

**Solver compatibility**: ScalarAutograd optimization accepts residual vectors of any length. It just needs:
- `fun(x) -> residuals` (✅ we have this)
- Automatic differentiation for jacobians (✅ ScalarAutograd provides this)

### Jacobian Computation

For composite residuals, jacobian is still per-variable:

```python
def compute_jacobian(self, variables):
    """Jacobian of ALL residuals w.r.t. each variable."""
    jacobians = {}

    # For wp_i: shape is (num_residuals, 3)
    jacobians[self.wp_i_id] = np.array([
        [dLength/dx_i, dLength/dy_i, dLength/dz_i],      # Row 1: length residual
        [dDirection/dx_i, dDirection/dy_i, dDirection/dz_i]  # Row 2: direction residual
    ])

    return jacobians
```

The solver just stacks these into the full sparse jacobian.

### Performance

**No performance penalty**:
- Same number of residual evaluations
- Same jacobian size
- Possibly FASTER due to shared computation (e.g., compute `line_vec` once)

## Migration Strategy

### Backward Compatibility

Keep atomic constraints working during transition:

```python
# In problem.py
for constraint in project.constraints:
    if isinstance(constraint, DistanceConstraint):
        # Old atomic path (keep for now)
        self._add_distance_factor(constraint)
    # ...

for line in project.lines:
    if line.constraints:
        # New entity-driven path
        self._add_line_factor(line)
```

### Gradual Rollout

1. **Week 1**: Implement `LineResidual` alongside existing
2. **Week 2**: Test both paths give same results
3. **Week 3**: Switch frontend to use entity-driven for new projects
4. **Week 4**: Deprecate atomic constraints

## Open Questions

1. **Jacobian accuracy**: Use analytical vs finite differences for composite residuals?
   - **Recommendation**: Start with finite differences, optimize later if needed

2. **Constraint conflicts**: What if line has `direction="horizontal"` AND is part of a vertical plane?
   - **Recommendation**: Document constraint priority, show warnings in UI

3. **Partial constraints**: What if line has `direction` but no `targetLength`?
   - ✅ **Already handled**: Return variable-length residual array

4. **Naming**: `LineConstraintResidual` vs `LineResidual` vs `LineFactor`?
   - **Recommendation**: `LineResidual` (simpler, entity is implicit)

## Conclusion

Entity-driven optimization is:
- ✅ **Architecturally cleaner**: ONE source of truth
- ✅ **More maintainable**: No conversion layer
- ✅ **Better UX**: Direct entity → error feedback
- ✅ **Technically feasible**: Current system already supports it
- ✅ **Low risk**: Can be rolled out gradually

**Next step**: Implement Phase 1 (Line entity support) as proof of concept.
