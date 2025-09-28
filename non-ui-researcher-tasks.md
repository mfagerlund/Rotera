# Non-UI Researcher Developer Action Plan

## Overview
This document provides a comprehensive action plan for implementing user requirements based on the analysis of the current Pictorigo codebase. Each task is actionable and appropriate for developer implementation.

## Current Codebase Analysis

### Key Components Identified:
- **MainLayout.tsx**: Primary UI layout with workspace management (Image/World/Split views)
- **FusionLineCreationTool.tsx**: Existing floating window implementation that can be used as a reusable component foundation
- **ImageViewer.tsx**: Image display component that needs to be made resizable
- **WorldView.tsx**: 3D world point visualization
- **Project Storage**: localStorage-based persistence system (`utils/storage.ts`)
- **TypeScript Build**: Currently configured with `strict: true` but has 71 `any` type usages across 30 files

---

## Task Breakdown

### 1. Image ViewTab UI Improvements
**File**: `frontend/src/components/MainLayout.tsx` (lines 392-438)

**Requirements**:
- Remove text from tab switching
- Make selected tab more visually distinct

**Action Items**:
1. Locate the WorkspaceSwitcher component in `components/WorkspaceManager.tsx`
2. Modify tab rendering to use icons only (remove text labels)
3. Enhance visual distinction for active tab:
   - Increase border thickness/color contrast
   - Add background color difference
   - Add subtle animation/transition effects
4. Update CSS in `styles/enhanced-workspace.css` to support new visual states

**Testing**: Verify tab switching works and active state is clearly visible

---

### 2. Resizable Image Sidebar with Size Persistence
**File**: `frontend/src/components/ImageViewer.tsx`

**Requirements**:
- Make image sidebar resizable
- Store and restore last used size
- Resize images when user resizes sidebar

**Action Items**:
1. Install or implement a resize handle component
2. Add resize functionality to image sidebar container
3. Create storage mechanism for sidebar width:
   - Add `imageSidebarWidth` to localStorage via `utils/storage.ts`
   - Modify `ProjectStorage.loadSettings()` to include sidebar width
4. Implement image scaling based on sidebar width:
   - Update image container CSS to be responsive to parent width
   - Ensure world point overlays scale proportionally
5. Add minimum/maximum width constraints (e.g., 200px min, 800px max)

**Testing**: Verify sidebar resizes smoothly, size persists after refresh, images scale correctly

---

### 3. Delete All Selected Items Feature
**File**: `frontend/src/hooks/useSelection.ts` and `frontend/src/components/MainLayout.tsx`

**Requirements**:
- Add ability to delete all currently selected items (points, lines, planes)

**Action Items**:
1. Extend `useSelection` hook with `deleteSelectedItems()` function
2. Implement batch deletion logic:
   - Delete selected world points (and their associated image points)
   - Delete selected lines
   - Delete selected planes
   - Update constraints that reference deleted entities
3. Add keyboard shortcut (Delete key) handling in MainLayout
4. Add "Delete Selected" button to appropriate UI section
5. Add confirmation dialog for batch deletions
6. Ensure proper cleanup of orphaned data

**Testing**: Verify all selected items are deleted correctly, constraints are cleaned up, undo/redo works if applicable

---

### 4. TypeScript Strict Mode Compliance
**Files**: Multiple files with `any` usage (71 occurrences across 30 files)

**Requirements**:
- Fix all usage of `any` type
- Ensure all tests are included in build
- Maintain strict TypeScript configuration

**Action Items**:
1. Audit all `any` usages identified in the grep results:
   - `frontend/src/types/project.ts`: 2 occurrences
   - `frontend/src/hooks/useEntityManager.ts`: 1 occurrence
   - `frontend/src/components/tools/CreationToolsManager.tsx`: 2 occurrences
   - And 27 other files
2. Replace `any` with proper type definitions:
   - Create specific interfaces where missing
   - Use generic types for reusable components
   - Add proper type guards for dynamic data
3. Check `tsconfig.json` test inclusion:
   - Ensure test files are not excluded from compilation
   - Verify `include` patterns cover test directories
4. Fix type errors that emerge from strict typing

**Testing**: Verify TypeScript compilation passes with no errors, all tests still run and pass

---

### 5. Data Persistence Investigation and Fix
**File**: `frontend/src/utils/storage.ts`

**Requirements**:
- Investigate why server restart wipes data
- Determine if localStorage is working correctly
- Implement save/load functionality if needed

**Action Items**:
1. Investigate current storage behavior:
   - Check if `ProjectStorage.save()` is being called on data changes
   - Verify localStorage data survives browser refresh
   - Identify when and why data gets cleared
2. Add auto-save functionality:
   - Implement debounced auto-save on project changes
   - Add manual save/load controls in UI
3. Add storage debugging:
   - Log storage operations to console
   - Add storage size monitoring
   - Implement storage error handling
4. Consider data migration strategy for future schema changes

**Testing**: Verify data persists across browser refresh, server restart doesn't affect client-side data

---

### 6. Midpoint Constraint Implementation
**Files**: `frontend/src/types/geometry.ts`, `frontend/src/hooks/useConstraints.ts`

**Requirements**:
- Add midpoint constraint that creates a point at the middle of a line
- Allow two lines to share a center point

**Action Items**:
1. Define midpoint constraint type in `types/geometry.ts`:
   ```typescript
   type MidpointConstraint = {
     type: 'midpoint'
     line: string
     resultPoint?: string
   }
   ```
2. Implement constraint logic in `useConstraints.ts`:
   - Calculate midpoint coordinates from line endpoints
   - Create world point at calculated position
   - Handle constraint satisfaction/violation
3. Add UI for midpoint constraint creation:
   - Add button to constraint toolbar when line is selected
   - Handle constraint parameter collection
4. Implement shared center constraint variant:
   - Allow multiple lines to reference same midpoint
   - Update constraint when any line changes

**Testing**: Verify midpoint is calculated correctly, constraint updates when line moves, UI shows constraint status

---

### 7. World Point List Hover Data Cleanup
**File**: `frontend/src/components/WorldPointPanel.tsx`

**Requirements**:
- Remove extra hover data that shifts layout
- Create movable details window similar to FusionLineCreationTool
- Extract reusable popup component
- Include name editing and line associations in details window

**Action Items**:
1. Extract reusable floating window component from FusionLineCreationTool:
   - Create `components/common/FloatingWindow.tsx`
   - Include drag functionality, close button, positioning
   - Make size and content configurable
2. Modify WorldPointPanel hover behavior:
   - Remove verbose hover tooltip
   - Show minimal identifier on hover
3. Create WorldPointDetailsWindow component:
   - Use new FloatingWindow base
   - Include point name editing
   - List all lines that include the point
   - Add delete/edit actions
4. Integrate details window with WorldPointPanel:
   - Open on point double-click or context menu
   - Position near clicked point
   - Handle multiple open windows

**Testing**: Verify hover no longer shifts layout, details window functions correctly, reusable component works in other contexts

---

### 8. Right Panel Restructuring
**Files**: `frontend/src/components/MainLayout.tsx` (lines 650-690), various property panels

**Requirements**:
- Remove obsolete "Properties Select points..." text
- Show/edit world points, image points, lines, planes, circles
- Move constraints list to separate popup
- World points remain at main level, others in dedicated popups
- All popups inherit from FloatingWindow base

**Action Items**:
1. Remove obsolete property text from MainLayout
2. Create dedicated popup components:
   - `ImagePointsWindow.tsx`: List/edit image points
   - `LinesWindow.tsx`: List/edit lines with delete options
   - `PlanesWindow.tsx`: List/edit planes
   - `CirclesWindow.tsx`: List/edit circles (for future)
   - `ConstraintsWindow.tsx`: Move constraints list here
3. Add launcher buttons to right panel for each popup type
4. Implement consistent list/edit/delete pattern across all popups
5. Ensure all popups use FloatingWindow base component
6. Update MainLayout to integrate new popup system

**Testing**: Verify each popup opens correctly, CRUD operations work, popups don't interfere with each other

---

### 9. Obsolete Constraint Toolbar Removal
**Files**: `frontend/src/components/ConstraintToolbar.tsx`, related UI classes

**Requirements**:
- Remove distance, horizontal, vertical constraint buttons
- Remove associated UI and backend classes
- These are now handled as line properties

**Action Items**:
1. Identify all references to obsolete constraint types:
   - Search for "distance", "horizontal", "vertical" constraint implementations
   - Locate UI buttons and handlers
   - Find backend constraint classes
2. Remove obsolete UI components:
   - Remove buttons from ConstraintToolbar
   - Clean up event handlers
   - Update toolbar layout
3. Remove backend constraint logic:
   - Delete constraint type definitions
   - Remove constraint application logic
   - Clean up constraint validation
4. Update constraint documentation and help text
5. Verify line property constraints still work correctly

**Testing**: Verify obsolete constraints are fully removed, existing line constraints work, no broken references remain

---

## Implementation Priority

### Phase 1 (Foundation)
1. Extract reusable FloatingWindow component
2. TypeScript strict compliance
3. Data persistence investigation

### Phase 2 (Core Features)
1. Image sidebar resizing
2. Delete all selected items
3. World point hover cleanup

### Phase 3 (Advanced Features)
1. Image ViewTab improvements
2. Midpoint constraint implementation
3. Right panel restructuring

### Phase 4 (Cleanup)
1. Obsolete constraint removal

## Testing Strategy

### Unit Tests
- Test each new component in isolation
- Mock dependencies appropriately
- Cover edge cases and error scenarios

### Integration Tests
- Test popup interactions with main UI
- Verify data persistence across operations
- Test constraint system with new features

### Manual Testing
- Verify all UI interactions work smoothly
- Test keyboard shortcuts and accessibility
- Confirm responsive behavior at different screen sizes

## Notes for Developers

1. **Backwards Compatibility**: The codebase is explicitly designed with NO backwards compatibility requirements - feel free to make breaking changes for cleaner implementation.

2. **Code Quality**: Maintain clean, readable code without legacy support burden.

3. **Testing**: Run `bash check.sh` before completing any task as specified in project instructions.

4. **Incremental Implementation**: Each task can be implemented and tested independently, allowing for iterative development.

5. **Type Safety**: Prioritize proper TypeScript typing over quick fixes to maintain long-term code quality.