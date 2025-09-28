# Data Structure Refactoring Plan

Based on the architecture review in `FRONTEND_DATA_ARCHITECTURE_REVIEW.md` and additional requirements for co-selection, validation, and referential integrity.

## Strategy: Type Usage Mapping Before Refactoring

**Problem**: TypeScript has ~58 build errors. Going "through the wall" by changing types and fixing errors as they appear is disheartening and error-prone.

**Solution**: Map current type usage BEFORE making changes, then make surgical replacements.

### Type Usage Mapping Tools Created
- `TYPE_USAGE_MAP.md` - Basic grep-based type usage mapping
- `TYPE_USAGE_ANALYSIS.md` - Comprehensive analysis with categories
- `scripts/find-type-usage.js` - Tool to find exact usage patterns

### Mapping Categories
1. **imports** - Where types are imported
2. **type_annotation** - Variable/parameter type annotations
3. **generic_usage** - Generic type parameters
4. **inheritance** - extends/implements usage
5. **implementation** - Interface implementations

## Overview

Transform the current project structure to:
- Separate DTOs (storage) from Domain objects (runtime)
- Use branded IDs for type safety
- Implement unified selection interface
- Add strict validation with fail-fast serialization
- Ensure referential integrity with cascading deletes
- Remove all legacy code and constraints

## Phase 0: Type Usage Analysis ✅ CURRENT

### 0.1 Map Current Type Usage
**Purpose**: Understand where each type is used before making breaking changes
**Files Created**:
- `TYPE_USAGE_MAP.md` - Grep-based basic mapping
- `scripts/find-type-usage.js` - Precise usage analysis tool
- `TYPE_USAGE_ANALYSIS.md` - Comprehensive categorized analysis

**Key Findings**:
- `Constraint` used in 38+ locations (imports, type annotations, parameters)
- `WorldPoint` used in 200+ locations across components, hooks, services
- `Project` used in 50+ locations
- Need surgical replacement strategy for each category

### 0.2 Refactoring Strategy Based on Usage
**Approach**: Replace types in dependency order:
1. **Foundation types first** (IDs, interfaces) - minimal impact
2. **DTO layer** - update storage types only
3. **Domain classes** - create alongside DTOs
4. **Component interfaces** - update gradually by file
5. **Imports last** - final switchover

## Phase 1: Foundation ✅ COMPLETED

### 1.1 Branded ID Types ✅ COMPLETED
**File**: `src/types/ids.ts`
- Create branded types: `PointId`, `LineId`, `PlaneId`, `CameraId`, `ImageId`, `ImagePointId`, `ConstraintId`, `ProjectId`
- Add type guards and creation helpers
- Add ID generation functions using crypto.randomUUID()

### 1.2 Selectable Interface ✅ COMPLETED
**File**: `src/types/selectable.ts`
- `ISelectable` interface for unified co-selection of points, lines, planes
- Include methods: `getId()`, `getType()`, `getDependencies()`, `getDependents()`
- Support batch selection operations across entity types

### 1.3 Validation Framework ✅ COMPLETED
**File**: `src/validation/validator.ts`
- `IValidatable` interface with `validate(project: ProjectDto): ValidationResult`
- Project-wide validation before saves (fail-fast)
- Referential integrity checks
- Dependency validation

## Phase 2: DTO Layer ✅ IN PROGRESS

### 2.1 Surgical Type Replacement Strategy
**Based on usage analysis**, replace types systematically:

**Step 2.1.1**: Create DTOs alongside existing types (no conflicts)
- `WorldPointDto` with branded `PointId` ✅ STARTED in `entities/world-point.ts`
- `LineDto` with branded `LineId`
- `PlaneDto` with branded `PlaneId`
- `CameraDto` with branded `CameraId`
- `ImageDto` with branded `ImageId`
- `ImagePointDto` with branded `ImagePointId` (NEW - missing in current)
- `ConstraintDto` with branded `ConstraintId`

**Step 2.1.2**: Update usage by category (from usage analysis):
1. **Storage layer first** (`services/fileManager.ts`, `services/export.ts`)
2. **Domain logic** (`hooks/useProject.ts`, `services/validation.ts`)
3. **Component props** (`components/*.tsx` - update prop types gradually)
4. **Import statements last** (final switchover)

### 2.2 Core Entity DTOs ✅ IN PROGRESS
**Files**: Co-located with domain classes - DTO + Domain class in same file
- `entities/world-point.ts` ✅ STARTED - WorldPointDto + WorldPoint class
- `entities/line.ts` - LineDto + Line class
- `entities/plane.ts` - PlaneDto + Plane class
- `entities/camera.ts` - CameraDto + Camera class
- `entities/image.ts` - ImageDto + Image class
- `entities/constraint.ts` - ConstraintDto + Constraint class

### 2.2 Project DTO (Storage Only)
**File**: `src/types/project-dto.ts`
```typescript
export interface ProjectDto {
  id: ProjectId
  version: number
  name: string
  createdAt: string
  updatedAt: string

  // Entity collections with branded IDs
  points: Record<PointId, WorldPointDto>
  lines: Record<LineId, LineDto>
  planes: Record<PlaneId, PlaneDto>
  cameras: Record<CameraId, CameraDto>
  images: Record<ImageId, ImageDto>
  constraints: ConstraintDto[]

  settings: ProjectSettingsDto

  // NO runtime state here (entityManager, selection, workspace)
}
```

### 2.3 Remove Legacy Constraints
- Delete all legacy constraint types from unions
- Remove legacy fields from existing constraint interfaces
- Update `getConstraintPointIds` in utils.ts for clean schema only
- Remove `ProjectMigration` from main model

## Phase 3: Domain Layer

### 3.1 Domain Classes with Repository Integration
**Pattern**: Each entity file contains both DTO and Domain class
```typescript
// world-point.ts
export interface WorldPointDto { ... }

export class WorldPoint implements ISelectable, IValidatable {
  private constructor(private repo: Repository, private data: WorldPointDto) {}

  static fromDTO(dto: WorldPointDto, repo: Repository): WorldPoint
  toDTO(): WorldPointDto

  // ISelectable implementation
  getId(): PointId
  getType(): 'point'
  getDependencies(): EntityId[]  // lines/constraints using this point
  getDependents(): EntityId[]    // what this point depends on

  // IValidatable implementation
  validate(project: ProjectDto): ValidationResult

  // Domain methods
  get name(): string
  set name(value: string)
  // ... other getters/setters
}
```

### 3.2 Repository with Caching and Integrity
**File**: `src/repository/repository.ts`
```typescript
export class Repository {
  constructor(private store: ProjectDto) {}
  private cache = new Map<EntityId, any>()
  private dependencyGraph = new Map<EntityId, Set<EntityId>>()

  // Entity accessors with caching
  point(id: PointId): WorldPoint
  line(id: LineId): Line
  // ... others

  // Dependency tracking
  addDependency(dependent: EntityId, dependency: EntityId): void
  removeDependency(dependent: EntityId, dependency: EntityId): void
  getDependencies(id: EntityId): EntityId[]
  getDependents(id: EntityId): EntityId[]

  // Cascading operations
  deletePoint(id: PointId): DeleteResult  // cascades to lines/constraints
  deleteLine(id: LineId): DeleteResult    // cascades to constraints

  // Validation
  validateIntegrity(): ValidationResult
}
```

## Phase 4: Runtime Session (Non-Persisted)

### 4.1 Project Session
**File**: `src/types/project-session.ts`
```typescript
export interface ProjectSession {
  repository: Repository
  selection: EntitySelection      // ISelectable[]
  workspace: WorkspaceState
  history: UndoStack
  entityManager: EntityManager    // moved from storage
}

export interface EntitySelection {
  items: ISelectable[]
  add(item: ISelectable): void
  remove(item: ISelectable): void
  clear(): void
  getByType<T extends ISelectable>(type: string): T[]
}
```

## Phase 5: Strict Serialization

### 5.1 Fail-Fast Serialization
**File**: `src/serialization/serializer.ts`
```typescript
export class ProjectSerializer {
  static serialize(session: ProjectSession): string {
    const dto = session.repository.toDTO()
    const validation = this.validateBeforeSave(dto)

    if (!validation.isValid) {
      throw new SerializationError(`Cannot save invalid project: ${validation.errors.join(', ')}`)
    }

    return JSON.stringify(dto, null, 2)
  }

  static deserialize(json: string): ProjectDto {
    const dto = JSON.parse(json) as ProjectDto
    const validation = this.validateAfterLoad(dto)

    if (!validation.isValid) {
      throw new DeserializationError(`Invalid project data: ${validation.errors.join(', ')}`)
    }

    return dto
  }

  private static validateBeforeSave(dto: ProjectDto): ValidationResult
  private static validateAfterLoad(dto: ProjectDto): ValidationResult
}
```

### 5.2 Validation Rules
- All entity references must exist
- No orphaned constraints (missing points/lines)
- No circular dependencies
- Required fields present
- ID format validation

## Phase 6: Component Integration

### 6.1 Update Components
- Components consume domain objects via repository
- Selection works with `ISelectable[]`
- Use branded IDs throughout
- Remove direct DTO manipulation

### 6.2 Hooks Integration
**File**: `src/hooks/useProject.ts`
- Return `ProjectSession` instead of raw project
- Provide selectors returning domain instances
- Hide repository implementation details

## Phase 7: Testing

### 7.1 Validation Tests
- Test referential integrity checks
- Test cascading delete scenarios
- Test serialization fail-fast behavior

### 7.2 Round-Trip Tests
- `deserialize(serialize(project))` equals original
- Domain object creation and DTO conversion
- Repository caching and dependency tracking

## Critical Requirements Addressed

✅ **Co-selection**: `ISelectable` interface allows unified selection of points, lines, planes
✅ **Fail-fast serialization**: Validation before save prevents corrupt data
✅ **Referential integrity**: Repository tracks dependencies and cascades deletes
✅ **Project validation**: Every entity validates against entire project before save
✅ **No legacy**: Complete removal of legacy constraint fields and types
✅ **Strong typing**: Branded IDs prevent cross-wiring, eliminate `any` usage

## Implementation Order

1. ✅ Branded IDs (`src/types/ids.ts`) - IN PROGRESS
2. Selectable interface (`src/types/selectable.ts`)
3. Validation framework (`src/validation/validator.ts`)
4. Entity DTOs and domain classes (co-located)
5. Repository with caching and dependency tracking
6. Project session and selection management
7. Serialization with validation
8. Component updates
9. Comprehensive testing

## Files to Create

- `src/types/ids.ts` ✅
- `src/types/selectable.ts`
- `src/validation/validator.ts`
- `src/types/project-dto.ts`
- `src/types/project-session.ts`
- `src/repository/repository.ts`
- `src/serialization/serializer.ts`
- Domain class files (world-point.ts, line.ts, etc.)

## Files to Modify

- Remove legacy from existing constraint types
- Update `src/types/utils.ts` for clean schema
- Update all components to use domain objects
- Update hooks to provide domain instances
- Update storage layer to use DTOs

This plan ensures the project becomes "rock solid" with fail-fast validation, proper referential integrity, and no legacy code while supporting the required co-selection interface.