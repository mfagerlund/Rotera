# Visibility and Locking Design

# Current Architecture Analysis

### State Management
- **Location**: `MainLayout.tsx` uses `useState` to manage `VisibilitySettings`
- **Type**: `src/types/visibility.ts` - simple boolean flags for each entity type
- **UI**: `VisibilityPanel.tsx` - pure component with checkboxes
- **Flow**: User toggles → callback → MainLayout state → ImageViewer props → render filtering

### Selection System
- **Centralized**: `useSelection()` hook in `src/hooks/useSelection.ts`
- **Interface**: `ISelectable` - unified interface for all selectable entities
- **Click Handling**: `handleEntityClick(entity, ctrlKey, shiftKey)`
- **Architecture**: Object-based (not ID-based), uses `Set<ISelectable>`

### Click Detection in ImageViewer
- **Functions**: `findNearbyPoint()`, `findNearbyLine()`, `findNearbyVanishingLine()`
- **Priority Order**: Points → Lines → Vanishing Lines → Empty space
- **Thresholds**: Points (15px), Lines (10px), Vanishing Lines (10px)
- **Current Issue**: Checks entity's `isVisible` property, NOT global visibility settings

## Current Problems

### Problem 1: Hidden Entities Still Respond to Clicks
**Current Behavior:**
```typescript
// In findNearbyLine (line 429)
if (!lineEntity.isVisible) continue

// This checks the entity's own isVisible flag
// NOT the global visibility.lines setting from VisibilityPanel
```

**Issue**: When you hide vanishing lines via VisibilityPanel, they're still detected by clicks because:
1. The `findNearbyVanishingLine()` function checks `vanishingLine.isVisible` (entity property)
2. But VisibilityPanel controls `visibility.vanishingLines` (global setting)
3. These are two different things!

**Impact**: Hidden entities block tool operations (e.g., line tool can't create points because vanishing lines intercept clicks)

### Problem 2: No Locking Mechanism
Currently there's no way to make entities non-selectable while keeping them visible.

### Problem 3: Tool-Specific Filtering
When using tools like the line tool, even visible+unlocked vanishing lines shouldn't interfere with point creation.

## Proposed Solution

### 1. Enhanced Visibility & Locking Settings

**Extend the type:**
```typescript
// src/types/visibility.ts
export interface VisibilitySettings {
  worldPoints: boolean
  lines: boolean
  planes: boolean
  vanishingLines: boolean
  vanishingPoints: boolean
  perspectiveGrid: boolean
}

export interface LockSettings {
  worldPoints: boolean
  lines: boolean
  planes: boolean
  vanishingLines: boolean
  vanishingPoints: boolean
  perspectiveGrid: boolean
}

// Combined settings (what MainLayout manages)
export interface ViewSettings {
  visibility: VisibilitySettings
  locking: LockSettings
}
```

**Default behavior:**
```typescript
export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  visibility: { /* all true except perspectiveGrid */ },
  locking: { /* all false */ }
}
```

### 2. UI Enhancement - VisibilityPanel

**Add lock toggles next to visibility checkboxes:**
```
☑ World Points      [🔓]
☑ Lines             [🔓]
☑ Planes            [🔓]
☑ Vanishing Lines   [🔒]  ← Locked
☐ Vanishing Points  [🔒]  ← Hidden AND auto-locked
☑ Perspective Grid  [🔓]
```

**Behavior:**
- Visibility checkbox controls rendering
- Lock icon controls interactivity
- **When hidden → automatically locked** (grayed out lock icon)
- When visible → lock can be toggled independently

### 3. Click Detection Changes

**Update `findNearby*` functions to respect locking:**

```typescript
// NEW: Helper to check if entity type is interactive
const isEntityTypeInteractive = useCallback((entityType: keyof VisibilitySettings) => {
  // Must be visible AND unlocked
  return visibility[entityType] && !locking[entityType]
}, [visibility, locking])

// UPDATED: findNearbyVanishingLine
const findNearbyVanishingLine = useCallback((canvasX: number, canvasY: number, threshold: number = 10): VanishingLine | null => {
  // Check global visibility AND locking
  if (!isEntityTypeInteractive('vanishingLines')) return null

  // ... rest of proximity detection
}, [isEntityTypeInteractive, ...otherDeps])
```

**Apply to all findNearby functions:**
- `findNearbyPoint()` - check `isEntityTypeInteractive('worldPoints')`
- `findNearbyLine()` - check `isEntityTypeInteractive('lines')`
- `findNearbyVanishingLine()` - check `isEntityTypeInteractive('vanishingLines')`

### 4. Tool-Specific Filtering

**Add tool context to ImageViewer:**
```typescript
interface ToolContext {
  activeTool: 'select' | 'line' | 'vanishingLine' | 'loop' | null
  allowedEntityTypes: Set<keyof VisibilitySettings>
}

// When line tool is active
const toolContext: ToolContext = {
  activeTool: 'line',
  allowedEntityTypes: new Set(['worldPoints']) // Only points, ignore everything else
}
```

**Update click detection:**
```typescript
const findNearbyVanishingLine = useCallback((...) => {
  // 1. Check tool context first
  if (toolContext.activeTool && !toolContext.allowedEntityTypes.has('vanishingLines')) {
    return null // Tool doesn't interact with vanishing lines
  }

  // 2. Check visibility and locking
  if (!isEntityTypeInteractive('vanishingLines')) return null

  // 3. Proximity detection
  // ...
}, [toolContext, isEntityTypeInteractive, ...])
```

### 5. Hover Behavior

**Update hover detection similarly:**
```typescript
const handleMouseMove = (event: React.MouseEvent) => {
  // Only detect hover for interactive entities
  const nearbyPoint = isEntityTypeInteractive('worldPoints')
    ? findNearbyPoint(x, y)
    : null
  const nearbyLine = isEntityTypeInteractive('lines')
    ? findNearbyLine(x, y)
    : null
  const nearbyVanishingLine = isEntityTypeInteractive('vanishingLines')
    ? findNearbyVanishingLine(x, y)
    : null

  setHoveredPoint(nearbyPoint)
  setHoveredLine(nearbyLine)
  setHoveredVanishingLine(nearbyVanishingLine)
}
```

## Testing Strategy

### Is the Code Testable?

**YES!** The architecture is well-suited for testing:

1. **Centralized Selection Logic**: `useSelection` hook is pure and testable
2. **Clear Entity Interfaces**: `ISelectable` provides type-safe testing
3. **Proximity Functions**: `findNearby*` functions can be unit tested
4. **Callback-based**: Easy to mock callbacks and verify behavior

### Proposed Tests

**Test 1: Vanishing lines not selectable when locked**
```typescript
// src/components/__tests__/ImageViewer.interactivity.test.tsx
describe('ImageViewer - Entity Locking', () => {
  it('should not select vanishing line when locked', () => {
    const mockOnVanishingLineClick = jest.fn()
    const locking = { ...DEFAULT_LOCKING, vanishingLines: true }

    render(
      <ImageViewer
        locking={locking}
        onVanishingLineClick={mockOnVanishingLineClick}
        // ... other props
      />
    )

    // Click on vanishing line position
    fireEvent.mouseDown(canvas, { clientX: vpLineX, clientY: vpLineY })

    // Should NOT call the callback
    expect(mockOnVanishingLineClick).not.toHaveBeenCalled()
  })
})
```

**Test 2: Vanishing lines not selectable when using line tool**
```typescript
it('should not select vanishing line when line tool is active', () => {
  const mockOnVanishingLineClick = jest.fn()
  const mockOnCreatePoint = jest.fn()

  render(
    <ImageViewer
      locking={DEFAULT_LOCKING} // Not locked
      toolContext={{ activeTool: 'line', allowedEntityTypes: new Set(['worldPoints']) }}
      onVanishingLineClick={mockOnVanishingLineClick}
      onCreatePoint={mockOnCreatePoint}
      // ... other props
    />
  )

  // Click on position with vanishing line AND empty space
  fireEvent.mouseDown(canvas, { clientX: vpLineX, clientY: vpLineY })

  // Should call point creation, NOT vanishing line click
  expect(mockOnVanishingLineClick).not.toHaveBeenCalled()
  expect(mockOnCreatePoint).toHaveBeenCalled()
})
```

**Test 3: Hidden entities are automatically locked**
```typescript
it('should not interact with hidden entities', () => {
  const mockOnVanishingLineClick = jest.fn()
  const visibility = { ...DEFAULT_VISIBILITY, vanishingLines: false }

  render(
    <ImageViewer
      visibility={visibility}
      onVanishingLineClick={mockOnVanishingLineClick}
      // ... other props
    />
  )

  fireEvent.mouseDown(canvas, { clientX: vpLineX, clientY: vpLineY })
  expect(mockOnVanishingLineClick).not.toHaveBeenCalled()
})
```

**Test 4: useSelection hook behavior**
```typescript
// src/hooks/__tests__/useSelection.test.ts
describe('useSelection with locking', () => {
  it('should not add locked entities to selection', () => {
    const { result } = renderHook(() => useSelection())

    const vanishingLine = new VanishingLine(...)
    const locking = { vanishingLines: true }

    act(() => {
      result.current.handleEntityClick(vanishingLine, false, false)
    })

    // Selection should remain empty
    expect(result.current.selection.count).toBe(0)
  })
})
```

## Implementation Plan

### Phase 1: Type System
1. Extend `visibility.ts` with `LockSettings` and `ViewSettings`
2. Update `DEFAULT_VISIBILITY` → `DEFAULT_VIEW_SETTINGS`
3. Update all type imports

### Phase 2: State Management
1. Update `MainLayout` to manage both visibility AND locking
2. Pass both to `VisibilityPanel` and `ImageViewer`
3. Update prop types

### Phase 3: UI Enhancement
1. Update `VisibilityPanel` to show lock toggles
2. Implement auto-lock when hidden
3. Style lock icons (locked/unlocked/disabled)

### Phase 4: Click Detection
1. Add `isEntityTypeInteractive()` helper
2. Update all `findNearby*` functions
3. Update hover detection
4. Update drag detection

### Phase 5: Tool Context (Optional - can be separate PR)
1. Add `ToolContext` interface
2. Update `ImageViewer` to accept tool context
3. Update click detection to respect tool context
4. Wire up from `MainLayout` based on active tool

### Phase 6: Testing
1. Write unit tests for proximity functions
2. Write integration tests for click behavior
3. Write tests for tool-specific filtering
4. Manual testing of UI interactions

## Open Questions for Discussion

### 1. Lock Icon Behavior
**Option A**: Single toggle (click to lock/unlock)
**Option B**: Separate checkbox (like visibility)
**Recommendation**: Option A (icon toggle) - cleaner UI, less space

I want to show the visible/locked in the same ui. Two icon toggles, one for visible and one for locked, use eye and lock icons.

### 2. Keyboard Shortcuts
Should there be keyboard shortcuts for locking/unlocking?
- `Ctrl+L` to toggle lock on selected entities?
- Number keys to toggle entity type visibility/locking?

no

### 3. Lock Granularity
Should we support locking individual entities, or only type-level locking?
**Current proposal**: Type-level only (simpler, matches visibility)
**Future**: Could add per-entity locking if needed

no

### 4. Non-Selectable Entity Types
Vanishing points and grids aren't currently selectable anyway. Should they:
- **Option A**: Have visible lock toggle (grayed out, always locked)
- **Option B**: Not show lock toggle at all
**Recommendation**: Option B (cleaner UI, less confusion)

b

### 5. Tool Context Implementation
Should tool context be:
- **Option A**: Passed explicitly as prop from MainLayout
- **Option B**: Derived from state (like `isVanishingLineActive`)
**Recommendation**: Option A (explicit, testable, clear dependencies)

a

### 6. Backward Compatibility
Current entity `isVisible` property - what to do with it?
- Keep it for individual entity control?
- Deprecate it in favor of global visibility?
**Recommendation**: Keep both. Global visibility is UI preference, entity visibility is data state.

remove it. we have no way to show it again. not sure why this was added.

## Benefits of This Design

1. **Centralized Control**: Single source of truth for interactivity
2. **Testable**: Clear separation of concerns, easy to mock
3. **Consistent**: Same pattern for all entity types
4. **Extensible**: Easy to add new entity types or behaviors
5. **User-Friendly**: Clear visual feedback, intuitive controls
6. **Performance**: Early bailout in click detection (no expensive proximity checks for locked entities)

## Summary

This design provides:
- ✅ Lock entities to prevent selection/clicking/hovering
- ✅ Auto-lock when hidden (solves the "hidden but still clickable" bug)
- ✅ Tool-specific filtering (line tool ignores vanishing lines)
- ✅ Testable architecture (central state management)
- ✅ Clean UI (integrated into existing VisibilityPanel)
- ✅ Minimal changes to entity layer (global UI concern, not entity concern)
