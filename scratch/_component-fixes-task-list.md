# Component Fixes Task List

## Context: Object-Reference Architecture Migration

**Status**: Phase 2 IN PROGRESS! 7 components fixed across 2 sessions. ~350 errors remaining.

**Total TypeScript Errors**: 427 → **~350 remaining** (77 eliminated across 2 sessions)

---

## ✅ Session Progress - UPDATED (Latest Session)

**Phase 2 Continued - 3 More Components Fixed (31 errors eliminated):**

5. ✅ **useImageViewerRenderer.ts (14 errors fixed)**
   - Fixed all `wp.id` → `wp` (pass WorldPoint object directly)
   - Fixed `selectedPoints.includes(wp.id)` → `selectedPoints.includes(wp)` (object comparison)
   - Fixed `selectedLines.includes(lineId)` → `selectedLines.includes(line)` (object comparison)
   - Fixed `viewpoint.getImagePointsForWorldPoint(wp.id)` → `viewpoint.getImagePointsForWorldPoint(wp)`
   - Fixed `line.constraints?.direction` → `line.direction` (direct property access)
   - Fixed `line.constraints?.targetLength` → `line.targetLength` (direct property access)
   - Updated renderSelectionOverlay to iterate over WorldPoint objects instead of IDs

6. ✅ **OptimizationPanel.tsx (9 errors fixed)**
   - Fixed `project.constraints.length` → `project.constraints.size` (Set property)
   - Fixed `project.constraints.filter()` → `Array.from(project.constraints).filter()` (convert Set to Array)
   - Fixed `point.id` → `point.getName()` for React keys
   - Fixed `line.id` → `line.getName()` for React keys

7. ✅ **ImagePointsManager.tsx (8 errors fixed)**
   - Fixed `Object.values(viewpoint.imagePoints)` → `Array.from(viewpoint.imagePoints)` (Set iteration)
   - Fixed `imagePoint.worldPointId` → `imagePoint.worldPoint` (object reference)
   - Fixed `viewpoint.imagePoints[worldPoint.id]` → `Array.from(viewpoint.imagePoints).find(ip => ip.worldPoint === ref.worldPoint)` (Set lookup)
   - Fixed composite keys to use `getEntityKey()` instead of `getName()`

8. ✅ **React Keys Refactor - All Components**
   - Replaced all `getName()` uses for React keys with `getEntityKey()` utility
   - Uses WeakMap to generate stable, unique keys for entity objects
   - Applied to: OptimizationPanel, ImagePointsManager, ImageNavigationToolbar
   - Names are now ONLY for display, not for identification
   - See: `src/utils/entityKeys.ts`

**Previous Session Completed:**
1. ✅ **MainLayout.tsx (19 errors fixed)**
2. ✅ **ImageNavigationToolbar.tsx (15 errors fixed)**
3. ✅ **ImageViewer.tsx (12 errors fixed)**
4. ✅ **image-viewer/types.ts (Type safety improvements)**

**Key Patterns Applied:**
- ✅ Entity objects passed directly (no `.id` lookups)
- ✅ Collections as Arrays/Sets (no ID-based Maps)
- ✅ `getEntityKey()` used for React keys (WeakMap-based, NOT names or IDs!)
- ✅ `getName()` only for display purposes, never as unique identifiers
- ✅ Circular references maintained (WorldPoint.imagePoints properly populated)
- ✅ Zero tolerance for naked `any` types
- ✅ Direct property access on Line (e.g., `line.direction`, `line.targetLength`, not `line.constraints.*`)
- ✅ Set operations: `.size` instead of `.length`, `Array.from()` before using array methods

**Total Progress:**
- **77 errors eliminated** (46 in previous session + 31 in this session)
- **~350 errors remaining** (427 original → ~350 remaining)

**Next Priority:**
- LinesManager.tsx (6 errors)
- ConstraintPropertyPanel.tsx (5+ errors)
- WorldView.tsx (8 errors)
- WorldPointPanel.tsx (8 errors)

---

## Background: Why We're Fixing These Errors

The Pictorigo project uses **object references, NOT IDs** at runtime. This is a fundamental architectural decision documented in `CLAUDE.md` and `architectural-rules.md`.

### The Rule: Object References vs IDs

**✅ ALWAYS at Runtime:**
```typescript
// Entities reference each other via object references
const line = new Line(pointA, pointB)  // Direct WorldPoint objects
const point = line.pointA              // Access via object reference

// APIs accept entity objects as parameters
createLine(pointA: WorldPoint, pointB: WorldPoint)

// Collections use object references
project.worldPoints: Set<WorldPoint>
project.lines: Set<Line>
```

**❌ NEVER at Runtime:**
```typescript
// NO IDs stored on entities
worldPoint.id        // ❌ Doesn't exist
line.id              // ❌ Doesn't exist
viewpoint.id         // ❌ Doesn't exist

// NO ID-based APIs
createLine(pointAId: string, pointBId: string)  // ❌ Wrong

// NO ID maps for entity storage
project.points: Map<string, WorldPoint>  // ❌ Wrong
```

**✅ IDs ONLY for Serialization:**
```typescript
// Generate IDs temporarily during serialization
const pointIds = new Map<WorldPoint, string>()
project.worldPoints.forEach((p, i) => {
  pointIds.set(p, `wp_${i}`)
})

// Use in DTOs only
const dto = {
  id: pointIds.get(worldPoint),
  name: worldPoint.name
}
```

### Why This Architecture?

1. **Performance**: Direct object references are faster than Map lookups
2. **Type Safety**: TypeScript enforces correct types (no string ID confusion)
3. **Circular References**: WorldPoint ↔ Line relationships work naturally
4. **No ID Sync Issues**: No need to keep ID strings in sync across entities
5. **Cleaner Code**: `line.pointA.name` vs `project.points.get(line.pointAId)?.name`

### Key Changes Made So Far

**Phase 1: Hooks Layer (✅ Complete)**
- Fixed all 8 hooks to use object references
- Removed `project.clone()` → use `setProject({ ...project } as Project)`
- Changed `useConstraints` to accept `ISelectable[]` instead of ID arrays
- Changed `useEntityProject` from `currentImageId` to `currentViewpoint` object

**Phase 2: Components Layer (👉 Current - In Progress)**
- **COMPLETED**: Fixed 3 core components (46 errors eliminated)
  - ✅ MainLayout.tsx (19 errors) - Removed all `.id` accesses, changed to `currentViewpoint`, fixed Set.size usage
  - ✅ ImageNavigationToolbar.tsx (15 errors) - Converted Maps to arrays, fixed all Viewpoint.id references
  - ✅ ImageViewer.tsx (12 errors) - Fixed WorldPoint.id accesses, updated render state to use entity objects
- **Type Safety Improvements**:
  - Eliminated ALL naked `any` types (replaced with proper Line, WorldPoint types)
  - Fixed `ImageViewerRenderState` interface to use entity objects instead of ID strings
  - Properly typed all function parameters (e.g., `LineUpdates` instead of `any`)
- Remaining: ~381 errors in other components and tests

---

## Priority Order (by error count)

### High Priority - Test Files (211 errors)
These are test files - lower priority since they don't affect runtime:

1. **src/optimization/__tests__/all-constraints.test.ts** (84 errors)
2. **src/optimization/__tests__/intrinsic-constraints.test.ts** (32 errors)
3. **src/optimization/__tests__/projection-constraint.test.ts** (25 errors)
4. **src/optimization/__tests__/real-data-optimization.test.ts** (20 errors)
5. **src/optimization/__tests__/fixed-point-constraint.test.ts** (20 errors)
6. **src/tests/testUtils.tsx** (15 errors)
7. **src/optimization/__tests__/optimization-info-demo.test.ts** (7 errors)

**Action**: Fix tests LAST after all components work

---

### ✅ High Priority - Main Components (19 errors) - COMPLETE

#### ✅ **src/components/MainLayout.tsx** (19 errors) - FIXED
All issues resolved:
- Changed `currentImageId` → `currentViewpoint` throughout
- Removed all ID-based Maps, converted to entity arrays
- Fixed all `.id` accesses to use `getName()` or object equality
- Fixed `.length` → `.size` for Set collections
- Properly typed `updatedLine` parameter (removed `any`)

---

### ✅ Medium Priority - Image Viewer Components (41 errors) - COMPLETE

#### ✅ **src/components/ImageNavigationToolbar.tsx** (15 errors) - FIXED
- Fixed in previous session

#### ✅ **src/components/image-viewer/useImageViewerRenderer.ts** (14 errors) - FIXED
- Fixed all `.id` accesses on WorldPoint objects
- Fixed object comparisons for selectedPoints and selectedLines
- Fixed line.constraints references to direct properties

#### ✅ **src/components/ImageViewer.tsx** (12 errors) - FIXED
- Fixed in previous session

#### ✅ **src/components/ImagePointsManager.tsx** (8 errors) - FIXED
- Fixed Set iteration and lookups
- Fixed object reference usage instead of IDs
- Fixed composite key generation using getName()

---

### Medium Priority - Other Components (26 errors remaining, 9 fixed)

#### **src/services/export.ts** (16 errors)
Export/serialization service - needs ID generation for DTOs

#### ✅ **src/components/OptimizationPanel.tsx** (9 errors) - FIXED
- Fixed Set.length → Set.size
- Fixed Set.filter() → Array.from().filter()
- Fixed entity.id → entity.getName() for React keys

#### **src/components/tools/LineCreationTool.tsx** (10 errors)
Line creation tool errors

#### **src/components/WorldView.tsx** (8 errors)
3D world view rendering

#### **src/components/WorldPointPanel.tsx** (8 errors)
Point editing panel

#### **src/components/LinesManager.tsx** (6 errors)
- Lines 45, 50: Line.id
- Lines 56, 115, 117: Line.constraints (doesn't exist - Line has direct properties)

#### **src/components/ConstraintPropertyPanel.tsx** (5+ errors)
- Lines 30, 73, 151, 197: WorldPoint.id
- Line 73: Type mismatch WorldPoint[] vs string[]

#### **src/components/ConstraintsManager.tsx** (2+ errors)
- Lines 36-37: WorldPoint.id, Line.id

#### **src/components/EntityListPopup.tsx** (2 errors)
- Lines 62, 82: `lockedXyz` property issues

#### **src/components/ImageEditor.tsx** (2 errors)
- Lines 139: Viewpoint.id

#### **src/components/main-layout/WorldWorkspace.tsx** (1 error)
- Line 36: Type mismatch - expecting Plane object but passing planeId string

#### **src/components/main-layout/MainToolbar.tsx** (1 error)
- Line 151: WorldPoint.id

---

### Low Priority - Constraint Entities (19 errors)

These are in the entity layer but related to constraints:

#### **src/entities/constraints/equal-angles-constraint.ts** (11 errors)
#### **src/entities/constraints/equal-distances-constraint.ts** (8 errors)

**Action**: Check if these need object references instead of IDs

---

## Common Patterns to Fix

### Pattern 1: React Keys for Entities
```typescript
// ❌ WRONG - Don't use names (not guaranteed unique!)
<div key={worldPoint.getName()}>

// ❌ WRONG - Don't use IDs (entities don't have them!)
<div key={worldPoint.id}>

// ✅ CORRECT - Use getEntityKey() utility
import { getEntityKey } from '../utils/entityKeys'
<div key={getEntityKey(worldPoint)}>

// For composite keys (e.g., ImagePoint = WorldPoint + Viewpoint)
const compositeKey = `${getEntityKey(worldPoint)}-${getEntityKey(viewpoint)}`
```

### Pattern 2: Accessing .id on entities
```typescript
// ❌ WRONG
const id = worldPoint.id
const key = line.id

// ✅ CORRECT - Use object references
const point = line.pointA  // Direct reference
if (selectedPoints.includes(worldPoint)) { ... }  // Object comparison
```

### Pattern 3: Set.length → Set.size
```typescript
// ❌ WRONG
if (project.constraints.length > 0)
const filtered = constraints.filter(c => c.isEnabled)

// ✅ CORRECT
if (project.constraints.size > 0)
const filtered = Array.from(constraints).filter(c => c.isEnabled)
```

### Pattern 4: currentImageId → currentViewpoint
```typescript
// ❌ WRONG
const { currentImageId, setCurrentImageId } = useEntityProject()

// ✅ CORRECT
const { currentViewpoint, setCurrentViewpoint } = useEntityProject()
```

### Pattern 5: Line.constraints property
```typescript
// ❌ WRONG
line.constraints.direction
line.constraints.targetLength

// ✅ CORRECT (direct properties on Line)
line.direction
line.targetLength
```

---

## Execution Strategy

### Phase 1: Fix Core Components (Day 1) ✅ COMPLETE
1. ✅ All hooks fixed
2. ✅ MainLayout.tsx (central hub - 19 errors)
3. ✅ ImageViewer.tsx (12 errors)
4. ✅ ImageNavigationToolbar.tsx (15 errors)
5. ✅ Fixed all naked `any` types in these components

### Phase 2: Fix Supporting Components (Day 1-2)
5. Fix OptimizationPanel.tsx (9 errors)
6. Fix LinesManager.tsx (6 errors)
7. Fix ConstraintPropertyPanel.tsx (5+ errors)
8. Fix ImagePointsManager.tsx (8 errors)

### Phase 3: Fix Remaining Components (Day 2)
9. Fix all other component files (~35 errors)
10. Fix services/export.ts (16 errors)

### Phase 4: Fix Tests (Day 2-3)
11. Fix test files last (~211 errors)

---

## Notes

- **Entity layer is LOCKED** - do not modify entity files unless absolutely necessary
- **Use object references** - Never use IDs at runtime
- **React keys** - Use stable identifiers like `entity.getName()` or create temporary ID maps
- **Sets not Arrays** - Remember `constraints` is a `Set<Constraint>`, not an array
- **Spread pattern** - Always use `setProject({ ...project } as Project)` for re-renders

---

## Reference Documents

For complete architectural context, see:

- **`CLAUDE.md`** - Project instructions, core architectural rules
  - Section: "CRITICAL: Object References, NOT IDs"
  - Section: "React Re-render Pattern (NOT Angular!)"

- **`docs/architectural-rules.md`** (if exists) - Detailed architecture documentation

- **`src/entities/README.md`** - Entity layer lockdown notice

- **Hook fixes summary** - See conversation history for detailed changes made to all 8 hooks
