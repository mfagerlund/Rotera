# Testing Issues and User Stories

## Verification Summary: Previously Implemented Features

### ✅ **Project Templates Available**
- **Location**: `frontend/src/services/projectTemplates.ts`
- **Status**: Code exists but **NOT ACCESSIBLE IN UI**
- **Templates Available**:
  - Architectural Facade Documentation
  - 360° Object Documentation
  - Industrial Equipment Inspection
  - Archaeological Site Documentation
  - Terrain Mapping
  - General Object Documentation
- **Issue**: Project templates are implemented but not integrated into the main UI. Users cannot access this functionality.

---

## Remaining Issues

### 🔄 **On Hold**

#### 1. **Project Templates Not Accessible**
- **Status**: Code exists but no UI integration - ON HOLD
- **Impact**: Users can't leverage pre-configured project setups
- **Required**: Create project template selection interface

### 🔴 **Critical UI Issues**

#### 2. **✅ Green Circle Remnants After ESC Unselect** *(COMPLETED)*
- **Status**: ✅ FIXED - Removed all green circle rendering completely
- **Impact**: Visual clutter eliminated - only blue circles with numbers remain
- **Solution**: Eliminated world point selection state and rendering; unified on constraint selection only
- **Files Modified**: `MainLayout.tsx`, `ImageViewer.tsx`
- **Note**: AI should beep when task needs user attention (use `powershell -c "[console]::beep(1000,300); [console]::beep(1200,200)"`) and when ready for user testing/input (use `powershell -c "[console]::beep(1200,200); [console]::beep(1000,300)"`)

#### 3. **✅ Fixed Position Constraint Input Issues** *(COMPLETED)*
- **Status**: ✅ FIXED - Can now input "0" in position constraint boxes; only one coordinate required to enable constraint
- **Impact**: Users can now set valid zero positions; reduced friction for single-axis constraints
- **Solution**: Updated validation logic to allow falsy values (including 0) and changed requirement from all three coordinates to at least one
- **Files Modified**: `useConstraints.ts:278-282`, `ConstraintPropertyPanel.tsx:231-252`

#### 4. **✅ Missing Cancel Functionality in Constraint Dialog** *(COMPLETED)*
- **Status**: ✅ FIXED - ESC key now cancels constraint creation; cancel button was already present
- **Impact**: Users can now easily exit constraint creation with ESC key
- **Solution**: Added ESC key event listener to ConstraintPropertyPanel component
- **Files Modified**: `ConstraintPropertyPanel.tsx:32-45`

#### 5. **✅ Inconsistent Point Selection Between Image and List** *(COMPLETED)*
- **Status**: ✅ FIXED - Point selection now unified between image viewer and world point list
- **Impact**: Users can now mix selection methods (e.g., one from image, one from list) for constraint creation
- **Solution**: Connected WorldPointPanel's onSelectWorldPoint to the same handlePointClick function used by ImageViewer; added proper Ctrl/Shift multi-select support and prevented text selection on shift+click
- **Files Modified**: `MainLayout.tsx:334`, `WorldPointPanel.tsx:12,170,204,241-247`

#### 6. **Redundant Scale Controls**
- **Status**: Scale indicator in footer AND scale slider in bottom right panel
- **Impact**: Duplicate controls; wasted screen space
- **Required**: Remove slider panel; replace footer indicator with the slider (no height increase)
- **Note**: AI should beep when task needs user attention

#### 7. **Image Panel Width Optimization**
- **Status**: Image panel has excessive width with dead space
- **Impact**: Inefficient use of screen real estate
- **Required**: Reduce outer and inner panel widths by 150 pixels
- **Note**: AI should beep when task needs user attention

#### 8. **World Points Panel Layout Optimization**
- **Status**: WP panel can be wider; pills showing "2 images and 3 constraints" need refinement
- **Impact**: Suboptimal information density and layout
- **Required**: Expand WP panel width; improve constraint/image count display
- **Note**: AI should beep when task needs user attention

#### 9. **✅ Cross-Image Constraint Creation Clarity** *(COMPLETED)*
- **Status**: ✅ DOCUMENTED - Cross-image constraint creation functionality is now clearly documented
- **Impact**: Users can now understand the feature purpose and activation conditions
- **Solution**: Added comprehensive documentation explaining workflow, triggers, visual indicators, and use cases
- **Documentation**: See implementation details in ImageNavigationToolbar.tsx:96-149

**Cross-Image Constraint Creation Overview:**
- **Purpose**: Allows users to create constraints using points from multiple images
- **Activation**: Triggered automatically when user starts creating a constraint (isCreatingConstraint = true)
- **Visual Indicators**:
  - "CREATING CONSTRAINT" badge appears
  - "Switch images freely during creation" hint
  - Image thumbnails show constraint-mode styling
  - Selected point count displayed per image
  - Instructions panel with step-by-step guidance
- **Workflow**:
  1. User initiates constraint creation from toolbar
  2. Cross-image mode activates automatically
  3. User can click points in any image to select them
  4. User can switch between images freely during selection
  5. Selected points are tracked across all images and highlighted
  6. When sufficient points selected, user can complete constraint
- **UI Changes**: Special styling, overlays, point counters, navigation hints
- **Completion**: Constraint creation completes when enough points are selected for the constraint type

---

## Remaining User Stories

#### **US-007: Project Template Selection Interface** *(ON HOLD)*
**As a** user
**I want** to create new projects from predefined templates
**So that** I can start with appropriate constraints and point groups for my use case

**Acceptance Criteria:**
- Create project template browser/selector
- Display template categories, descriptions, and requirements
- Preview template setup (constraints, point groups)
- Integration with project creation workflow
- Template search and filtering capabilities

**Estimated Effort:** Large (12-16 hours)
**Status:** ON HOLD

---

## Implementation Plan

### Current Phase: Critical UI Fixes
1. **Issue #2**: Green circle remnants after ESC unselect
2. **Issue #3**: Fixed position constraint input issues
3. **Issue #4**: Missing cancel functionality in constraint dialog
4. **Issue #5**: Inconsistent point selection between image and list
5. **Issue #6**: Redundant scale controls
6. **Issue #7**: Image panel width optimization
7. **Issue #8**: World points panel layout optimization
8. **Issue #9**: Cross-image constraint creation clarity

**Overall Progress: 6/7 User Stories Complete (85.7% done) + 8 Critical UI Issues to address**

---

## Priority Matrix

| Issue | Impact | Effort | Priority | Status |
|-------|---------|---------|----------|---------|
| Green circle remnants | High | Low | **P1** | **✅ COMPLETED** |
| Constraint input issues | High | Medium | **P1** | **✅ COMPLETED** |
| Missing cancel in constraints | High | Low | **P1** | **✅ COMPLETED** |
| Inconsistent point selection | High | Medium | **P2** | **✅ COMPLETED** |
| Cross-image constraint clarity | Medium | Low | **P2** | **PENDING** |
| Redundant scale controls | Medium | Medium | **P2** | **PENDING** |
| Image panel width | Low | Low | **P3** | **PENDING** |
| WP panel layout | Low | Medium | **P3** | **PENDING** |
| Project templates | Medium | High | **ON HOLD** | **ON HOLD** |