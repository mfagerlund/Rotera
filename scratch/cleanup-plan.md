# Architecture Cleanup Plan

## Goal
Single representation per concept. No duplicate types, interfaces, or classes.

## Principles
1. Each entity = ONE class file containing ALL logic
2. DTOs = separate pure data interfaces
3. ONE serializer handles all entity↔DTO conversions
4. No types/ folder - types live with implementations
5. No legacy code - old projects will break

---

## Phase 1: Consolidate Entity Classes

### 1.1 WorldPoint - Merge Supporting Files
**Action**: Merge into single `frontend/src/entities/world-point/WorldPoint.ts`

**Merge these files:**
- `WorldPointGeometry.ts` → methods into WorldPoint class
- `WorldPointValidation.ts` → methods into WorldPoint class
- `WorldPointRelationships.ts` → methods into WorldPoint class
- Delete: `frontend/src/entities/world-point.ts` (re-export file)

**Keep:**
- `WorldPoint.ts` (consolidated)
- `WorldPointDto.ts` (pure data interface)

### 1.2 Line - Merge Supporting Files
**Action**: Merge into single `frontend/src/entities/line/Line.ts`

**Merge these files:**
- `LineGeometry.ts` → methods into Line class
- `LineValidation.ts` → methods into Line class
- `LineRelationships.ts` → methods into Line class
- Delete: `frontend/src/entities/line.ts` (re-export file)

**Keep:**
- `Line.ts` (consolidated)
- `LineDto.ts` (pure data interface)

### 1.3 CameraImage - Create Unified Class
**Action**: Replace Camera + Image with single `CameraImage` class

**Create:**
- `frontend/src/entities/camera-image/CameraImage.ts`
  - Camera projection (quaternion + position)
  - Intrinsics (focal length, principal point, distortion)
  - List of ImagePoints
  - All camera/image methods merged

- `frontend/src/entities/camera-image/CameraImageDto.ts`
  - Pure data interface

**Delete:**
- `frontend/src/entities/camera.ts` (both Camera class and CameraDto)
- Any Image class/interface
- Any re-export files

### 1.4 ImagePoint - Consolidate
**Action**: Single class file

**Create/Update:**
- `frontend/src/entities/image-point/ImagePoint.ts` (consolidated)
- `frontend/src/entities/image-point/ImagePointDto.ts`

**Delete:**
- Any supporting service files
- Any re-export files

### 1.5 Constraints - Already Good
**Keep as is** - constraints already have clean structure:
- Base class + concrete implementations
- DTOs in separate dtos/ folder
- No major changes needed

---

## Phase 2: Create Serialization Layer

### 2.1 Single Serializer Class
**Create:** `frontend/src/serialization/EntitySerializer.ts`

**Responsibilities:**
```typescript
class EntitySerializer {
  // WorldPoint
  static worldPointToDto(entity: WorldPoint): WorldPointDto
  static worldPointFromDto(dto: WorldPointDto): WorldPoint

  // Line
  static lineToDto(entity: Line): LineDto
  static lineFromDto(dto: LineDto, worldPoints: Map<string, WorldPoint>): Line

  // CameraImage
  static cameraImageToDto(entity: CameraImage): CameraImageDto
  static cameraImageFromDto(dto: CameraImageDto): CameraImage

  // ImagePoint
  static imagePointToDto(entity: ImagePoint): ImagePointDto
  static imagePointFromDto(dto: ImagePointDto): ImagePoint

  // Constraints
  static constraintToDto(entity: Constraint): ConstraintDto
  static constraintFromDto(dto: ConstraintDto, context: EntityContext): Constraint

  // Full project
  static projectToDto(project: EntityProject): ProjectDto
  static projectFromDto(dto: ProjectDto): EntityProject
}
```

**Delete:**
- `frontend/src/utils/constraint-entity-converter.ts` (replaced)
- Any `toDto()` / `fromDto()` methods on entities
- Any conversion logic scattered in repositories

---

## Phase 3: Delete Types Folder

### 3.1 Move Cross-Cutting Interfaces
**Move from types/ to entities/:**

- `types/selectable.ts` → `entities/interfaces/ISelectable.ts`
- `types/optimization.ts` → `entities/interfaces/IOptimizable.ts`
- Extract IValidatable → `entities/interfaces/IValidatable.ts`

### 3.2 Move Project Structure
**Move:**
- `types/project-entities.ts` → `entities/EntityProject.ts`
- Update imports everywhere

### 3.3 Delete Legacy Types
**Delete entirely:**
- `types/project.ts` (legacy WorldPoint, Line, Camera interfaces)
- `types/geometry.ts` (alternative Point, Line, Circle system)
- `types/enhanced-project.ts` (enhanced versions)
- `types/entities.ts` (if empty after moves)
- `types/ids.ts` (type aliases - define where used)
- **Delete entire types/ folder if empty**

---

## Phase 4: Update All References

### 4.1 Search and Replace
1. Camera → CameraImage (carefully - some may be legitimate camera references)
2. Update imports from types/ to new locations
3. Update repository methods to use EntitySerializer
4. Remove any .toDto() / .fromDto() calls on entities

### 4.2 Update Hooks
- `useProject.ts` - update to CameraImage
- `useEnhancedProject.ts` - update to CameraImage
- `useEntityManager.ts` - update serialization calls
- `useEntityProject.ts` - update to new structure

### 4.3 Update Components
- `OptimizationPanel.tsx` - use EntitySerializer
- `MainLayout.tsx` - update any camera references
- Any components using old types

### 4.4 Update Optimization
- `optimization/` folder - update to CameraImage
- Remove any old optimizer files if they exist
- Update constraint residuals to use CameraImage

---

## Phase 5: Testing & Verification

### 5.1 Run Tests
```bash
cd frontend
npm test
```

### 5.2 Run Check Script
```bash
bash check.sh
```

### 5.3 Manual Verification
- Load a project (old ones will break - expected)
- Create new entities
- Serialize/deserialize
- Run optimization
- Verify all entity types work

---

## Files to Delete (Summary)

### Entity Support Files
- `frontend/src/entities/world-point/WorldPointGeometry.ts`
- `frontend/src/entities/world-point/WorldPointValidation.ts`
- `frontend/src/entities/world-point/WorldPointRelationships.ts`
- `frontend/src/entities/world-point.ts` (re-export)
- `frontend/src/entities/line/LineGeometry.ts`
- `frontend/src/entities/line/LineValidation.ts`
- `frontend/src/entities/line/LineRelationships.ts`
- `frontend/src/entities/line.ts` (re-export)
- `frontend/src/entities/camera.ts` (replaced by CameraImage)

### Types Folder (entire folder)
- `frontend/src/types/project.ts`
- `frontend/src/types/geometry.ts`
- `frontend/src/types/enhanced-project.ts`
- `frontend/src/types/entities.ts`
- `frontend/src/types/ids.ts`
- `frontend/src/types/selectable.ts` (after moving)
- `frontend/src/types/` (folder itself)

### Utils
- `frontend/src/utils/constraint-entity-converter.ts` (replaced by EntitySerializer)

### Documentation (if exists)
- `CLEANUP_GUIDE.md`
- `TYPESCRIPT_CONVERSION_GUIDE.md`
- `frontend/src/MIGRATION_GUIDE.md`
- `backend-refactor-tasks.md`
- `mtasks.md`
- `review-tasks*.md`
- `tasks.md`

---

## Files to Create

### New Entities
- `frontend/src/entities/camera-image/CameraImage.ts`
- `frontend/src/entities/camera-image/CameraImageDto.ts`
- `frontend/src/entities/camera-image/index.ts`

### Interfaces
- `frontend/src/entities/interfaces/ISelectable.ts`
- `frontend/src/entities/interfaces/IValidatable.ts`
- `frontend/src/entities/interfaces/IOptimizable.ts`
- `frontend/src/entities/interfaces/IResidualProvider.ts`
- `frontend/src/entities/interfaces/index.ts`

### Serialization
- `frontend/src/serialization/EntitySerializer.ts`
- `frontend/src/serialization/index.ts`

### Project Structure
- `frontend/src/entities/EntityProject.ts`

---

## Execution Order

1. ✅ Update CLAUDE.md
2. ✅ Create cleanup plan
3. Merge WorldPoint supporting files
4. Merge Line supporting files
5. Create CameraImage (merge Camera + Image)
6. Create interfaces folder (move from types/)
7. Create EntitySerializer
8. Delete types/ folder
9. Delete legacy utils
10. Update all imports and references
11. Run tests
12. Run check.sh

---

## Risk Assessment

**Breaking Changes:**
- Old project files will NOT load (no backward compatibility)
- Camera → CameraImage is pervasive change
- All serialization logic changes

**Mitigation:**
- Work incrementally, verify at each step
- Keep git commits granular for easy rollback
- Test after each major change

**Expected Outcome:**
- Single representation per concept
- Cleaner, more maintainable codebase
- Easier to understand (one class = complete understanding)
- No hunting across multiple files
