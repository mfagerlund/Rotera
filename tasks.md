# Pictorigo Implementation Tasks

## ✅ **COMPLETED IMPLEMENTATION (Dec 28, 2024)**

**Core paradigm implementation is COMPLETE!** The new entity-first, constraint-on-selection system is fully functional with all foundational components in place.

### **✅ COMPLETED PHASES:**
- ✅ **Phase 1: Foundation** - Data models, workspace separation, visual language (COMPLETE)
- ✅ **Phase 2: Selection & Creation Tools** - Enhanced selection system, creation tools (COMPLETE)
- ✅ **Phase 3: Context-Sensitive Constraints** - Dynamic constraint palette (COMPLETE)
- ✅ **Phase 4: Image-World Integration** - Workspace switching, layout fixes (COMPLETE)

## ✅ **Core Philosophy - IMPLEMENTED**
**"Entity-first, constraint-on-selection"** - Users create simple geometric primitives (points, lines, planes), then apply constraints contextually based on their selection. The UI always clearly shows what's driven vs free.

### **Primary Interaction Model - IMPLEMENTED**
**Selection-first approach**: Clicking by default **selects** entities, never creates them. Creation requires explicit tool activation:

- **Default Behavior**: Click = Select (with Ctrl/Shift modifiers for multi-selection)
- **Point Creation**: Activate "Create Point" tool → Click image → Creates one point → Tool deactivates (or Esc to cancel)
- **Line Creation**: Activate "Create Line" tool → Behavior depends on current selection:
  - **0 points selected**: Prompts to select two points sequentially
  - **1 point selected**: Prompts to select second point → Creates line → Tool deactivates
  - **2 points selected**: Immediately creates line between them → Tool deactivates
  - **Invalid selection**: Tool remains inactive until valid selection

### **✅ Line Creation Workflow (Fusion 360 Style - IMPLEMENTED)**
**Slot-based creation with explicit panel:**

1. Click "Line" button or press L key
2. Line creation panel opens with:
   - Two point slots (Point 1, Point 2)
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
- Fixed length: Optional value input (segments only)

**Completion:**
- OK button enabled only when both slots filled
- Creates line with selected constraints applied
- Tool deactivates, returns to select mode
- Cancel or Esc closes panel without creating line

**Case 4: Invalid selection (3+ points, mixed entities)**
- "Create Line" button disabled/grayed out
- Tooltip: "Select 0, 1, or 2 points to create line"

### **✅ Point Creation Workflow - IMPLEMENTED**
**CRITICAL**: Point creation only happens when WP tool is explicitly active
1. Click "WP" button or press W key → Tool activates
2. While active: click on image → Point created at location
3. Tool automatically deactivates after point creation OR press Esc
4. **Default behavior**: Click without tool active = selection only (NO point creation)

### **✅ Data Integrity Rules - IMPLEMENTED**
- **Unique line constraint:** Two points can never be connected by more than one line
- **Cascading deletion:** Deleting a point automatically deletes all connected lines
- **Line validation:** System prevents creation of duplicate lines
- **Entity consistency:** All entity references are validated before creation

### **✅ Live Construction Preview - IMPLEMENTED**
- **First point selected**: Dashed orange line follows cursor from that point
- **Both points selected**: Solid orange preview line between points
- **Tool deactivated**: Preview clears immediately
- **Completed lines**: Render on images when both world points have image points

### **✅ Workspace Separation - IMPLEMENTED**
- **Split views clearly:**
  - Image View: 2D photo workspace with IP placement
  - World View: 3D geometry workspace with primitives
- **Implemented workspace switching** with keyboard shortcuts (Ctrl+1/2/3)
- **Synchronized selection** across workspaces

### **✅ Visual Language - IMPLEMENTED**
- **Color coding:**
  - Green: Satisfied constraints
  - Amber: High residual/warning
  - Red: Violated/unsolved
  - Blue: World geometry reprojected
  - Orange: Image-only guides
- **Constraint glyphs:** ∥ (parallel), ⟂ (perpendicular), ⎓ (axis), ⌖ (on), 🔒 (locked)

---

## 🎯 **NEXT IMPLEMENTATION PRIORITIES**

### **🔥 HIGH PRIORITY: Floating Edit Windows**

#### **FloatingWindow Base Component**
- **Draggable header** with title and grab cursor
- **Standardized layout**: Header + Content + Footer with OK/Cancel
- **Z-index management** for multiple windows (stack order)
- **ESC key handling** for cancel action
- **Window positioning** (smart placement, avoid viewport edges)
- **Consistent styling** following design system

#### **EditLineWindow Implementation**
- **Line property editing**: Name, color, visibility toggle
- **Line constraint editing**: Direction, length, construction/driving
- **Live preview** of all changes in viewers
- **Validation**: Check for conflicts, invalid values
- **Revert capability**: Cancel restores original state
- **Apply workflow**: OK commits changes permanently

#### **Enhanced Selection & Hover**
- **Line click detection** in ImageViewer and WorldView
- **Hover state management** for lines and points
- **Visual hover feedback**: Highlighting, thickness increase, cursor changes
- **Selection consistency** across viewers
- **Multi-entity hover** (cycle through overlapping)

#### **Integration Workflow**
- **Selection triggers edit**: Click line → auto-open EditLineWindow
- **Smart positioning**: Window appears near selected entity
- **Live preview**: Changes reflect immediately in viewers
- **State management**: Apply changes or revert on cancel
- **Template establishment**: Pattern for all future edit tools

---

## **🔄 UPCOMING PHASES: Detailed Implementation**

### **Phase 5: Core Primitives**
⏳ **Next after floating windows**

#### **5.1 Plane Primitive Implementation**
**Multiple definition methods with dynamic UI:**

**Method 1: 3 World Points**
- Slot-based panel: Point 1, Point 2, Point 3
- Auto-validation: Non-collinear check
- Live preview: Ghost plane surface
- Constraints: Parallel/perpendicular to axes

**Method 2: 2 Lines**
- Slot-based panel: Line 1, Line 2
- Auto-validation: Coplanar check, non-parallel
- Live preview: Plane containing both lines
- Edge case handling: Parallel lines error

**Method 3: Line + World Point**
- Slot-based panel: Line slot, Point slot
- Auto-validation: Point not on line
- Live preview: Plane through line and point
- Most intuitive for many use cases

**Plane Creation Panel:**
- Method selector dropdown
- Dynamic slots based on method
- Plane-local constraints section
- Live validation with error messages

#### **5.2 Circle/Arc Primitive Implementation**
**Two creation methods:**

**Method 1: Center + Radius**
- Point slot for center
- Radius input (numerical or point distance)
- Orientation plane selection
- Arc angle constraints (optional)

**Method 2: 3 Points**
- Three point slots
- Auto-calculation of center and radius
- Plane determination from points
- Full circle or arc options

### **Phase 6: Context-Sensitive Constraints**
⏳ **Advanced constraint system**

#### **6.1 Dynamic Constraint Palette**
- **Real-time updates** based on current selection
- **Grouped constraints**: Geometric, Dimensional, Alignment, Construction
- **Disabled states** with tooltip explanations
- **Icon-based interface** with constraint glyphs

#### **6.2 Selection-Based Constraint Rules**

**Single entity selected:**
- **WP**: Fix coords, lock, on line/plane, distance to, equal to
- **Line**: Parallel/perpendicular/axis-aligned, length, passes through, lies in plane
- **Plane**: Parallel/perpendicular, offset, lock to axis

**Two entities selected:**
- **WP+WP**: Distance, equal, merge, midpoint
- **WP+Line**: Point-on-line, perpendicular through
- **Line+Line**: Parallel, perpendicular, colinear, intersect
- **Line+Plane**: Parallel, perpendicular, intersect
- **Plane+Plane**: Parallel, perpendicular, coincident

**Three+ entities selected:**
- **Multiple WPs**: Colinear, coplanar, equal distances
- **Mixed entities**: Plane creation, advanced constraints

#### **6.3 Auto-Construction Helpers**
- **One-click construction**: "Perpendicular through point", "Midpoint", "Plane from selection"
- **Implicit vs explicit intersections** (prefer explicit WPs)
- **Smart suggestions** based on geometry patterns

### **Phase 7: Image-World Integration**
⏳ **Enhanced photogrammetry workflow**

#### **7.1 Image View Enhancements**
**Vanishing guides system:**
- **2D lines drawn in image** with direction tagging
- **Tag as X/Y/Z aligned** for camera orientation constraints
- **"Adopt as axis" suggestions** for quick setup
- **Constraint camera orientation** using parallel lines

**IP placement workflow:**
- **Click image** → popup: "New WP" or "Attach to existing"
- **Show reprojection error** immediately with color coding
- **Visual connection** lines to world geometry
- **Batch placement** modes for efficiency

#### **7.2 World View Enhancements**
**3D manipulation:**
- **Draggable WPs** when unconstrained
- **Ghost directions** for constrained movement visualization
- **Axis-aligned movement** with Shift key modifier
- **Live constraint feedback** during drag operations
- **Construction geometry** toggle (show/hide helper entities)

### **Phase 8: Constraint Management UI**
⏳ **Professional constraint control**

#### **8.1 Inspector Panel (Right Sidebar)**
**Selection properties:**
- **Entity details**: Coordinates, name, type, creation date
- **Attached constraints list** with enable/disable toggles
- **Weight adjustment** sliders for solver priority
- **Edit target values**: Distances, angles with live preview

#### **8.2 Constraint List (Bottom Panel)**
**Comprehensive constraint overview:**
- **Sortable by**: Residual (error), Type, Creation order, Status
- **Visual indicators**: Color-coded status (green/amber/red)
- **Click to zoom/highlight** involved entities in viewers
- **Batch operations**: Enable/disable multiple constraints
- **Filtering**: Show only violated, muted, or specific types

#### **8.3 DOF System**
**System health monitoring:**
- **Degrees of Freedom meter** showing current system status
- **Under-constrained warnings** with specific suggestions
- **Over-constrained detection** with conflict visualization
- **One-click mute** for conflicting constraints
- **Solver diagnostics** for complex constraint systems

### **Phase 9: User Experience Polish**
⏳ **Professional-grade interactions**

#### **9.1 Interaction Refinements**
- **Undo/Redo system** (Ctrl+Z/Y) with operation-specific descriptions
- **Non-destructive delete** with orphan dependency warnings
- **Status readouts**: Real-time measurements in meters with unit consistency
- **Context menus** that mirror palette options (right-click shortcuts)

#### **9.2 Visual Feedback**
- **Snap cues**: Visual indicators during creation/editing operations
- **Constraint previews**: Show effect before applying with ghost geometry
- **Animated transitions** for constraint application and solver updates
- **Hover states** for all interactive elements with consistent styling

#### **9.3 Error Handling**
- **Clear error messages** with actionable solutions and recovery steps
- **Conflict visualization**: Highlight conflicting constraints with explanation
- **Recovery suggestions**: "Try releasing X constraint" with one-click options
- **Progressive disclosure**: Advanced options hidden by default, revealed on demand

### **Phase 10: Advanced Features**
⏳ **Power user capabilities**

#### **10.1 Colinearity & Coplanarity**
**N-point alignment:**
- **Select 3+ WPs** → "Colinear" creates reference line automatically
- **Point-on-line constraints** for each WP with individual controls
- **Visual reference line** can be hidden/shown independently
- **Similar workflow for coplanar** with auto-plane creation

#### **10.2 Construction vs Driving Constraints**
**Constraint behavior types:**
- **Driving constraints**: Actively enforced by solver
- **Construction constraints**: Can be muted for diagnosis without breaking model
- **Toggle in inspector** per constraint with clear visual distinction
- **Solver modes**: Full, driving-only, manual override for advanced users

#### **10.3 Measurement Tools**
**Live measurement system:**
- **Distance between entities** with persistent display options
- **Angles between lines/planes** with degree/radian modes
- **Areas and volumes** for closed geometry
- **Units always shown** (meters, degrees) with conversion options
- **Export measurements** to structured reports (CSV/JSON)

---

## 🎯 **IMMEDIATE NEXT STEPS (This Session)**

### **Floating Edit Windows Implementation**
1. **FloatingWindow Component**
   - Draggable header with title
   - Standardized OK/Cancel button layout
   - Z-index management for multiple windows
   - ESC key handling for cancel

2. **EditLineWindow**
   - Line property editing (name, color, visibility)
   - Line constraint editing (direction, length)
   - Live preview of changes
   - Validation and error handling

3. **Enhanced Selection & Hover**
   - Line click detection in ImageViewer and WorldView
   - Hover state management for lines and points
   - Visual hover feedback (highlighting, cursor changes)
   - Selection state consistency across viewers

4. **Integration Workflow**
   - Line selection triggers EditLineWindow
   - Window positioning near selected line
   - Apply changes with live preview
   - Cancel reverts to original state

**Success Criteria:**
- Users can click any line to open its edit window
- Edit window is draggable and well-positioned
- Changes preview live in viewers
- OK applies changes, Cancel reverts
- Window serves as template for future edit tools

---

## 📋 **IMPLEMENTATION NOTES**

### **Design Principles**
- **Consistency**: All edit windows follow same FloatingWindow template
- **Discoverability**: Hover feedback makes interactive elements obvious
- **Predictability**: Selection-based workflow with clear visual cues
- **Professional Feel**: Polished interactions matching CAD software standards

### **Technical Approach**
- **Component Composition**: FloatingWindow wraps specific edit components
- **State Management**: Centralized edit state with preview capabilities
- **Event Handling**: Unified selection and hover event systems
- **Performance**: Efficient re-rendering for hover/selection feedback

### **Future Extensibility**
This floating window system will enable:
- **EditPointWindow** (world point properties)
- **EditPlaneWindow** (plane properties and constraints)
- **EditConstraintWindow** (constraint parameters)
- **CreatePlaneWindow** (plane creation following same pattern)