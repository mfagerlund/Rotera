- Before we're done with a task, run `bash check.sh`
- This project should currently have NO backward compability and NO legacy code. Keep it CLEAN.
- NEVER create multiple objects, classes, interfaces, or types that serve the same or similar purposes. Each concept gets ONE representation.
- gogo means "Start executing and don't stop until finished. Beep when done."s

## ENTITY LAYER - BE VERY CAREFUL

**The entity layer (`src/entities/`) has been completely refactored and is now STABLE.**

- Be very careful when adding fields, methods, or IDs to entities
- Be very careful when modifying entity class structures
- Be very careful when changing entity constructors or factory methods
- If UI code needs changes to work with entities, prefer to FIX THE UI CODE rather than the entities
- See `src/entities/README.md` for details

**Current focus: Systematic testing of optimization system via automated test suite**

See `scratch/SOLVING-TEST-PROTOCOL.md` for progress:
- ✅ Phase 1 Complete (4/4 scenarios): Single camera initialization
- ✅ Phase 2 Complete (3/3 scenarios): Two-camera systems
- ✅ Phase 3 Complete (3/3 scenarios): Complex constraints
- All 10 scenarios passing, 4 production bugs found and fixed
- Test suite: `src/optimization/__tests__/solving-scenarios.test.ts`

### Coordinate Inference System (✓ Implemented - Phase 0)

WorldPoint now automatically infers coordinates from geometric constraints:

**Key Concepts:**
- `inferredXyz` field auto-populated by constraint propagation
- `getEffectiveXyz()` returns merged `lockedXyz` + `inferredXyz`
- `isFullyConstrained()` checks if all 3 axes are known (locked or inferred)
- Lines propagate coordinates based on direction (vertical, horizontal, x-aligned, z-aligned)
- Project automatically runs propagation via MobX reactions

**Usage in Optimization:**
- Use `isFullyConstrained()` instead of `isFullyLocked()` for scale constraints
- Use `getEffectiveXyz()` instead of `lockedXyz` when initializing points
- Inference reduces manual coordinate locking needed by users

## MobX Observable Pattern

This project uses **MobX** for automatic change detection of entity mutations.

**CORRECT pattern for mutations:**
```typescript
// Just mutate entities directly (like Angular)
worldPoint.name = "New Name"
project.addWorldPoint(point)

// MobX automatically detects changes and updates UI
// NO setProject() calls needed
```

**Components:**
```typescript
import { observer } from 'mobx-react-lite'

export const MyComponent = observer(() => {
  // Automatically re-renders when any observable accessed here changes
  return <div>{worldPoint.name}</div>
})
```

**Entity classes:**
```typescript
class WorldPoint {
  constructor() {
    makeObservable(this, {
      name: observable,
      lockedXyz: observable,
      // mutation methods:
      addConnectedLine: action,
    })
  }
}
```

## 🚨 CRITICAL: NEVER Use Spread Operator on Project or Entities

**DO NOT EVER DO THIS:**
```typescript
setProject({ ...project } as Project)  // ❌ DESTROYS ALL CLASS METHODS!
const newPoint = { ...worldPoint }      // ❌ DESTROYS ALL CLASS METHODS!
```

**WHY THIS IS CATASTROPHIC:**
- The spread operator `{ ...obj }` creates a **plain JavaScript object**
- It **LOSES ALL CLASS METHODS** - only copies data fields
- Result: `project.removeLine is not a function` and similar runtime errors
- This breaks MobX reactivity and the entire entity system

**WHAT TO DO INSTEAD:**
```typescript
// With MobX, you don't need to "update" the project reference at all!
// Just mutate the entity directly:
project.addWorldPoint(point)   // ✓ MobX detects this automatically
worldPoint.name = "New Name"   // ✓ MobX detects this automatically

// NO setProject() call needed - MobX handles UI updates
```

**IF YOU MUST trigger a re-render (rare):**
```typescript
// Force re-render without breaking the class:
project.propagateInferences()  // ✓ Calls an action method
// MobX will detect the change and update UI
```

**Remember:** Entities are **CLASS INSTANCES**, not plain objects. Treat them with respect.

## CRITICAL: Object References, NOT IDs

**ALWAYS use full object references. NEVER use IDs at runtime.**

- Entities reference other entities via object references (e.g., `line.pointA: WorldPoint`)
- APIs accept entity objects as parameters, NOT IDs (e.g., `createLine(pointA: WorldPoint, pointB: WorldPoint)`)
- Caller must resolve entities BEFORE calling APIs - no ID lookups inside functions
- IDs exist ONLY for serialization (DTOs) and as Map keys
- DTOs are ONLY for JSON serialization - they use IDs to avoid circular references
- The rest of the application NEVER sees DTOs or uses IDs

**Examples:**

✓ CORRECT:
```typescript
const line = new Line(pointA, pointB);
const point = line.pointA;
function createConstraint(line: Line, target: number) { ... }
```

✗ WRONG:
```typescript
const line = createLine(pointAId, pointBId);  // ❌ NO IDs
const point = project.points.get(line.pointAId);  // ❌ NO ID lookups
function createConstraint(lineId: string, target: number) { ... }  // ❌ NO ID params
```

## Key Architecture Points

- **Circular references are expected and welcome**: WorldPoint knows its Lines, Lines know their WorldPoints. Use Sets/Maps for collections.
- **Single global project variable**: `project: EntityProject` is a global variable. All code has direct access at all times.
- **No Repository pattern**: Simple functions for add/delete/query. Direct access to collections via Maps.

See architectural-rules.md for complete details.
- Do NOT use any to solve your problems. Proper casting is *important*!
- DON'T ADD FUCKING WRAPPER FUCKING FUNCTIONS TO HANDLE ID BASED CALLS, FIX THE ISSUE BY CALLING USING FULL ENTITIES.