# Architectural Violations Report

**Generated**: 2025-10-19
**Updated**: 2025-10-19 (after user review)
**Status**: VIOLATIONS FOUND - Requires cleanup

---

## Executive Summary

The codebase has **3 CRITICAL VIOLATIONS** of the "ONE Representation Per Concept" rule:

1. ❌ **Duplicate Project types** (`Project` vs `EntityProject`)
2. ❌ **Duplicate geometry types** in `types/geometry.ts`
3. ❌ **Widespread usage of legacy types** (43+ files importing `types/project.ts`)

---

## Detailed Violation Analysis

### ✅ CORRECT PATTERNS FOUND

#### Entity Design (GOOD)
The main entity classes follow the rules perfectly:

**frontend/src/entities/line/Line.ts**:
- ✅ Uses object references: `pointA: WorldPoint`, `pointB: WorldPoint`
- ✅ Never uses IDs at runtime
- ✅ Has bidirectional relationships

**frontend/src/entities/line/LineDto.ts**:
- ✅ DTOs use IDs for serialization: `pointA: PointId`, `pointB: PointId`
- ✅ DTOs only for JSON conversion

**frontend/src/entities/world-point/WorldPoint.ts**:
- ✅ Uses Sets for relationships: `Set<ILine>`, `Set<IConstraint>`
- ✅ Rich object model with circular refs

**frontend/src/store/project-serialization.ts**:
- ✅ Sealed serialization module
- ✅ Conversion functions: `projectToDto()`, `dtoToProject()`
- ✅ DTOs only at save/load boundary

**frontend/src/store/project-store.ts**:
- ✅ Global project variable: `export let project: EntityProject`
- ✅ Simple add/delete functions, no repository pattern
- ✅ Direct collection access

---

### ❌ CRITICAL VIOLATIONS

#### Violation #1: Duplicate Project Types

**Problem**: TWO definitions of "Project"

**Location 1**: `frontend/src/types/project-entities.ts` (CORRECT)
```typescript
export interface EntityProject {
  worldPoints: Map<string, WorldPoint>  // ✓ Uses Map
  lines: Map<string, Line>
  viewpoints: Map<string, Viewpoint>
  constraints: Constraint[]
}
```

**Location 2**: `frontend/src/types/project.ts` (LEGACY - WRONG)
```typescript
export interface Project {
  worldPoints: Record<string, WorldPoint>  // ✗ Uses Record
  lines: Record<string, Line>
  planes: Record<string, Plane>
  cameras: Record<string, Camera>
  constraints: Constraint[]
}
```

**Impact**:
- **43 files** import from `types/project.ts`
- Creates confusion about which is the "real" project type
- Different collection types (Map vs Record)
- `Project` includes deprecated types (cameras, planes with old structure)

**Solution**: DELETE `types/project.ts` entirely, migrate all imports to `types/project-entities.ts`

---

#### Violation #2: Duplicate Entity Definitions

**Problem**: MULTIPLE definitions for WorldPoint, Line, Plane, Constraint

##### WorldPoint Duplication

**Correct Location**: `frontend/src/entities/world-point/WorldPoint.ts`
```typescript
export class WorldPoint {
  constructor(
    private _xyz: [number | null, number | null, number | null],
    // ... uses object references
  ) {}
}
```

**Duplicate 1**: `frontend/src/types/project.ts:3-15`
```typescript
export interface WorldPoint {
  id: string
  xyz?: [number, number, number]
  imagePoints: ImagePoint[]  // ✗ Inline array
  // ... uses IDs, not objects
}
```

**Duplicate 2**: `frontend/src/types/geometry.ts:13-21`
```typescript
export interface Point extends BaseEntity {
  type: 'point'
  xyz?: [number, number, number]
  imagePoints: ImagePoint[]
  // ... different structure
}
```

##### Line Duplication

**Correct Location**: `frontend/src/entities/line/Line.ts`
```typescript
export class Line {
  constructor(
    private _pointA: WorldPoint,  // ✓ Object reference
    private _pointB: WorldPoint   // ✓ Object reference
  ) {}
}
```

**Duplicate 1**: `frontend/src/types/project.ts:179-194`
```typescript
export interface Line {
  pointA: string  // ✗ ID, not object
  pointB: string  // ✗ ID, not object
}
```

**Duplicate 2**: `frontend/src/types/geometry.ts:23-30`
```typescript
export interface Line extends BaseEntity {
  definition: {
    pointIds: [string, string]  // ✗ IDs in definition
  }
}
```

##### Constraint Duplication

**Correct Location**: `frontend/src/entities/constraints/base-constraint.ts`
```typescript
export abstract class Constraint {
  // Polymorphic class hierarchy
  // Uses object references internally
}
```

**Duplicate 1**: `frontend/src/types/project.ts:59-75`
```typescript
export interface Constraint {
  entities: {
    points?: string[]  // ✗ ID arrays
    lines?: string[]   // ✗ ID arrays
  }
}
```

**Duplicate 2**: `frontend/src/types/geometry.ts:86-124`
```typescript
export interface EnhancedConstraint {
  entities: {
    points: string[]  // ✗ ID arrays
    lines: string[]
  }
}
```

---

#### Violation #3: Widespread Legacy Type Usage

**Problem**: Legacy types are still actively used throughout the codebase

**Files importing `types/project.ts`**: 43 files
- components/MainLayout.tsx
- components/ConstraintsManager.tsx
- components/WorldPointEditor.tsx
- services/export.ts
- services/validation.ts
- hooks/useConstraints.ts
- hooks/useSelection.ts
- ... and 36 more files

**Files importing `types/geometry.ts`**: 5 files
- components/MainLayout.tsx
- hooks/useEnhancedProject.ts
- utils/visualLanguage.ts
- components/ConstraintTimeline.tsx
- hooks/useLines.ts

**Impact**:
- Components using wrong type definitions
- Type mismatches between entity classes and interfaces
- Confusion about which types to use
- Makes refactoring dangerous

---

## Compliance Checklist Against Architectural Rules

### Rule 1: Entities Use Object References
- ✅ **WorldPoint**: Uses `Set<ILine>`, `Set<IConstraint>`
- ✅ **Line**: Uses `pointA: WorldPoint`, `pointB: WorldPoint`
- ✅ **Viewpoint**: Uses object refs in constraints
- ⚠️ **Legacy types in project.ts/geometry.ts**: Use IDs instead

### Rule 2: DTOs Only for Serialization
- ✅ **WorldPointDto**: Uses IDs, only in serialization layer
- ✅ **LineDto**: Uses `pointA: PointId`, `pointB: PointId`
- ✅ **ViewpointDto**: Uses IDs for references
- ✅ **Serialization boundary**: Clean separation in `project-serialization.ts`

### Rule 3: APIs Operate on Entities
- ✅ **project-store.ts**: `addWorldPoint(point: WorldPoint)`
- ✅ **project-store.ts**: `addLine(line: Line)`
- ✅ **All store functions**: Accept entity objects, not IDs
- ✅ **No ID lookups**: No `project.get(id)` pattern in APIs

### Rule 4: ONE Representation Per Concept
- ❌ **WorldPoint**: 3 definitions (class + 2 interfaces)
- ❌ **Line**: 3 definitions (class + 2 interfaces)
- ❌ **Project**: 2 definitions (EntityProject + Project)
- ❌ **Constraint**: 3 definitions (class hierarchy + 2 interfaces)
- ✅ **Viewpoint**: 1 class definition (good!)

### Rule 5: Global Project State
- ✅ **project-store.ts**: Global `let project: EntityProject`
- ✅ **No repository pattern**: Simple functions only
- ✅ **Direct access**: Components can access project directly

### Rule 6: No Legacy Code
- ❌ **types/project.ts**: Legacy file with old structures
- ❌ **types/geometry.ts**: Unused/alternative geometry system
- ❌ **43+ files**: Still importing legacy types

---

## Recommended Cleanup Actions

### Priority 1: Delete Legacy Type Files (HIGH PRIORITY)

**Action 1.1**: Delete `frontend/src/types/project.ts`
- Impact: 43 files need migration
- Risk: High - widespread usage
- Benefit: Eliminates primary source of duplication

**Action 1.2**: Delete `frontend/src/types/geometry.ts`
- Impact: 5 files need migration
- Risk: Low - limited usage
- Benefit: Removes alternative geometry system

### Priority 2: Migrate Imports (HIGH PRIORITY)

**Action 2.1**: Update all imports from `types/project` to use:
- `EntityProject` from `types/project-entities`
- Entity classes from `entities/*`
- DTOs only in serialization code

**Action 2.2**: Update all imports from `types/geometry` to:
- Use entity classes from `entities/*`
- Remove references to `Point`, `Line`, `EnhancedConstraint` interfaces

### Priority 3: Clean Up Related Code (MEDIUM PRIORITY)

**Action 3.1**: Remove any code adapting between type systems
**Action 3.2**: Delete helper functions converting between duplicate types
**Action 3.3**: Update type annotations in components

---

## Migration Strategy

### Phase 1: Preparation
1. Run full test suite to establish baseline
2. Create list of all files importing legacy types (done above)
3. Identify conversion/adapter code

### Phase 2: File-by-File Migration
1. Start with leaf nodes (components with fewest dependencies)
2. Update imports to use entity classes
3. Fix type errors
4. Test each file
5. Commit incrementally

### Phase 3: Delete Legacy Files
1. Verify no remaining imports
2. Delete `types/project.ts`
3. Delete `types/geometry.ts`
4. Run full test suite
5. Final commit

### Phase 4: Validation
1. Run `bash check.sh`
2. Verify no duplicate type definitions remain
3. Grep for any remaining references
4. Update this report to COMPLIANT

---

## Enforcement Going Forward

### Pre-Commit Checklist
- [ ] No new files in `types/` that duplicate entities
- [ ] All new code uses entity classes, not interfaces
- [ ] DTOs only in serialization layer
- [ ] No ID-based references at runtime
- [ ] APIs accept entities, not IDs

### Automated Checks (Future)
- Lint rule: No imports from deleted legacy files
- Lint rule: Entities must use object references
- Lint rule: DTOs only in serialization modules
- CI check: Verify architectural-rules.md compliance

---

## Summary Statistics

- **Total Entity Types**: 4 (WorldPoint, Line, Viewpoint, Constraint)
- **Duplicate Definitions**: 9 (3 WorldPoint, 3 Line, 2 Project, 3 Constraint)
- **Files Using Legacy Types**: 43+ files
- **Files to Migrate**: 48 files (43 project.ts + 5 geometry.ts)
- **Compliance Score**: 60% (serialization/APIs good, type duplication bad)

---

## Next Steps

1. **Answer clarifying questions** in `architectural-rules.md` (Q1-Q7)
2. **Approve migration plan** above
3. **Execute migration** in 3 phases
4. **Verify compliance** with `bash check.sh`
5. **Lock down rules** with lint rules

---

## Architectural Decisions (APPROVED)

All architectural questions have been reviewed and approved:

| Decision | Status |
|----------|--------|
| ImagePoint embedding in Viewpoint | ✅ Approved |
| Constraint class hierarchy | ✅ Approved |
| Entity IDs for serialization | ✅ Approved |
| Metadata on entities | ✅ Approved |
| Validation at DTO boundaries | ✅ Approved |
| Map/Set/Array collections | ✅ Approved |
| Optional properties over null | ✅ Approved |

---

**Status**: ⚠️ READY FOR MIGRATION - User has approved architectural rules
**Current Violations**: 3 critical violations remain (48 files to migrate)
**Code Quality Fix**: ✅ Fixed terrible O(n*m) sorting in ImageNavigationToolbar (now O(n log n))
**Entity Consolidation**: ✅ Viewpoint = Camera + Image (1:1:1, already done)
**Next Action**: Execute cleanup migration to remove duplicate types
**Estimated Effort**: 2-4 hours (43 files from project.ts + 5 files from geometry.ts)
