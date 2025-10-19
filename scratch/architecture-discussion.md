# Architecture Discussion - Entity & DTO Structure

## Current State Summary

We have multiple competing representations:
- **WorldPoint**: 7 different representations
- **Line**: 3 different representations
- **Camera**: 4 different representations
- **Constraints**: 3 different representations

This violates your principle: "NO backward compatibility and NO legacy code"

---

it certainly does. update the claude.md to NOT create multiple objects that serve the same or similar purposes!

## Key Decisions Needed

### 1. DOMAIN ENTITY CLASSES (e.g., `WorldPoint`, `Line`, `Camera`)

**Question: What should domain entities be responsible for?**

- [x] Hold **state** (current values: position, color, locked, etc.)
- [x] Have **behavior methods** (move(), validate(), computeDistance())
- [x] Store **object references** to other entities (worldPoint.imagePoints = [ImagePoint, ...])
- [x] Handle **optimization concerns** (addToValueMap(), computeResiduals())
- [x] Do **validation** logic (isValid(), getValidationErrors())
- [x] Manage **relationships** (getConnectedLines(), removeFromLine())

**Your response:**
i agree with all

---

### 2. DTOs (Data Transfer Objects)

**Question: What should DTOs be for?**

- [ ] Pure data only (no methods, just properties)
- [ ] Used ONLY for serialization/deserialization (save/load from JSON)
- [ ] Use IDs instead of object references (worldPointId vs worldPoint object)
- [ ] Can be flat or nested?
- [ ] Should have type discriminators for polymorphism?

**Current pattern:**
```typescript
// Entity
class WorldPoint {
  id: string;
  xyz: [number, number, number];
  imagePoints: ImagePoint[];  // Object references
  toDto(): WorldPointDto { ... }
}

// DTO
interface WorldPointDto {
  id: string;
  xyz: [number, number, number];
  imagePointIds: string[];  // Just IDs
}
```

**Your response:**
agree, i'm considering placing the dtos in a separate class/method that does all serialization to and from actual enities to prevent llms from using the wrong class. again.

---

### 3. TYPES FOLDER (`types/*.ts`)

**Question: What belongs in the types folder?**

Options:
- A) Delete it entirely, types live with their implementations
- B) Keep for cross-cutting interfaces only (ISelectable, IValidatable)
- C) Keep for project-level compositions (EntityProject)
- D) Keep for optimization interfaces (IOptimizable, IResidualProvider)

**Your response:**

A
---

### 4. OPTIMIZATION INTEGRATION

**Question: Where should optimization logic live?**

**Option A - Baked In (current):**
```typescript
class WorldPoint implements IOptimizable {
  addToValueMap(valueMap: ValueMap): void { ... }
  computeResiduals(): number[] { ... }
}
```
Pros: Entities know how to optimize themselves
Cons: Tight coupling, entities know about optimization system

**Option B - Separate Layer:**
```typescript
class WorldPoint {
  // Pure domain logic only
}

class WorldPointOptimizer {
  addToValueMap(point: WorldPoint, valueMap: ValueMap): void { ... }
  computeResiduals(point: WorldPoint): number[] { ... }
}
```
Pros: Separation of concerns, cleaner domain
Cons: Logic spread across files

**Option C - Mix/Match:**
Entities implement interfaces but delegate to services

**Your response:**
A. Each entity should know how to add itself to optimization - and extract it's current optimization state after optimization. worldpoint should know its optimized xyz (and i should be able to see it in the ui). image points the same except their reprojection position and residual etc.

---

### 5. CONVERSION LAYER (Entity ↔ DTO)

**Question: How should we convert between entities and DTOs?**

**Option A - Static Methods on Entity:**
```typescript
class WorldPoint {
  static fromDto(dto: WorldPointDto, repo: Repository): WorldPoint { ... }
  toDto(): WorldPointDto { ... }
}
```

**Option B - Separate Converter Utility:**
```typescript
class WorldPointConverter {
  static toDto(entity: WorldPoint): WorldPointDto { ... }
  static fromDto(dto: WorldPointDto, repo: Repository): WorldPoint { ... }
}
```

**Option C - Methods on Repository:**
```typescript
class EntityRepository {
  worldPointToDto(entity: WorldPoint): WorldPointDto { ... }
  worldPointFromDto(dto: WorldPointDto): WorldPoint { ... }
}
```

**Your response:**

ONE separate class that handles full entity=>dto and dto=>entity. entities know nothing about serialization. dtos no nothin in general.

---

### 6. SUPPORTING SERVICES (Geometry, Validation, Relationships)

**Question: Should we keep separate service files?**

**Current structure:**
```
world-point/
  WorldPoint.ts              # Main class
  WorldPointGeometry.ts      # Geometric calculations
  WorldPointValidation.ts    # Validation logic
  WorldPointRelationships.ts # Relationship management
  WorldPointDto.ts           # DTO
```

**Option A - Keep Separate (current, composition):**
Pros: Single responsibility, testable
Cons: Many files, indirection

**Option B - Merge into Entity (all-in-one):**
```typescript
class WorldPoint {
  // All validation, geometry, relationships in one class
}
```
Pros: Everything in one place
Cons: Large files, mixed concerns

**Option C - Use Mixins:**
Complex TypeScript patterns

**Your response:**
SINGLE CLASS FOR WP, SINGLE CLASS FOR IP, SINGLE CLASS FOR Camera. There's an Image concept and a Camera concept. This is very confusing ecause they have a 1 to 1 mapping. I propose we call a unified class CameraImage instead. It contains camera preojection details (quaternion+position) and a list of ImagePoints.

---

### 7. LEGACY CODE TO DELETE

**Question: Can we delete these files?**

- [ ] `types/project.ts` - Old project structure (WorldPoint, Line, Camera interfaces)
- [ ] `types/geometry.ts` - Alternative geometry system (Point, Line, Circle)
- [ ] `types/enhanced-project.ts` - Enhanced versions
- [ ] Old deleted constraint files (BaseConstraint.ts, DistancePointPointConstraint.ts, etc.)

**Your response:**

yes, as long as everything works afterwards.

---

### 8. PROPOSED FINAL STRUCTURE

**Option: Clean, Single Source of Truth**

```
frontend/src/
  entities/
    world-point/
      WorldPoint.ts          # Domain entity (state + behavior + validation)
      WorldPointDto.ts       # Pure data for serialization
      index.ts
    line/
      Line.ts
      LineDto.ts
      index.ts
    camera/
      Camera.ts
      CameraDto.ts           # Move DTO out of Camera.ts
      index.ts
    constraints/
      Constraint.ts          # Base class
      DistanceConstraint.ts
      AngleConstraint.ts
      ... (all concrete types)
      dtos/
        ConstraintDto.ts     # Polymorphic DTO union
        BaseConstraintDto.ts
        ... (all DTO types)
      index.ts

  types/
    project-entities.ts      # EntityProject (composition of entities)
    optimization.ts          # IOptimizable, IResidualProvider interfaces
    selectable.ts            # ISelectable, IValidatable interfaces
    ids.ts                   # Type aliases (PointId, LineId, etc.)

  utils/
    serialization.ts         # Entity ↔ DTO conversion utilities
    project-serialization.ts # Full project save/load

  optimization/
    (optimization system - separate from entities)
```

**Your response:**
ok

---

## Your Overall Vision

**Please describe in your own words:**

What should the architecture look like? What are the key principles you want to follow?

When I look at a class, I want to understand all about the class. I don't want to look at 5 different files to understand the class.
---

## Next Steps

Once we agree on the structure, I will:
1. Create a cleanup plan
2. Delete legacy code
3. Standardize patterns across all entities
4. Update all references
5. Run tests to verify
