# FIX ALL REMAINING .get() VIOLATIONS - FINAL PUSH

**Current Count: 38 violations**
**Target: Only acceptable boundary/optimization lookups remain**

## VIOLATION CATEGORIES

### ✅ ACCEPTABLE - DO NOT FIX (20 violations)

These are legitimate uses and should NOT be changed:

1. **Entity Optimization Lookups (9):**
   - `entities/line/Line.ts` (2): `valueMap.points.get()` - optimization system
   - `entities/world-point/WorldPoint.ts` (1): `valueMap.points.get()` - optimization system
   - `entities/viewpoint/Viewpoint.ts` (2): `valueMap.cameras.get()` - optimization system
   - `entities/constraints/equal-angles-constraint.ts` (3): `pointMap.get()` - constraint optimization
   - `entities/constraints/equal-distances-constraint.ts` (2): `pointMap.get()` - constraint optimization

2. **Serialization/Boundary Lookups (3):**
   - `store/project-serialization.ts` (2): Converting DTOs to entities
   - `components/MainLayout.tsx:99`: `project.viewpoints.get(currentImageId)` - deriving currentImage from state

3. **WIP/Experimental Code (3):**
   - `wip/optimizer.ts` (3): Optimization parameter lookups

4. **EntityListPopup Adapters (4):**
   - `components/LinesManager.tsx` (4 lines): Adapter between EntityListPopup (ID-based) and entity-based APIs
     - These are unavoidable adapters for the EntityListPopup component which uses string IDs

**TOTAL ACCEPTABLE: 19 violations**

---

## 🔥 MUST FIX - 19 COMPONENT VIOLATIONS

### 1. ImageNavigationToolbar.tsx (3 violations)

**Problem:** `editingImageId` state is a string ID instead of Viewpoint entity

**Lines 138, 141:**
```typescript
{editingImageId && images.get(editingImageId) && (
  <ImageEditor
    viewpoint={images.get(editingImageId)!}
```

**Fix:**
```typescript
// Change state from:
const [editingImageId, setEditingImageId] = useState<string | null>(null)

// To:
const [editingImage, setEditingImage] = useState<Viewpoint | null>(null)

// Update all references:
- Replace `editingImageId` checks with `editingImage`
- Replace `setEditingImageId(id)` with `setEditingImage(viewpoint)`
- Replace `images.get(editingImageId)` with just `editingImage`

// Line 138-141 becomes:
{editingImage && (
  <ImageEditor
    viewpoint={editingImage}
```

**Line 474:**
```typescript
const wp = worldPoints.get(imagePoint.worldPointId)
```

**Fix:**
Change `ImagePoint` DTO to store `worldPoint: WorldPoint` entity reference instead of `worldPointId: string`.
If ImagePoint is from Viewpoint DTO, then fix at source where ImagePoint is created.

---

### 2. ImagePointsManager.tsx (3 violations)

**Line 34:**
```typescript
const worldPoint = worldPoints.get(imagePoint.worldPointId)
```

**Fix:** ImagePoint should reference WorldPoint entity directly, not by ID.

**Line 47:**
```typescript
const getImageName = (imageId: string) => images.get(imageId)?.getName() || imageId
```

**Fix:**
```typescript
// Change signature to accept entity:
const getImageName = (viewpoint: Viewpoint) => viewpoint.getName()

// Or if caller has ID, change caller to pass entity
```

**Line 88:**
```typescript
const viewpoint = images.get(imageId)
```

**Fix:** Change data flow to pass Viewpoint entity instead of imageId string.

---

### 3. CreationToolsManager.tsx (2 violations)

**Lines 381-382:**
```typescript
const pointA = worldPoints.get(pointIds[0])!
const pointB = worldPoints.get(pointIds[1])!
```

**Problem:** LoopTraceTool's `onCreateLine` callback passes `[string, string]` instead of entities.

**Fix:**
```typescript
// In LoopTraceTool, change onCreateLine signature from:
onCreateLine: (pointIds: [string, string], constraints?: any) => void

// To:
onCreateLine: (pointA: WorldPoint, pointB: WorldPoint, constraints?: any) => void

// Then in CreationToolsManager, remove the adapter:
<LoopTraceTool
  onCreateLine={(pointA, pointB, constraints) => {
    onCreateLine(pointA, pointB, constraints)
  }}
/>
```

---

### 4. LoopTraceTool.tsx (2 violations)

**Lines 97-98:**
```typescript
pointA: worldPoints.get(seg.pointA)!,
pointB: worldPoints.get(seg.pointB)!,
```

**Fix:**
```typescript
// Change segment storage from:
{ pointA: string, pointB: string }

// To:
{ pointA: WorldPoint, pointB: WorldPoint }

// Store entities directly in segments array:
const newSegment = {
  pointA: worldPoints.get(pointId)!, // Do lookup ONCE when creating segment
  pointB: lastPoint
}
```

---

### 5. LineCreationTool.tsx (2 violations)

**Lines 366-367:**
```typescript
const pointA = worldPoints.get(pointSlot1)
const pointB = worldPoints.get(pointSlot2)
```

**Fix:**
```typescript
// Change pointSlot1/pointSlot2 state from string to entity:
const [pointSlot1, setPointSlot1] = useState<WorldPoint | null>(null)
const [pointSlot2, setPointSlot2] = useState<WorldPoint | null>(null)

// Then directly use:
const pointA = pointSlot1
const pointB = pointSlot2
```

---

### 6. WorldPointPanel.tsx (2 violations)

**Line 82:**
```typescript
const viewpoint = viewpoints.get(imageId)
```

**Fix:** Change caller to pass Viewpoint entity instead of imageId.

**Line 127:**
```typescript
return pointIds.some((id: string) => !worldPoints.get(id))
```

**Fix:**
```typescript
// Change constraint to store WorldPoint[] instead of string[]
// Then:
return constraint.points.some(point => !point) // Check if any are null/undefined
```

---

### 7. WorldView.tsx (2 violations)

**Lines 305, 322:**
```typescript
const pointEntity = project.worldPoints.get(clickedPointId)
const lineEntity = project.lines.get(clickedLineId)
```

**Fix:**
```typescript
// Change state from IDs to entities:
const [clickedPoint, setClickedPoint] = useState<WorldPoint | null>(null)
const [clickedLine, setClickedLine] = useState<Line | null>(null)

// Update click handlers to store entities directly:
onClick={(point) => setClickedPoint(point)}
```

---

### 8. useImageViewerRenderer.ts (1 violation)

**Line 137:**
```typescript
const wp = worldPoints.get(pointId)
```

**Fix:** Change rendering code to iterate over `worldPoints.values()` instead of pointIds array.

---

## EXECUTION PLAN

### Phase 1: State Changes (editingImageId, pointSlots)
1. ImageNavigationToolbar: `editingImageId` → `editingImage` entity
2. LineCreationTool: `pointSlot1/2` string → WorldPoint entity
3. WorldView: `clickedPointId/clickedLineId` → entity state

### Phase 2: Callback Signatures
1. LoopTraceTool: Change `onCreateLine` to accept entities
2. CreationToolsManager: Remove adapter wrapper

### Phase 3: Data Structure Changes
1. LoopTraceTool: Store WorldPoint entities in segments array
2. ImagePoint DTO: Change to reference WorldPoint entity (if feasible)

### Phase 4: Rendering Changes
1. useImageViewerRenderer: Iterate over entities directly

---

## VERIFICATION

After all fixes:
```bash
cd /c/Dev/Pictorigo
bash check.sh

# Count remaining violations:
cd frontend/src
grep -rn "\.get(" --include="*.tsx" --include="*.ts" . | \
  grep -v "node_modules" | grep -v ".test." | grep -v "\.d\.ts" | \
  wc -l

# Should be ~20 (all acceptable boundary/optimization lookups)
```

---

## EXPECTED FINAL STATE

**Remaining .get() calls (all acceptable):**
- Entity optimization: 9
- Serialization boundaries: 3
- WIP optimizer: 3
- EntityListPopup adapters: 4
- MainLayout currentImage boundary: 1

**Total: ~20 acceptable violations**

**All component logic violations: 0** ✅
