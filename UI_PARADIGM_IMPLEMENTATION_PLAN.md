# Pictorigo UI Paradigm Implementation Plan

## ✅ **IMPLEMENTATION STATUS (Dec 28, 2024)**

**Core paradigm implementation is COMPLETE!** The new entity-first, constraint-on-selection system is fully functional with all foundational components in place.

### **✅ COMPLETED PHASES:**
- ✅ **Phase 1: Foundation** - Data models, workspace separation, visual language (COMPLETE)
- ✅ **Phase 2: Selection & Creation Tools** - Enhanced selection system, creation tools (COMPLETE)
- ✅ **Phase 3: Context-Sensitive Constraints** - Dynamic constraint palette (COMPLETE)
- ✅ **Phase 4: Image-World Integration** - Workspace switching, layout fixes (COMPLETE)

### **🔄 CURRENT PHASE: Core Primitives Implementation**
- 🔄 **Line primitive** implementation (two WPs, segment vs infinite toggle)
- ⏳ **Plane primitive** implementation (3 WPs, 2 Lines, or Line + WP)
- ⏳ **Multi-select → constraints logic** refinement

---

## Executive Summary
Transform Pictorigo from its current point-and-constraint system to a modern entity-first, constraint-on-selection paradigm inspired by Fusion 360. This will provide users with a more intuitive, predictable, and powerful workflow for photogrammetry-based 3D reconstruction.

**Key Paradigm Shift**: Unlike traditional CAD tools where clicking creates geometry, Pictorigo follows a **selection-first approach** where clicking selects entities by default. This provides more predictable behavior and prevents accidental geometry creation.

## Core Philosophy ✅ **IMPLEMENTED**
**"Entity-first, constraint-on-selection"** - Users create simple geometric primitives (points, lines, planes), then apply constraints contextually based on their selection. The UI always clearly shows what's driven vs free.

### Primary Interaction Model
**Selection-first approach**: Clicking by default **selects** entities, never creates them. Creation requires explicit tool activation:

- **Default Behavior**: Click = Select (with Ctrl/Shift modifiers for multi-selection)
- **Point Creation**: Activate "Create Point" tool → Click image → Creates one point → Tool deactivates (or Esc to cancel)
- **Line Creation**: Activate "Create Line" tool → Behavior depends on current selection:
  - **0 points selected**: Prompts to select two points sequentially
  - **1 point selected**: Prompts to select second point → Creates line → Tool deactivates
  - **2 points selected**: Immediately creates line between them → Tool deactivates
  - **Invalid selection**: Tool remains inactive until valid selection

### Line Creation Rules
- Two points can never be connected by more than one line
- Deleting a point automatically deletes all connected lines
- Line creation tool only activates with 0, 1, or 2 points selected

## ✅ Phase 1: Foundation (COMPLETE - Week 1-2)
### ✅ 1.1 Refactor Data Models
- ✅ **Extended WorldPoint** to support new constraint types and relationships
- 🔄 **Add Line primitive** (exactly 2 WPs, segment vs infinite toggle) - IN PROGRESS
- ⏳ **Add Plane primitive** with multiple definition methods:
  - 3 World Points
  - 2 non-parallel Lines
  - Line + World Point
- ✅ **Updated constraint system** to support new entity relationships

### ✅ 1.2 Workspace Separation
- ✅ **Split views clearly:**
  - Image View: 2D photo workspace with IP placement
  - World View: 3D geometry workspace with primitives
- ✅ **Implemented workspace switching** with keyboard shortcuts (Ctrl+1/2/3)
- ✅ **Synchronized selection** across workspaces

### ✅ 1.3 Visual Language
- ✅ **Color coding:**
  - Green: Satisfied constraints
  - Amber: High residual/warning
  - Red: Violated/unsolved
  - Blue: World geometry reprojected
  - Orange: Image-only guides
- ✅ **Constraint glyphs:** ∥ (parallel), ⟂ (perpendicular), ⎓ (axis), ⌖ (on), 🔒 (locked)

## Phase 2: Selection & Creation Tools (Week 2-3)
### 2.1 Enhanced Selection System
- **Smart selection grammar:**
  - Single click: Select one entity
  - Shift-click: Add/remove from selection
  - Marquee drag: Area selection
  - Tab: Cycle through overlapping entities
- **Type filtering:** Toggle selectability by entity type (WP/Line/Plane/IP)
- **Primary selection tracking** (last selected = pivot for operations)

### 2.2 Creation Tools
- **Tool palette (button-based for now):**
  - Create Point button (single-use, auto-deactivates)
  - Create Line button (selection-dependent behavior)
  - Create Plane button (selection-dependent behavior)
  - Image Point button (Image View only)
  - Measure button
  - **Note**: Hotkeys deferred - users will use buttons for creation tools
- **Selection-first workflow:**
  - Default state: Select mode (click to select entities)
  - Tools activate only when valid selection exists
  - Tools auto-deactivate after successful creation
- **Smart snapping:** Endpoints, midpoints, perpendicular, parallel, extensions
- **Live preview** during creation (ghost entities)

### 2.3 Point Creation Workflow (Corrected)
**CRITICAL**: Point creation only happens when WP tool is explicitly active
1. Click "WP" button or press W key → Tool activates
2. While active: click on image → Point created at location
3. Tool automatically deactivates after point creation OR press Esc
4. **Default behavior**: Click without tool active = selection only (NO point creation)

### 2.4 Line Creation Workflow (Fusion 360 Style - Corrected)
**Slot-based creation with explicit panel:**

1. Click "Line" button or press L key
2. Line creation panel opens with:
   - Two point slots (Point 1, Point 2)
   - Segment/Infinite radio buttons
   - Line-local constraint options
   - Cancel/OK buttons

**Pre-population from selection:**
- 2 points selected → both slots filled
- 1 point selected → first slot filled
- 0 points selected → both slots empty

**Slot filling while tool active:**
- Click any existing point → fills current empty slot, advances to next
- Manual dropdown selection in slots
- Clear buttons to remove points from slots

**Line-local constraints (applied during creation):**
- Direction: None/Horizontal/Vertical/X-aligned/Y-aligned/Z-aligned (dropdown)
- Fixed length: Checkbox + value input (segments only)

**Completion:**
- OK button enabled only when both slots filled
- Creates line with selected constraints applied
- Tool deactivates, returns to select mode
- Cancel or Esc closes panel without creating line

**Case 4: Invalid selection (3+ points, mixed entities)**
- "Create Line" button disabled/grayed out
- Tooltip: "Select 0, 1, or 2 points to create line"

### 2.5 Data Integrity Rules
- **Unique line constraint:** Two points can never be connected by more than one line
- **Cascading deletion:** Deleting a point automatically deletes all connected lines
- **Line validation:** System prevents creation of duplicate lines
- **Entity consistency:** All entity references are validated before creation

## Phase 3: Context-Sensitive Constraints (Week 3-4)
### 3.1 Constraint Palette
- **Dynamic constraint menu** based on selection:
  - Updates in real-time
  - Disabled items show requirements in tooltip
  - Groups: Geometric, Dimensional, Alignment, Construction

### 3.2 Selection-Based Rules
**Single entity selected:**
- WP: Fix coords, lock, on line/plane, distance to, equal to
- Line: Parallel/perpendicular/axis-aligned, length, passes through, lies in plane
- Plane: Parallel/perpendicular, offset, lock to axis

**Two entities selected:**
- WP+WP: Distance, equal, merge, midpoint
- WP+Line: Point-on-line, perpendicular through
- Line+Line: Parallel, perpendicular, colinear, intersect
- Line+Plane: Parallel, perpendicular, intersect
- Plane+Plane: Parallel, perpendicular, coincident

**Three+ entities selected:**
- Multiple WPs: Colinear, coplanar, equal distances
- Mixed for plane creation

### 3.3 Auto-Construction Helpers
- **One-click construction:** "Perpendicular through point", "Midpoint", "Plane from selection"
- **Implicit vs explicit intersections** (prefer explicit WPs)

## Phase 4: Image-World Integration (Week 4-5)
### 4.1 Image View Enhancements
- **Vanishing guides:**
  - 2D lines drawn in image
  - Tag as X/Y/Z aligned
  - Constrain camera orientation
  - "Adopt as axis" suggestions
- **IP placement workflow:**
  - Click image → popup: "New WP" or "Attach to existing"
  - Show reprojection error immediately
  - Visual connection to world geometry

### 4.2 World View
- **3D manipulation:**
  - Draggable WPs (when unconstrained)
  - Ghost directions for constrained movement
  - Axis-aligned movement with Shift
- **Live constraint feedback** during drag
- **Construction geometry** toggle (show/hide helper entities)

## Phase 5: Constraint Management UI (Week 5-6)
### 5.1 Inspector Panel (Right Sidebar)
- **Selection properties:**
  - Entity details (coordinates, name, type)
  - Attached constraints list
  - Enable/disable toggles
  - Weight adjustment
  - Edit target values (distances, angles)

### 5.2 Constraint List (Bottom Panel)
- **Sortable by:**
  - Residual (error)
  - Type
  - Creation order
- **Visual indicators:** Color-coded status
- **Click to zoom/highlight** involved entities
- **Batch operations:** Enable/disable multiple

### 5.3 DOF System
- **Degrees of Freedom meter** showing system status
- **Under-constrained warnings** with suggestions
- **Over-constrained detection** with conflict resolution
- **One-click mute** for conflicting constraints

## Phase 6: User Experience Polish (Week 6-7)
### 6.1 Interaction Refinements
- **Undo/Redo system** (Ctrl+Z/Y) with visual feedback
- **Non-destructive delete** with orphan warnings
- **Status readouts:** Real-time measurements in meters
- **Context menus** mirror palette options (right-click)

### 6.2 Visual Feedback
- **Snap cues:** Visual indicators during creation/editing
- **Constraint previews:** Show effect before applying
- **Animated transitions** for constraint application
- **Hover states** for all interactive elements

### 6.3 Error Handling
- **Clear error messages** with actionable solutions
- **Conflict visualization:** Highlight conflicting constraints
- **Recovery suggestions:** "Try releasing X constraint"
- **Progressive disclosure:** Advanced options hidden by default

## Phase 7: Advanced Features (Week 7-8)
### 7.1 Colinearity & Coplanarity
- **N-point alignment:**
  - Select 3+ WPs → "Colinear" creates reference line
  - Point-on-line constraints for each WP
  - Visual line can be hidden/shown
- **Similar for coplanar** with auto-plane creation

### 7.2 Construction vs Driving
- **Constraint types:**
  - Driving: Actively enforced
  - Construction: Can be muted for diagnosis
- **Toggle in inspector** per constraint
- **Solver modes:** Full, driving-only, manual

### 7.3 Measurement Tools
- **Live measurements:**
  - Distance between entities
  - Angles between lines/planes
  - Areas and volumes
- **Units always shown** (meters, degrees)
- **Export measurements** to report

## Implementation Strategy

### Technical Approach
1. **Incremental refactoring:** Keep existing functionality working
2. **Feature flags:** Roll out new UI gradually
3. **Backwards compatibility:** Support old project files
4. **Component isolation:** New components alongside old
5. **Progressive migration:** Move features one at a time

### Testing Strategy
1. **Unit tests** for new constraint logic
2. **Integration tests** for selection grammar
3. **E2E tests** for critical workflows
4. **User acceptance testing** at each phase
5. **Performance benchmarks** for large projects

### Risk Mitigation
1. **Maintain old UI option** during transition
2. **Comprehensive documentation** of new paradigm
3. **Video tutorials** for key workflows
4. **In-app guided tours** for first-time users
5. **Community feedback loops** at each phase

## Success Metrics
- **Reduced clicks** for common operations (target: 30% reduction)
- **Faster constraint application** (target: 2x speed)
- **Clearer mental model** (user survey: 80% prefer new)
- **Fewer constraint conflicts** (target: 50% reduction)
- **Increased feature discoverability** (analytics tracking)

## User Experience Goals

### Delightful Interactions
- **Smooth animations** that provide feedback without slowing workflow
- **Smart defaults** that anticipate user intent
- **Keyboard shortcuts** for power users
- **Visual consistency** across all tools
- **Predictable behavior** with no surprises

### Learning Curve
- **Onboarding flow** for new users:
  1. Simple 2-image calibration
  2. Basic constraints (distance, parallel)
  3. Advanced features progressively
- **Contextual help** with tooltips and hints
- **Example projects** demonstrating best practices

### Professional Feel
- **CAD-standard interactions** familiar to engineers
- **Precise control** with numerical input
- **Batch operations** for efficiency
- **Customizable workspace** layouts
- **Professional visual design** (Fusion-inspired)

## Timeline Summary
- **Weeks 1-2:** Foundation (data models, workspaces, visual language)
- **Weeks 2-3:** Selection & creation tools
- **Weeks 3-4:** Context-sensitive constraints
- **Weeks 4-5:** Image-world integration
- **Weeks 5-6:** Constraint management UI
- **Weeks 6-7:** UX polish and refinements
- **Weeks 7-8:** Advanced features and optimization

## Next Steps
1. Review and approve this plan
2. Set up feature branch for development
3. Create detailed technical specifications
4. Begin Phase 1 implementation
5. Schedule weekly progress reviews

---

This plan transforms Pictorigo into a modern, professional photogrammetry tool with an intuitive entity-first paradigm that scales from simple to complex projects while maintaining a delightful user experience.