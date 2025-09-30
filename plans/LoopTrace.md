# LoopTrace Tool - Implementation Plan

## Overview
LoopTrace is a streamlined line creation tool that allows users to string together multiple points (new or existing) and batch-create lines with a shared orientation. When activated, users click points to build a chain/loop, then click "Complete" to create all missing lines at once.

## Use Cases
1. **Side view wall tracing** - Click points along a wall perimeter with 'free' orientation to form a closed loop
2. **Floor plan creation** - Set 'horizontal' orientation and click points to create a horizontal plane layout
3. **Vertical features** - Set 'vertical' orientation for columns, edges, etc.
4. **Mixed geometry** - Reuse existing lines (keep their orientation) while adding new ones

## Core Behavior

### Point Selection
- **Click empty space**: Creates new world point at that location, adds to chain
- **Click existing world point**: Adds existing point to chain
- **Point reuse**: Same point can be selected multiple times in chain (useful for branching)
- **Visual feedback**: Show accumulated chain with dashed preview lines

### Line Creation Logic
- When "Complete" is clicked:
  - Check each consecutive pair of points in chain
  - If line already exists between points: **Skip** (keep existing line unchanged)
  - If line doesn't exist: **Create** with selected orientation
- Lines inherit: name pattern (auto-generated), color, orientation constraint

### Cancel Behavior
- Clears the point chain
- **Keeps** any newly created world points (they become orphaned but available)
- Closes the tool

## UI Components

### FloatingWindow Layout
```
┌─────────────────────────────────┐
│ LoopTrace                    [X]│
├─────────────────────────────────┤
│ Orientation:                    │
│ [Free] [Horiz] [Vert] [X] [Z]  │
│                                 │
│ ☐ Coplanar (disabled)          │
│                                 │
│ Chain: (5 points)              │
│ • WP_001 → WP_002 → WP_003 ... │
│                                 │
│ Lines to create: 3 new, 2 exist│
│                                 │
│      [Complete]  [Cancel]      │
└─────────────────────────────────┘
```

### Orientation Controls
- Button group with same styling as LineCreationTool
- Options: `free | horizontal | vertical | x-aligned | z-aligned`
- Default: `free`
- Stays persistent during tool session

### Coplanar Checkbox
- **Disabled** initially (future feature)
- Tooltip: "Create coplanar constraint for all points (coming soon)"
- When enabled in future: creates single coplanar constraint containing all points in chain

### Chain Display
- Shows abbreviated list of points in chain
- Format: `WP_001 → WP_002 → WP_003`
- Truncate long chains: `WP_001 → ... → WP_020 (20 points)`

### Status Summary
- Real-time count of:
  - Total points in chain
  - New lines to create
  - Existing lines to skip

### Visual Feedback During Creation
- **Preview lines**: Dashed lines showing the chain being built
- **Color coding**:
  - Green dashed: Will create new line
  - Gray dashed: Line already exists (will skip)
  - Blue: Currently building segment (cursor to last point)
- **Point highlighting**: Last added point highlighted in accent color

## Tool Activation

### Integration with CreationToolsManager
- Add new tool type: `'loop'` to `ToolType` union
- Add LoopTrace button to toolbar:
  - Icon: 🔗 or custom loop icon
  - Label: "Loop"
  - Shortcut: `O` (for Loop)
- Button state:
  - Always enabled (no selection requirements)
  - Active state when tool is selected

### FloatingWindow Setup
- Storage key: `"loop-trace-tool"`
- Default position: Center-right
- Size: 400px width, ~500px min height
- OK button text: "Complete"
- Cancel button text: "Cancel"

## Implementation Files

### New Files to Create
1. `frontend/src/components/tools/LoopTraceTool.tsx`
   - Main tool component
   - Manages point chain state
   - Handles orientation selection
   - Renders UI controls and chain display

2. `frontend/src/hooks/useLoopTrace.ts`
   - Custom hook for tool logic
   - Point chain management
   - Line existence checking
   - Batch line creation

### Files to Modify
1. `frontend/src/components/tools/CreationToolsManager.tsx`
   - Add `'loop'` to `ToolType`
   - Add LoopTrace button to toolbar
   - Add FloatingWindow for LoopTrace
   - Wire up tool activation/deactivation

2. `frontend/src/components/ImageViewer.tsx`
   - Handle point clicks when LoopTrace is active
   - Dispatch custom events for point selection
   - Show construction preview for chain

3. `frontend/src/components/WorldView.tsx`
   - Handle point clicks in 3D view when LoopTrace is active
   - Show construction preview overlay

4. `frontend/src/styles/tools.css`
   - Add styles for chain display
   - Add styles for coplanar checkbox (disabled state)

## State Management

### LoopTraceTool Component State
```typescript
interface LoopTraceState {
  pointChain: string[]              // Array of point IDs in order
  orientation: LineDirection        // Selected orientation
  coplanarEnabled: boolean          // Checkbox state (always false initially)
  isActive: boolean                 // Tool active state
}
```

### Derived State (computed)
- `linesToCreate`: Pairs of consecutive points where line doesn't exist
- `existingLines`: Pairs of consecutive points where line already exists
- `newPointsCount`: Count of newly created points (for undo tracking)

## Event Handling

### Custom Events
```typescript
// Dispatched from ImageViewer/WorldView when user clicks point
interface LoopTracePointClickEvent {
  pointId: string
  isNewPoint: boolean  // true if just created
}

// Dispatched when tool completes
interface LoopTraceCompleteEvent {
  createdLines: string[]
  skippedLines: string[]
}
```

### Keyboard Shortcuts
- `O`: Activate LoopTrace tool (from select mode)
- `O`: Deactivate tool (when already active)
- `Esc`: Cancel and close tool
- `Enter`: Complete (create lines)
- `Backspace`: Remove last point from chain

## Construction Preview

### Preview Rendering (ImageViewer)
```typescript
interface LoopTracePreview {
  type: 'loop-chain'
  segments: Array<{
    pointA: string
    pointB: string
    status: 'new' | 'exists' | 'building'  // building = cursor segment
  }>
}
```

### Preview Styling
- New segments: `stroke: #5cb85c` (green), `strokeDasharray: "8,4"`
- Existing segments: `stroke: #666` (gray), `strokeDasharray: "4,2"`
- Building segment: `stroke: #0696d7` (blue), `strokeDasharray: "8,4"`

## Line Creation Logic

### Batch Creation Algorithm
```typescript
function createLoopLines(
  pointChain: string[],
  orientation: LineDirection,
  existingLines: Record<string, LineDto>,
  onCreateLine: (pointIds: [string, string], constraints: LineConstraints) => void
) {
  const created: string[] = []
  const skipped: string[] = []

  for (let i = 0; i < pointChain.length - 1; i++) {
    const pointA = pointChain[i]
    const pointB = pointChain[i + 1]

    // Check if line exists (bidirectional)
    const existingLine = Object.values(existingLines).find(line =>
      (line.pointA === pointA && line.pointB === pointB) ||
      (line.pointA === pointB && line.pointB === pointA)
    )

    if (existingLine) {
      skipped.push(existingLine.id)
      continue
    }

    // Create new line
    const constraints: LineConstraints = {
      name: `Loop_${i + 1}`,  // Auto-generated name
      color: '#0696d7',       // Default blue
      isVisible: true,
      isConstruction: false,
      constraints: {
        direction: orientation,
        tolerance: 0.001
      }
    }

    onCreateLine([pointA, pointB], constraints)
    created.push(`${pointA}-${pointB}`)
  }

  return { created, skipped }
}
```

## Auto-Closure Detection

### Optional Feature (Phase 2)
- Detect when user clicks back to first point in chain
- Offer to "close loop" by creating final segment
- Visual indicator: highlight first point when hovering with 3+ points in chain

## Future Enhancements

### Coplanar Constraint (Phase 2)
When enabled:
1. Create all lines as normal
2. Create single `coplanar-points` constraint
3. Constraint entities: all unique points in chain
4. Add constraint to project constraints

### Smart Orientation Suggestions (Phase 3)
- Analyze existing points in chain
- Suggest orientation based on point distribution
- "Detected vertical alignment - switch to vertical?"

### Branch Support (Phase 3)
- Allow creating branches from existing chain points
- Hold Shift to start new branch from selected point
- Creates tree structure instead of linear chain

## Testing Scenarios

### Scenario 1: Simple Floor Plan Loop
1. Activate LoopTrace, set horizontal
2. Click 4 empty locations forming rectangle
3. Click first point again (auto-close)
4. Complete - creates 4 horizontal lines

### Scenario 2: Mixed Existing/New
1. Start with 2 existing points connected by line
2. Activate LoopTrace, set free
3. Click existing point A → existing point B (line exists, will skip)
4. Click new location C → new location D
5. Complete - creates 2 new lines, skips 1 existing

### Scenario 3: Wall Tracing on Image
1. Load side view image of building
2. Activate LoopTrace, set free
3. Click along wall perimeter (8-10 points)
4. Click first point to close loop
5. Complete - creates closed polygon

### Scenario 4: Cancel with New Points
1. Activate LoopTrace
2. Click 3 empty locations (creates 3 new WPs)
3. Cancel tool
4. Verify: 3 orphaned WPs remain, no lines created

## Dependencies
- Existing `LineDirection` type
- Existing `LineConstraints` interface
- Existing `onCreateLine` handler
- Existing construction preview system
- FloatingWindow component
- Custom event system for point clicks

## Implementation Order
1. Create `LoopTraceTool.tsx` with basic UI structure
2. Add tool button to `CreationToolsManager`
3. Implement point chain state management
4. Add click handlers to ImageViewer/WorldView
5. Implement construction preview rendering
6. Implement batch line creation logic
7. Add keyboard shortcuts
8. Add disabled coplanar checkbox
9. Polish styling and visual feedback
10. Test all scenarios

## Success Criteria
- ✓ Tool activates/deactivates cleanly
- ✓ Point chain builds correctly (new + existing)
- ✓ Preview shows green (new) vs gray (existing) segments
- ✓ Complete creates only missing lines
- ✓ Cancel preserves created points
- ✓ Orientation applies to all new lines
- ✓ No duplicate lines created
- ✓ Coplanar checkbox present but disabled