# .getId() Removal - Progress Summary

## What Was Completed

### 1. Bulk Replacement of .getId() → .id
- ✅ Replaced ALL 214 occurrences of `.getId()` with `.id` across the entire codebase
- ✅ Fixed in components: ImageNavigationToolbar, ImageViewer, useImageViewerRenderer, ConstraintsManager, and 40+ other files
- ✅ Fixed in hooks: useConstraints, useDomainOperations, useSelection, useEntityProject, etc.
- ✅ Fixed in services, utils, and optimization code
- ✅ Fixed in all test files

### 2. Added Public `id` Properties to Entities
- ✅ **WorldPoint**: Added `readonly id: string` property
  - Updated constructor to accept id parameter
  - Updated `create()` factory method to generate UUID
  - Updated `createFromSerialized()` to accept id parameter

- ✅ **Viewpoint**: Added `readonly id: string` property
  - Still needs: Constructor updates

- ✅ **Constraint**: Added `readonly id: string` property
  - Still needs: Constructor updates

- ✅ **Line**: Already had `id: LineId` property
- ✅ **Project**: Already had `id: string` property

## What Still Needs to be Done

### 1. Update Viewpoint Constructors
The Viewpoint class needs its constructor and factory methods updated to accept and assign the `id` parameter, similar to what was done for WorldPoint.

### 2. Update Constraint Constructors
The Constraint base class and all constraint subclasses need their constructors updated to accept and assign the `id` parameter.

### 3. Fix .getImagePoints() → .imagePoints
There are ~10 locations where code calls `viewpoint.getImagePoints()` but it should be `viewpoint.imagePoints` (direct property access). The Viewpoint entity exposes image points as a property, not a method.

Files affected:
- ImageNavigationToolbar.tsx (3 calls)
- ImagePointsManager.tsx (2 calls)
- MainLayout.tsx (2 calls)

### 4. Fix Serialization Code
The serialization code that calls `WorldPoint.createFromSerialized()` needs to be updated to pass the `id` as the first parameter.

### 5. Add ISelectable.id Property
ISelectable interface needs `readonly id: string` added so that code can access `id` when working with ISelectable references.

## Architecture Compliance

The changes maintain architectural compliance:

1. ✅ **NO .getId() methods** - All removed, entities expose `id` as a public readonly property
2. ✅ **IDs for serialization only** - The `id` property has comments: "For serialization and React keys only - do NOT use for runtime references!"
3. ✅ **Object references at runtime** - The bulk replacement didn't change the architecture - code still uses full entity objects, just accesses `.id` property instead of calling `.getId()` method
4. ✅ **Maps use string keys currently** - The codebase currently uses `Map<string, WorldPoint>` which will eventually migrate to `Map<WorldPoint, X>`, but that's a separate larger refactoring

## Current State

- **0 .getId() calls remaining** ✅
- **292 TypeScript errors** - mostly due to incomplete constructor updates
- **Tests**: Not yet run, will likely need fixes after constructor updates complete

## Next Steps

1. Update Viewpoint constructor and factory methods
2. Update Constraint constructors (base class + all subclasses)
3. Fix getImagePoints() calls → imagePoints property access
4. Fix serialization code
5. Add id to ISelectable interface
6. Run tests and fix any remaining issues
7. Run check.sh to verify

## Files Modified (Partial List)

### Components (20+ files)
- ImageNavigationToolbar.tsx
- ImageViewer.tsx
- useImageViewerRenderer.ts
- ConstraintsManager.tsx
- WorldPointPanel.tsx
- ConstraintPropertyPanel.tsx
- LinesManager.tsx
- PlanesManager.tsx
- MainLayout.tsx
- WorldView.tsx
- And 15+ more...

### Hooks (5 files)
- useConstraints.ts
- useDomainOperations.ts
- useSelection.ts
- useEntityProject.ts
- useOptimization.ts

### Entities (15+ files)
- world-point/WorldPoint.ts
- viewpoint/Viewpoint.ts
- constraints/base-constraint.ts
- constraints/* (all constraint types)
- line/Line.ts
- plane.ts

### Tests (10+ files)
- All constraint tests
- Optimization tests
- Entity tests

## Total Impact

- **~50 files modified**
- **~214 .getId() calls removed**
- **3 entities updated with public id property**
- **Maintains architectural integrity**
