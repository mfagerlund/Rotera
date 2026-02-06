# Rotera Architectural Rules

## Application Architecture

**Rotera is a standalone browser application** - all code runs in the browser, no server required.

### Three Layers (All In-Browser)

```
┌─────────────────────────────────────────┐
│  UI Layer (React + TypeScript)          │
│  - Components, rendering, user input    │
└──────────────┬──────────────────────────┘
               │ Direct object references
┌──────────────▼──────────────────────────┐
│  Domain Layer (Entity Classes)          │
│  - WorldPoint, Line, Viewpoint, etc.    │
│  - MobX observables (auto UI updates)   │
│  - Business logic & constraints         │
│  - Source of truth for application      │
└──────────────┬──────────────────────────┘
               │ Serialization (DTOs)
┌──────────────▼──────────────────────────┐
│  Solver Layer (Analytical Gradients)    │
│  - Levenberg-Marquardt optimization     │
│  - Takes entities, returns positions    │
└─────────────────────────────────────────┘
```

**Key Point:** No network calls, no separate processes. Everything is in-memory in the browser tab.

---

## Core Principle: ONE Representation Per Concept

**The Golden Rule**: Each domain concept gets exactly ONE runtime representation - the Entity itself. No duplicates, no alternatives, no legacy types.

---

## 1. Entity Design Rules

### 1.1 Entities Use Object References (ALWAYS)
- **ALWAYS**: Entities reference other entities directly via object references
- **NEVER**: Use IDs to reference other entities at runtime
- **Example (CORRECT)**:
  ```typescript
  class Line {
    constructor(
      public readonly pointA: WorldPoint,
      public readonly pointB: WorldPoint
    ) {}
  }
  ```
- **Example (WRONG)**:
  ```typescript
  class Line {
    constructor(
      public readonly pointAId: string,  // ❌ WRONG
      public readonly pointBId: string   // ❌ WRONG
    ) {}
  }
  ```

### 1.2 Circular References Are Expected and Welcome
- Rich object model with bidirectional relationships
- WorldPoint knows its Lines, Lines know their WorldPoints
- Use Sets for entity collections (not Maps - we don't reference by ID!)
- **Example**:
  ```typescript
  class WorldPoint {
    lines = new Set<Line>();
    constraints = new Set<Constraint>();
  }
  ```

### 1.3 Use Direct Field Access (Not Getters)
- **ALWAYS**: Use direct field access for properties
- **NEVER**: Create `getName()` methods or getters that just return a field
- **Why**: TypeScript allows transparent refactoring from fields to computed properties without changing callers
- **Use getters ONLY when**:
  - Computing a value: `get length() { return this.pointA.position.distanceTo(this.pointB.position); }`
  - Property needs side effects (rare)
- **Example (CORRECT)**:
  ```typescript
  class Line {
    name: string;  // Direct field access
    pointA: WorldPoint;
    pointB: WorldPoint;

    // Computed property - still uses property syntax!
    get length() {
      return this.pointA.position.distanceTo(this.pointB.position);
    }
  }

  // Usage (same syntax for both):
  line.name = "Line 1";
  console.log(line.length);
  ```
- **Example (WRONG)**:
  ```typescript
  class Line {
    private _name: string;
    getName() { return this._name; }  // ❌ Java-ism, no benefit

    private _pointA: WorldPoint;
    get pointA() { return this._pointA; }  // ❌ Pointless getter
  }
  ```

### 1.4 IDs Exist ONLY for Serialization
- Entities have `id` properties for serialization/deserialization
- **CRITICAL**: IDs are an architectural hazard - never use them for references!
- Every `id` property MUST have this comment:
  ```typescript
  class WorldPoint {
    id: string;  // Do *not* use this id as a reference, use the full entity everywhere!
    position: THREE.Vector3;
    lines: Set<Line>;
  }
  ```
- **IDs are used ONLY for**:
  - Serialization to JSON (DTOs)
  - Map keys during deserialization (temporary, local scope only)
- **Future consideration**: Remove IDs entirely, generate them on-the-fly during serialization

### 1.5 One Entity Class Per Concept
- WorldPoint: ONE class definition
- Line: ONE class definition
- Viewpoint: ONE class definition
- Constraint: ONE abstract base with concrete implementations
- **NEVER** create alternative representations (e.g., SimplePoint, LightweightLine, etc.)

---

## 2. Data Transfer Object (DTO) Rules

### 2.1 DTOs Are ONLY for Serialization
- DTOs exist solely for JSON serialization/deserialization
- DTOs use IDs instead of object references to avoid circular references
- DTOs are private implementation details of the serialization layer

### 2.2 DTO Structure
- **Example**:
  ```typescript
  interface LineDto {
    id: LineId;
    pointA: PointId;  // ✓ IDs OK in DTOs
    pointB: PointId;  // ✓ IDs OK in DTOs
    color: string;
    // ... other serializable properties
  }
  ```

### 2.3 Conversion Functions Are Sealed
- Conversion logic lives in dedicated, sealed classes/modules
- Only the serialization layer touches DTOs
- **Pattern**:
  ```typescript
  // In project-serialization.ts (sealed module)
  function entityToDto(entity: Entity): EntityDto { /* ... */ }
  function dtoToEntity(dto: EntityDto): Entity { /* ... */ }
  ```

### 2.4 DTO Boundaries
- DTOs only exist at save/load boundaries
- **Load flow**: JSON → DTO → Entity (via dtoToEntity)
- **Save flow**: Entity → DTO → JSON (via entityToDto)
- Rest of application NEVER sees DTOs

---

## 3. API Design Rules

### 3.1 APIs Operate on Entities Directly
- **ALWAYS**: Accept entity objects as parameters
- **NEVER**: Accept IDs and then look up entities internally
- **Example (CORRECT)**:
  ```typescript
  function createLine(pointA: WorldPoint, pointB: WorldPoint): Line {
    return new Line(pointA, pointB);
  }
  ```
- **Example (WRONG)**:
  ```typescript
  function createLine(pointAId: string, pointBId: string): Line {
    const pointA = project.worldPoints.get(pointAId); // ❌ WRONG
    const pointB = project.worldPoints.get(pointBId); // ❌ WRONG
    return new Line(pointA, pointB);
  }
  ```

### 3.2 Caller Responsibility
- Caller must resolve entities before calling APIs
- APIs trust that references are valid
- Validation happens at higher layers if needed

---

## 4. Project State Management

### 4.1 Global Project Variable (Current Design)
- **Current pattern**: Single global variable holding the loaded project
- All code has direct access to the project at all times
- **Pattern**:
  ```typescript
  // project-store.ts
  export let project: EntityProject;

  export function setProject(newProject: EntityProject) {
    project = newProject;
  }
  ```

### 4.2 No Repository Pattern (Currently)
- No complex repository abstraction layer
- Simple functions for add/delete/query operations
- Direct access to collections via Sets
- **Rationale**: Single project, no multi-tenancy, no complex queries needed
- **Note**: Maps may still exist for legacy reasons, but new code should use Sets

### 4.3 Future Consideration
- When multi-project support is needed, pattern may evolve
- But still: no IDs at runtime, only object references

---

## 5. Type System Rules

### 5.1 No Duplicate Type Definitions
- **FORBIDDEN**: Multiple type definitions for the same concept
- If `WorldPoint` exists in entities/, don't create `Point` elsewhere
- If `EntityProject` is the main type, delete any legacy `Project` types

### 5.2 Clean Type Hierarchy
- Clear inheritance/interface hierarchies
- Abstract base classes where polymorphism is needed (e.g., `BaseConstraint`)
- Concrete implementations for specific behaviors

---

## 6. Code Cleanliness Rules

### 6.1 No Legacy Code
- Delete unused/legacy code immediately
- No "keep for reference" comments
- No backward compatibility with deprecated patterns

### 6.2 No Migration Shims
- When refactoring, complete the migration fully
- Don't leave adapter/shim layers around

### 6.3 Clean File Organization
- Entities in `entities/[entity-name]/`
- Each entity folder contains:
  - `EntityName.ts` (the entity class)
  - `EntityNameDto.ts` (the DTO, if needed)
  - `index.ts` (exports)
  - Tests

---

## 7. Clarifying Questions

### Q1: ImagePoint vs WorldPoint
**Question**: ImagePoint represents 2D observations in images, while WorldPoint represents 3D points. Should ImagePoints be embedded in Viewpoint (current pattern) or be separate entities?

**Current pattern**: ImagePoints are stored as a map within Viewpoint: `imagePoints: Map<string, ImagePoint>`

**Recommendation**: ✓ **Keep current pattern** - ImagePoints are value objects, not entities. They don't have independent lifecycle or identity outside their Viewpoint.

**✅ DECISION**: ImagePoints remain embedded in Viewpoint as they have clear ownership from the viewpoint.

**IMPORTANT CLARIFICATION**:
- ImagePoint is a **collection** (Map) - one Viewpoint has MANY ImagePoints (2D observations)
- ProjectImage/Camera have a **1:1:1 relationship** with Viewpoint
- Viewpoint = Camera + Image consolidated into ONE entity
- Image properties (filename, url, width, height) are embedded directly in Viewpoint
- Camera properties (intrinsics, extrinsics) are embedded directly in Viewpoint
- **NO separate ProjectImage or Camera entity classes** - they're part of Viewpoint

---

### Q2: Constraint Polymorphism
**Question**: Constraints have many types (Distance, Angle, Parallel, etc.). Should each type be its own class, or use a discriminated union?

**Current pattern**: Abstract `BaseConstraint` class with concrete implementations like `DistanceConstraint`, `AngleConstraint`

**Recommendation**: ✓ **Keep class hierarchy** - Enables polymorphism, clear type safety, and extensibility

**✅ DECISION**: Keep class hierarchy for constraints.

---

### Q3: Entity Identity (IDs)
**Question**: Do entities need IDs for identity/equality checks, or use object identity?

**Current pattern**: Entities have `id` property for serialization and map keys

**Recommendation**: ✓ **Keep IDs for serialization** - Use IDs as map keys and for serialization, but use object references everywhere else

**✅ DECISION**: Accepted. Keep IDs for serialization and map keys, use object references everywhere else.

---

### Q4: Metadata vs Core Properties
**Question**: Should metadata (color, visibility, tags, groups) live on entities, or in a separate metadata system?

**Current pattern**: Metadata properties directly on entity classes

**Recommendation**: ✓ **Keep on entities** - Simpler model, metadata is intrinsic to the domain. Only extract if metadata system becomes complex.

**✅ DECISION**: Accepted. Keep metadata on entities.

---

### Q5: DTO Validation
**Question**: Where should validation occur - when converting from DTO to Entity, or throughout the entity lifecycle?

**Current pattern**: Unclear - appears to be minimal validation

**Recommendation**: ✓ **Validate at DTO boundaries** - Validate during `dtoToEntity` conversion. Once entities are created, trust them to be valid. Throw errors early if DTOs are malformed.

**✅ DECISION**: Accepted. Validate at DTO boundaries only.

---

### Q6: Collection Types
**Question**: Should entity collections use Map, Set, Array, or custom collection classes?

**Current pattern**: Mix of Map (for lookup by ID) and Set (for bidirectional refs)

**Recommendation**: ✓ **Use Sets for entity collections**:
- `Set<Entity>` for all entity collections (project.worldPoints, point.lines, etc.)
- `Array` only for ordered lists where order matters
- **NOT** `Map<EntityId, Entity>` - we don't reference by ID!

**✅ DECISION**: Use Sets everywhere. Maps serve no purpose at runtime when using object references.

**Deserialization pattern**:
```typescript
function deserialize(dto: ProjectDTO): EntityProject {
  // Temporary map for deserialization ONLY (local scope)
  const tempIdMap = new Map<string, WorldPoint>();

  // First pass: create objects
  for (const pDto of dto.points) {
    const point = new WorldPoint(...);
    tempIdMap.set(pDto.id, point);
  }

  // Second pass: connect references
  for (const lDto of dto.lines) {
    const pointA = tempIdMap.get(lDto.pointAId)!;
    const pointB = tempIdMap.get(lDto.pointBId)!;
    new Line(pointA, pointB);
  }

  // Return Sets, not Maps!
  return {
    points: new Set(tempIdMap.values()),
    lines: new Set(...)
  };
}
```

**Note**: Temporary Maps are acceptable during deserialization for ID→object lookup, but they must be scoped locally to the deserialization function. The rest of the application uses Sets and object references.

### Q7: Null vs Undefined
**Question**: When a property might not exist, use `null`, `undefined`, or optional `?:`?

**Current pattern**: Mix of patterns - `xyz: [number | null, ...]`, optional properties `?:`

**Recommendation**: ✓ **Standardize on optional properties** - Use TypeScript's optional `?:` for properties that may not exist. Use `null` only when "explicitly absent" has semantic meaning different from "not set".

**✅ DECISION**: Accepted. Standardize on optional properties `?:`.

---

## 8. Enforcement Checklist

Before committing code, verify:

- [ ] No duplicate type definitions for the same concept
- [ ] Entities use object references, not IDs
- [ ] DTOs only appear in serialization layer
- [ ] APIs accept entities, not IDs
- [ ] No legacy code remains
- [ ] No TODO comments for "old way" compatibility
- [ ] Each concept has exactly ONE representation
- [ ] Collections use Sets (not Maps) - no ID-based lookup
- [ ] All `id` properties have the warning comment
- [ ] No silly getters - use direct field access
- [ ] Only computed properties use `get` keyword

---

## 9. Examples of Correct Patterns

### Creating a Line
```typescript
// ✓ CORRECT
const p1 = new WorldPoint([0, 0, 0]);
const p2 = new WorldPoint([1, 1, 1]);
const line = new Line(p1, p2);
project.addLine(line);

// ❌ WRONG
const line = createLineFromIds("point-1-id", "point-2-id");
```

### Adding a Constraint
```typescript
// ✓ CORRECT
const constraint = new DistanceConstraint(line, 5.0);
project.addConstraint(constraint);

// ❌ WRONG
const constraint = { type: 'distance', lineId: 'line-1', target: 5.0 };
```

### Accessing Related Entities
```typescript
// ✓ CORRECT
const point = line.pointA;
const allLinesUsingPoint = Array.from(point.getLines());

// ❌ WRONG
const point = project.worldPoints.get(line.pointAId);
```

---

## 10. Migration Path for Violations

If you find code violating these rules:

1. **Identify**: List all duplicate types/representations
2. **Choose**: Pick the ONE correct representation (usually the Entity)
3. **Migrate**: Update all references to use the chosen representation
4. **Delete**: Remove the duplicate types completely
5. **Test**: Ensure no regressions
6. **Commit**: Clean commit with clear message

**No half-measures**: Complete the migration fully, no shims or adapters.

---

## Rationale

This architecture enables:
- **Rich domain model**: Natural, expressive object-oriented design
- **Type safety**: TypeScript guarantees correct entity references
- **Performance**: Direct references are faster than ID lookups
- **Simplicity**: One way to do things, not multiple
- **Clean serialization**: DTOs handle JSON conversion cleanly
- **No impedance mismatch**: Domain model matches how we think about the problem

---

## 11. Optimization Architecture: Entity-Driven Constraints

### Philosophy

**Traditional Approach**: Convert high-level entities (lines, planes) into atomic constraints (distance, angle) before optimization.

**Entity-Driven Approach**: Optimize directly on semantic entities, preserving UI→optimization→feedback loop with full traceability.

### Constraint Types

**Intrinsic Constraints**: Embedded within entities themselves
- Line direction (horizontal, vertical, axis-aligned)
- Line target length
- Fixed point coordinates
- These are properties of the entity, not separate constraint objects

**Extrinsic Constraints**: Relationships between separate entities
- Distance between two points
- Angle between lines
- Parallel/perpendicular relationships
- These exist as separate constraint objects

### Key Benefit: Traceability

```typescript
// Entity with embedded constraints
Line {
  id: "L1",
  pointA: WorldPoint,
  pointB: WorldPoint,
  direction: "horizontal",     // Intrinsic constraint
  targetLength: 5.0            // Intrinsic constraint
}

// Optimization result maintains entity link
Result {
  "L1": {
    total_error: 2.5,
    components: [
      { type: 'length', error: 2.3, target: 5.0 },
      { type: 'direction', error: 0.2 }
    ]
  }
}

// User sees: "Line L1 is 2.3m too long"  ✅
// Not:       "Constraint violation"      ❌
```

### Rules

1. **Intrinsic constraints are entity properties** - No separate constraint objects for entity properties
2. **Extrinsic constraints reference entities** - Use object references, not IDs
3. **Optimization maintains entity identity** - Results trace back to specific entities
4. **ONE source of truth** - Entity properties ARE the optimization inputs

---

## 12. Decisions Summary

All clarifying questions have been resolved:

| Question | Decision |
|----------|----------|
| **Q1: ImagePoint embedding** | ✅ Keep embedded in Viewpoint (clear ownership) |
| **Q2: Constraint polymorphism** | ✅ Keep class hierarchy |
| **Q3: Entity IDs** | ✅ Keep IDs for serialization/map keys, use object refs everywhere else |
| **Q4: Metadata location** | ✅ Keep metadata on entities |
| **Q5: Validation location** | ✅ Validate at DTO boundaries only |
| **Q6: Collection types** | ✅ Use Sets (not Maps) - no ID-based lookup at runtime |
| **Q7: Null vs Undefined** | ✅ Standardize on optional `?:` properties |

---

**Version**: 1.3
**Last Updated**: 2026-02-06
**Status**: APPROVED - All decisions finalized
