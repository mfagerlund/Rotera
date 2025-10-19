# UI Migration to Entity-Based Architecture

## Current State

MainLayout.tsx has been updated to pass entity Maps directly to UI components. All adapter/conversion code has been removed. Components currently receive:

- `Map<string, WorldPoint>` instead of `Record<string, WorldPointDTO>`
- `Map<string, Line>` instead of `Record<string, LineDTO>`
- `Map<string, Viewpoint>` instead of `Record<string, ImageDTO>`
- Entity objects with methods (`.getId()`, `.getName()`) instead of DTOs with properties (`.id`, `.name`)

**Type safety is temporarily suspended** using `as any` casts to allow compilation during migration.

## Components Needing Updates

### 1. ImageNavigationToolbar
**Location**: `frontend/src/components/ImageNavigationToolbar.tsx`

**Current props (assumed):**
```typescript
{
  images: Record<string, ImageDTO>
  worldPoints: Record<string, WorldPointDTO>
  currentImageId: string | null
  onImageChange: (imageId: string) => void
  onCreateWorldPoint: (name: string, xyz: [number, number, number]) => void
}
```

**Required changes:**
```typescript
{
  images: Map<string, Viewpoint>  // Not Record
  worldPoints: Map<string, WorldPoint>  // Not Record
  // ... rest unchanged
}
```

**Code patterns to update:**
```typescript
// BEFORE:
Object.entries(images).map(([id, img]) => (
  <div key={id}>{img.name}</div>
))

// AFTER:
Array.from(images.entries()).map(([id, viewpoint]) => (
  <div key={id}>{viewpoint.getName()}</div>
))

// OR using values if key not needed:
Array.from(images.values()).map((viewpoint) => (
  <div key={viewpoint.getId()}>{viewpoint.getName()}</div>
))

// BEFORE:
const imageCount = Object.keys(images).length

// AFTER:
const imageCount = images.size

// BEFORE:
const image = images[imageId]

// AFTER:
const image = images.get(imageId)
```

---

### 2. ImageWorkspace
**Location**: `frontend/src/components/ImageWorkspace.tsx`

**Current props (assumed):**
```typescript
{
  image: ImageDTO | null
  worldPoints: Record<string, WorldPointDTO>
  onImageClick: (u: number, v: number) => void
  onWorldPointDrag: (worldPointId: string, u: number, v: number) => void
}
```

**Required changes:**
```typescript
{
  image: Viewpoint | null  // Entity, not DTO
  worldPoints: Map<string, WorldPoint>  // Not Record
  // ... rest unchanged
}
```

**Code patterns to update:**
```typescript
// BEFORE:
<img src={image.dataUrl} alt={image.name} />
const imagePoints = image.imagePoints

// AFTER:
<img src={image.getDataUrl()} alt={image.getName()} />
const imagePoints = image.getImagePoints()

// BEFORE:
const worldPoint = worldPoints[worldPointId]

// AFTER:
const worldPoint = worldPoints.get(worldPointId)

// Image point rendering - before:
imagePoints.forEach(ip => {
  const wp = worldPoints[ip.worldPointId]
  renderPoint(ip.u, ip.v, wp.name)
})

// After:
imagePoints.forEach(ip => {
  const wp = worldPoints.get(ip.worldPointId)
  renderPoint(ip.u, ip.v, wp?.getName() || 'Unknown')
})
```

---

### 3. WorldWorkspace
**Location**: `frontend/src/components/WorldWorkspace.tsx`

**Current props (assumed):**
```typescript
{
  project: LegacyProject  // Uses Records internally
  onWorldPointDrag: (id: string, xyz: [number, number, number]) => void
}
```

**Required changes:**
```typescript
{
  project: EntityProject  // Uses Maps internally
  // ... rest unchanged
}
```

**Code patterns to update:**
```typescript
// BEFORE:
Object.entries(project.worldPoints).map(([id, wp]) => {
  renderSphere(wp.xyz, wp.name, wp.color)
})

// AFTER:
Array.from(project.worldPoints.values()).map((wp) => {
  renderSphere(wp.getXyz(), wp.getName(), wp.getColor())
})

// BEFORE:
Object.entries(project.lines).map(([id, line]) => {
  const pointA = project.worldPoints[line.pointAId]
  const pointB = project.worldPoints[line.pointBId]
  renderLine(pointA.xyz, pointB.xyz, line.color)
})

// AFTER:
Array.from(project.lines.values()).map((line) => {
  const pointA = line.getPointA()
  const pointB = line.getPointB()
  renderLine(pointA.getXyz(), pointB.getXyz(), line.getColor())
})
```

---

### 4. WorldPointPanel
**Location**: `frontend/src/components/WorldPointPanel.tsx`

**Current props (assumed):**
```typescript
{
  worldPoints: Record<string, WorldPointDTO>
  selectedIds: string[]
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}
```

**Required changes:**
```typescript
{
  worldPoints: Map<string, WorldPoint>  // Not Record
  // ... rest unchanged
}
```

**Code patterns to update:**
```typescript
// BEFORE:
Object.entries(worldPoints)
  .sort((a, b) => a[1].name.localeCompare(b[1].name))
  .map(([id, wp]) => (
    <div key={id} onClick={() => onSelect(id)}>
      {wp.name} - {wp.xyz.join(', ')}
    </div>
  ))

// AFTER:
Array.from(worldPoints.values())
  .sort((a, b) => a.getName().localeCompare(b.getName()))
  .map((wp) => (
    <div key={wp.getId()} onClick={() => onSelect(wp.getId())}>
      {wp.getName()} - {wp.getXyz().join(', ')}
    </div>
  ))

// BEFORE:
const selectedPoint = worldPoints[selectedId]

// AFTER:
const selectedPoint = worldPoints.get(selectedId)

// BEFORE:
const count = Object.keys(worldPoints).length

// AFTER:
const count = worldPoints.size
```

---

### 5. CreationToolsManager
**Location**: `frontend/src/components/CreationToolsManager.tsx`

**Current props (assumed):**
```typescript
{
  existingLines: Record<string, LineDTO>
  worldPoints: Record<string, WorldPointDTO>
  onCreateLine: (pointAId: string, pointBId: string) => void
}
```

**Required changes:**
```typescript
{
  existingLines: Map<string, Line>  // Not Record
  worldPoints: Map<string, WorldPoint>  // Not Record
  // ... rest unchanged
}
```

**Code patterns to update:**
```typescript
// BEFORE:
const lineExists = Object.values(existingLines).some(line =>
  (line.pointAId === pointA && line.pointBId === pointB) ||
  (line.pointAId === pointB && line.pointBId === pointA)
)

// AFTER:
const lineExists = Array.from(existingLines.values()).some(line => {
  const pA = line.getPointA()
  const pB = line.getPointB()
  return (pA.getId() === pointA && pB.getId() === pointB) ||
         (pA.getId() === pointB && pB.getId() === pointA)
})

// BEFORE:
Object.values(worldPoints).map(wp => (
  <option key={wp.id} value={wp.id}>{wp.name}</option>
))

// AFTER:
Array.from(worldPoints.values()).map(wp => (
  <option key={wp.getId()} value={wp.getId()}>{wp.getName()}</option>
))
```

---

### 6. LinesManager
**Location**: `frontend/src/components/LinesManager.tsx`

**Current props (assumed):**
```typescript
{
  lines: Record<string, LineDTO>
  worldPoints: Record<string, WorldPointDTO>
  onToggleVisibility: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (id: string) => void
}
```

**Required changes:**
```typescript
{
  lines: Map<string, Line>  // Not Record
  worldPoints: Map<string, WorldPoint>  // Not Record
  // ... rest unchanged
}
```

**Code patterns to update:**
```typescript
// BEFORE:
Object.entries(lines).map(([id, line]) => {
  const pointA = worldPoints[line.pointAId]
  const pointB = worldPoints[line.pointBId]
  return (
    <div key={id}>
      {line.name}: {pointA.name} → {pointB.name}
      <button onClick={() => onDelete(id)}>Delete</button>
    </div>
  )
})

// AFTER:
Array.from(lines.values()).map((line) => {
  const pointA = line.getPointA()
  const pointB = line.getPointB()
  return (
    <div key={line.getId()}>
      {line.getName()}: {pointA.getName()} → {pointB.getName()}
      <button onClick={() => onDelete(line.getId())}>Delete</button>
    </div>
  )
})

// BEFORE:
const line = lines[lineId]
const length = calculateDistance(
  worldPoints[line.pointAId].xyz,
  worldPoints[line.pointBId].xyz
)

// AFTER:
const line = lines.get(lineId)
if (!line) return
const length = calculateDistance(
  line.getPointA().getXyz(),
  line.getPointB().getXyz()
)
```

---

### 7. ImagePointsManager
**Location**: `frontend/src/components/ImagePointsManager.tsx`

**Current props (assumed):**
```typescript
{
  worldPoints: Record<string, WorldPointDTO>
  images: Record<string, ImageDTO>
  onDeleteImagePoint: (worldPointId: string, imageId: string) => void
}
```

**Required changes:**
```typescript
{
  worldPoints: Map<string, WorldPoint>  // Not Record
  images: Map<string, Viewpoint>  // Not Record
  // ... rest unchanged
}
```

**Code patterns to update:**
```typescript
// BEFORE:
Object.entries(worldPoints).map(([wpId, wp]) => {
  const imagePoints = Object.values(images).flatMap(img =>
    img.imagePoints
      .filter(ip => ip.worldPointId === wpId)
      .map(ip => ({ ...ip, imageName: img.name }))
  )
  return (
    <div key={wpId}>
      {wp.name} has {imagePoints.length} image points
    </div>
  )
})

// AFTER:
Array.from(worldPoints.values()).map((wp) => {
  const imagePoints = Array.from(images.values()).flatMap(viewpoint =>
    viewpoint.getImagePoints()
      .filter(ip => ip.worldPointId === wp.getId())
      .map(ip => ({ ...ip, imageName: viewpoint.getName() }))
  )
  return (
    <div key={wp.getId()}>
      {wp.getName()} has {imagePoints.length} image points
    </div>
  )
})

// BEFORE:
const image = images[imageId]
const pointCount = image.imagePoints.length

// AFTER:
const viewpoint = images.get(imageId)
const pointCount = viewpoint?.getImagePoints().length || 0
```

---

### 8. WorldPointEditor
**Location**: `frontend/src/components/WorldPointEditor.tsx`

**Current props (assumed):**
```typescript
{
  worldPoint: WorldPointDTO | null
  images: Record<string, ImageDTO>
  onUpdate: (updated: WorldPointDTO) => void
  onClose: () => void
}
```

**Required changes:**
```typescript
{
  worldPoint: WorldPoint | null  // Entity, not DTO
  images: Map<string, Viewpoint>  // Not Record
  onUpdate: (updated: WorldPoint) => void
  // ... rest unchanged
}
```

**Code patterns to update:**
```typescript
// BEFORE:
const [name, setName] = useState(worldPoint?.name || '')
const [xyz, setXyz] = useState(worldPoint?.xyz || [0, 0, 0])

// AFTER:
const [name, setName] = useState(worldPoint?.getName() || '')
const [xyz, setXyz] = useState(worldPoint?.getXyz() || [0, 0, 0])

// BEFORE:
const imagePointsForThisWP = Object.values(images).map(img => ({
  imageName: img.name,
  points: img.imagePoints.filter(ip => ip.worldPointId === worldPoint.id)
}))

// AFTER:
const imagePointsForThisWP = Array.from(images.values()).map(viewpoint => ({
  imageName: viewpoint.getName(),
  points: viewpoint.getImagePoints().filter(ip => ip.worldPointId === worldPoint?.getId())
}))

// BEFORE:
onUpdate({ ...worldPoint, name, xyz })

// AFTER:
// Need to call domain operations instead of passing modified DTO
// This should be handled via a callback that calls renameWorldPoint, etc.
```

---

## Common Migration Patterns

### Pattern 1: Iterating over collections

```typescript
// Record pattern (OLD):
Object.entries(record).map(([id, item]) => ...)
Object.values(record).map(item => ...)
Object.keys(record).map(id => ...)

// Map pattern (NEW):
Array.from(map.entries()).map(([id, item]) => ...)
Array.from(map.values()).map(item => ...)
Array.from(map.keys()).map(id => ...)

// OR using Map methods directly:
map.forEach((item, id) => ...)
```

### Pattern 2: Getting a single item

```typescript
// Record pattern (OLD):
const item = record[id]
if (record[id]) { ... }

// Map pattern (NEW):
const item = map.get(id)
if (map.has(id)) { ... }
```

### Pattern 3: Counting items

```typescript
// Record pattern (OLD):
const count = Object.keys(record).length
const count = Object.values(record).length

// Map pattern (NEW):
const count = map.size
```

### Pattern 4: Accessing entity properties

```typescript
// DTO pattern (OLD):
entity.id
entity.name
entity.xyz
entity.dataUrl
entity.imagePoints

// Entity pattern (NEW):
entity.getId()
entity.getName()
entity.getXyz()
entity.getDataUrl()
entity.getImagePoints()
```

### Pattern 5: Checking if collection is empty

```typescript
// Record pattern (OLD):
if (Object.keys(record).length === 0) { ... }

// Map pattern (NEW):
if (map.size === 0) { ... }
```

### Pattern 6: Filtering collections

```typescript
// Record pattern (OLD):
const filtered = Object.fromEntries(
  Object.entries(record).filter(([id, item]) => condition)
)

// Map pattern (NEW):
const filtered = new Map(
  Array.from(map.entries()).filter(([id, item]) => condition)
)

// OR if you just need an array:
const filteredArray = Array.from(map.values()).filter(item => condition)
```

### Pattern 7: Finding an item

```typescript
// Record pattern (OLD):
const found = Object.values(record).find(item => item.name === 'foo')

// Map pattern (NEW):
const found = Array.from(map.values()).find(item => item.getName() === 'foo')
```

---

## Migration Priority Order

### Phase 1 - Simple List Components (Start Here)
1. **WorldPointPanel** - Simple list, easy iteration update
2. **ImageNavigationToolbar** - Simple list, easy iteration update
3. **LinesManager** - Straightforward entity method calls

### Phase 2 - Intermediate Components
4. **CreationToolsManager** - More complex logic, but isolated
5. **ImagePointsManager** - Multi-collection operations

### Phase 3 - Complex Workspace Components
6. **ImageWorkspace** - Canvas rendering, more complex
7. **WorldWorkspace** - 3D rendering, most complex

### Phase 4 - Editors
8. **WorldPointEditor** - Needs careful handling of updates

---

## Testing Strategy

For each component:

1. **Update TypeScript types** - Remove `as any` casts from MainLayout
2. **Fix compilation errors** - Update Record → Map, property → method
3. **Test basic rendering** - Ensure component displays correctly
4. **Test interactions** - Ensure clicks, drags, edits work
5. **Test edge cases** - Empty collections, null values, etc.

---

## Notes on Entity Immutability

Entities are **immutable**. When updating:

**DON'T** try to modify entity properties:
```typescript
worldPoint.name = 'New Name'  // ❌ Won't work
```

**DO** use domain operations:
```typescript
renameWorldPoint(worldPoint.getId(), 'New Name')  // ✓ Correct
```

This means edit handlers may need to change from:
```typescript
onUpdate(modifiedEntity)  // Old DTO pattern
```

To:
```typescript
onRename(entity.getId(), newName)  // New entity pattern
```

---

## Current `as any` Casts in MainLayout (to be removed)

Once components are updated, remove these casts:

```typescript
// Line 885:
images={project?.viewpoints as any}
worldPoints={project?.worldPoints as any}

// Line 898:
image={currentImage as any}
worldPoints={project?.worldPoints as any}

// Line 912:
project={project as any}

// Line 926:
worldPoints={project?.worldPoints as any}

// Line 942:
existingLines={project?.lines as any}

// Line 955:
lines={project?.lines as any}

// Line 967:
worldPoints={project?.worldPoints as any}
images={project?.viewpoints as any}

// Line 1181:
worldPoint={project?.worldPoints.get(worldPointEditWindow.worldPointId) as any}
images={project?.viewpoints as any}
onUpdateWorldPoint={handleWorldPointUpdate as any}
```

Each cast can be removed once the corresponding component is updated to accept the correct types.

---

## Success Criteria

✅ All `as any` casts removed from MainLayout.tsx
✅ All UI components accept Map types
✅ All UI components use entity methods (`.getId()`, `.getName()`, etc.)
✅ TypeScript compiles with no errors
✅ All tests pass
✅ Application functions correctly
✅ No adapters, no conversions, pure entity usage throughout
