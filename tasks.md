# Pictorigo Implementation Tasks

## ✅ **COMPLETED IMPLEMENTATION (Dec 28, 2024)**

### **Core UI Paradigm - COMPLETE**
- ✅ **Entity-first, constraint-on-selection paradigm** implemented
- ✅ **Selection-first approach** (click selects, creation requires tool activation)
- ✅ **Workspace separation** (Image/World/Split views with Ctrl+1/2/3)
- ✅ **Enhanced selection system** with multi-select and keyboard shortcuts
- ✅ **Visual language** with color coding and constraint status indicators

### **Line Primitive - COMPLETE**
- ✅ **Fusion 360-style Line Creation Tool** with slot-based selection
- ✅ **Live construction preview** (dashed line to cursor, solid preview)
- ✅ **Line rendering on images** when both world points have image points
- ✅ **Line-local constraints** (direction alignment, optional length)
- ✅ **Point creation tool** (W key, explicit activation required)
- ✅ **Data integrity** (unique lines, cascading deletion)

### **Project Infrastructure - COMPLETE**
- ✅ **Enhanced project structure** with workspace state management
- ✅ **Line data management** hooks and CRUD operations
- ✅ **Component architecture** (tools, managers, viewers)
- ✅ **Mouse tracking and interaction** systems

---

## 🎯 **NEXT IMPLEMENTATION PRIORITIES**

### **🔥 HIGH PRIORITY: Floating Edit Windows**
- ⏳ **Design FloatingWindow base component** (draggable, OK/Cancel, template for all edit tools)
- ⏳ **Implement line selection in viewers** (click line to select)
- ⏳ **Create EditLineWindow component** (name, color, constraints editing)
- ⏳ **Add hover indicators** for lines and points (visual feedback)
- ⏳ **Wire selection → edit workflow** (select line → auto-open edit window)
- ⏳ **Test complete edit cycle** (select, edit, apply/cancel, close)

### **🔄 MEDIUM PRIORITY: Core Primitives**
- ⏳ **Plane primitive implementation**
  - 3 World Points method
  - 2 Lines method (coplanar check)
  - Line + World Point method
  - Fusion 360-style creation panel with method selection
- ⏳ **Circle/Arc primitive implementation**
  - Center + radius method
  - 3 Points method
  - Live preview and constraints

### **📊 MEDIUM PRIORITY: Constraint System**
- ⏳ **Constraint glyphs on entities** (∥, ⟂, ⎓, ⌖, 🔒 visual indicators)
- ⏳ **Degrees-of-freedom meter** (system health indicator)
- ⏳ **Under-constraint warnings** with suggestions
- ⏳ **Over-constraint detection** with conflict resolution
- ⏳ **Enhanced Inspector panel** (properties, weights, enable/disable)

### **🎨 LOWER PRIORITY: Image-side Enhancements**
- ⏳ **Vanishing guides** (2D lines tagged as X/Y/Z-aligned)
- ⏳ **Smart IP placement** (new WP vs attach to existing)
- ⏳ **Reprojection error badges** on image points
- ⏳ **One-click axis adoption** suggestions

### **🔧 LOWER PRIORITY: Tools & Measurement**
- ⏳ **Measurement tools** (M key, inline distance/angle display)
- ⏳ **Smart snapping** (endpoints, midpoints, perpendicular, parallel)
- ⏳ **Auto-construction helpers** (perpendicular through point, midpoint)
- ⏳ **Units display consistency** (meters everywhere)

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