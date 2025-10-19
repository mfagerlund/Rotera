# Pictorigo Implementation Roadmap

**Last Updated:** 2025-10-18
**Status:** Active Development - Core frontend functional, solver using ScalarAutograd

---

## Core Philosophy

**"Entity-first, constraint-on-selection"** - Users create simple geometric primitives (points, lines, planes), then apply constraints contextually based on their selection. The UI always clearly shows what's driven vs free.

**Constraint Architecture:**
- **Intrinsic Constraints**: Embedded within geometric entities (e.g., line direction, target length)
- **Extrinsic Constraints**: Relationships between entities (e.g., distance between points, parallel lines)

---

## ✅ COMPLETED IMPLEMENTATION

### Phase 1-4: Foundation & Core Workflow (COMPLETE)
- ✅ Data models, workspace separation, visual language
- ✅ Selection system and creation tools
- ✅ Context-sensitive constraint palette
- ✅ Image-World integration with workspace switching
- ✅ Line creation workflow (Fusion 360 style with slot-based panel)
- ✅ Point creation workflow with explicit tool activation
- ✅ Live construction preview
- ✅ Data integrity rules (unique line constraint, cascading deletion)
- ✅ Object counts footer
- ✅ Clean entity architecture (Line, WorldPoint use composition pattern)

### Recent Fixes (2025-10-18):
- ✅ Removed duplicate constraint architecture (~1,000 LOC cleanup)
- ✅ Deleted orphaned files (TestApp, obsolete hooks)
- ✅ Updated README with ScalarAutograd solver info
- ✅ Archived obsolete documentation (Python cleanup guides)

---

## 🎯 CURRENT SPRINT: Critical Fixes

### 1. Fix Visual Language Duplication
**Priority:** HIGH
**Files:**
- `frontend/src/constants/visualLanguage.ts` (197 LOC)
- `frontend/src/utils/visualLanguage.ts` (394 LOC)

**Issue:** Color schemes and constraint glyphs duplicated between constants and utils

**Action:**
- Keep `constants/visualLanguage.ts` as source of truth for static values
- Refactor `VisualLanguageManager` in `utils/visualLanguage.ts` to import from constants
- Remove duplicated definitions

**Estimated Effort:** 2-3 hours

---

### 2. Address Critical TODOs
**Priority:** HIGH

**MainLayout.tsx** (lines 327-328):
```typescript
// TODO: Remove this legacy function - use entity objects directly
// TODO: Update constraint system to use entity objects
```
**Action:** Refactor to use entity objects, remove legacy functions

**useEnhancedProject.ts** (lines 235, 350):
```typescript
// TODO: Implement migration from legacy project format
// TODO: Implement conversion to legacy format
```
**Action:** Either implement or remove if no longer needed

**Line.ts / WorldPoint.ts** (line 30):
```typescript
private _tags: string[], // TODO: Remove completely
```
**Action:** Remove tags property after verifying no usage


---

### 3. Remove Tags Property
**Priority:** MEDIUM

**Action:**
1. Search codebase for any actual usage of `tags` property
2. If unused, remove from Line and WorldPoint classes
3. Update DTOs to remove tags field
4. Update serialization/deserialization

**Estimated Effort:** 2-3 hours

---

## 🔄 NEXT IMPLEMENTATION PRIORITIES

### Phase 5: Line Interaction & Editing
**Status:** Partially Complete

#### 5.1 Line Click Detection
- [ ] Implement line hit testing in ImageViewer (2D)
- [ ] Implement line hit testing in WorldView (3D)
- [ ] Add hover states and visual feedback
- [ ] Wire up EditLineWindow to line clicks

#### 5.2 Remove WP from Specific Image
- [ ] Add `removeImagePointFromWorldPoint` function
- [ ] Update WorldPointPanel UI with "Remove from Image" button
- [ ] Handle edge cases (last image point, insufficient constraints)

#### 5.3 Construction Preview Cleanup
- [ ] Fix preview persisting after tool cancellation
- [ ] Improve preview state management
- [ ] Add explicit canvas clearing when preview is null

**Estimated Effort:** 8-12 hours

---

### Phase 6: Core Primitives
**Status:** Not Started

#### 6.1 Plane Primitive Implementation
- [ ] Method 1: 3 World Points (with non-collinear validation)
- [ ] Method 2: 2 Lines (with coplanar validation)
- [ ] Method 3: Line + World Point
- [ ] Plane creation panel with method selector
- [ ] Plane-local constraints (orientation, offset)

#### 6.2 Circle/Arc Primitive Implementation
- [ ] Method 1: Center + Radius
- [ ] Method 2: 3 Points (auto-calculate center/radius)
- [ ] Arc angle constraints

**Estimated Effort:** 12-16 hours

---

### Phase 7: Enhanced Constraint System
**Status:** Not Started

#### 7.1 Entity-Driven Optimization
**Goal:** Lines with embedded constraints optimize directly (no conversion to atomic constraints)

**Current State:** Unclear if fully implemented
**Questions:**
- Is `LineConstraintResidual` implemented in ScalarAutograd solver?
- Are Line constraints sent directly or converted to atomic constraints?

**Actions:**
- [ ] Verify implementation state
- [ ] Update ENTITY_DRIVEN_OPTIMIZATION.md with current status
- [ ] If incomplete: Implement LineResidual in solver

#### 7.2 Intrinsic vs Extrinsic Clarity
**Actions:**
- [ ] Document intrinsic constraint types (line direction, length, etc.)
- [ ] Document extrinsic constraint types (distance, angle, parallel, etc.)
- [ ] Update UI labels to make distinction clear
- [ ] Add tooltips explaining constraint categorization

**Estimated Effort:** 6-8 hours

---

### Phase 8: Large Component Refactoring
**Status:** Not Started

**Problem:** Some components are too large:
- `MainLayout.tsx` (1,221 LOC)
- `ImageViewer.tsx` (1,028 LOC)
- `useProject.ts` (752 LOC)

**Actions:**
- [ ] Split MainLayout into MainToolbar, SidebarManager, modal components
- [ ] Extract ImageViewer interactions into `useImageViewerInteractions.ts`
- [ ] Split useProject into useProjectPersistence and useProjectConversion

**Target:** <400 LOC per file

**Estimated Effort:** 10-14 hours

---

## 🧪 TESTING & VALIDATION

### Current Coverage
- ✅ Entity tests (Line, WorldPoint)
- ✅ Polymorphic constraint tests
- ✅ Line creation tests
- ⚠️ Missing: Hook tests (useEntityManager, useProject, useSelection)
- ⚠️ Missing: Large component tests (MainLayout, ImageViewer)

### Testing Gaps
- [ ] Add integration tests for entity creation workflows
- [ ] Add unit tests for large hooks before splitting
- [ ] Add visual regression tests for UI components
- [ ] Test frontend-solver integration with ScalarAutograd

**Estimated Effort:** 16+ hours

---

## 📦 SOLVER INTEGRATION (ScalarAutograd)

### Current State
- ✅ Frontend exports optimization DTOs
- ✅ ScalarAutograd (TypeScript) provides automatic differentiation
- ❓ Integration status unclear - need verification

### Required Actions
- [ ] Verify ScalarAutograd integration is working
- [ ] Document constraint → residual mapping
- [ ] Test optimization round-trips (frontend → solver → frontend)
- [ ] Ensure intrinsic constraints are properly handled
- [ ] Performance benchmarking with realistic projects

**Estimated Effort:** 8-12 hours

---

## 🚫 FORBIDDEN PATTERNS

**Do NOT introduce:**
- ❌ String-based entity lookups (`entities.find(e => e.id === id)`)
- ❌ Legacy compatibility code without clear removal plan
- ❌ Repository pattern with manual object resolution
- ❌ DTOs for internal frontend logic (only for serialization boundaries)
- ❌ `any` types - use proper TypeScript classes
- ❌ Duplicate implementations of the same functionality
- ❌ File naming inconsistency (use kebab-case for .ts files)

---

## 📊 PRIORITY ORDER

1. **CRITICAL**: Fix visual language duplication (DRY principle)
2. **CRITICAL**: Address TODOs in MainLayout and entity management
3. **HIGH**: Clarify intrinsic vs extrinsic constraints
4. **HIGH**: Verify ScalarAutograd integration
5. **MEDIUM**: Remove tags property
6. **MEDIUM**: Implement line interaction (Phase 5)
7. **MEDIUM**: Split large components (Phase 8)
8. **LOW**: Implement plane primitives (Phase 6)
9. **LOW**: Comprehensive testing coverage

---

## 📁 RECENT CLEANUP (2025-10-18)

**Deleted:**
- 5 duplicate PascalCase constraint files (~600 LOC)
- `frontend/src/TestApp.tsx` (duplicate)
- `frontend/src/hooks/useUnifiedEntityManager.ts` (unused)
- `frontend/src/hooks/useOptimizedRepository.ts` (unused)
- `frontend/src/MIGRATION_GUIDE.md` (obsolete)

**Archived:**
- `CLEANUP_GUIDE.md` → `docs/archive/python-cleanup-guide.md`
- `TYPESCRIPT_CONVERSION_GUIDE.md` → `docs/archive/typescript-conversion-guide.md`

**Updated:**
- `README.md` - Correct solver information (ScalarAutograd)

**Total Cleanup:** ~1,500 LOC removed, multiple obsolete files archived

---

## 🎯 SUCCESS METRICS

**Code Quality:**
- [x] No duplicate constraint implementations
- [x] Single source of truth documentation
- [ ] All files <500 LOC
- [ ] Zero TODOs for core features
- [ ] Full TypeScript type safety (no `any`)

**Functionality:**
- [x] Entity creation workflows work
- [x] Selection system functional
- [ ] Constraint system integrated with solver
- [ ] Line/plane interaction complete
- [ ] Comprehensive test coverage

**Architecture:**
- [x] Clean modular entity design
- [x] Proper separation of concerns
- [ ] Clear intrinsic/extrinsic constraint distinction
- [ ] ScalarAutograd integration verified
- [ ] Documentation matches implementation

---

## 📖 DOCUMENTATION STRUCTURE

**Primary Docs:**
- `README.md` - Project overview and quick start
- `CLAUDE.md` - Claude-specific instructions
- `IMPLEMENTATION_ROADMAP.md` (this file) - Development roadmap
- `ENTITY_DRIVEN_OPTIMIZATION.md` - Constraint architecture details

**Reference:**
- `milestones/M9_plan.md` - Milestone planning
- `analysis/vanishing_line_design.md` - Design analysis
- `icons.md` - Icon usage
- `agents.md` - Agent system documentation

**Archived:**
- `docs/archive/python-cleanup-guide.md` - Historical (Python removal)
- `docs/archive/typescript-conversion-guide.md` - Historical (TS conversion)

---

**Next Session Priority:** Fix visual language duplication, then address critical MainLayout TODOs
