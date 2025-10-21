# Component Fixes Task List

**Status**: 427 → 318 → **279 errors** (~148 fixed total, 39 this session)

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

**Session 5 (39 errors fixed):**
- useImageViewerRenderer.ts (11) - hover/drag object refs, LineData constraints access
- ImageNavigationToolbar.tsx (3) - WorldPoint type casts for interface compatibility
- MainToolbar.tsx (1) - onConstraintClick signature uses object refs
- MainLayout.tsx (6) - LineData mapping, movePoint signature, Plane imports, prop names
- CreationToolsManager.tsx - currentViewpoint (not currentImageId)
- Services: export.ts, fileManager.ts, storage.ts - removed createdAt/updatedAt, fixed Set methods
- Utilities: imageUtils.ts, visualLanguage.ts, constraint-entity-converter.ts - removed ID imports
- Optimization: equal-angles-residual.ts, equal-distances-residual.ts - use getName()
- Created ProjectSettings type export

**Infrastructure:**
- Fixed ScalarAutograd `Vec4` export (reinstalled local package)
- Created Maps from Sets using `getEntityKey()` for component lookups

---

## ⚠️ Remaining Work (~279 errors)

**Constraint Entities (~100+ errors):**
- All constraint files still use `.id` property access and import `../../types/ids`
- DTOs use IDs (which is correct for serialization)
- Runtime code accessing `.id` on WorldPoint (doesn't exist)
- Fix `getDefinedCoordinates` calls (method doesn't exist on WorldPoint)
- NOTE: Entity layer locked - may need architectural decision

**Tests (~109+ errors):**
- all-constraints.test.ts (84)
- fixed-point-constraint.test.ts, intrinsic-constraints.test.ts
- polymorphic-constraints.test.ts
- testUtils.tsx - MockConstraintRepository, WorldPoint constructor calls
- real-data-optimization.test.ts
- Fix LAST per original plan

**Known Issues:**
- Runtime ID violations remain (check-no-runtime-ids.ts)
- Planes still in legacy format (use string IDs)
- Tests reference old APIs (WorldPoint constructor, ConstraintRepository)

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
- Use `getEntityKey()` for React keys (NEVER getName() - not unique!)
- NO legacy code - delete it, don't fix it

## Constraint Serialization Pattern

**Reference file:** `src/entities/Serialization.ts`

All constraint serialization happens in the Serialization class, following the same pattern as Lines and ImagePoints:

1. **Define DTO interface** with IDs for references:
```typescript
interface DistanceConstraintDto {
  id: string
  type: 'distance_point_point'
  pointAId: string  // ID references to other entities
  pointBId: string
  targetDistance: number
  // ... other properties
}
```

2. **In `dtoToProject()`**, resolve IDs to objects using the maps:
```typescript
const constraints = new Set<Constraint>()
dto.constraints.forEach(constraintDto => {
  const constraint = this.dtoToConstraint(constraintDto, idToWorldPoint, lines)
  if (constraint) constraints.add(constraint)
})
```

3. **In `dtoToConstraint()`**, dispatch by type and resolve references:
```typescript
private static dtoToDistanceConstraint(
  dto: DistanceConstraintDto,
  idToWorldPoint: Map<string, WorldPoint>
): Constraint | null {
  // Resolve ID references to actual objects
  const pointA = idToWorldPoint.get(dto.pointAId)
  const pointB = idToWorldPoint.get(dto.pointBId)

  if (!pointA || !pointB) return null

  // Call constraint factory with OBJECT REFERENCES
  return DistanceConstraint.create(pointA, pointB, ...)
}
```

**Key points:**
- DTOs store IDs (strings) for relationships
- During deserialization, build ID→Object maps ONCE upfront
- Use maps to resolve all references
- Pass resolved objects to entity constructors
- Constraints store objects at runtime, not IDs
