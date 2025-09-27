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

### ✅ **Constraint System**
- **Location**: Multiple components (ConstraintToolbar, ConstraintPropertyPanel, etc.)
- **Status**: Fully functional
- **Features**: Distance, parallel, perpendicular, angle, and other constraint types

### ✅ **Image Navigation**
- **Location**: `ImageNavigationToolbar.tsx`
- **Status**: Functional but with UI issues (documented below)

### ✅ **World Point Management**
- **Location**: `WorldPointPanel.tsx`
- **Status**: Functional with placement mode

---

## Current Issues Found During Testing

### 🔴 **Critical UI Issues**

#### 1. **Image Selection Indicator Problems**
- **Issue**: Blue dot indicating selected image is very small and poorly placed
- **Current Implementation**: `.active-dot` in CSS (lines 443-449)
- **Problems**:
  - 8px dot is too small
  - Positioned in top-right corner, conflicts with other indicators
  - Very similar to world point circle indicators
- **User Impact**: Difficult to identify which image is currently selected

#### 2. **Image Thumbnail Display Issues**
- **Issue**: Images panel layout problems
- **Current Implementation**: `.image-thumbnail` (lines 324-338)
- **Problems**:
  - Fixed 60px × 60px thumbnails are too small
  - Image containers don't utilize available width in sidebar
  - Images sidebar is much wider than needed for current thumbnails
  - `object-fit: contain` may leave empty space
- **User Impact**: Poor visual experience, hard to see image details

#### 3. **Missing Drag & Drop for World Points**
- **Issue**: No drag and drop functionality for world point manipulation
- **Current Implementation**: Only click-to-place exists
- **Missing Features**:
  - Drag existing world points to new positions
  - Visual feedback when near a world point (hover states)
  - Grab cursor when hovering over draggable points
- **User Impact**: Inefficient workflow for point adjustment

#### 4. **Zoom Functionality Broken**
- **Issue**: Current zoom implementation is problematic
- **Current Implementation**: Two-finger scroll zoom causes erratic behavior
- **User Feedback**: "zoom function is totally busted"
- **Requested Solution**:
  - Add zoom slider control
  - Pan with key combination (e.g., Space+drag)
  - More predictable zoom behavior

#### 5. **Unnecessary Placement Confirmation**
- **Issue**: Confirmation dialog for placing latest world point is annoying
- **Current Implementation**: Lines 158-165 in `MainLayout.tsx`
- **User Feedback**: "I didn't like the question if i wanted to place the latest"
- **Solution**: Remove confirmation dialog, keep "Place Latest" button

#### 6. **Constraint Enablement Not Working**
- **Issue**: Selecting two points doesn't enable constraints
- **User Feedback**: "when i select two points, no constraints get enabled"
- **Potential Cause**: Issue in constraint detection logic or point selection system

#### 7. **Mystery Green "1" Indicator**
- **Issue**: Green "1" appears on images without clear reason
- **Likely Cause**: `.selected-wp-indicator` showing count but logic may be incorrect
- **User Impact**: Confusing UI feedback

### 🟡 **Missing Functionality**

#### 1. **Project Templates Not Accessible**
- **Status**: Code exists but no UI integration
- **Impact**: Users can't leverage pre-configured project setups
- **Required**: Create project template selection interface

---

## User Stories for Defect Resolution

### Epic: Image Navigation UX Improvements

#### **US-001: Improved Image Selection Indicator**
**As a** user
**I want** a clear, prominent indicator showing which image is currently selected
**So that** I can easily identify my current working context

**Acceptance Criteria:**
- Replace small blue dot with prominent border highlight
- Use existing frame styling or enhance it
- Ensure indicator doesn't conflict with world point indicators
- Make indicator visible in both normal and constraint modes

**Estimated Effort:** Small (2-4 hours)

---

#### **US-002: Enhanced Image Thumbnail Display**
**As a** user
**I want** larger, well-proportioned image thumbnails
**So that** I can better identify and navigate between images

**Acceptance Criteria:**
- Increase thumbnail size to better utilize sidebar width
- Implement responsive thumbnail sizing
- Use `object-fit: cover` for better image filling
- Ensure consistent aspect ratios
- Add hover states for better interactivity

**Estimated Effort:** Medium (4-6 hours)

---

#### **US-003: World Point Drag & Drop**
**As a** user
**I want** to drag and drop world points to reposition them
**So that** I can efficiently adjust point locations without recreating them

**Acceptance Criteria:**
- Implement drag functionality for existing world points
- Show grab cursor when hovering over draggable points
- Provide visual feedback during drag operations
- Update point coordinates in real-time during drag
- Maintain constraint relationships during point movement
- Add snapping functionality for precise placement

**Estimated Effort:** Large (8-12 hours)

---

#### **US-004: Improved Zoom and Pan Controls**
**As a** user
**I want** intuitive zoom and pan controls
**So that** I can navigate images efficiently without erratic behavior

**Acceptance Criteria:**
- Replace problematic scroll-to-zoom with zoom slider
- Implement pan mode with keyboard modifier (Space+drag)
- Add zoom-to-fit and zoom-to-selection buttons
- Provide zoom level indicator
- Smooth zoom animations
- Keyboard shortcuts for zoom in/out (+/- keys)

**Estimated Effort:** Large (8-12 hours)

---

### Epic: Workflow Optimization

#### **US-005: Remove Placement Confirmation Dialog**
**As a** user
**I want** to place world points without confirmation dialogs
**So that** my workflow isn't interrupted by unnecessary prompts

**Acceptance Criteria:**
- Remove automatic placement confirmation dialog
- Keep "Place Latest" button but hide when point already placed
- Provide clear visual feedback for placement mode
- Allow ESC key to cancel placement mode

**Estimated Effort:** Small (1-2 hours)

---

#### **US-006: Fix Constraint Selection**
**As a** user
**I want** constraints to become available when I select appropriate points
**So that** I can create geometric relationships between points

**Acceptance Criteria:**
- Debug point selection system
- Ensure constraints appear when 2+ points selected
- Verify constraint type detection logic
- Test cross-image constraint creation
- Provide clear feedback on constraint availability

**Estimated Effort:** Medium (4-6 hours)

---

### Epic: Project Management

#### **US-007: Project Template Selection Interface**
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

---

## Implementation Plan

### Phase 1: Critical UI Fixes (Estimated: 1-2 weeks)
1. **US-001**: Fix image selection indicator
2. **US-005**: Remove placement confirmation
3. **US-006**: Debug constraint selection
4. **US-002**: Improve thumbnail display

### Phase 2: Enhanced Navigation (Estimated: 2-3 weeks)
1. **US-004**: Implement new zoom/pan controls
2. **US-003**: Add drag & drop for world points

### Phase 3: Feature Completion (Estimated: 2-3 weeks)
1. **US-007**: Project template interface
2. Additional polish and testing

---

## Technical Investigation Needed

### 1. **Green "1" Indicator Debug**
- **File**: `ImageNavigationToolbar.tsx:227-231`
- **Investigation**: Check `selectedWorldPointIds` and counting logic
- **Verify**: World point selection state management

### 2. **Constraint Selection Debug**
- **File**: `useConstraints.ts` and related constraint logic
- **Investigation**: Point selection to constraint mapping
- **Verify**: Multi-point selection detection

### 3. **Zoom Implementation Assessment**
- **File**: `ImageViewer.tsx` (likely location)
- **Investigation**: Current zoom implementation causing issues
- **Design**: New zoom control architecture

---

## Priority Matrix

| Issue | Impact | Effort | Priority |
|-------|---------|---------|----------|
| Image selection indicator | High | Low | **High** |
| Constraint selection broken | High | Medium | **High** |
| Placement confirmation | Medium | Low | **High** |
| Thumbnail display | Medium | Medium | **Medium** |
| Zoom functionality | High | High | **Medium** |
| Drag & drop WP | High | High | **Medium** |
| Project templates | Medium | High | **Low** |

---

## Testing Strategy

### Before Implementation
1. Document current zoom behavior (screen recording)
2. Test constraint selection with various point combinations
3. Verify world point counting logic

### During Implementation
1. Test each fix in isolation
2. Verify no regressions in existing functionality
3. Test cross-image workflows

### After Implementation
1. User acceptance testing on all reported issues
2. Performance testing for drag & drop operations
3. Responsive design testing for thumbnails