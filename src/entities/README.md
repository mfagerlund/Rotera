# Entity Architecture - DO NOT MODIFY

## CRITICAL: These entities are STABLE and LOCKED

**DO NOT modify these entity files unless explicitly requested by the user.**

The entity layer has been completely refactored and stabilized. Any changes to entities must be carefully considered and approved.

## Locked Entity Files

- `WorldPoint.ts` - Stable ✓ (includes coordinate inference system)
- `Line.ts` - Stable ✓
- `Viewpoint.ts` - Stable ✓
- `ImagePoint.ts` - Stable ✓
- `Project.ts` - Stable ✓ (includes automatic inference propagation)
- `Serialization.ts` - Stable ✓

## Recent Addition: Coordinate Inference System

**Implemented: Phase 0 of Vanishing Points Specification**

WorldPoint now includes an implicit coordinate inference system that automatically propagates coordinate constraints through geometric relationships:

### New Fields
- `inferredXyz: [number | null, number | null, number | null]` - Auto-computed from constraints
- Priority: `lockedXyz` > `inferredXyz` > `optimizedXyz`

### New Methods
- `getEffectiveXyz()` - Returns merged locked + inferred coordinates
- `isFullyConstrained()` - True if all 3 axes are known (locked or inferred)
- `getConstraintStatus()` - Returns 'locked' | 'inferred' | 'partial' | 'free'

### Inference Rules
Lines propagate coordinates based on direction:
- **Vertical** (Y-axis): preserves X and Z
- **Horizontal** (XZ plane): preserves Y
- **X-aligned**: preserves Y and Z
- **Z-aligned**: preserves X and Y

### Automatic Propagation
Project automatically runs `propagateInferences()` when:
- Point coordinates are locked/unlocked
- Lines are added/removed/modified
- Runs via MobX reaction with 100ms debounce

### UI Indicators
**Status Colors:**
- 🟢 **Dark Green (#2E7D32)**: Fully constrained (locked or inferred)
- 🟠 **Orange (#FF9800)**: Partially constrained
- 🔴 **Red (#D32F2F)**: Free (no constraints)

**Visualization:**
- WorldView: Points colored by status
- ImageViewer: Small colored dot in center of each point
- WorldPointEditor: Status badge + inferred coordinates display

## Optimization System Status

**✅ Completed: Vanishing Point Camera Initialization**

VanishingLine entity and camera initialization from vanishing points fully implemented and tested.

**✅ Completed: Optimization System Validation**

Comprehensive test coverage validates the entire optimization pipeline:
- ✅ Phase 1 (4/4 scenarios): Single camera initialization via PnP and VP
- ✅ Phase 2 (3/3 scenarios): Two-camera systems with Essential Matrix
- ✅ Phase 3 (3/3 scenarios): Complex multi-constraint scenarios
- 4 production bugs discovered and fixed through systematic testing

**Test Suite:** `src/optimization/__tests__/solving-scenarios.test.ts` (10 scenarios, 174 tests)

## Key Architecture Rules

1. **Object References Only** - Entities reference other entities via objects, NEVER IDs at runtime
2. **No IDs on Entities** - IDs exist ONLY in DTOs during serialization
3. **Direct Field Access** - Access entity fields directly (no getter wrappers)
4. **Sets for Collections** - Entities use `Set<T>` for collections
5. **Global Project** - `project` is a global variable with direct access

See `CLAUDE.md` in project root for complete architectural rules.

## MobX Integration

All entities are MobX observables. Changes are automatically tracked.

**When adding new properties:**
1. Add to `makeObservable()` call in constructor
2. Mark as `observable` for data, `action` for mutations
3. React components wrapped with `observer()` will auto-update

**Example:**
```typescript
class Line {
  constructor() {
    makeObservable(this, {
      name: observable,           // auto-tracked
      color: observable,          // auto-tracked
      setColor: action,           // mutation method
    })
  }
}
```

## If You Need to Change Entities

1. **STOP** - Ask the user first
2. Explain why the change is needed
3. Wait for explicit approval
4. Document the change in this file
