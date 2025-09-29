# Frontend Architecture Refactoring Tasks

Additional tasks to work into the structure by you, claude:

constraints is a weird class. it should be polymorphic. we no longer need the constraints that have been absorbed by the line. check line for constraint values.

polymorphism is tricky in the dto, we should store it as an array of multiConstraint that contains class fields for each actual constraintDtos - that way we can deserialize properly. or if you know of a better aproach.

## 🚀 **KEEP GOING UNTIL ALL PHASES COMPLETE - NO MID-STREAM REPORTS**

## 🎯 **CORE OBJECTIVE**
Eliminate all ID-based references and legacy code from the frontend. Implement pure object reference architecture with private IDs and type-safe domain classes.

Find ANY usages in the code and replace with strongly typed references. Unless completely unreasonable.

## 🚨 **CRITICAL VIOLATIONS TO FIX**

### **Violation 1: ID-Based References Everywhere**
- Components pass `lineId`, `pointId` strings instead of objects
- Repository methods return `EntityId[]` instead of actual objects
- Selection system works with string IDs instead of entities

### **Violation 2: Legacy Code Throughout Codebase**
- `useSelection.ts` has 200+ lines of "legacy compatibility"
- References to `legacyFilters`, `legacySelectionState`, `mapToPrimaryType`
- Mock `ISelectable` entities created from string IDs

### **Violation 3: ReferenceManager Anti-Pattern**
- Manual object resolution when we should have direct references
- `WorldPointRepository.getReferenceManager()` suggests broken architecture

### **Violation 4: DTO Misuse in Domain Logic**
- DTOs used for internal operations instead of just serialization
- Domain classes calling `toDTO()` for internal logic

### **Violation 5: Use of `any` Types**
- Code uses `any` instead of proper TypeScript classes
- Weakens type safety and prevents proper IDE support
- Must use existing classes: `WorldPoint`, `Line`, `Constraint`, etc.

---

## 📋 **REFACTORING TASK BREAKDOWN**

### **PHASE 1: Domain Model Refactoring**

#### **Task 1.1: Redesign WorldPoint Class**
**Current State:**
```typescript
// BAD: Returns IDs
getConnectedLineIds(): EntityId[]
getReferencingConstraintIds(): EntityId[]

// BAD: Uses repository for object resolution
get linesConnected(): any[] {
  const lineIds = this.repo.getLinesByPoint(this.data.id)
  this._linesRef = lineIds.map(id => refManager.resolve(id, 'line'))
}
```

**Target State:**
```typescript
class WorldPoint {
  private _id: PointId // PRIVATE - only accessible via toDTO()
  private _connectedLines: Set<Line> = new Set()
  private _referencingConstraints: Set<Constraint> = new Set()

  // Pure object references
  get connectedLines(): Line[] { return Array.from(this._connectedLines) }
  get referencingConstraints(): Constraint[] { return Array.from(this._referencingConstraints) }

  // Only expose ID during serialization
  toDTO(): WorldPointDto { return { id: this._id, ... } }
}
```

**Actions:**
- [ ] Remove all `EntityId[]` return types from WorldPoint
- [ ] Replace with direct object references using private Sets
- [ ] Remove `WorldPointRepository` dependency
- [ ] Remove `getReferenceManager()` calls
- [ ] Make `_id` private, only exposed in `toDTO()`

#### **Task 1.2: Redesign Line Class**
**Current State:**
```typescript
// BAD: String references
pointA: string
pointB: string
```

**Target State:**
```typescript
class Line {
  private _id: LineId // PRIVATE
  private _pointA: WorldPoint
  private _pointB: WorldPoint

  constructor(pointA: WorldPoint, pointB: WorldPoint) {
    this._pointA = pointA
    this._pointB = pointB
    pointA.addConnectedLine(this)
    pointB.addConnectedLine(this)
  }

  get pointA(): WorldPoint { return this._pointA }
  get pointB(): WorldPoint { return this._pointB }

  toDTO(): LineDto { return { id: this._id, pointA: this._pointA.id, pointB: this._pointB.id, ... } }
}
```

**Actions:**
- [ ] Convert `pointA`, `pointB` from strings to `WorldPoint` objects
- [ ] Add bidirectional reference management in constructor
- [ ] Make `_id` private, only exposed in `toDTO()`
- [ ] Remove all string-based point lookups

#### **Task 1.3: Redesign Constraint Class**
**Target State:**
```typescript
class Constraint {
  private _id: ConstraintId // PRIVATE
  private _referencedEntities: Set<ISelectable> = new Set()

  constructor(entities: ISelectable[]) {
    entities.forEach(entity => {
      this._referencedEntities.add(entity)
      entity.addReferencingConstraint(this)
    })
  }

  get referencedEntities(): ISelectable[] { return Array.from(this._referencedEntities) }
}
```

**Actions:**
- [ ] Replace string entity references with direct object references
- [ ] Add bidirectional reference management
- [ ] Make `_id` private

### **PHASE 2: Selection System Cleanup**

#### **Task 2.1: Eliminate All Legacy Code from useSelection**
**Files to Clean:**
- `frontend/src/hooks/useSelection.ts` (lines 11-204 are legacy)

**Actions:**
- [ ] Remove `legacyFilters` state completely
- [ ] Remove `legacySelectionState` computed value
- [ ] Remove `mapToPrimaryType` function
- [ ] Remove `handlePointClick`, `handleLineClick`, `handlePlaneClick` legacy handlers
- [ ] Remove all mock `ISelectable` entity creation
- [ ] Remove backwards compatibility getters (`selectedPoints`, `selectedLines`, etc.)

#### **Task 2.2: Pure Object-Based Selection**
**Target State:**
```typescript
export const useSelection = () => {
  const [selection, setSelection] = useState<EntitySelection>(new EntitySelectionImpl())

  const handleEntityClick = (entity: ISelectable, modifiers: SelectionModifiers) => {
    // Pure object-based selection - no ID lookups
  }

  const getSelectedByType = <T extends ISelectable>(type: SelectableType): T[] => {
    return selection.getByType<T>(type)
  }

  // NO legacy compatibility, NO string IDs, NO mock entities
}
```

**Actions:**
- [ ] Simplify to pure object-based selection
- [ ] Remove all string ID handling
- [ ] Components must pass actual entity objects, not IDs

### **PHASE 3: Component Refactoring**

#### **Task 3.1: Update All Components to Use Objects**
**Components to Update:**
- `MainLayout.tsx`
- `EditLineWindow.tsx`
- `ImageViewer.tsx`
- `WorldView.tsx`
- All constraint panels

**Current Anti-Pattern:**
```typescript
// BAD: Passing IDs
onLineClick={(lineId) => handleLineClick(lineId)}
const line = lines.find(l => l.id === lineId)
```

**Target Pattern:**
```typescript
// GOOD: Passing objects
onLineClick={(line) => handleLineClick(line)}
// line is already the object we need
```

**Actions:**
- [ ] Replace all `onEntityClick(id: string)` with `onEntityClick(entity: EntityType)`
- [ ] Remove all `.find(e => e.id === id)` lookups
- [ ] Pass objects directly through prop drilling or context

#### **Task 3.2: Remove Repository Pattern**
**Files to Remove/Modify:**
- Remove `WorldPointRepository` interface
- Remove `getReferenceManager()` methods
- Remove manual object resolution

**Actions:**
- [ ] Delete `WorldPointRepository` interface
- [ ] Remove repository injection from entity constructors
- [ ] Replace with direct object references

### **PHASE 4: Project State Management**

#### **Task 4.1: Redesign useProject Hook**
**Current Issues:**
- Maintains separate arrays of entities
- Uses string-based lookups
- Exposes entity management complexity

**Target State:**
```typescript
export const useProject = () => {
  const [worldPoints] = useState<Set<WorldPoint>>(new Set())
  const [lines] = useState<Set<Line>>(new Set())
  const [constraints] = useState<Set<Constraint>>(new Set())

  const createLine = (pointA: WorldPoint, pointB: WorldPoint): Line => {
    const line = new Line(pointA, pointB)
    lines.add(line)
    return line
  }

  const createWorldPoint = (name: string, options: WorldPointOptions): WorldPoint => {
    const point = new WorldPoint(name, options)
    worldPoints.add(point)
    return point
  }

  // Serialization for backend communication
  const toProjectDTO = (): ProjectDto => ({
    worldPoints: Array.from(worldPoints).map(wp => wp.toDTO()),
    lines: Array.from(lines).map(l => l.toDTO()),
    constraints: Array.from(constraints).map(c => c.toDTO())
  })
}
```

**Actions:**
- [ ] Replace arrays with Sets for better performance
- [ ] Remove all string-based entity lookups
- [ ] Return actual objects from creation methods
- [ ] Use `toDTO()` only for backend communication

#### **Task 4.2: Clean DTO Usage**
**DTOs Should Only Be Used For:**
1. Serialization to backend
2. Deserialization from backend
3. File save/load operations

**DTOs Should NEVER Be Used For:**
1. Internal frontend logic
2. Component props
3. State management
4. Entity relationships

**Actions:**
- [ ] Audit all DTO usage in frontend
- [ ] Replace internal DTO usage with domain objects
- [ ] Ensure DTOs only appear at serialization boundaries

### **PHASE 5: Type System Cleanup**

#### **Task 5.1: Remove Legacy Types**
**Files to Clean:**
- `frontend/src/types/project.ts` - Remove legacy interfaces
- `frontend/src/types/selectable.ts` - Clean up type mappings

**Actions:**
- [ ] Remove `SelectionState` interface (legacy)
- [ ] Remove `primaryType` mappings
- [ ] Clean up `SelectableType` to only include current types
- [ ] Remove backwards compatibility type unions

#### **Task 5.2: Strengthen Type Safety**
**Target State:**
```typescript
// Strongly typed relationships
interface IWorldPoint {
  readonly connectedLines: ReadonlyArray<ILine>
  readonly referencingConstraints: ReadonlyArray<IConstraint>
}

interface ILine {
  readonly pointA: IWorldPoint
  readonly pointB: IWorldPoint
}

interface IConstraint {
  readonly referencedEntities: ReadonlyArray<ISelectable>
}
```

**Actions:**
- [ ] Add readonly modifiers to prevent external mutation
- [ ] Use generic constraints to ensure type safety
- [ ] Remove any `any` types from entity relationships

---

## 🔍 **IMPLEMENTATION VERIFICATION**

### **Phase 1 Success Criteria:**
- [ ] No `EntityId[]` return types in any domain class
- [ ] All entity relationships use direct object references
- [ ] No `Repository` pattern or `ReferenceManager` usage
- [ ] IDs only accessible via `toDTO()` methods

### **Phase 2 Success Criteria:**
- [ ] Zero lines of legacy code in `useSelection.ts`
- [ ] No mock entity creation
- [ ] No string-based selection handling
- [ ] Selection works purely with object references

### **Phase 3 Success Criteria:**
- [ ] No component passes string IDs between each other
- [ ] No `.find(e => e.id === id)` lookups anywhere
- [ ] All event handlers receive actual entity objects

### **Phase 4 Success Criteria:**
- [ ] `useProject` manages entities as objects, not by ID
- [ ] Creation methods return actual objects
- [ ] DTOs only used for backend communication

### **Phase 5 Success Criteria:**
- [ ] No legacy types or interfaces
- [ ] Full type safety with readonly relationships
- [ ] Zero `any` types in entity code

---

## ⚠️ **MIGRATION STRATEGY**

### **Step 1: Create New Architecture Alongside Old**
- Build new object-based classes in parallel
- Don't break existing functionality during transition

### **Step 2: Component-by-Component Migration**
- Start with leaf components (edit windows)
- Work up to root components (MainLayout)
- Test each component thoroughly after migration

### **Step 3: Remove Legacy Code**
- Only after all components migrated
- Remove in single atomic commit
- Verify no references remain

### **Step 4: Backend Integration**
- Ensure serialization/deserialization works correctly
- Test full round-trip: Frontend Objects → DTOs → Backend → DTOs → Frontend Objects

---

## 🎯 **PRIORITY ORDER**

1. **HIGHEST**: Phase 1 (Domain Model) - Foundation for everything else
2. **HIGH**: Phase 2 (Selection System) - Eliminates most legacy code
3. **MEDIUM**: Phase 3 (Components) - User-facing improvements
4. **MEDIUM**: Phase 4 (Project State) - Clean up management layer
5. **LOW**: Phase 5 (Types) - Polish and type safety
6. **CRITICAL**: Phase 6 (Type Safety Audit) - Eliminate all `any` types
7. **CRITICAL**: Phase 7 (Build Verification) - Ensure clean builds
8. **HIGH**: Phase 8 (Backend Tasks) - Document backend refactoring

---

## 🚫 **ABSOLUTELY FORBIDDEN PATTERNS**

- ❌ Any new "legacy compatibility" code
- ❌ String-based entity lookups (`entities.find(e => e.id === id)`)
- ❌ Exposing entity IDs outside of `toDTO()` methods
- ❌ Using DTOs for internal frontend logic
- ❌ Repository pattern or manual object resolution
- ❌ Mock entity creation from string IDs
- ❌ Any code marked "backwards compatibility"
- ❌ **Using `any` types - MUST use proper TypeScript classes**
- ❌ **Creating new classes when existing ones should be used**

---

## 📊 **PROGRESS TRACKING**

Create sub-tasks for each phase and track completion. Each task should include:
- Specific files to modify
- Exact code patterns to eliminate
- New patterns to implement
- Verification criteria
- Test cases to ensure functionality

**Estimated Timeline:**
- Phase 1: 2-3 sessions (complex, foundational)
- Phase 2: 1-2 sessions (mostly deletion)
- Phase 3: 2-3 sessions (component updates)
- Phase 4: 1-2 sessions (state management)
- Phase 5: 1 session (cleanup)

**Total: 7-11 sessions for complete architecture transformation**

---

## **FINAL VERIFICATION PHASES**

### **Phase 6: Type Safety Audit**
**Critical Task: Eliminate All `any` Types**

**Actions:**
- [ ] Search entire frontend codebase for `any` type usage
- [ ] Replace all `any` with proper TypeScript classes:
  - `any` → `WorldPoint` where appropriate
  - `any` → `Line` where appropriate
  - `any` → `Constraint` where appropriate
  - `any` → `ISelectable` for generic selectable items
- [ ] Ensure all entity references use proper types
- [ ] Run TypeScript compiler with strict mode
- [ ] Fix all type errors before proceeding

**Success Criteria:**
- Zero `any` types in entity-related code
- Full TypeScript type safety throughout
- All IDE autocompletion working correctly

### **Phase 7: Frontend Build Verification**
**Critical Task: Ensure Frontend Builds Successfully**

**Actions:**
- [ ] Run `npm run build` and fix all compilation errors
- [ ] Run `npm run typecheck` and fix all type errors
- [ ] Run `npm run lint` and fix all linting issues
- [ ] Ensure no runtime errors in development mode
- [ ] Verify all components render without crashes

**Success Criteria:**
- Clean build with zero errors
- Clean typecheck with zero errors
- Clean lint with zero warnings
- Application starts and renders correctly

### **Phase 8: Backend Task List Creation**
**Critical Task: Document Backend Refactoring Needs**

**Actions:**
- [ ] Analyze backend codebase for similar architectural issues
- [ ] Create comprehensive `backend-refactor-tasks.md` document
- [ ] Identify backend patterns that need updating
- [ ] Ensure backend build/test pipeline works correctly
- [ ] Document backend DTO synchronization requirements

**Success Criteria:**
- Complete backend refactoring roadmap created
- Backend builds and tests pass
- Clear path to backend-frontend integration