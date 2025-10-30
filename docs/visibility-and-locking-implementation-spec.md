# Visibility and Locking - Implementation Specification

## Overview

This spec defines the implementation of a unified visibility and locking system for entity types in Pictorigo. The system will control both rendering (visibility) and interactivity (locking) of entity types through a single UI panel.

## Core Requirements

1. **Visibility Control**: Toggle rendering of entity types (existing functionality)
2. **Locking Control**: Toggle interactivity of entity types (new functionality)
3. **Auto-Lock**: Hidden entities are automatically non-interactive
4. **Tool Context**: Tools can specify which entity types they interact with
5. **Remove Individual Entity Visibility**: Delete the per-entity `isVisible` property

## Implementation Tasks

### Task 1: Update Type System

**File**: `src/types/visibility.ts`

**Changes**:

1. Add `LockSettings` interface (mirrors `VisibilitySettings`)
2. Add `ViewSettings` interface (combines both)
3. Update defaults

```typescript
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
  // NOTE: vanishingPoints and perspectiveGrid are not selectable,
  // so they don't need lock settings
}

export interface ViewSettings {
  visibility: VisibilitySettings
  locking: LockSettings
}

export const DEFAULT_VISIBILITY: VisibilitySettings = {
  worldPoints: true,
  lines: true,
  planes: true,
  vanishingLines: true,
  vanishingPoints: true,
  perspectiveGrid: false
}

export const DEFAULT_LOCKING: LockSettings = {
  worldPoints: false,
  lines: false,
  planes: false,
  vanishingLines: false
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  visibility: DEFAULT_VISIBILITY,
  locking: DEFAULT_LOCKING
}
```

### Task 2: Add Tool Context Type

**File**: `src/types/tool-context.ts` (new file)

```typescript
import { VisibilitySettings } from './visibility'

export type ToolType = 'select' | 'line' | 'vanishingLine' | 'loop' | null

export interface ToolContext {
  activeTool: ToolType
  // Which entity types this tool can interact with
  // If null, all unlocked+visible entities are interactive (select mode)
  allowedEntityTypes: Set<keyof VisibilitySettings> | null
}

// Tool context definitions
export const SELECT_TOOL_CONTEXT: ToolContext = {
  activeTool: 'select',
  allowedEntityTypes: null // All entity types allowed
}

export const LINE_TOOL_CONTEXT: ToolContext = {
  activeTool: 'line',
  allowedEntityTypes: new Set(['worldPoints']) // Only world points
}

export const VANISHING_LINE_TOOL_CONTEXT: ToolContext = {
  activeTool: 'vanishingLine',
  allowedEntityTypes: new Set([]) // No existing entities, only creates new
}

export const LOOP_TOOL_CONTEXT: ToolContext = {
  activeTool: 'loop',
  allowedEntityTypes: new Set(['worldPoints', 'lines']) // Points and lines
}
```

### Task 3: Remove Entity-Level `isVisible` Property

**Files to modify**:
- `src/entities/line.ts`
- `src/entities/vanishing-line.ts`
- Any other entities with `isVisible` property

**Actions**:
1. Remove `isVisible` property from entity classes
2. Remove from constructors
3. Remove from DTOs/serialization
4. Search codebase for references to `.isVisible` on entities and remove/update
5. Update entity README if it documents this property

**Migration Note**: If entities currently have `isVisible` stored in project files, add migration code to ignore this field during deserialization.

### Task 4: Update MainLayout State Management

**File**: `src/components/MainLayout.tsx`

**Changes**:

1. Replace `visibility` state with combined `viewSettings` state:

```typescript
// BEFORE:
const [visibility, setVisibility] = useState<VisibilitySettings>(DEFAULT_VISIBILITY)

// AFTER:
const [viewSettings, setViewSettings] = useState<ViewSettings>(DEFAULT_VIEW_SETTINGS)
```

2. Add handlers for both visibility and locking:

```typescript
const handleVisibilityChange = useCallback((key: keyof VisibilitySettings, value: boolean) => {
  setViewSettings(prev => ({
    ...prev,
    visibility: {
      ...prev.visibility,
      [key]: value
    }
  }))
}, [])

const handleLockingChange = useCallback((key: keyof LockSettings, value: boolean) => {
  setViewSettings(prev => ({
    ...prev,
    locking: {
      ...prev.locking,
      [key]: value
    }
  }))
}, [])
```

3. Compute tool context based on active tools:

```typescript
const toolContext = useMemo((): ToolContext => {
  if (isVanishingLineActive) return VANISHING_LINE_TOOL_CONTEXT
  if (isLoopTraceActive) return LOOP_TOOL_CONTEXT
  if (isPointCreationActive) return LINE_TOOL_CONTEXT
  return SELECT_TOOL_CONTEXT
}, [isVanishingLineActive, isLoopTraceActive, isPointCreationActive])
```

4. Update props passed to child components:

```typescript
<VisibilityPanel
  viewSettings={viewSettings}
  onVisibilityChange={handleVisibilityChange}
  onLockingChange={handleLockingChange}
/>

<ImageViewer
  visibility={viewSettings.visibility}
  locking={viewSettings.locking}
  toolContext={toolContext}
  // ... other props
/>
```

### Task 5: Update VisibilityPanel UI

**File**: `src/components/VisibilityPanel.tsx`

**Changes**:

1. Update props interface:

```typescript
interface VisibilityPanelProps {
  viewSettings: ViewSettings
  onVisibilityChange: (key: keyof VisibilitySettings, value: boolean) => void
  onLockingChange: (key: keyof LockSettings, value: boolean) => void
}
```

2. Update option definitions to include which ones support locking:

```typescript
const visibilityOptions: Array<{
  key: keyof VisibilitySettings
  label: string
  supportsLocking: boolean // NEW
}> = [
  { key: 'worldPoints', label: 'World Points', supportsLocking: true },
  { key: 'lines', label: 'Lines', supportsLocking: true },
  { key: 'planes', label: 'Planes', supportsLocking: true },
  { key: 'vanishingLines', label: 'Vanishing Lines', supportsLocking: true },
  { key: 'vanishingPoints', label: 'Vanishing Points', supportsLocking: false },
  { key: 'perspectiveGrid', label: 'Perspective Grid', supportsLocking: false }
]
```

3. Update JSX to render both toggles:

```tsx
{visibilityOptions.map(option => {
  const isVisible = viewSettings.visibility[option.key]
  const isLocked = option.supportsLocking
    ? viewSettings.locking[option.key as keyof LockSettings]
    : false

  return (
    <div key={option.key} className="visibility-panel__option">
      <span className="visibility-panel__label">{option.label}</span>
      <div className="visibility-panel__controls">
        {/* Visibility toggle */}
        <button
          className={`visibility-panel__icon-toggle ${isVisible ? 'active' : ''}`}
          onClick={() => onVisibilityChange(option.key, !isVisible)}
          title={isVisible ? 'Hide' : 'Show'}
        >
          <FontAwesomeIcon icon={isVisible ? faEye : faEyeSlash} />
        </button>

        {/* Lock toggle (only for selectable types) */}
        {option.supportsLocking && (
          <button
            className={`visibility-panel__icon-toggle ${isLocked ? 'active' : ''} ${!isVisible ? 'disabled' : ''}`}
            onClick={() => !isVisible ? null : onLockingChange(option.key as keyof LockSettings, !isLocked)}
            disabled={!isVisible}
            title={!isVisible ? 'Auto-locked (hidden)' : isLocked ? 'Unlock' : 'Lock'}
          >
            <FontAwesomeIcon icon={isLocked || !isVisible ? faLock : faLockOpen} />
          </button>
        )}
      </div>
    </div>
  )
})}
```

4. Add CSS for icon toggles (approximate styles):

```css
.visibility-panel__option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
}

.visibility-panel__label {
  flex: 1;
}

.visibility-panel__controls {
  display: flex;
  gap: 8px;
}

.visibility-panel__icon-toggle {
  background: transparent;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  color: #666;
}

.visibility-panel__icon-toggle.active {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.visibility-panel__icon-toggle.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  color: #999;
}

.visibility-panel__icon-toggle:hover:not(.disabled) {
  background: #f0f0f0;
}

.visibility-panel__icon-toggle.active:hover:not(.disabled) {
  background: #0056b3;
}
```

### Task 6: Update ImageViewer Props and State

**File**: `src/components/ImageViewer.tsx`

**Changes**:

1. Add new props to interface:

```typescript
interface ImageViewerProps extends ImageViewerPropsBase {
  // ... existing props
  visibility?: VisibilitySettings // Already exists
  locking?: LockSettings // NEW
  toolContext?: ToolContext // NEW
}
```

2. Add defaults in destructuring:

```typescript
export const ImageViewer = forwardRef<ImageViewerRef, ImageViewerProps>(({
  // ... existing props
  visibility = DEFAULT_VISIBILITY,
  locking = DEFAULT_LOCKING, // NEW
  toolContext = SELECT_TOOL_CONTEXT, // NEW
}, ref) => {
```

3. Create helper function to check entity interactivity:

```typescript
// Helper: Check if an entity type is interactive
const isEntityTypeInteractive = useCallback((entityType: keyof VisibilitySettings): boolean => {
  // 1. Check tool context first - does this tool interact with this entity type?
  if (toolContext.allowedEntityTypes !== null) {
    if (!toolContext.allowedEntityTypes.has(entityType)) {
      return false // Tool doesn't interact with this type
    }
  }

  // 2. Must be visible
  if (!visibility[entityType]) {
    return false // Hidden entities are not interactive
  }

  // 3. Must not be locked (if lockable)
  const lockKey = entityType as keyof LockSettings
  if (lockKey in locking && locking[lockKey]) {
    return false // Locked entities are not interactive
  }

  return true
}, [toolContext, visibility, locking])
```

### Task 7: Update Click Detection Functions

**File**: `src/components/ImageViewer.tsx`

**Changes**:

Update each `findNearby*` function to check interactivity first:

```typescript
const findNearbyPoint = useCallback((canvasX: number, canvasY: number, threshold: number = 15) => {
  // Check if world points are interactive
  if (!isEntityTypeInteractive('worldPoints')) {
    return null
  }

  return Array.from(worldPoints.values()).find(wp => {
    // ... existing proximity detection logic
  })
}, [isEntityTypeInteractive, worldPoints, /* other deps */])

const findNearbyLine = useCallback((canvasX: number, canvasY: number, threshold: number = 10): LineEntity | null => {
  // Check if lines are interactive
  if (!isEntityTypeInteractive('lines')) {
    return null
  }

  for (const [lineId, lineEntity] of Array.from(lineEntities.entries())) {
    // REMOVE: if (!lineEntity.isVisible) continue
    // Entity-level visibility no longer exists

    // ... existing proximity detection logic
  }
  return null
}, [isEntityTypeInteractive, lineEntities, /* other deps */])

const findNearbyVanishingLinePart = useCallback((canvasX: number, canvasY: number, endpointThreshold: number = 15, lineThreshold: number = 10) => {
  // Check if vanishing lines are interactive
  if (!isEntityTypeInteractive('vanishingLines')) {
    return null
  }

  if (!image.vanishingLines) return null

  for (const vanishingLine of image.vanishingLines) {
    // REMOVE: if (!vanishingLine.isVisible) continue
    // Entity-level visibility no longer exists

    // ... existing proximity detection logic
  }
  return null
}, [isEntityTypeInteractive, image, /* other deps */])
```

### Task 8: Update Hover Detection

**File**: `src/components/ImageViewer.tsx`

**Changes**:

Update `handleMouseMove` to respect interactivity:

```typescript
const handleMouseMove = (event: React.MouseEvent) => {
  // ... existing coordinate calculation

  if (!isDragging && !isDraggingPoint && !isDraggingVanishingLine) {
    // Only detect hover for interactive entities
    const nearbyPoint = findNearbyPoint(x, y)
    const nearbyLine = findNearbyLine(x, y)
    const nearbyVanishingLine = findNearbyVanishingLine(x, y)

    setHoveredPoint(nearbyPoint || null)
    setHoveredLine(nearbyLine || null)
    setHoveredVanishingLine(nearbyVanishingLine || null)

    // Notify parent of hover changes
    if (onPointHover) {
      onPointHover(nearbyPoint || null)
    }
  }
}
```

Note: The `findNearby*` functions already handle interactivity checks, so this code doesn't need explicit checks.

### Task 9: Update Renderer to Respect Visibility

**File**: `src/components/image-viewer/useImageViewerRenderer.ts` (or wherever rendering happens)

**Changes**:

Ensure all rendering respects the global `visibility` settings, not entity-level `isVisible`:

```typescript
// Example for vanishing lines
if (visibility.vanishingLines && image.vanishingLines) {
  for (const vanishingLine of image.vanishingLines) {
    // REMOVE: if (!vanishingLine.isVisible) continue
    // Render the vanishing line
  }
}

// Example for lines
if (visibility.lines) {
  for (const [lineId, lineEntity] of lineEntities.entries()) {
    // REMOVE: if (!lineEntity.isVisible) continue
    // Render the line
  }
}
```

### Task 10: Search and Update All References

**Search patterns to find and update**:

1. `grep -r "\.isVisible" src/` - Find all entity visibility checks
2. `grep -r "isVisible:" src/` - Find property definitions
3. `grep -r "isVisible =" src/` - Find assignments

**For each reference**:
- If on a Line/VanishingLine entity: Remove the check, use global visibility instead
- If in DTO/serialization: Remove from serialization
- If in entity constructor: Remove parameter

### Task 11: Update Tests

**Files to create/update**:

1. `src/components/__tests__/ImageViewer.interactivity.test.tsx` (new file)

```typescript
import { render, fireEvent } from '@testing-library/react'
import { ImageViewer } from '../ImageViewer'
import { DEFAULT_VISIBILITY, DEFAULT_LOCKING } from '../../types/visibility'
import { LINE_TOOL_CONTEXT, SELECT_TOOL_CONTEXT } from '../../types/tool-context'

describe('ImageViewer - Entity Interactivity', () => {
  it('should not detect vanishing line when locked', () => {
    const mockOnVanishingLineClick = jest.fn()
    const locking = { ...DEFAULT_LOCKING, vanishingLines: true }

    // ... render with mocked vanishing line at known position
    // ... simulate click at that position
    // ... expect mockOnVanishingLineClick NOT to be called
  })

  it('should not detect vanishing line when hidden', () => {
    const mockOnVanishingLineClick = jest.fn()
    const visibility = { ...DEFAULT_VISIBILITY, vanishingLines: false }

    // ... similar test
  })

  it('should not detect vanishing line when line tool is active', () => {
    const mockOnVanishingLineClick = jest.fn()
    const mockOnCreatePoint = jest.fn()

    // ... render with LINE_TOOL_CONTEXT
    // ... simulate click on vanishing line position
    // ... expect vanishing line click NOT called, but point creation IS called
  })

  it('should detect vanishing line when visible, unlocked, and in select mode', () => {
    const mockOnVanishingLineClick = jest.fn()

    // ... render with SELECT_TOOL_CONTEXT, not locked, visible
    // ... simulate click on vanishing line
    // ... expect vanishing line click to be called
  })
})
```

2. Update existing tests that may reference entity `.isVisible` property

### Task 12: Update TypeScript Imports

**Search and update imports**:

```typescript
// BEFORE:
import { VisibilitySettings, DEFAULT_VISIBILITY } from '../types/visibility'

// AFTER (where needed):
import {
  VisibilitySettings,
  LockSettings,
  ViewSettings,
  DEFAULT_VISIBILITY,
  DEFAULT_LOCKING,
  DEFAULT_VIEW_SETTINGS
} from '../types/visibility'

// Also add where needed:
import { ToolContext, LINE_TOOL_CONTEXT, /* etc */ } from '../types/tool-context'
```

## Implementation Order

Recommended order to minimize breaking changes:

1. **Task 1**: Update type system
2. **Task 2**: Add tool context types
3. **Task 10**: Search for all `.isVisible` references (for awareness)
4. **Task 3**: Remove entity-level `isVisible` property
5. **Task 9**: Update renderer to use global visibility
6. **Task 6**: Update ImageViewer props
7. **Task 7**: Update click detection functions
8. **Task 8**: Update hover detection
9. **Task 4**: Update MainLayout state management
10. **Task 5**: Update VisibilityPanel UI
11. **Task 11**: Add tests
12. **Task 12**: Final cleanup of imports

## Testing Checklist

After implementation, verify:

- [ ] Hiding vanishing lines prevents them from being clicked
- [ ] Locking vanishing lines (while visible) prevents them from being clicked
- [ ] Unlocked+visible vanishing lines can be clicked in select mode
- [ ] Vanishing lines are not clickable when line tool is active
- [ ] World points ARE clickable when line tool is active
- [ ] Hidden entities show locked icon (grayed out)
- [ ] Lock toggle is disabled when entity type is hidden
- [ ] Hover effects respect locking/visibility
- [ ] Right-click context menu respects locking/visibility
- [ ] Drag operations respect locking/visibility
- [ ] Existing entity files load correctly (isVisible field ignored if present)
- [ ] No TypeScript errors
- [ ] All existing tests still pass

## Icons Required

Import from `@fortawesome/free-solid-svg-icons`:
- `faEye` - visible
- `faEyeSlash` - hidden
- `faLock` - locked
- `faLockOpen` - unlocked

Already imported in VisibilityPanel: `faEye`, so add:
```typescript
import { faEyeSlash, faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons'
```

## Edge Cases

1. **What if a tool context allows an entity type that is locked?**
   - Locking takes precedence. Entity is not interactive.

2. **What if an entity type is hidden but not locked in state?**
   - Hidden entities are treated as locked regardless of lock state.
   - UI should show lock icon as active (or disabled) when hidden.

3. **What about keyboard-selected entities?**
   - Selection system (`useSelection`) is separate from click detection.
   - Locked entities can potentially be selected via keyboard shortcuts (Ctrl+A).
   - Consider: Should `useSelection` also respect locking?
   - **Decision**: Add a check in `handleEntityClick` to reject locked entity types.

4. **What about entities already in selection when they become locked?**
   - Keep them in selection (locking doesn't clear selection).
   - But further interactions with them are prevented.

## Future Enhancements (Out of Scope)

1. Per-entity locking (in addition to type-level)
2. Keyboard shortcuts for locking/unlocking
3. "Solo" mode (lock all except one type)
4. Lock state persistence in project file
5. Undo/redo for visibility/locking changes

## Questions for Implementer

If anything is unclear during implementation:

1. Should hovering over a locked entity show any visual feedback?
   - Suggest: No hover effect, cursor remains default (not pointer)

2. Should locked entities show selection highlights if somehow selected?
   - Suggest: Yes, but they can't be interacted with (no drag, no property edits)

3. Should the VisibilityPanel itself be collapsible/expandable?
   - Already implemented (expand/collapse button exists)

4. Color scheme for lock icons?
   - Suggest: Match existing theme, use blue for active/locked

## Completion Criteria

Implementation is complete when:

1. All tasks above are completed
2. All items in testing checklist pass
3. No entity classes have `isVisible` property
4. VisibilityPanel shows both visibility and lock toggles
5. ImageViewer respects both visibility and locking in all interactions
6. Tool context properly filters entity interactions
7. Tests verify the core behaviors
8. No TypeScript compilation errors
9. No regression in existing functionality
