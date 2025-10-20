# Component Fixes Task List

**Status**: 427 → **~230 errors** (~197 fixed, 28+ components migrated)

**Architecture**: Object references, NOT IDs at runtime. See `CLAUDE.md` for details.

---

## ✅ Completed (28+ components)

**Session 1 (4 components, 46 errors):**
- MainLayout.tsx, ImageNavigationToolbar.tsx, ImageViewer.tsx, image-viewer/types.ts

**Session 2 (3 components, 31 errors):**
- useImageViewerRenderer.ts, OptimizationPanel.tsx, ImagePointsManager.tsx
- Added `getEntityKey()` utility (src/utils/entityKeys.ts) for React keys

**Session 3 (10 components, 33 errors):**
- LinesManager, ConstraintPropertyPanel, WorldView, WorldPointPanel
- MainToolbar, ConstraintsManager (removed DTO ID usage at runtime!)
- EntityListPopup, ImageEditor, WorldWorkspace

**Session 4 (11+ components, ~87 errors):**
- LineCreationTool.tsx - removed `LineConstraintSettings`, use `line.direction`/`line.targetLength`
- CreationToolsManager.tsx - same as above
- PlanesManager.tsx - match points by name (planes still legacy)
- ImagePointsManager.tsx - use `IWorldPoint` interface
- OptimizationPanel.tsx - `Array.from(Set)`, fix isOptimized check
- WorldPointPanel.tsx - fix context menu position
- useLoopTrace.ts - remove `LineConstraintSettings`
- Viewpoint.ts - fix `Vec4` import and `lockedXyz` → `position`
- WorkspaceManager.tsx - `currentImageId` → `currentViewpoint`
- MainLayout.tsx - Sets → Maps with `getEntityKey()`, mostly fixed
- entities/interfaces.ts - add `color` to `IWorldPoint`, `imagePoints` to `IViewpoint`

**Infrastructure:**
- Fixed ScalarAutograd `Vec4` export (reinstalled local package)
- Created Maps from Sets using `getEntityKey()` for component lookups

---

## ⚠️ Remaining Work (~230 errors)

**Component Errors (~21):**
- MainLayout.tsx (6) - plane callbacks need object refs, prop mismatches
- useImageViewerRenderer.ts (11) - hovered/dragged properties, LineData vs Line
- ImageNavigationToolbar.tsx (3) - callbacks need IWorldPoint signatures
- MainToolbar.tsx (1) - callback signature mismatch

**Constraint Entities (~100+ errors):**
- All constraint files still use `.id` and import missing `../../types/ids`
- Need to remove ID usage from constraint implementations
- Fix `getDefinedCoordinates` calls (method doesn't exist)

**Tests (~109 errors):**
- all-constraints.test.ts (84)
- fixed-point-constraint.test.ts, intrinsic-constraints.test.ts
- Fix LAST per original plan

**Known Issues:**
- 7 runtime ID violations (check-no-runtime-ids.ts)
- Planes still in legacy format (use string IDs)
- Some components expect concrete types but get interfaces

---

## Key Fixes Applied This Session

**Line entities:**
```typescript
// OLD: line.constraints.direction
line.direction  // Direct property

// OLD: line.constraints.targetLength
line.targetLength  // Direct property

// Removed: LineConstraintSettings interface
```

**Sets → Maps conversion:**
```typescript
// Project uses Sets, components need Maps with keys
const worldPointsMap = useMemo(() => {
  const map = new Map<string, WorldPoint>()
  for (const wp of project.worldPoints) {
    map.set(getEntityKey(wp), wp)
  }
  return map
}, [project?.worldPoints])
```

**Workspace state:**
```typescript
// OLD: currentImageId: string | null
currentViewpoint: Viewpoint | null  // Object reference
```

**Entity interfaces:**
```typescript
export interface IWorldPoint {
  getName(): string
  hasCoordinates(): boolean
  lockedXyz?: [number | null, number | null, number | null]
  color: string  // ADDED
}

export interface IViewpoint {
  getName(): string
  imageWidth: number
  imageHeight: number
  imagePoints: Set<IImagePoint>  // ADDED
}
```

---

## Quick Reference

**Common Fixes:**
```typescript
// React keys: getEntityKey(entity) NOT entity.id or getName()
<div key={getEntityKey(worldPoint)}>

// Object refs: line.pointA NOT line.pointAId
const point = line.pointA

// Sets: .size NOT .length, Array.from() for array methods
if (project.constraints.size > 0)

// Lines: line.direction NOT line.constraints.direction
const dir = line.direction
const len = line.targetLength

// Hooks: currentViewpoint NOT currentImageId
const { currentViewpoint } = useEntityProject()

// Re-renders: setProject({ ...project })

// Maps from Sets: use getEntityKey()
const map = new Map()
for (const entity of set) {
  map.set(getEntityKey(entity), entity)
}
```

**Rules:**
- Entity layer LOCKED - fix UI, not entities
- Object references at runtime, IDs only for serialization
- Sets not Arrays for entity collections
- Zero tolerance for `any` types
- Use `getEntityKey()` for React keys and Map lookups
