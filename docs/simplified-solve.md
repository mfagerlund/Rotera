# Simplified Solver Architecture

**Status:** Design phase - capturing requirements before implementation
**Created:** 2026-02-05
**Priority:** After scalar-autograd removal

## The Problem

The current solver has become a maintenance nightmare:

1. **Fragility** - Every new project breaks something, requires special-case fixes, which break other things
2. **Opacity** - 12 attempts to solve some projects (seeds, branches, candidates) - when it fails, you don't know WHY
3. **Whack-a-mole** - Fix one project, break another. Eventually covers all edge cases, but impossible to reason about
4. **No clear requirements** - User doesn't know what constraints are needed to make a project solvable

### Current Approach (What We Want to Replace)

- Try everything, hope something works
- Multiple seeds, branches, alignments
- Complex 7-phase initialization
- State snapshots for re-runs
- Result: Works 95% of the time, impossible to debug the other 5%

### Desired Approach

- Solve what's solvable, clearly explain what's not
- Predictable behavior with clear requirements
- When it fails, user knows exactly what's missing
- Easy to adjust without breaking other things

---

## Proposed Architecture

### Two Types of Starting Points (Seeds)

The solver should support exactly TWO ways to bootstrap a solve:

#### Type 1: Two Viewpoints (Stereo Seed)

**Requirements:**
- 2 viewpoints with 7+ shared image points (correspondences)
- At least 1 distance constraint (sets scale - essential matrix only gives direction)
- Enough axis constraints to lock absolute rotation (2 orthogonal axes?)

**What this determines:**
- Essential matrix → relative camera pose (R, t direction)
- Distance constraint → scale factor
- Axis lines → absolute orientation in world frame
- Triangulated shared points → fully determined 3D positions

**What remains unsolved:**
- Points visible in only one viewpoint (depth ambiguous - on a ray)
- These become "pending" until another viewpoint observes them

#### Type 2: One Fully Constrained Viewpoint (Single Image Seed)

**Requirements:**
- Fixed points OR sufficient geometric constraints
- Axis-aligned lines (orientation from vanishing points)
- Distance constraints (scale)

**What this determines:**
- Camera pose (if constraints are sufficient)
- Some 3D points (where constraint rays intersect)

**What remains unsolved:**
- Points on single rays (depth ambiguous)
- Camera pose might be partial (e.g., orientation known but position only constrained to a line)

---

### Incremental Addition (After Seed)

Once we have a seed with known 3D points, adding more viewpoints follows a simple pattern:

1. **Find eligible viewpoint** - Has 4+ visible points with known 3D positions
2. **PnP** - Compute camera pose from 2D-3D correspondences
3. **Triangulate** - New points now visible from 2+ cameras get 3D positions
4. **Resolve pending** - Previously depth-ambiguous points may now be solvable
5. **Repeat** - Until all viewpoints added or no more eligible viewpoints

This is essentially standard incremental SfM, but with clear prerequisites at each step.

---

## Open Questions

### Q1: What exactly "locks down" the solve?

- Is 2 orthogonal axis constraints always required?
- Can 1 axis + distance sometimes work?
- What's the minimal constraint set for each seed type?

### Q2: How to handle depth-ambiguous points?

Should these be explicitly tracked and displayed to the user?

```
Point X: depth unknown (visible only in Image A)
         → will resolve when Image B or C is added
```

This gives users clear feedback about what's solvable vs pending.

### Q3: What are the failure modes?

When user tries to solve but requirements aren't met, what specific feedback?

Examples:
- "Need 2 more correspondences between Image A and B"
- "Need a distance constraint to set scale"
- "Need axis constraint to lock orientation"
- "Image C cannot be added yet - only 2 known points visible (need 4+)"

### Q4: User picks seed vs auto-detect?

Options:
1. **User explicitly marks anchor** - "This is my starting image/pair"
2. **Auto-detect best seed** - Find the most constrained starting point
3. **Hybrid** - Auto-suggest, user confirms

### Q5: What about the current multi-attempt approach?

The current solver tries 12+ combinations of:
- Random seeds (perturbations)
- Branches (sign ambiguities)
- Alignments (coordinate frames)

Questions:
- Are sign ambiguities inherent to the math, or artifacts of the current approach?
- Can a cleaner seed selection eliminate the need for multiple attempts?
- Should we keep a simple "try both signs" fallback, or is that a smell?

### Q6: Bundle adjustment timing

When to run bundle adjustment?
- After each viewpoint addition?
- After all viewpoints added?
- Incrementally (local BA after each addition, global BA at end)?

### Q7: What constraints propagate vs require re-solve?

When a new viewpoint is added:
- Do existing point positions update (bundle adjustment)?
- Or are early points "locked" once triangulated?
- Trade-off: accuracy vs predictability

---

## Comparison: Current vs Proposed

| Aspect | Current | Proposed |
|--------|---------|----------|
| Starting point | Try to initialize all cameras at once | Explicit seed (1 or 2 viewpoints) |
| Ambiguity handling | Multiple attempts with random seeds | Clear "pending" state for ambiguous points |
| Failure feedback | High reprojection error, unclear cause | Specific missing constraint messages |
| Viewpoint addition | Complex branching initialization | Simple PnP when 4+ points known |
| Predictability | Low - different results each run | High - deterministic given constraints |
| Coverage | Tries to solve everything | Solves what's solvable, explains what's not |

---

## Implementation Notes

### Phase 1: Seed Detection & Validation

```typescript
interface SeedValidation {
  type: 'stereo' | 'single' | 'insufficient';

  // For stereo seed
  viewpointPair?: [Viewpoint, Viewpoint];
  sharedPoints?: WorldPoint[];

  // For single seed
  anchorViewpoint?: Viewpoint;

  // What's missing (if insufficient)
  missing?: string[];  // Human-readable requirements
}

function validateSeed(project: Project): SeedValidation
```

### Phase 2: Incremental Solve

```typescript
interface SolveState {
  // Fully determined
  solvedViewpoints: Set<Viewpoint>;
  solvedPoints: Map<WorldPoint, Vec3>;

  // Partially determined
  pendingPoints: Map<WorldPoint, {
    constraint: 'ray' | 'plane' | 'line';
    fromViewpoint: Viewpoint;
  }>;

  // Not yet solvable
  unreachableViewpoints: Map<Viewpoint, string>;  // reason
}

function solveIncremental(project: Project, seed: SeedValidation): SolveState
```

### Phase 3: Clear Feedback

```typescript
interface SolveResult {
  success: boolean;
  state: SolveState;

  // If not fully solved
  blockers?: {
    viewpoint: Viewpoint;
    reason: string;
    suggestion: string;  // "Add 2 more point correspondences with Image A"
  }[];
}
```

---

## Next Steps

1. **Finish scalar-autograd removal** - Cleaner codebase for new solver
2. **Prototype seed validation** - Can we detect if a project has valid seed?
3. **Prototype incremental solve** - Simple version without all edge cases
4. **Compare with current solver** - Same projects, which gives better feedback?
5. **Iterate on requirements** - Refine based on real project testing

---

## References

- Current orchestrator: `src/optimization/optimize-project/orchestrator.ts`
- Current constraint system: `src/optimization/constraint-system/ConstraintSystem.ts`
- Essential matrix: 5-point algorithm, needs 5+ correspondences (7+ for robustness)
- PnP: Perspective-n-Point, needs 4+ 2D-3D correspondences
