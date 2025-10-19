# Pictorigo Architectural Rules

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
- Use Sets/Maps for collections to prevent duplicates
- **Example**:
  ```typescript
  class WorldPoint {
    private lines = new Set<ILine>();
    private constraints = new Set<IConstraint>();
  }
  ```

### 1.3 One Entity Class Per Concept
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
- Direct access to collections via Maps
- **Rationale**: Single project, no multi-tenancy, no complex queries needed

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

**Recommendation**: ✓ **Keep current pattern**:
- `Map<EntityId, Entity>` for primary collections (project.worldPoints)
- `Set<Entity>` for bidirectional references (point.lines)
- `Array` only for ordered lists where duplicates or ordering matter

**✅ DECISION**: Accepted. Keep current pattern.

**Note**: Maps are used for serialization (map keys become DTO IDs) and provide O(1) lookup when needed. While we prefer object references, Maps enable efficient serialization and deserialization.

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
- [ ] Circular references use Sets/Maps appropriately

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

## 11. Decisions Summary

All clarifying questions have been resolved:

| Question | Decision |
|----------|----------|
| **Q1: ImagePoint embedding** | ✅ Keep embedded in Viewpoint (clear ownership) |
| **Q2: Constraint polymorphism** | ✅ Keep class hierarchy |
| **Q3: Entity IDs** | ✅ Keep IDs for serialization/map keys, use object refs everywhere else |
| **Q4: Metadata location** | ✅ Keep metadata on entities |
| **Q5: Validation location** | ✅ Validate at DTO boundaries only |
| **Q6: Collection types** | ✅ Keep Map/Set/Array pattern |
| **Q7: Null vs Undefined** | ✅ Standardize on optional `?:` properties |

---

**Version**: 1.0
**Last Updated**: 2025-10-19
**Status**: ✅ APPROVED - All decisions finalized
