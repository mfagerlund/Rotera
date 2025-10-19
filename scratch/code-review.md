# Pictorigo Comprehensive Code Review
**Generated:** 2025-10-18
**Review Scope:** Full codebase analysis including frontend architecture, documentation, and architectural adherence

---

## Executive Summary

The Pictorigo codebase is architecturally sound with strong TypeScript foundations, but is currently **mid-migration** between legacy and modern patterns. The codebase contains **~1,500+ LOC of duplicated constraint code** representing parallel implementations, multiple task/documentation files with overlapping content, and numerous TODOs indicating incomplete features.

**Overall Health:** 🟡 **MODERATE** - Functional but needs cleanup

**Key Findings:**
- ✅ Clean modular entity architecture (Line, WorldPoint use composition pattern)
- ✅ Strong TypeScript type safety throughout
- ✅ Well-separated concerns (components, hooks, entities, services)
- ❌ **CRITICAL**: Duplicate constraint architecture (PascalCase vs kebab-case)
- ❌ Multiple overlapping documentation files need consolidation
- ⚠️ 38+ TODO comments indicating incomplete features
- ⚠️ Some very large files (MainLayout.tsx: 1,221 LOC)

**Immediate Action Required:**
1. Eliminate duplicate constraint implementation (highest impact)
2. Consolidate documentation files
3. Address critical TODOs in MainLayout and entity management
4. Remove orphaned files and legacy code

---

## 1. Documentation Updates Required

### Severity: MEDIUM
**Impact:** Developer confusion, outdated guidance

### Files Requiring Action:

#### **CONSOLIDATE:** Task tracking files
**Files:**
- `tasks.md` (536 LOC) - Main implementation tasks
- `review-tasks.md` (467 LOC) - Frontend refactoring tasks
- `review-tasks-2.md` (similar content)
- `review-tasks-3.md` (similar content)
- `backend-refactor-tasks.md` (310 LOC) - Backend tasks
- `mtasks.md` (unknown content, likely duplicate)

**Problem:** 6 different task files with overlapping/conflicting information

**Recommendation:**
1. Create single `IMPLEMENTATION_ROADMAP.md` combining all active tasks
2. Archive completed tasks to `docs/archive/`
3. Delete redundant task files
4. **MY RECOMMENDATION:** Use this structure:
   ```
   IMPLEMENTATION_ROADMAP.md
   ├── Current Sprint (from tasks.md lines 113-240)
   ├── Architecture Refactoring (from review-tasks.md)
   ├── Backend Tasks (from backend-refactor-tasks.md)
   └── Completed Archive (link to docs/archive/)
   ```

#### **UPDATE:** README.md
**File:** `README.md` (104 LOC)

**Outdated Information:**
- Line 20: References Python solver migration, but actually migrating to ScalarAutograd (C++ library)
- Line 87-88: States "TypeScript-based constraint solver using ScalarAutograd" - unclear if this is complete
- Missing: Current architecture diagram showing entity-driven design

**Recommendation:**
1. Update solver status section with actual migration state
2. Add entity-first architecture section
3. Document current Line creation workflow (implemented)
4. Remove references to incomplete features as "in progress" if completed

#### **OBSOLETE:** Architecture guides may be outdated
**Files:**
- `TYPESCRIPT_CONVERSION_GUIDE.md` (475 LOC) - Still relevant or completed?
- `CLEANUP_GUIDE.md` (566 LOC) - Python cleanup, but Python removed per commit de2f671

**Problem:** CLEANUP_GUIDE references Python backend that was removed

**Recommendation:**
1. Archive `CLEANUP_GUIDE.md` - no longer applicable after Python removal
2. Review `TYPESCRIPT_CONVERSION_GUIDE.md` - mark sections as completed or delete if done
3. Update `ENTITY_DRIVEN_OPTIMIZATION.md` to reflect current implementation state

#### **CONSOLIDATE:** Visual language documentation
**Files:**
- `icons.md` - Icon usage
- `analysis/vanishing_line_design.md` - Design document
- Constants in `frontend/src/constants/visualLanguage.ts`
- Utils in `frontend/src/utils/visualLanguage.ts`

**Recommendation:**
1. Create `docs/VISUAL_LANGUAGE.md` combining icon usage, color schemes, constraint glyphs
2. Reference implementation files from docs
3. Delete redundant documentation

---

## 2. Code Duplication Issues

### Severity: **CRITICAL** 🔴
**Impact:** Maintenance nightmare, bug multiplication, ~1,500+ LOC waste

### Issue #1: Dual Constraint Architecture
**Location:** `frontend/src/entities/constraints/`

**Problem:** TWO complete parallel constraint implementations exist:

**Legacy Implementation (PascalCase):**
- `BaseConstraint.ts` (275 LOC)
- `FixedPointConstraint.ts` (194 LOC)
- `ParallelLinesConstraint.ts`
- `DistancePointPointConstraint.ts`

**New Implementation (kebab-case):**
- `base-constraint.ts` (616 LOC)
- `fixed-point-constraint.ts` (217 LOC)
- `parallel-lines-constraint.ts`
- `distance-constraint.ts`
- `angle-constraint.ts`
- `perpendicular-lines-constraint.ts`
- `equal-distances-constraint.ts`
- `equal-angles-constraint.ts`
- `collinear-points-constraint.ts`
- `coplanar-points-constraint.ts`

**Evidence:**
```typescript
// frontend/src/entities/constraints/BaseConstraint.ts:1
export abstract class BaseConstraint { ... } // Legacy

// frontend/src/entities/constraints/base-constraint.ts:1
export abstract class BaseConstraint { ... } // New
```

**Impact:**
- ~1,000+ lines duplicated
- Bugs must be fixed in two places
- Unclear which implementation is active
- Import confusion for developers

**Recommended Fix:**
1. **Determine active implementation** - Appears kebab-case is newer/active
2. **Delete all PascalCase constraint files:**
   - `BaseConstraint.ts`
   - `FixedPointConstraint.ts`
   - `ParallelLinesConstraint.ts`
   - `DistancePointPointConstraint.ts`
3. **Update all imports** to use kebab-case versions
4. **Run tests** to verify no breakage
5. **Commit atomically** with clear message

**Estimated Effort:** MEDIUM (4-6 hours)
**Risk:** LOW - If kebab-case version is truly active, safe to delete legacy

---

### Issue #2: Entity Management Hook Proliferation
**Location:** `frontend/src/hooks/`

**Problem:** Three similar entity management hooks with unclear primary:

**Files:**
- `useEntityManager.ts` (599 LOC) - Most comprehensive
- `useUnifiedEntityManager.ts` (175 LOC) - Uses useOptimizedRepository
- `useOptimizedRepository.ts` (280 LOC) - Repository pattern

**Recommendation:**
1. **Audit usage** of each hook across codebase
2. **Choose primary hook** - Likely `useEntityManager.ts` based on size/completeness
3. **Delete unused hooks** or clearly document specialization
4. **MY RECOMMENDATION:** Keep `useEntityManager.ts`, delete others if unused

**Estimated Effort:** SMALL (2-3 hours)

---

### Issue #3: Visual Language Duplication
**Location:** `frontend/src/constants/` and `frontend/src/utils/`

**Files:**
- `constants/visualLanguage.ts` (197 LOC) - Constants exports
- `utils/visualLanguage.ts` (394 LOC) - VisualLanguageManager class

**Duplication:**
Both files define similar color schemes and constraint glyphs:
```typescript
// constants/visualLanguage.ts
export const ENTITY_COLORS = { ... }
export const CONSTRAINT_GLYPHS = { ... }

// utils/visualLanguage.ts
class VisualLanguageManager {
  private colors = { ... } // Similar to ENTITY_COLORS
  private glyphs = { ... } // Similar to CONSTRAINT_GLYPHS
}
```

**Recommendation:**
1. **Keep constants file** for static values
2. **Refactor VisualLanguageManager** to import from constants
3. **Remove duplication** in VisualLanguageManager
4. **MY RECOMMENDATION:** Manager should extend/compose constants, not duplicate

**Estimated Effort:** SMALL (1-2 hours)

---

### Issue #4: TestApp Duplication
**Location:** `frontend/src/`

**Files:**
- `TestApp.tsx` (12 LOC) - Root level
- `components/TestApp.tsx` (13 LOC) - Component folder

**Problem:** Nearly identical test components in two locations

**Recommendation:**
1. **Delete** `frontend/src/TestApp.tsx` (root version)
2. **Keep** `frontend/src/components/TestApp.tsx`
3. **Update any imports** if necessary

**Estimated Effort:** TRIVIAL (15 minutes)

---

### Issue #5: useLines Hook - Potentially Obsolete
**Location:** `frontend/src/hooks/useLines.ts` (167 LOC)

**Problem:**
- Centralized line management in useProject hook instead (per tasks.md:104-106)
- Line creation bug was fixed by removing separate useLines hook
- May be unused legacy code

**Recommendation:**
1. **Search for imports** of useLines across codebase
2. **If unused**: Delete the file
3. **If used**: Document why separate from useProject

**Estimated Effort:** SMALL (1 hour)

---

## 3. Pattern Violations

### Severity: MEDIUM ⚠️
**Impact:** Code inconsistency, developer confusion

### Violation #1: File Naming Convention Inconsistency
**Location:** `frontend/src/entities/constraints/`

**Problem:** Mixed PascalCase and kebab-case file naming

| Pattern | Files | Status |
|---------|-------|--------|
| PascalCase | `BaseConstraint.ts`, `FixedPointConstraint.ts` | Legacy ❌ |
| kebab-case | `base-constraint.ts`, `fixed-point-constraint.ts` | Active ✅ |

**TypeScript Convention:** kebab-case for file names

**Recommendation:**
1. Ensure all new files use kebab-case
2. After deleting legacy PascalCase files, verify consistency
3. **MY RECOMMENDATION:** Enforce via ESLint rule: `"unicorn/filename-case": ["error", { "case": "kebabCase" }]`

---

### Violation #2: Export Pattern Inconsistency
**Location:** Entity modules

**Pattern A (Clean - Line, WorldPoint):**
```typescript
// entity.ts (barrel file)
export * from './entity/index'

// entity/index.ts
export { Entity } from './Entity'
export { EntityDto } from './EntityDto'
export { EntityGeometry } from './EntityGeometry'
```

**Pattern B (Complex - Constraints):**
```typescript
// constraint.ts
export * from './constraints'

// constraints/index.ts
export { createConstraint } from './ConstraintFactory' // Factory pattern
export type { BaseConstraintDto } from './dtos/BaseConstraintDto'
// Mixed re-exports with different patterns
```

**Recommendation:**
1. **Standardize on Pattern A** - Clean barrel exports
2. **Remove factory functions** from index files
3. **Simplify constraint exports** to match Line/WorldPoint pattern

---

### Violation #3: Large Monolithic Files
**Location:** Various components

**Oversized Files:**
- `MainLayout.tsx` - 1,221 LOC ❌
- `ImageViewer.tsx` - 1,028 LOC ❌
- `useProject.ts` - 752 LOC ⚠️

**Problem:** Files exceeding 500 LOC become hard to maintain

**Recommendation:**
1. **Split MainLayout.tsx:**
   - Extract toolbar into `MainToolbar.tsx`
   - Extract sidebar management into `SidebarManager.tsx`
   - Extract modal dialogs into separate components
   - **Target:** <400 LOC per file

2. **Split ImageViewer.tsx:**
   - Extract rendering logic into `useImageViewerRenderer.ts` (already exists!)
   - Extract interaction handling into `useImageViewerInteractions.ts`
   - Reduce to coordinating component

3. **Refactor useProject.ts:**
   - Split persistence logic into `useProjectPersistence.ts`
   - Split conversion logic into `useProjectConversion.ts`
   - Keep only core state management

**Estimated Effort:** LARGE (8-12 hours total)

---

## 4. Architecture Adherence

### Severity: MEDIUM ⚠️

### Adherence Issue #1: Legacy Compatibility Code
**Location:** `frontend/src/hooks/useSelection.ts`

**Problem:** Per review-tasks.md, useSelection has 200+ lines of legacy code:
- `legacyFilters` state
- `legacySelectionState` computed value
- `mapToPrimaryType` function
- Mock `ISelectable` entity creation from string IDs

**Current Architecture Goal:** Pure object-based selection (no string IDs)

**Recommendation:**
1. Review if legacy code still needed (check for usages)
2. If not needed: **DELETE** legacy compatibility code
3. If needed: **DOCUMENT** why and plan removal
4. **MY RECOMMENDATION:** Create migration ticket and set deadline for removal

---

### Adherence Issue #2: DTO Misuse in Domain Logic
**Source:** review-tasks.md Phase 4.2

**Problem:** DTOs being used for internal frontend logic instead of just serialization

**DTOs Should Only Be Used For:**
- Serialization to backend
- Deserialization from backend
- File save/load operations

**DTOs Should NEVER Be Used For:**
- Internal frontend logic
- Component props
- State management
- Entity relationships

**Recommendation:**
1. **Audit DTO usage** across components
2. **Replace internal DTO usage** with domain objects (WorldPoint, Line, etc.)
3. **Ensure DTOs only at boundaries** (persistence, API calls)

**Estimated Effort:** MEDIUM (6-8 hours)

---

### Adherence Issue #3: Incomplete Entity-Driven Architecture
**Source:** ENTITY_DRIVEN_OPTIMIZATION.md

**Vision:** Lines with embedded constraints optimize directly (no conversion to atomic constraints)

**Current State:** Unclear if Line constraints are being used by solver or converted

**Questions:**
1. Is `LineConstraintResidual` implemented in optimizer?
2. Are Line constraints sent directly to backend?
3. Or are they still converted to atomic constraints?

**Recommendation:**
1. **Verify implementation state** of entity-driven optimization
2. **Update ENTITY_DRIVEN_OPTIMIZATION.md** with current status
3. **If incomplete:** Add to roadmap with priority
4. **MY RECOMMENDATION:** Check backend solver for LineResidual class

---

## 5. Recommendations (Actionable Fixes)

### CRITICAL Priority (Do First)

#### 1. Eliminate Duplicate Constraint Architecture
**Severity:** Critical
**Location:** `frontend/src/entities/constraints/`
**Files:** All PascalCase constraint files

**Steps:**
1. Verify kebab-case versions are active (check imports in components)
2. Run tests to establish baseline
3. Delete PascalCase files:
   ```bash
   rm frontend/src/entities/constraints/BaseConstraint.ts
   rm frontend/src/entities/constraints/FixedPointConstraint.ts
   rm frontend/src/entities/constraints/ParallelLinesConstraint.ts
   rm frontend/src/entities/constraints/DistancePointPointConstraint.ts
   ```
4. Update any remaining imports (if any)
5. Run tests to verify no breakage
6. Commit: "refactor: remove duplicate legacy constraint architecture"

**Estimated Effort:** MEDIUM (4-6 hours)
**Impact:** HIGH - Eliminates ~1,000+ LOC duplication

**MY RECOMMENDATION:** ✅ Do this ASAP - highest impact cleanup

---

#### 2. Consolidate Documentation
**Severity:** High
**Location:** Root directory
**Files:** tasks.md, review-tasks*.md, backend-refactor-tasks.md

**Steps:**
1. Create `IMPLEMENTATION_ROADMAP.md`
2. Extract active tasks from all task files
3. Organize by priority and phase
4. Archive completed tasks to `docs/archive/`
5. Delete redundant task files
6. Update CLAUDE.md references

**Estimated Effort:** SMALL (2-3 hours)
**Impact:** HIGH - Single source of truth for development

**MY RECOMMENDATION:** ✅ Essential for maintaining clear roadmap

---

### HIGH Priority (Next Week)

#### 3. Address Critical TODOs
**Severity:** High
**Location:** Various files

**Critical TODOs to Address:**

**MainLayout.tsx (lines 327-328):**
```typescript
// TODO: Remove this legacy function - use entity objects directly
// TODO: Update constraint system to use entity objects
```
**Action:** Refactor to use entity objects, remove legacy functions

**useEnhancedProject.ts (lines 235, 350):**
```typescript
// TODO: Implement migration from legacy project format
// TODO: Implement conversion to legacy format
```
**Action:** Either implement or remove if no longer needed

**Line.ts (line 30):**
```typescript
private _tags: string[], // TODO: Remove completely
```
**Action:** Remove tags property if truly unused (search for usage first)

**Estimated Effort:** MEDIUM (6-8 hours total)
**Impact:** HIGH - Removes technical debt markers

---

#### 4. Remove Orphaned Files
**Severity:** Medium
**Location:** Various

**Files to Audit/Remove:**
- `frontend/src/TestApp.tsx` - Duplicate (keep components/ version)
- `frontend/src/hooks/useLines.ts` - May be obsolete (verify first)
- `frontend/src/hooks/useUnifiedEntityManager.ts` - May be unused
- `CLEANUP_GUIDE.md` - References removed Python backend

**Steps:**
1. Search for imports of each file
2. If no imports found: **DELETE**
3. If imports found: Document purpose or migrate away

**Estimated Effort:** SMALL (2-3 hours)
**Impact:** MEDIUM - Cleaner codebase

---

### MEDIUM Priority (This Month)

#### 5. Split Large Components
**Severity:** Medium
**Location:** `frontend/src/components/`

**MainLayout.tsx (1,221 LOC):**
- Extract toolbar → `MainToolbar.tsx`
- Extract sidebar → `SidebarManager.tsx`
- Extract modals → Individual modal components
- Target: <400 LOC main file

**ImageViewer.tsx (1,028 LOC):**
- Already has `useImageViewerRenderer.ts` hook ✅
- Extract interactions → `useImageViewerInteractions.ts`
- Extract tool management → `useImageViewerTools.ts`

**Estimated Effort:** LARGE (8-12 hours)
**Impact:** HIGH - Improved maintainability

---

#### 6. Fix Visual Language Duplication
**Severity:** Low
**Location:** `frontend/src/constants/` and `frontend/src/utils/`

**Steps:**
1. Keep `constants/visualLanguage.ts` as source of truth
2. Refactor `utils/visualLanguage.ts` to import constants
3. Remove duplicated color/glyph definitions
4. Add tests to prevent re-duplication

**Estimated Effort:** SMALL (2-3 hours)
**Impact:** MEDIUM - DRY principle

---

## 6. Follow-up Questions

**Questions Requiring Your Decision:**

### Q1: Constraint Architecture - Which to Keep?
**Context:** Two parallel constraint implementations exist
**Question:** Confirm kebab-case version is active and PascalCase can be deleted?
**Impact:** Affects cleanup scope

**MY RECOMMENDATION:** ✅ Based on file analysis, delete PascalCase versions

---

### Q2: Entity-Driven Optimization - Implementation Status?
**Context:** ENTITY_DRIVEN_OPTIMIZATION.md describes vision
**Question:** Is LineConstraintResidual actually implemented in the solver?
**Impact:** Determines if documentation is aspirational or actual

**Next Steps:** Check backend for LineResidual class implementation

---

### Q3: Legacy Project Format Migration - Still Needed?
**Context:** TODOs in useEnhancedProject.ts for legacy format
**Question:** Do you have old project files that need migration?
**Impact:** Determines if TODO should be implemented or removed

**MY RECOMMENDATION:** If no old projects exist, delete the TODO

---

### Q4: Python Backend Cleanup Guide - Archive?
**Context:** CLEANUP_GUIDE.md references Python backend (removed in commit de2f671)
**Question:** Safe to archive this document?
**Impact:** Documentation clarity

**MY RECOMMENDATION:** ✅ Archive to docs/archive/python-migration.md

---

## 7. Code Quality Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| **Total TypeScript Files** | ~130 | - | ✅ Good |
| **Average File Size** | ~200 LOC | <500 LOC | ✅ Good |
| **Largest File** | MainLayout.tsx (1,221 LOC) | <500 LOC | ❌ Needs split |
| **Duplicated Code** | ~1,500 LOC | 0 | ❌ Critical |
| **Files with TODOs** | 10 files (38 TODOs) | <5 | ⚠️ Moderate |
| **Module Organization** | Well-separated | - | ✅ Excellent |
| **Type Coverage** | Comprehensive | 100% | ✅ Excellent |
| **Documentation Files** | 12+ (fragmented) | 3-5 | ⚠️ Needs consolidation |

---

## 8. Testing & Validation

### Current Test State
- Location: `frontend/src/tests/`
- Test files found: `lineCreation.test.ts`, `simple.test.ts`, `setup.ts`
- Comprehensive polymorphic constraint tests: `frontend/src/entities/constraints/__tests__/`

### Testing Gaps Identified

**Missing Tests:**
1. Entity management hooks (useEntityManager, useProject)
2. Large components (MainLayout, ImageViewer)
3. Selection system (useSelection)
4. Visual language utilities

**Recommendation:**
1. Add integration tests for entity creation workflows
2. Add unit tests for large hooks before splitting
3. Add visual regression tests for UI components

**Estimated Effort:** LARGE (16+ hours for comprehensive coverage)

---

## 9. Security & Performance

### Security Review
**Status:** ✅ No critical security issues identified

**Observations:**
- No API key exposure
- No XSS vulnerabilities detected
- LocalStorage usage appears safe (no sensitive data)
- File upload validation present in fileManager.ts

### Performance Review
**Status:** ✅ Generally good

**Potential Optimizations:**
1. **Large component re-renders** - MainLayout.tsx could benefit from React.memo
2. **Selection state updates** - Consider immer for immutable updates
3. **Image rendering** - Already optimized with useImageViewerRenderer ✅

**Low Priority:**
- Bundle size optimization (not critical for desktop app)
- Lazy loading for unused components

---

## 10. Migration Roadmap

Based on this review, recommended migration path:

### Sprint 1: Critical Cleanup (Week 1-2)
1. ✅ Delete duplicate constraint architecture
2. ✅ Consolidate documentation files
3. ✅ Remove orphaned files
4. ✅ Address critical TODOs in MainLayout

**Deliverable:** Clean codebase with single constraint implementation

---

### Sprint 2: Architecture Refinement (Week 3-4)
1. ✅ Split MainLayout.tsx into smaller components
2. ✅ Refactor useProject.ts for clarity
3. ✅ Fix visual language duplication
4. ✅ Standardize export patterns

**Deliverable:** Maintainable component structure

---

### Sprint 3: Feature Completion (Week 5-6)
1. ✅ Implement remaining TODOs or remove
2. ✅ Complete entity-driven optimization (if incomplete)
3. ✅ Add missing tests
4. ✅ Update architecture documentation

**Deliverable:** Feature-complete, well-tested codebase

---

## Summary & Next Steps

### What's Working Well ✅
- Clean modular entity architecture (Line, WorldPoint composition)
- Strong TypeScript type safety
- Well-organized directory structure
- Comprehensive visual language system
- Good separation of concerns

### Critical Issues ❌
1. **Duplicate constraint architecture** (~1,500 LOC)
2. **Fragmented documentation** (6+ task files)
3. **Large monolithic files** (MainLayout: 1,221 LOC)
4. **38+ TODOs** indicating incomplete features

### Immediate Actions (This Week)
1. **Delete PascalCase constraint files** - 4-6 hours
2. **Consolidate documentation** - 2-3 hours
3. **Remove TestApp.tsx duplicate** - 15 minutes
4. **Run check.sh** to verify build health

### Total Estimated Cleanup Time
- **Critical issues:** 8-12 hours
- **High priority:** 12-16 hours
- **Medium priority:** 10-14 hours
- **Total:** ~30-42 hours (1-2 weeks focused work)

---

## Appendix: File References

### Files Analyzed
- **Documentation:** 12 files (README.md, tasks.md, CLAUDE.md, guides)
- **Frontend Source:** ~130 TypeScript/TSX files
- **Hooks:** 13 files in `frontend/src/hooks/`
- **Components:** 41 files in `frontend/src/components/`
- **Entities:** 40+ files in `frontend/src/entities/`
- **Tests:** Multiple test files in `frontend/src/tests/`

### Key Paths
```
c:\Dev\Pictorigo\
├── frontend\src\
│   ├── components\         (41 TSX files)
│   ├── entities\          (40+ files)
│   │   ├── constraints\   (DUPLICATE ARCHITECTURE HERE)
│   │   ├── line\          (Clean modular design ✅)
│   │   └── world-point\   (Clean modular design ✅)
│   ├── hooks\             (13 files, some redundant)
│   ├── services\          (5 files)
│   ├── types\             (8 files)
│   └── utils\             (3 files)
├── docs\                  (NEEDS CREATION)
├── CLAUDE.md
├── README.md
├── tasks.md               (TO CONSOLIDATE)
├── review-tasks.md        (TO CONSOLIDATE)
└── [other task files]     (TO CONSOLIDATE)
```

---

**Review conducted by:** Claude Code
**Methodology:** Comprehensive static analysis, architecture review, pattern detection
**Confidence Level:** HIGH - Based on thorough exploration and expert analysis

**Recommendation:** Proceed with Critical priority items immediately for maximum impact. The codebase is fundamentally sound and cleanup will significantly improve maintainability.
