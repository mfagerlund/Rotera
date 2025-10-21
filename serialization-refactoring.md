# Serialization Refactoring Analysis and Recommendations

## Current State Analysis

The current serialization implementation in `Serialization.ts` (472 lines) uses a centralized approach with:
- Manual ID mapping via `Map<Entity, string>` for each entity type
- Separate DTO interfaces for each entity type
- Static methods like `worldPointToDto()`, `lineToDto()`, etc.
- Manual dependency ordering during serialization/deserialization

### Current Dependencies Graph
```
WorldPoint (fundamental - no dependencies)
  ↓
Line (depends on: WorldPoint)
Viewpoint (depends on: WorldPoint via ImagePoints)
  ↓
ImagePoint (depends on: WorldPoint, Viewpoint)
  ↓
Constraint (depends on: WorldPoint, Line, and potentially ImagePoint/Viewpoint)
```

## Problems with Current Approach

1. **Scaling Issue**: As you noted, this file will grow linearly with each new entity type
2. **Centralization**: All serialization logic is in one place, violating Single Responsibility Principle
3. **Manual Dependency Management**: The order of serialization is hardcoded in `projectToDto()`
4. **Fragility**: Adding a new constraint type requires changes in multiple places
5. **Incomplete Implementation**: Constraints currently don't serialize (see line 467-469)

## Proposed Solutions

### Option 1: Self-Serializing Entities with Context (RECOMMENDED)

This approach gives each entity the ability to serialize/deserialize itself, with a shared context for ID resolution.

#### Architecture

```typescript
// SerializationContext.ts
export class SerializationContext {
  // During serialization: entity → id
  private entityToId = new Map<object, string>()

  // During deserialization: id → entity
  private idToEntity = new Map<string, object>()

  private idCounter = 0

  registerEntity(entity: object, id?: string): string {
    if (!id) id = `${entity.constructor.name}_${this.idCounter++}`
    this.entityToId.set(entity, id)
    this.idToEntity.set(id, entity)
    return id
  }

  getEntityId(entity: object): string | undefined {
    return this.entityToId.get(entity)
  }

  getEntity<T>(id: string): T | undefined {
    return this.idToEntity.get(id) as T | undefined
  }

  hasEntity(entity: object): boolean {
    return this.entityToId.has(entity)
  }
}

// Serializable interface
export interface ISerializable<TDto> {
  serialize(context: SerializationContext): TDto
}

export interface IDeserializable<TDto, TEntity> {
  deserialize(dto: TDto, context: SerializationContext): TEntity
}
```

#### Entity Implementation Example

```typescript
// WorldPoint.ts
interface WorldPointDto {
  id: string
  name: string
  lockedXyz: [number | null, number | null, number | null]
  optimizedXyz?: [number, number, number]
  color: string
  isVisible: boolean
  isOrigin: boolean
}

export class WorldPoint implements ISerializable<WorldPointDto> {
  // ... existing implementation ...

  serialize(context: SerializationContext): WorldPointDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    return {
      id,
      name: this.name,
      lockedXyz: this.lockedXyz,
      optimizedXyz: this.optimizedXyz,
      color: this.color,
      isVisible: this.isVisible,
      isOrigin: this.isOrigin
    }
  }

  static deserialize(dto: WorldPointDto, context: SerializationContext): WorldPoint {
    const point = WorldPoint.createFromSerialized(
      dto.name,
      dto.lockedXyz,
      dto.color,
      dto.isVisible,
      dto.isOrigin,
      dto.optimizedXyz
    )
    context.registerEntity(point, dto.id)
    return point
  }
}

// Line.ts
interface LineDto {
  id: string
  name: string
  pointAId: string
  pointBId: string
  color: string
  // ... other properties
}

export class Line implements ISerializable<LineDto> {
  serialize(context: SerializationContext): LineDto {
    const id = context.getEntityId(this) || context.registerEntity(this)

    // This will work because WorldPoints are already in context
    const pointAId = context.getEntityId(this.pointA)
    const pointBId = context.getEntityId(this.pointB)

    if (!pointAId || !pointBId) {
      throw new Error(`Line ${this.name}: dependency not serialized yet`)
    }

    return {
      id,
      name: this.name,
      pointAId,
      pointBId,
      color: this.color,
      // ... other properties
    }
  }

  static deserialize(dto: LineDto, context: SerializationContext): Line {
    const pointA = context.getEntity<WorldPoint>(dto.pointAId)
    const pointB = context.getEntity<WorldPoint>(dto.pointBId)

    if (!pointA || !pointB) {
      throw new Error(`Line ${dto.name}: dependencies not found`)
    }

    const line = Line.create(dto.name, pointA, pointB, {
      color: dto.color,
      // ... other options
    })
    context.registerEntity(line, dto.id)
    return line
  }
}
```

#### Orchestration

```typescript
// Serialization.ts (much smaller now!)
export class Serialization {
  static serialize(project: Project): string {
    const context = new SerializationContext()

    // Phase 1: Register all entities in dependency order
    project.worldPoints.forEach(wp => wp.serialize(context))
    project.viewpoints.forEach(vp => vp.serialize(context))
    project.lines.forEach(line => line.serialize(context))
    project.imagePoints.forEach(ip => ip.serialize(context))
    project.constraints.forEach(c => c.serialize(context))

    // Phase 2: Now serialize with all IDs available
    const dto = {
      name: project.name,
      worldPoints: Array.from(project.worldPoints).map(wp => wp.serialize(context)),
      viewpoints: Array.from(project.viewpoints).map(vp => vp.serialize(context)),
      lines: Array.from(project.lines).map(line => line.serialize(context)),
      imagePoints: Array.from(project.imagePoints).map(ip => ip.serialize(context)),
      constraints: Array.from(project.constraints).map(c => c.serialize(context)),
      // ... project settings
    }

    return JSON.stringify(dto, null, 2)
  }

  static deserialize(json: string): Project {
    const dto = JSON.parse(json)
    const context = new SerializationContext()

    // Deserialize in dependency order
    const worldPoints = dto.worldPoints.map(wpDto =>
      WorldPoint.deserialize(wpDto, context)
    )

    const viewpoints = dto.viewpoints.map(vpDto =>
      Viewpoint.deserialize(vpDto, context)
    )

    const lines = dto.lines.map(lineDto =>
      Line.deserialize(lineDto, context)
    )

    const imagePoints = dto.imagePoints.map(ipDto =>
      ImagePoint.deserialize(ipDto, context)
    )

    const constraints = dto.constraints.map(cDto =>
      deserializeConstraint(cDto, context)  // Polymorphic helper
    )

    return Project.createFull(/* ... */)
  }
}
```

#### Benefits
- **Scalability**: New entity types add ~30 lines to their own file, not to Serialization.ts
- **Encapsulation**: Each entity knows how to serialize itself
- **Maintainability**: Serialization logic lives with the entity
- **Flexibility**: Easy to add version migration logic per-entity
- **Type Safety**: DTOs can be private to each entity module

#### Costs
- Adds ~25-40 lines to each entity class
- Requires entities to know about serialization (breaks pure domain model)
- Two-phase serialization (register, then serialize) is slightly complex

---

### Option 2: StorageKey Property on Entities

Add a stable identifier to entities that persists across sessions.

```typescript
export class WorldPoint {
  readonly storageKey: string  // e.g., "wp_abc123"

  // Generated once on creation, never changes
  private constructor(...) {
    this.storageKey = `wp_${crypto.randomUUID()}`
  }
}
```

#### Benefits
- **Simpler Serialization**: No need for runtime ID mapping
- **Stable References**: Same entity always has same ID
- **Cross-Session References**: Can reference entities across save files

#### Costs
- **Breaks Immutability**: Entities now carry persistence concerns
- **Memory Overhead**: Every entity carries a UUID (~16 bytes + object overhead)
- **Architectural Pollution**: Domain entities know about storage
- **Migration Headaches**: Need to handle legacy data without storageKeys

---

### Option 3: Hybrid Approach with Visitor Pattern

Use a serialization visitor that entities accept.

```typescript
interface SerializationVisitor {
  visitWorldPoint(point: WorldPoint): WorldPointDto
  visitLine(line: Line): LineDto
  visitViewpoint(vp: Viewpoint): ViewpointDto
  // ... etc
}

interface Visitable {
  accept(visitor: SerializationVisitor): unknown
}

export class WorldPoint implements Visitable {
  accept(visitor: SerializationVisitor) {
    return visitor.visitWorldPoint(this)
  }
}
```

#### Benefits
- **Separation of Concerns**: Serialization logic separate from domain
- **Extensibility**: Easy to add new serialization formats
- **Type Safety**: Visitor pattern ensures all entity types handled

#### Costs
- **Complexity**: Visitor pattern is more abstract
- **Boilerplate**: Still need visit methods in every entity
- **No Clear Win**: Doesn't actually reduce code vs current approach

---

## Recommendation: Option 1 (Self-Serializing + Context)

### Why?
1. **Proven Pattern**: Used successfully in many ORMs and serialization frameworks
2. **Scales Well**: New entities add minimal code to central Serialization.ts
3. **Handles Constraints**: Polymorphic constraints can each implement their own serialization
4. **Dependency Safety**: Context ensures dependencies are serialized first
5. **Testable**: Each entity's serialization can be unit tested independently

### Implementation Plan

1. **Phase 1**: Create `SerializationContext` class
2. **Phase 2**: Add `serialize()/deserialize()` to `WorldPoint` (foundation)
3. **Phase 3**: Add to `Viewpoint` (independent of WorldPoint)
4. **Phase 4**: Add to `Line` (depends on WorldPoint)
5. **Phase 5**: Add to `ImagePoint` (depends on WorldPoint + Viewpoint)
6. **Phase 6**: Add to base `Constraint` class with polymorphic dispatch
7. **Phase 7**: Implement constraint-specific serialization for each type
8. **Phase 8**: Refactor `Serialization.ts` to use new system
9. **Phase 9**: Remove old DTO interfaces and methods

### Alternative Consideration

If you absolutely don't want to touch entities, **keep the current approach** but make it more modular:

```typescript
// serializers/WorldPointSerializer.ts
export class WorldPointSerializer {
  static toDto(point: WorldPoint, context: SerializationContext): WorldPointDto {
    // ...
  }

  static fromDto(dto: WorldPointDto, context: SerializationContext): WorldPoint {
    // ...
  }
}

// Serialization.ts becomes a coordinator
export class Serialization {
  static serialize(project: Project): string {
    const context = new SerializationContext()

    const dto = {
      worldPoints: project.worldPoints.map(wp =>
        WorldPointSerializer.toDto(wp, context)
      ),
      // ...
    }
  }
}
```

This keeps entities pure but still modularizes the serialization code.

---

## Constraint Serialization Strategy

With Option 1, constraint serialization becomes elegant:

```typescript
// base-constraint.ts
interface ConstraintDto {
  id: string
  type: string
  name: string
  // ... other common fields
}

export abstract class Constraint {
  abstract serialize(context: SerializationContext): ConstraintDto
  static deserialize(dto: ConstraintDto, context: SerializationContext): Constraint {
    // Polymorphic dispatch based on dto.type
    switch (dto.type) {
      case 'distance_point_point':
        return DistanceConstraint.deserialize(dto, context)
      case 'angle_point_point_point':
        return AngleConstraint.deserialize(dto, context)
      // ... etc
    }
  }
}

// distance-constraint.ts
interface DistanceConstraintDto extends ConstraintDto {
  pointAId: string
  pointBId: string
  targetDistance: number
  tolerance: number
}

export class DistanceConstraint extends Constraint {
  serialize(context: SerializationContext): DistanceConstraintDto {
    return {
      id: context.getEntityId(this) || context.registerEntity(this),
      type: 'distance_point_point',
      name: this.name,
      pointAId: context.getEntityId(this.pointA)!,
      pointBId: context.getEntityId(this.pointB)!,
      targetDistance: this.targetDistance,
      tolerance: this.tolerance
    }
  }

  static deserialize(dto: DistanceConstraintDto, context: SerializationContext): DistanceConstraint {
    const pointA = context.getEntity<WorldPoint>(dto.pointAId)!
    const pointB = context.getEntity<WorldPoint>(dto.pointBId)!

    const constraint = DistanceConstraint.create(
      dto.name,
      pointA,
      pointB,
      dto.targetDistance,
      { tolerance: dto.tolerance }
    )

    context.registerEntity(constraint, dto.id)
    return constraint
  }
}
```

Each constraint type implements its own serialization. Adding a new constraint type requires:
1. Define `<ConstraintName>Dto` interface
2. Implement `serialize()` method
3. Implement static `deserialize()` method
4. Add case to `Constraint.deserialize()` switch

---

## Code Size Estimates

### Current Approach (if all constraints were implemented)
- `Serialization.ts`: ~1200 lines (extrapolating from current 472)
- Per entity/constraint: 0 lines (all centralized)

### Option 1 (Self-Serializing)
- `Serialization.ts`: ~150 lines (orchestration only)
- `SerializationContext.ts`: ~50 lines
- Per entity: ~30-40 lines (serialize + deserialize)
- Per constraint: ~30-40 lines (serialize + deserialize)

### Total for 10 constraints + 5 entities
- Current: ~1200 lines in one file
- Option 1: ~200 (infrastructure) + 450 (15 entities × 30) = ~650 lines distributed across 17 files

---

## Edge Cases to Handle

1. **Circular References**: ImagePoint → WorldPoint → ImagePoint (via sets)
   - Solution: Serialize references by ID only, don't serialize contained collections

2. **Missing Dependencies**: Line references deleted WorldPoint
   - Solution: Validate all IDs exist before deserializing referencing entities

3. **Version Migration**: Old save files with different schema
   - Solution: Add `version` field to DTOs, implement migration functions

4. **Partial Serialization**: Only serialize dirty entities
   - Solution: Add `isDirty` flag, only serialize changed entities (future enhancement)

---

## Testing Strategy

1. **Unit Tests**: Each entity's serialize/deserialize independently
2. **Integration Tests**: Full project serialize → deserialize → compare
3. **Round-trip Tests**: project → JSON → project' → JSON' → assert(JSON === JSON')
4. **Edge Case Tests**: Empty project, single-entity project, etc.

---

## Questions to Consider

1. **Do you want entities to know about serialization?**
   - Yes → Option 1
   - No → Keep current approach but modularize with separate serializer classes

2. **Do you need stable IDs across sessions?**
   - Yes → Consider storageKey
   - No → Runtime IDs are fine

3. **Will you need multiple serialization formats?** (JSON, binary, database, etc.)
   - Yes → Visitor pattern or adapter pattern
   - No → Simple approach is fine

4. **How many total entity types do you expect?**
   - < 10 → Current approach is maintainable
   - 10-20 → Option 1 recommended
   - > 20 → Consider ORM or serialization framework

---

## My Specific Recommendation for Pictorigo

Given:
- You have ~5 base entities (WorldPoint, Line, Viewpoint, ImagePoint, Project)
- You have ~10 constraint types
- You value clean architecture
- The current approach is incomplete (constraints don't serialize)

**Implement Option 1** because:
1. It will reduce total code size by ~40%
2. It will make adding new constraints trivial (~30 lines each)
3. It keeps related code together (entity knows how to save itself)
4. It makes the dependency graph explicit in code
5. It's a proven pattern that scales well

**Implementation Priority**:
1. Start with `SerializationContext` (foundation)
2. Do `WorldPoint` first (simplest, no dependencies)
3. Do one constraint type (e.g., `DistanceConstraint`) to validate pattern
4. Gradually migrate remaining entities
5. Keep old code until all entities migrated
6. Write migration script to convert old save files

The two-phase approach (register IDs, then serialize) handles your dependency graph elegantly without needing a topological sort.
