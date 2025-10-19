# Entity Architecture Cleanup - Implementation Plan

## Executive Summary

**Objective**: Eliminate duplicate entity representations and consolidate to single source of truth per concept.

**Problem**: Currently have 3-7 different representations per entity (WorldPoint, Line, Camera, Constraints), violating the "no legacy code" principle.

**Solution**: Consolidate to ONE class per entity, ONE DTO per entity, ONE serializer for all conversions.

**Timeline**: ~2-3 days (incremental, with testing at each step)

**Risk Level**: Medium (breaking changes to serialization, no backward compatibility)

---

## Current State Analysis

### Duplicate Representations Count
- **WorldPoint**: 7 representations (entity, DTO, legacy type, geometry type, supporting services, re-exports, project type)
- **Line**: 3 representations (entity, DTO, legacy type)
- **Camera**: 4 representations (entity, DTO, legacy type, enhanced type)
- **Constraints**: 3 representations (polymorphic entities, legacy type, geometry type)

### Problems
1. Multiple competing definitions cause confusion
2. Legacy types in `types/` folder duplicate entity classes
3. Inconsistent DTO patterns (some co-located, some separated)
4. Supporting services spread across multiple files (WorldPointGeometry.ts, WorldPointValidation.ts, etc.)
5. Incomplete/scattered conversion utilities
6. Camera and Image have confusing 1:1 mapping

---

## Target Architecture

### Principles
1. **One Representation Rule**: Each concept gets exactly ONE class/interface
2. **Single Class Understanding**: Reading one file = complete understanding of entity
3. **Clean Separation**: Entities know business logic, DTOs are pure data, Serializer handles conversion
4. **No Legacy Code**: Delete all duplicate representations

### Directory Structure
```
frontend/src/
  entities/
    world-point/
      WorldPoint.ts          # Single consolidated class (all logic)
      WorldPointDto.ts       # Pure data interface
      index.ts

    line/
      Line.ts                # Single consolidated class
      LineDto.ts
      index.ts

    camera-image/            # NEW: Unified Camera+Image
      CameraImage.ts         # Replaces separate Camera/Image
      CameraImageDto.ts
      index.ts

    image-point/
      ImagePoint.ts          # Single consolidated class
      ImagePointDto.ts
      index.ts

    constraints/
      Constraint.ts          # Base class
      DistanceConstraint.ts  # Concrete implementations...
      AngleConstraint.ts
      ...
      dtos/
        ConstraintDto.ts     # Polymorphic DTO union
        ...
      index.ts

    interfaces/              # NEW: Cross-cutting interfaces
      ISelectable.ts
      IValidatable.ts
      IOptimizable.ts
      IResidualProvider.ts
      index.ts

    EntityProject.ts         # Project structure (moved from types/)

  serialization/             # NEW: Single conversion layer
    EntitySerializer.ts      # All entity ↔ DTO conversions
    index.ts

  optimization/
    (existing optimization system)
```

---

## Implementation Phases

### Phase 0: Pre-Flight Checks ⚠️

**CRITICAL: Verify tests are green before starting**

```bash
cd frontend
npm test
bash ../check.sh
```

**If tests fail, STOP and fix before proceeding.**

Create baseline commit:
```bash
git add -A
git commit -m "Baseline before architecture cleanup"
git tag baseline-before-cleanup
```

---

### Phase 1: Consolidate WorldPoint

**Goal**: Merge supporting files into single WorldPoint.ts

**Steps**:

1. **Read existing files**:
   - `entities/world-point/WorldPoint.ts`
   - `entities/world-point/WorldPointGeometry.ts`
   - `entities/world-point/WorldPointValidation.ts`
   - `entities/world-point/WorldPointRelationships.ts`

2. **Merge into WorldPoint.ts**:
   - Move all methods from Geometry, Validation, Relationships into WorldPoint class
   - Keep existing optimization logic (addToValueMap, computeResiduals, applyOptimizationResultFromValueMap)
   - Remove supporting class instantiations
   - Clean up imports

3. **Simplify data model** (preserve functionality):
   - Keep `_xyz: [number, number, number] | null` (current position)
   - Keep `_lockedAxes: { x: boolean, y: boolean, z: boolean }` (per-axis locking)
   - Add `_isOptimized: boolean` (flag after optimization)
   - Add `_optimizedAt: Date | null` (timestamp)
   - **Remove**: `_isLocked` (legacy global lock - use lockedAxes only)
   - **Remove**: `_xyzProvenance` (complex metadata - replace with simple flags)

4. **Delete files**:
   - `entities/world-point/WorldPointGeometry.ts`
   - `entities/world-point/WorldPointValidation.ts`
   - `entities/world-point/WorldPointRelationships.ts`
   - `entities/world-point.ts` (re-export file)

5. **Update WorldPointDto.ts**:
   - Match simplified data model
   - Pure data interface only

6. **Test**:
   ```bash
   npm test
   bash ../check.sh
   ```
   **Tests must be green before continuing.**

7. **Commit**:
   ```bash
   git add -A
   git commit -m "Consolidate WorldPoint into single class"
   ```

---

### Phase 2: Consolidate Line

**Goal**: Merge supporting files into single Line.ts

**Steps**: Same pattern as WorldPoint

1. Merge LineGeometry.ts, LineValidation.ts, LineRelationships.ts into Line.ts
2. Delete supporting files and re-export
3. Update LineDto.ts
4. **Test** (npm test && check.sh must be green)
5. Commit: `"Consolidate Line into single class"`

---

### Phase 3: Create Unified CameraImage

**Goal**: Replace Camera + Image with single CameraImage class

**Background**: Camera and Image have 1:1 mapping (camera extracted from image, cannot exist separately)

**Steps**:

1. **Create new entity**:
   - `entities/camera-image/CameraImage.ts`
   - Combines camera projection (quaternion + position, intrinsics, distortion)
   - Contains list of ImagePoints
   - Merge all Camera and Image methods

2. **Create DTO**:
   - `entities/camera-image/CameraImageDto.ts`
   - Pure data interface

3. **Update ImagePoint**:
   - Change references from Camera/Image to CameraImage
   - Update relationships

4. **Find and replace** (carefully):
   - Search for Camera class usage
   - Replace with CameraImage where appropriate
   - Be careful: some may be legitimate different camera concepts

5. **Delete old files**:
   - `entities/camera.ts`
   - Any Image entity files

6. **Update all imports** in:
   - Hooks (useProject.ts, useEnhancedProject.ts, useEntityManager.ts)
   - Components (OptimizationPanel.tsx, MainLayout.tsx)
   - Optimization code

7. **Test** (npm test && check.sh must be green)

8. **Commit**: `"Create unified CameraImage, remove separate Camera/Image"`

---

### Phase 4: Create Interfaces Folder

**Goal**: Move cross-cutting interfaces from types/ to entities/interfaces/

**Steps**:

1. **Create folder**: `entities/interfaces/`

2. **Move and consolidate interfaces**:
   - `types/selectable.ts` → `entities/interfaces/ISelectable.ts`
   - Extract IValidatable → `entities/interfaces/IValidatable.ts`
   - Extract IOptimizable → `entities/interfaces/IOptimizable.ts`
   - Extract IResidualProvider → `entities/interfaces/IResidualProvider.ts`
   - Create `entities/interfaces/index.ts` (re-export all)

3. **Update all imports** (find/replace):
   - `from '../../types/selectable'` → `from '../interfaces'`
   - etc.

4. **Test** (npm test && check.sh must be green)

5. **Commit**: `"Move interfaces to entities/interfaces/"`

---

### Phase 5: Create EntitySerializer

**Goal**: Single class handling all entity ↔ DTO conversions

**Steps**:

1. **Create folder**: `serialization/`

2. **Create EntitySerializer.ts**:
   ```typescript
   export class EntitySerializer {
     // WorldPoint
     static worldPointToDto(entity: WorldPoint): WorldPointDto { ... }
     static worldPointFromDto(dto: WorldPointDto): WorldPoint { ... }

     // Line
     static lineToDto(entity: Line): LineDto { ... }
     static lineFromDto(dto: LineDto, context: EntityContext): Line { ... }

     // CameraImage
     static cameraImageToDto(entity: CameraImage): CameraImageDto { ... }
     static cameraImageFromDto(dto: CameraImageDto): CameraImage { ... }

     // ImagePoint
     static imagePointToDto(entity: ImagePoint): ImagePointDto { ... }
     static imagePointFromDto(dto: ImagePointDto): ImagePoint { ... }

     // Constraints
     static constraintToDto(entity: Constraint): ConstraintDto { ... }
     static constraintFromDto(dto: ConstraintDto, context: EntityContext): Constraint { ... }

     // Full Project
     static projectToDto(project: EntityProject): ProjectDto { ... }
     static projectFromDto(dto: ProjectDto): EntityProject { ... }
   }
   ```

3. **Remove conversion logic from entities**:
   - Delete `toDTO()` / `fromDTO()` methods from entity classes
   - Entities should NOT know about serialization

4. **Delete old converters**:
   - `utils/constraint-entity-converter.ts`

5. **Update all serialization calls**:
   - Replace `worldPoint.toDTO()` with `EntitySerializer.worldPointToDto(worldPoint)`
   - Replace `WorldPoint.fromDTO(dto)` with `EntitySerializer.worldPointFromDto(dto)`
   - Update in hooks, components, utils

6. **Test** (npm test && check.sh must be green)

7. **Commit**: `"Create EntitySerializer, remove conversion methods from entities"`

---

### Phase 6: Move EntityProject

**Goal**: Move project structure from types/ to entities/

**Steps**:

1. **Move file**:
   - `types/project-entities.ts` → `entities/EntityProject.ts`

2. **Update imports** everywhere

3. **Test** (npm test && check.sh must be green)

4. **Commit**: `"Move EntityProject to entities/"`

---

### Phase 7: Delete Legacy Types

**Goal**: Remove all duplicate type definitions

**Files to delete**:
- `types/project.ts` (legacy WorldPoint, Line, Camera interfaces)
- `types/geometry.ts` (alternative Point, Line, Circle system)
- `types/enhanced-project.ts` (enhanced versions)
- `types/entities.ts` (if now empty)
- `types/ids.ts` (define type aliases where used instead)
- `types/` folder (if now empty)

**Steps**:

1. **Search for imports** from these files:
   ```bash
   grep -r "from.*types/project" frontend/src/
   grep -r "from.*types/geometry" frontend/src/
   grep -r "from.*types/enhanced-project" frontend/src/
   ```

2. **Replace with entity imports**:
   - `from types/project` → `from entities/world-point` (or appropriate entity)

3. **Delete files** listed above

4. **Delete old documentation**:
   - `CLEANUP_GUIDE.md`
   - `TYPESCRIPT_CONVERSION_GUIDE.md`
   - `frontend/src/MIGRATION_GUIDE.md`
   - `backend-refactor-tasks.md`
   - `mtasks.md`
   - `review-tasks*.md`
   - `tasks.md`

5. **Test** (npm test && check.sh must be green)

6. **Commit**: `"Delete legacy types and duplicate representations"`

---

### Phase 8: Final Verification

**Steps**:

1. **Run full test suite**:
   ```bash
   cd frontend
   npm test -- --coverage
   bash ../check.sh
   ```

2. **Manual testing checklist**:
   - [ ] Create new WorldPoint
   - [ ] Lock/unlock axes
   - [ ] Create Line between points
   - [ ] Create CameraImage
   - [ ] Add ImagePoints to CameraImage
   - [ ] Create constraints
   - [ ] Run optimization
   - [ ] Verify optimized positions displayed
   - [ ] Save project
   - [ ] Load project
   - [ ] Verify all entities deserialized correctly

3. **Code review checklist**:
   - [ ] No files import from deleted `types/` folder
   - [ ] All entities have single class file
   - [ ] All DTOs are in separate files
   - [ ] EntitySerializer handles all conversions
   - [ ] No toDTO()/fromDTO() methods on entities
   - [ ] Tests are green
   - [ ] No TypeScript errors
   - [ ] No ESLint warnings

4. **Documentation**:
   - Update README if needed
   - Document breaking changes (old projects won't load)

5. **Final commit**:
   ```bash
   git add -A
   git commit -m "Complete architecture cleanup - single representation per entity"
   git tag architecture-cleanup-complete
   ```

---

## Testing Strategy

### Test Requirements (CRITICAL)

**Before starting ANY phase**:
```bash
npm test        # Must be GREEN ✅
bash ../check.sh  # Must be GREEN ✅
```

**After EACH phase**:
```bash
npm test        # Must be GREEN ✅
bash ../check.sh  # Must be GREEN ✅
```

**If tests fail at any point**:
1. STOP immediately
2. Fix the failing tests
3. Do NOT proceed to next phase until green

### Test Coverage Areas

1. **Unit Tests**: Each entity class, serializer methods
2. **Integration Tests**: Full save/load cycle, optimization workflow
3. **Type Tests**: TypeScript compilation must succeed
4. **Lint Tests**: ESLint must pass

---

## Rollback Strategy

### If Phase Fails

**Option 1 - Revert to last commit**:
```bash
git reset --hard HEAD~1
```

**Option 2 - Revert to baseline**:
```bash
git reset --hard baseline-before-cleanup
```

### If Entire Cleanup Fails

**Complete rollback**:
```bash
git reset --hard baseline-before-cleanup
git tag -d architecture-cleanup-complete  # If created
```

---

## Breaking Changes

### ⚠️ WARNING: No Backward Compatibility

**Old project files will NOT load** after this cleanup:
- Serialization format changes (Camera → CameraImage)
- DTO structure changes
- Type definitions removed

**Migration**: Users must re-create projects or run manual migration script (not provided).

---

## Success Criteria

### Definition of Done

- [ ] Each entity has exactly ONE class file
- [ ] Each entity has exactly ONE DTO file
- [ ] EntitySerializer handles all conversions
- [ ] No types/ folder (or only interfaces moved to entities/interfaces/)
- [ ] No legacy type definitions
- [ ] No supporting service files (all merged into entities)
- [ ] CameraImage replaces Camera/Image split
- [ ] All tests GREEN ✅
- [ ] TypeScript compilation succeeds
- [ ] ESLint passes
- [ ] Manual testing checklist complete
- [ ] Code review checklist complete

### Metrics

**Before**:
- WorldPoint: 7 representations across 6+ files
- Line: 3 representations across 4+ files
- Camera: 4 representations across 3+ files

**After**:
- WorldPoint: 1 class + 1 DTO (2 files total)
- Line: 1 class + 1 DTO (2 files total)
- CameraImage: 1 class + 1 DTO (2 files total)

**Code Reduction**: ~40% fewer files, ~30% less duplicate code

---

## Timeline Estimate

| Phase | Time | Cumulative |
|-------|------|------------|
| Phase 0: Pre-flight | 15 min | 15 min |
| Phase 1: WorldPoint | 2 hours | 2.25 hours |
| Phase 2: Line | 1 hour | 3.25 hours |
| Phase 3: CameraImage | 3 hours | 6.25 hours |
| Phase 4: Interfaces | 1 hour | 7.25 hours |
| Phase 5: Serializer | 2 hours | 9.25 hours |
| Phase 6: EntityProject | 30 min | 9.75 hours |
| Phase 7: Delete legacy | 1 hour | 10.75 hours |
| Phase 8: Verification | 1 hour | 11.75 hours |

**Total**: ~12 hours (~1.5 days for one developer, or ~2-3 days with testing/breaks)

---

## Team Assignments

**Lead Developer** (owns entire cleanup):
- Executes all phases
- Ensures tests green at each step
- Reviews all changes

**QA/Tester**:
- Runs manual testing checklist (Phase 8)
- Verifies no regressions
- Tests edge cases

**Code Reviewer**:
- Reviews each commit
- Checks compliance with architecture principles
- Verifies no duplicate representations remain

---

## Questions/Issues

**Contact**: [Your Name/Team Lead]

**Slack Channel**: #architecture-cleanup

**Issue Tracker**: Tag with `architecture-cleanup`

---

## References

- CLAUDE.md: "NO backward compatibility and NO legacy code. Keep it CLEAN."
- CLAUDE.md: "NEVER create multiple objects, classes, interfaces, or types that serve the same or similar purposes."
- Architecture Discussion: `scratch/architecture-discussion.md`
- Cleanup Plan: `scratch/cleanup-plan.md`

---

**Document Version**: 1.0
**Created**: 2025-10-19
**Last Updated**: 2025-10-19
**Status**: Ready for execution
