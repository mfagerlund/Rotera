# Frontend Architecture Refactoring Tasks - Phase 2

## 🎯 **GOALS ACHIEVED IN PHASE 1**
The previous refactoring successfully achieved the core objective:
- ✅ **Eliminated ID-based references** - All entities now use direct object references
- ✅ **Removed legacy code** - useSelection.ts completely clean, no backwards compatibility
- ✅ **Pure object architecture** - WorldPoint, Line classes have private IDs and object relationships
- ✅ **Clean selection system** - No string ID handling, pure ISelectable objects

## 🚀 **PHASE 2 OBJECTIVES**
Building on Phase 1 success, Phase 2 focuses on code quality, maintainability, and type safety:

### **Primary Goals:**
1. **Eliminate ALL `any` types** - Replace with proper TypeScript interfaces
2. **Implement polymorphic constraint architecture** - Replace monolithic Constraint class
3. **Refactor massive files** - Break down 500+ line classes into focused modules
4. **Simplify DTO architecture** - Remove redundant SolverDto interfaces
5. **Fix build pipeline** - Ensure clean builds, tests, and type checking

### **Architecture Principles:**
- **Type Safety First**: Zero `any` types, full TypeScript inference
- **Single Responsibility**: Each class has one clear purpose
- **Composition over Inheritance**: Use interfaces and composition patterns
- **Clean Interfaces**: Minimal, focused public APIs

---

## 📋 **TASK BREAKDOWN**

### **PHASE 1: Type Safety Enforcement**

#### **Task 1.1: Replace `any` Types in WorldPoint**
**File:** `frontend/src/entities/world-point.ts`
**Current Issues:**
- Lines 32-33: `Set<any>` for connected lines and constraints
- Lines 364, 368, 373, 377, 381, 385, 393-395: Methods use `any` parameters/returns

**Target Implementation:**
```typescript
// Import proper types
import type { Line } from './line'
import type { Constraint } from './constraint'

// Replace any types with proper interfaces
private _connectedLines: Set<Line> = new Set()
private _referencingConstraints: Set<Constraint> = new Set()

// Update method signatures
get connectedLines(): Line[] { return Array.from(this._connectedLines) }
get referencingConstraints(): Constraint[] { return Array.from(this._referencingConstraints) }
addConnectedLine(line: Line): void { this._connectedLines.add(line) }
removeConnectedLine(line: Line): void { this._connectedLines.delete(line) }
addReferencingConstraint(constraint: Constraint): void { this._referencingConstraints.add(constraint) }
removeReferencingConstraint(constraint: Constraint): void { this._referencingConstraints.delete(constraint) }
get connectedPoints(): WorldPoint[] { /* properly typed implementation */ }
```

**Actions:**
- [ ] Import Line and Constraint interfaces at top of file
- [ ] Replace all `Set<any>` with `Set<Line>` and `Set<Constraint>`
- [ ] Update all method signatures to use proper types
- [ ] Update all return types from `any[]` to proper arrays
- [ ] Fix any circular import issues with forward declarations

#### **Task 1.2: Replace `any` Types in Constraint**
**File:** `frontend/src/entities/constraint.ts`
**Current Issues:**
- Lines 85-87: `Set<any>` for entity references
- Lines 674, 682, 700, 718: Methods return `any[]`
- Line 903: Method parameters use `any`

**Target Implementation:**
```typescript
// Import proper types
import type { WorldPoint } from './world-point'
import type { Line } from './line'
import type { Plane } from './plane'

// Replace any types with proper interfaces
private _points: Set<WorldPoint> = new Set()
private _lines: Set<Line> = new Set()
private _planes: Set<Plane> = new Set()

// Update method signatures
get points(): WorldPoint[] { return Array.from(this._points) }
get lines(): Line[] { return Array.from(this._lines) }
get planes(): Plane[] { return Array.from(this._planes) }
private calculateAngleBetweenPoints(pointA: WorldPoint, vertex: WorldPoint, pointC: WorldPoint): number
```

**Actions:**
- [ ] Import WorldPoint, Line, Plane interfaces
- [ ] Replace all `Set<any>` with proper typed Sets
- [ ] Update all getter methods to return properly typed arrays
- [ ] Fix calculateAngleBetweenPoints method signature
- [ ] Ensure all entity access uses proper types

### **PHASE 2: Polymorphic Constraint Architecture**

#### **Task 2.1: Design Polymorphic Constraint Hierarchy**
**Goal:** Replace monolithic 940-line `Constraint` class with focused constraint classes

**Base Architecture:**
```typescript
// Base constraint interface
export interface IConstraint extends ISelectable {
  readonly type: ConstraintType
  readonly status: ConstraintStatus
  readonly priority: number
  readonly tolerance: number

  evaluate(): ConstraintEvaluationResult
  validate(context: ValidationContext): ValidationResult
  updateFromEvaluation(result: ConstraintEvaluationResult): void
}

// Abstract base class with common functionality
export abstract class BaseConstraint implements IConstraint {
  protected constructor(
    protected _id: ConstraintId,
    protected _name: string,
    protected _priority: number,
    protected _tolerance: number
  ) {}

  // Common ISelectable implementation
  // Common validation helpers
  // Common timestamp management
}
```

**Specific Constraint Classes:**
```typescript
// Distance between two points
export class DistancePointPointConstraint extends BaseConstraint {
  constructor(
    id: ConstraintId,
    name: string,
    private _pointA: WorldPoint,
    private _pointB: WorldPoint,
    private _targetDistance: number,
    options: ConstraintOptions = {}
  ) { super(id, name, options.priority, options.tolerance) }

  get pointA(): WorldPoint { return this._pointA }
  get pointB(): WorldPoint { return this._pointB }
  get targetDistance(): number { return this._targetDistance }

  evaluate(): ConstraintEvaluationResult {
    const actualDistance = this._pointA.distanceTo(this._pointB)
    // Implementation specific to distance constraint
  }
}

// Parallel lines
export class ParallelLinesConstraint extends BaseConstraint {
  constructor(
    id: ConstraintId,
    name: string,
    private _lineA: Line,
    private _lineB: Line,
    options: ConstraintOptions = {}
  ) { super(id, name, options.priority, options.tolerance) }

  get lineA(): Line { return this._lineA }
  get lineB(): Line { return this._lineB }

  evaluate(): ConstraintEvaluationResult {
    // Implementation specific to parallel lines
  }
}

// Fixed point position
export class FixedPointConstraint extends BaseConstraint {
  constructor(
    id: ConstraintId,
    name: string,
    private _point: WorldPoint,
    private _targetPosition: [number, number, number],
    options: ConstraintOptions = {}
  ) { super(id, name, options.priority, options.tolerance) }

  get point(): WorldPoint { return this._point }
  get targetPosition(): [number, number, number] { return this._targetPosition }
}
```

**Actions:**
- [ ] Create `frontend/src/entities/constraints/` directory
- [ ] Create `IConstraint.ts` with base interface
- [ ] Create `BaseConstraint.ts` with abstract base class
- [ ] Create individual constraint class files:
  - [ ] `DistancePointPointConstraint.ts`
  - [ ] `DistancePointLineConstraint.ts`
  - [ ] `AngleConstraint.ts`
  - [ ] `ParallelLinesConstraint.ts`
  - [ ] `PerpendicularLinesConstraint.ts`
  - [ ] `FixedPointConstraint.ts`
  - [ ] `CollinearPointsConstraint.ts`
  - [ ] `CoplanarPointsConstraint.ts`
- [ ] Create constraint factory: `ConstraintFactory.ts`
- [ ] Create constraint type registry: `ConstraintRegistry.ts`

#### **Task 2.2: Implement Polymorphic DTO Architecture**
**Current Issue:** Single `ConstraintDto` tries to handle all constraint types

**Target Architecture:**
```typescript
// Base DTO interface
export interface BaseConstraintDto {
  id: ConstraintId
  name: string
  type: ConstraintType
  status: ConstraintStatus
  priority: number
  tolerance: number
  isEnabled: boolean
  isDriving: boolean
  createdAt: string
  updatedAt: string
}

// Specific constraint DTOs
export interface DistancePointPointDto extends BaseConstraintDto {
  type: 'distance_point_point'
  pointA: PointId
  pointB: PointId
  targetDistance: number
}

export interface ParallelLinesDto extends BaseConstraintDto {
  type: 'parallel_lines'
  lineA: LineId
  lineB: LineId
}

export interface FixedPointDto extends BaseConstraintDto {
  type: 'fixed_point'
  point: PointId
  targetPosition: [number, number, number]
}

// Union type for all constraint DTOs
export type ConstraintDto =
  | DistancePointPointDto
  | DistancePointLineDto
  | AngleConstraintDto
  | ParallelLinesDto
  | PerpendicularLinesDto
  | FixedPointDto
  | CollinearPointsDto
  | CoplanarPointsDto

// Multi-constraint container for storage
export interface MultiConstraintDto {
  constraints: ConstraintDto[]
}
```

**Actions:**
- [ ] Create `frontend/src/entities/constraints/dtos/` directory
- [ ] Create base DTO interface in `BaseConstraintDto.ts`
- [ ] Create specific DTO files for each constraint type
- [ ] Create union type in `ConstraintDto.ts`
- [ ] Create serialization helpers in `ConstraintDtoUtils.ts`
- [ ] Update project storage to use `MultiConstraintDto`

### **PHASE 3: File Size Refactoring**

#### **Task 3.1: Refactor Massive Line Entity (600+ lines)**
**File:** `frontend/src/entities/line.ts`
**Current Issues:**
- Single file with 580+ lines
- Mixed concerns: validation, geometry, serialization, relationships

**Target Architecture:**
```
frontend/src/entities/line/
├── Line.ts              // Core Line class (150 lines)
├── LineDto.ts           // DTO interfaces and types
├── LineValidation.ts    // Validation logic
├── LineGeometry.ts      // Geometric calculations
├── LineRelationships.ts // Relationship management
└── index.ts             // Public exports
```

**Line.ts (Core Class):**
```typescript
// Core Line domain class - focused on state and behavior
export class Line implements ISelectable, IValidatable {
  private constructor(/* core properties */) {}

  // Factory methods
  static fromDTO(dto: LineDto, pointA: WorldPoint, pointB: WorldPoint): Line
  static create(/* creation parameters */): Line

  // Core getters/setters
  // Basic domain methods
  // Serialization
  toDTO(): LineDto
}
```

**Actions:**
- [ ] Create `frontend/src/entities/line/` directory
- [ ] Extract DTO interfaces to `LineDto.ts`
- [ ] Extract validation logic to `LineValidation.ts` with `LineValidator` class
- [ ] Extract geometry methods to `LineGeometry.ts` with `LineGeometry` utility class
- [ ] Extract relationship management to `LineRelationships.ts`
- [ ] Refactor main `Line.ts` to use composition pattern
- [ ] Create `index.ts` with clean public exports
- [ ] Update all imports throughout codebase

#### **Task 3.2: Refactor Massive WorldPoint Entity (570+ lines)**
**File:** `frontend/src/entities/world-point.ts`
**Current Issues:**
- Single file with 570+ lines
- Mixed concerns similar to Line

**Target Architecture:**
```
frontend/src/entities/world-point/
├── WorldPoint.ts              // Core WorldPoint class (120 lines)
├── WorldPointDto.ts           // DTO interfaces
├── WorldPointValidation.ts    // Validation logic
├── WorldPointGeometry.ts      // Geometric calculations
├── WorldPointRelationships.ts // Connection management
└── index.ts                   // Public exports
```

**Actions:**
- [ ] Create `frontend/src/entities/world-point/` directory
- [ ] Extract DTO interfaces to `WorldPointDto.ts`
- [ ] Extract validation to `WorldPointValidation.ts`
- [ ] Extract geometry methods to `WorldPointGeometry.ts`
- [ ] Extract relationship management to `WorldPointRelationships.ts`
- [ ] Refactor main `WorldPoint.ts` class
- [ ] Create clean `index.ts` exports
- [ ] Update all imports

### **PHASE 4: DTO Architecture Simplification**

#### **Task 4.1: Remove Redundant SolverDto Interfaces**
**Current Issue:** Duplicate DTO interfaces for solver communication

**Files to Modify:**
- `frontend/src/entities/world-point.ts` (remove WorldPointSolverDto)
- `frontend/src/entities/line.ts` (remove LineSolverDto)

**Target Implementation:**
```typescript
// Remove these interfaces:
// - WorldPointSolverDto
// - LineSolverDto

// Remove these methods:
// - toSolverDTO() from WorldPoint
// - toSolverDTO() from Line

// Solver communication uses regular DTOs:
const solverData = {
  points: worldPoints.map(wp => wp.toDTO()),
  lines: lines.map(line => line.toDTO()),
  constraints: constraints.map(c => c.toDTO())
}
// Solver ignores frontend-specific fields (color, isVisible, etc.)
```

**Actions:**
- [ ] Remove `WorldPointSolverDto` interface from `world-point.ts`
- [ ] Remove `LineSolverDto` interface from `line.ts`
- [ ] Remove `toSolverDTO()` methods from both classes
- [ ] Update any solver communication code to use regular DTOs
- [ ] Update backend to handle regular DTOs (ignore extra fields)
- [ ] Update documentation to reflect simplified DTO approach

#### **Task 4.2: Implement Constraint DTO Deserialization**
**Challenge:** Polymorphic constraint DTOs need proper deserialization

**Target Implementation:**
```typescript
// Constraint factory with DTO deserialization
export class ConstraintFactory {
  static fromDTO(dto: ConstraintDto, entityResolver: EntityResolver): IConstraint {
    switch (dto.type) {
      case 'distance_point_point':
        const pointA = entityResolver.getWorldPoint(dto.pointA)
        const pointB = entityResolver.getWorldPoint(dto.pointB)
        return new DistancePointPointConstraint(
          dto.id, dto.name, pointA, pointB, dto.targetDistance, dto
        )

      case 'parallel_lines':
        const lineA = entityResolver.getLine(dto.lineA)
        const lineB = entityResolver.getLine(dto.lineB)
        return new ParallelLinesConstraint(dto.id, dto.name, lineA, lineB, dto)

      // ... other constraint types

      default:
        throw new Error(`Unknown constraint type: ${dto.type}`)
    }
  }

  static toDTO(constraint: IConstraint): ConstraintDto {
    return constraint.toDTO()
  }

  static fromMultiConstraintDto(multiDto: MultiConstraintDto, entityResolver: EntityResolver): IConstraint[] {
    return multiDto.constraints.map(dto => this.fromDTO(dto, entityResolver))
  }
}
```

**Actions:**
- [ ] Create `ConstraintFactory.ts` with DTO deserialization
- [ ] Create `EntityResolver` interface for entity lookup during deserialization
- [ ] Implement factory methods for each constraint type
- [ ] Update project loading/saving to use constraint factory
- [ ] Add proper error handling for unknown constraint types
- [ ] Add validation during deserialization

### **PHASE 5: Build Pipeline Fixes**

#### **Task 5.1: Fix Frontend Build Issues**
**Current Problems:**
- Frontend lint failures
- Frontend type-check failures

**Actions:**
- [ ] Run `cd frontend && npm run lint` and fix all linting errors
- [ ] Run `cd frontend && npm run type-check` and fix all TypeScript errors
- [ ] Update ESLint rules to enforce no `any` types
- [ ] Add TypeScript strict mode if not already enabled
- [ ] Fix any circular import issues from refactoring
- [ ] Update import statements after file restructuring

#### **Task 5.2: Fix Backend Integration**
**Current Problems:**
- Backend tests failing
- Backend type checking failing
- Backend format issues

**Actions:**
- [ ] Update backend DTO interfaces to match frontend changes
- [ ] Remove backend SolverDto interfaces if they exist
- [ ] Update backend constraint handling for polymorphic DTOs
- [ ] Run `cd backend && python -m pytest --tb=short -x --maxfail=5` and fix test failures
- [ ] Run `cd backend && python -m mypy pictorigo/` and fix type issues
- [ ] Run `cd backend && python -m black .` to format code
- [ ] Run `cd backend && python -m ruff check .` and fix linting issues

#### **Task 5.3: Integration Testing**
**Actions:**
- [ ] Test full round-trip: Frontend Objects → DTOs → Backend → DTOs → Frontend Objects
- [ ] Verify constraint evaluation works with new polymorphic architecture
- [ ] Test project save/load with new DTO structure
- [ ] Verify solver communication works with regular DTOs
- [ ] Add integration tests for new constraint types

---

## 🚨 **CRITICAL SUCCESS CRITERIA**

### **Phase 1 Complete When:**
- [ ] Zero `any` types in any entity files
- [ ] Full TypeScript inference and autocompletion
- [ ] All entity relationships properly typed

### **Phase 2 Complete When:**
- [ ] Constraint.ts file removed (replaced with polymorphic classes)
- [ ] Each constraint type has its own focused class file
- [ ] Type-safe constraint evaluation using specific entity types
- [ ] Clean constraint factory with proper DTO deserialization

### **Phase 3 Complete When:**
- [ ] Line.ts under 200 lines (down from 580+)
- [ ] WorldPoint.ts under 150 lines (down from 570+)
- [ ] Each concern separated into focused modules
- [ ] Clean composition-based architecture

### **Phase 4 Complete When:**
- [ ] No SolverDto interfaces anywhere
- [ ] Solver uses regular DTOs, ignores extra fields
- [ ] Polymorphic constraint DTO deserialization working
- [ ] Project save/load handles constraint polymorphism

### **Phase 5 Complete When:**
- [ ] `bash check.sh` passes completely
- [ ] Frontend builds without errors or warnings
- [ ] Backend builds without errors or warnings
- [ ] All tests pass

---

## 📊 **ESTIMATED TIMELINE**

**Phase 1 (Type Safety):** 1-2 sessions
- Straightforward type replacements
- Import fixes and circular dependency resolution

**Phase 2 (Polymorphic Constraints):** 3-4 sessions
- Complex architectural change
- Multiple new files and classes
- Factory pattern implementation

**Phase 3 (File Refactoring):** 2-3 sessions
- Mechanical code reorganization
- Composition pattern refactoring
- Import updates throughout codebase

**Phase 4 (DTO Simplification):** 1-2 sessions
- Remove redundant interfaces
- Update communication patterns

**Phase 5 (Build Fixes):** 1-2 sessions
- Fix issues uncovered by previous phases
- Integration testing

**Total: 8-13 sessions for complete Phase 2 transformation**

---

## 🎯 **FINAL ARCHITECTURE VISION**

**After Phase 2 completion:**
- **Zero `any` types** - Full TypeScript type safety
- **Focused classes** - Each file under 200 lines with single responsibility
- **Polymorphic constraints** - Type-safe constraint evaluation
- **Clean DTOs** - No redundancy, proper polymorphic serialization
- **Build pipeline** - Clean builds, tests, and type checking
- **Maintainable codebase** - Easy to extend and modify

This builds on the successful Phase 1 object reference architecture to create a truly clean, type-safe, and maintainable frontend codebase.