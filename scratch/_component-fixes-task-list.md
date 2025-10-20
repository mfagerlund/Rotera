# Component Fixes Task List

## Context: Object-Reference Architecture Migration

**Status**: Phase 1 COMPLETE! Core components fixed. ~381 errors remaining.

**Total TypeScript Errors**: 427 → **~381 remaining** (46 eliminated)

---

## ✅ Session Progress (2025-01-20)

**Completed:**
1. ✅ **MainLayout.tsx (19 errors fixed)**
   - Changed `currentImageId` → `currentViewpoint` (entity object)
   - Removed all ID-based Maps → converted to entity arrays
   - Fixed `.id` property accesses (changed to `.getName()`)
   - Fixed Set.length → Set.size
   - Eliminated `any` type for `updatedLine` parameter

2. ✅ **ImageNavigationToolbar.tsx (15 errors fixed)**
   - Changed interface from `Map<string, Viewpoint>` → `Viewpoint[]`
   - Changed `currentImageId` → `currentViewpoint`
   - Fixed all `viewpoint.id` → `viewpoint.getName()`
   - Fixed drag-and-drop to use entity names instead of IDs
   - Fixed imagePoints iteration: `Object.values()` → `Array.from(Set)`

3. ✅ **ImageViewer.tsx (12 errors fixed)**
   - Fixed all `worldPoint.id` → `worldPoint` (pass object directly)
   - Fixed `line.isVisible()` → `line.isVisible` (property not method)
   - Updated `ImageViewerRenderState` to use entity objects instead of ID arrays
   - Eliminated ALL `any` types in render state interface

4. ✅ **image-viewer/types.ts (Type safety improvements)**
   - Changed `selectedPoints: string[]` → `selectedPoints: WorldPoint[]`
   - Changed `selectedLines: any[]` → `selectedLines: Line[]`
   - Changed `hoveredLine: any | null` → `hoveredLine: Line | null`
   - Added proper Line import

**Key Patterns Applied:**
- ✅ Entity objects passed directly (no `.id` lookups)
- ✅ Collections as Arrays/Sets (no ID-based Maps)
- ✅ `getName()` used for React keys and comparisons
- ✅ Circular references maintained (WorldPoint.imagePoints properly populated)
- ✅ Zero tolerance for naked `any` types

**Next Priority:**
- useImageViewerRenderer.ts (14 errors)
- OptimizationPanel.tsx (9 errors)
- ImagePointsManager.tsx (8 errors)

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

### Medium Priority - Image Viewer Components (41 errors)

#### **src/components/ImageNavigationToolbar.tsx** (15 errors)
- Multiple `.id` accesses on Viewpoint objects
- Lines 91, 118-122, 126-127, 131, 181, 186, 198, 367, 381, 391: Viewpoint.id
- Line 508: WorldPoint.id

#### **src/components/image-viewer/useImageViewerRenderer.ts** (14 errors)
- All accessing `.id` on WorldPoint objects
- Lines 71, 80-83, 140, 385-386, 474-475, 507, 546, 574-575

#### **src/components/ImageViewer.tsx** (12 errors)
- Lines 149, 191, 327, 330-331, 334, 383, 492, 757, 760: WorldPoint.id
- Lines 328, 332: Line.id

#### **src/components/ImagePointsManager.tsx** (8 errors)
- Lines 46-47, 67, 99: Accessing `.id` on WorldPoint and Viewpoint
- Lines 46, 99: Set indexing issue

**Common issues**:
- Accessing `.id` on WorldPoint, Viewpoint entities
- Need to use entity object references for React keys

---

### Medium Priority - Other Components (35 errors)

#### **src/services/export.ts** (16 errors)
Export/serialization service - needs ID generation for DTOs

#### **src/components/OptimizationPanel.tsx** (9 errors)
- Lines 35, 39: Using `.length` and `.filter` on `Set<Constraint>` (should convert to array first)

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

### Pattern 1: Accessing .id on entities
```typescript
// ❌ WRONG
const id = worldPoint.id
const key = line.id

// ✅ CORRECT - Use Symbol for React keys
const key = Symbol.keyFor(worldPoint as any) || worldPoint.getName()

// OR create temporary ID map when needed
const pointIds = new Map<WorldPoint, string>()
project.worldPoints.forEach((p, i) => pointIds.set(p, `point_${i}`))
```

### Pattern 2: Set.length → Set.size
```typescript
// ❌ WRONG
if (project.constraints.length > 0)
const filtered = constraints.filter(c => c.isEnabled)

// ✅ CORRECT
if (project.constraints.size > 0)
const filtered = Array.from(constraints).filter(c => c.isEnabled)
```

### Pattern 3: currentImageId → currentViewpoint
```typescript
// ❌ WRONG
const { currentImageId, setCurrentImageId } = useEntityProject()

// ✅ CORRECT
const { currentViewpoint, setCurrentViewpoint } = useEntityProject()
```

### Pattern 4: Line.constraints property
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
