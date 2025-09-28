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


#### 2. **Redundant Scale Controls**
- **Status**: Scale indicator in footer AND scale slider in bottom right panel
- **Impact**: Duplicate controls; wasted screen space
- **Required**: Remove slider panel; replace footer indicator with the slider (no height increase)
- **Note**: AI should beep when task needs user attention

#### 3. **Image Panel Width Optimization**
- **Status**: Image panel has excessive width with dead space
- **Impact**: Inefficient use of screen real estate
- **Required**: Reduce outer and inner panel widths by 150 pixels
- **Note**: AI should beep when task needs user attention

#### 4. **World Points Panel Layout Optimization**
- **Status**: WP panel can be wider; pills showing "2 images and 3 constraints" need refinement
- **Impact**: Suboptimal information density and layout
- **Required**: Expand WP panel width; improve constraint/image count display
- **Note**: AI should beep when task needs user attention

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
1. **Issue #2**: Redundant scale controls
2. **Issue #3**: Image panel width optimization
3. **Issue #4**: World points panel layout optimization

**Overall Progress: 6/7 User Stories Complete (85.7% done) + 3 Critical UI Issues remaining**

---

## Priority Matrix

| Issue | Impact | Effort | Priority | Status |
|-------|---------|---------|----------|---------|
| Redundant scale controls | Medium | Medium | **P1** | **PENDING** |
| Image panel width | Low | Low | **P2** | **PENDING** |
| WP panel layout | Low | Medium | **P2** | **PENDING** |
| Project templates | Medium | High | **ON HOLD** | **ON HOLD** |