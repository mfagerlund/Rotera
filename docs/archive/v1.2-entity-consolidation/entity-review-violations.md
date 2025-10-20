# Entity Architecture Violations Review

Reviewed all entities in `C:\Dev\Pictorigo\frontend\src\entities`

## Summary

| Entity | IDs at Runtime? | Private Fields? | Getters/Setters? | Status |
|--------|----------------|-----------------|------------------|---------|
| **WorldPoint** | ✅ NO | ✅ Public | ✅ Removed | **CLEAN** |
| **Project** | ✅ NO | ✅ Public | ✅ Removed | **CLEAN** |
| **Line** | ✅ NO | ❌ Private | ❌ Has getters | **NEEDS FIX** |
| **Viewpoint** | ✅ NO | ❌ Private `_data` | ❌ Has getters | **NEEDS FIX** |
| **Plane** | ❌ **USES IDS** | ❌ Private `data` | ❌ Has getters | **MAJOR VIOLATION** |

---

## 🚨 CRITICAL: Plane.ts - Uses IDs at Runtime

**File:** `entities/plane.ts`

### Violations:

```typescript
// ❌ WRONG: Stores point IDs instead of object references
export interface PlaneDto {
  pointIds: PointId[]  // Should be: points: Set<WorldPoint>
}

export class Plane {
  private constructor(
    private repo: PlaneRepository,  // ❌ Repository pattern to look up IDs
    private data: PlaneDto          // ❌ Stores IDs
  ) {}

  // ❌ Returns IDs
  getDependencies(): EntityId[] {
    return this.data.pointIds.map(id => id as EntityId)
  }

  // ❌ Accepts IDs
  addPoint(pointId: PointId): void {
    this.data.pointIds.push(pointId)
  }

  // ❌ Uses IDs
  hasPoint(pointId: PointId): boolean {
    return this.data.pointIds.includes(pointId)
  }
}
```

### Should Be:

```typescript
export class Plane {
  id: PlaneId
  name: string
  points: Set<WorldPoint>  // ✅ Object references
  color: string
  // ... other fields

  addPoint(point: WorldPoint): void {
    this.points.add(point)
  }

  hasPoint(point: WorldPoint): boolean {
    return this.points.has(point)
  }

  getPoints(): WorldPoint[] {
    return Array.from(this.points)
  }
}
```

**Impact:** This is a fundamental architectural violation. Plane uses the Repository pattern with ID lookups, which is exactly what we're trying to avoid.

---

## ⚠️ Line.ts - Has Private Fields with Getters

**File:** `entities/line/Line.ts`

### Violations:

```typescript
// ❌ Private fields
private _id: LineId
private _name: string
private _pointA: WorldPoint  // ✅ Object ref (good) but private (bad)
private _pointB: WorldPoint  // ✅ Object ref (good) but private (bad)
private _color: string
// ... etc

// ❌ Unnecessary getters
get name(): string {
  return this._name
}

get pointA(): WorldPoint {
  return this._pointA
}
```

### Should Be:

```typescript
// ✅ Public fields
id: LineId
name: string
pointA: WorldPoint  // Direct object reference
pointB: WorldPoint  // Direct object reference
color: string
// ... etc

// Remove all getters that just return a field!
```

**What to Keep:**
- ✅ `pointA` and `pointB` already use object references (correct!)
- ✅ Computed getters like `get hasDistanceConstraint()` that calculate values
- ✅ Methods like `length()`, `getDirection()`, etc.

**What to Remove:**
- ❌ All `private _field` → make them `public field`
- ❌ All `get field() { return this._field }` getters
- ❌ All `set field(v) { this._field = v }` setters

---

## ⚠️ Viewpoint.ts - Wraps DTO with Private Field

**File:** `entities/viewpoint/Viewpoint.ts`

### Violations:

```typescript
// ❌ Wraps entire DTO in private field
private constructor(
  private _data: ViewpointDto
) {}

// ❌ All fields accessed via getters
get name(): string { return this._data.name }
get filename(): string { return this._data.filename }
get focalLength(): number { return this._data.focalLength }
get position(): [number, number, number] { return [...this._data.position] }
// ... etc
```

### Should Be:

```typescript
// ✅ Unpack all fields from DTO to public fields
id: ViewpointId
name: string
filename: string
url: string
imageWidth: number
imageHeight: number
focalLength: number
position: [number, number, number]
rotation: [number, number, number, number]
imagePoints: Record<string, ImagePointDto>  // IDs OK in DTO for serialization
// ... etc

private constructor(
  id: ViewpointId,
  name: string,
  filename: string,
  // ... all fields as parameters
) {
  this.id = id
  this.name = name
  this.filename = filename
  // ... assign all fields
}
```

**Note:** Image points use IDs in the DTO, which is acceptable because:
1. ViewpointDto is only for serialization
2. The IDs reference WorldPoints which must be resolved by the caller
3. Runtime code should work with `getImagePointsForWorldPoint(worldPoint: WorldPoint)` not IDs

---

## 📋 Fix Priority

### 1. **HIGH PRIORITY: Plane.ts**
**Reason:** Fundamental architectural violation - uses IDs at runtime
**Work Required:**
- Remove `PlaneRepository` pattern
- Change `pointIds: PointId[]` to `points: Set<WorldPoint>`
- Update all methods to use object references
- Fix serialization to convert between Sets and ID arrays

### 2. **MEDIUM PRIORITY: Line.ts**
**Reason:** Already uses object references correctly, just needs public fields
**Work Required:**
- Change all `private _field` to `public field`
- Remove getters/setters that just access fields
- Keep computed getters and methods
- ~200 lines of mechanical changes

### 3. **MEDIUM PRIORITY: Viewpoint.ts**
**Reason:** Needs to unpack DTO wrapper into public fields
**Work Required:**
- Unpack `_data: ViewpointDto` into individual public fields
- Remove getters that just access `_data.field`
- Keep image point management (IDs in DTO are OK)
- ~150 lines of changes

---

## Architectural Rules Compliance

### ✅ CORRECT Examples:

```typescript
// WorldPoint (already fixed)
export class WorldPoint {
  id: PointId
  name: string
  xyz: [number | null, number | null, number | null] | undefined
  color: string
  connectedLines: Set<ILine>  // ✅ Object references
  // Direct field access!
}

// Line references (the pattern IS correct, just needs public fields)
private _pointA: WorldPoint  // ✅ Object reference (just make it public)
private _pointB: WorldPoint  // ✅ Object reference (just make it public)
```

### ❌ WRONG Examples:

```typescript
// Plane (MUST FIX)
pointIds: PointId[]  // ❌ IDs instead of objects
repo.getPoint(pointId)  // ❌ ID lookup

// Line (minor - just needs public)
private _name: string  // ❌ Private with getter
get name() { return this._name }  // ❌ Unnecessary

// Viewpoint (minor - just needs unpacking)
private _data: ViewpointDto  // ❌ Wraps everything
get name() { return this._data.name }  // ❌ Unnecessary
```

---

## Next Steps

1. **Fix Plane.ts first** - This is the biggest architectural violation
2. **Fix Line.ts** - Make fields public, remove getters
3. **Fix Viewpoint.ts** - Unpack _data into public fields
4. Run tests and type checks
5. Update any code that depended on getters to use direct field access

The goal: **All entities should have public fields with direct access, using object references (not IDs) at runtime.**
