# UI Migration Plan - Entity Refactor

## Goal
Update all UI components to work with the new entity architecture WITHOUT modifying entities.

## Entity Changes Summary

### WorldPoint
- No more `id` field - entities don't have IDs
- `xyz` → `lockedXyz` and `optimizedXyz`
- Direct field access (no getters)
- Uses `Set<ILine>` for `connectedLines`
- Uses `Set<IConstraint>` for `referencingConstraints`

### Line
- No more `id` field
- `pointA` and `pointB` are `WorldPoint` objects (not IDs)
- `constraints` object flattened → `direction`, `targetLength`, `tolerance` fields directly on Line
- Direct field access

### Viewpoint
- No more `id` field
- `position` replaces `lockedXyz`
- Direct field access
- Uses `Set<IImagePoint>` for `imagePoints`

### ImagePoint
- No more `id` field
- `worldPoint` is `IWorldPoint` object (not ID)
- `viewpoint` is `IViewpoint` object (not ID)
- Removed `isManuallyPlaced` field from DTO

### Project
- No more `id` field
- Settings flattened directly onto Project (no nested `settings` object)
- All collections are `Set<T>` not `Map<string, T>`
- Direct field access

## Migration Strategy

### Phase 1: Identify All Components Using Entities
- [ ] List all components that use WorldPoint
- [ ] List all components that use Line
- [ ] List all components that use Viewpoint
- [ ] List all components that use ImagePoint
- [ ] List all components that use Project

### Phase 2: Common Patterns to Fix

#### Pattern 1: ID Access
```typescript
// BEFORE
const pointId = point.id
project.points.get(pointId)

// AFTER
// Just use the point object directly
const point = ...
// No IDs needed!
```

#### Pattern 2: Map Iteration
```typescript
// BEFORE
project.points.forEach((point, id) => ...)
Array.from(project.points.values())

// AFTER
project.worldPoints.forEach(point => ...)
Array.from(project.worldPoints)
```

#### Pattern 3: Settings Access
```typescript
// BEFORE
project.settings.showPointNames

// AFTER
project.showPointNames
```

#### Pattern 4: Constraints Access
```typescript
// BEFORE
line.constraints.direction
line.constraints.targetLength

// AFTER
line.direction
line.targetLength
```

#### Pattern 5: Coordinate Access
```typescript
// BEFORE
point.xyz
point.getCoordinates()

// AFTER
point.optimizedXyz || point.lockedXyz  // Or specific logic based on context
```

### Phase 3: Component-by-Component Updates

Start with leaf components (no dependencies on other components) and work up.

**Priority Order:**
1. Simple display components (read-only)
2. List/manager components
3. Editor/property panels
4. Complex interaction components
5. Tool components

### Phase 4: Verification

After each component update:
- [ ] Check TypeScript compilation
- [ ] Test the component in the UI
- [ ] Verify no entity files were modified
- [ ] Run `bash check.sh`

## Notes

- If you find yourself wanting to add an ID to an entity → STOP and rethink the UI code
- If you need to look up an entity → you probably already have a reference to it
- When in doubt, pass entity objects around, not IDs
