# Backend Cleanup & Consolidation Guide

## Current Situation Analysis

### **The Problem: Two Parallel Worlds** 🌍🌍

You have **two separate `pictorigo` packages** with overlapping but different responsibilities:

```
📦 Project Root
├── backend/
│   ├── pictorigo/            ❌ LEGACY - Backend DTOs (fat models)
│   │   └── core/models/
│   │       ├── entities.py   # 250 LOC - Frontend-matching DTOs
│   │       ├── constraints.py
│   │       └── project.py
│   ├── routers/              ✅ KEEP - FastAPI routes
│   └── tests/                ❌ ORPHANED - 11 test files
│
└── pictorigo/                ✅ CANONICAL - Core optimization
    └── core/
        ├── models/           # 155 LOC - Lean optimization models
        ├── optimization/     # Factor graphs, residuals
        ├── solver/           # SciPy solver wrapper
        ├── math/             # Camera, SE3, quaternions
        └── initialization/   # PnP, incremental
```

**The Confusion:**
- Backend routers import from **root `pictorigo`** (correct!)
- Backend has its own `backend/pictorigo` (unused legacy!)
- Tests split across two locations (3 root, 11 backend)
- Duplicate model files with different fields

---

## What's Happening

### Backend Routers Already Use Root Pictorigo! ✅

```python
# backend/routers/solve.py
from pictorigo.core.optimization.problem import OptimizationProblem  # ✅ Root!
from pictorigo.core.solver.scipy_solver import SciPySolver           # ✅ Root!
from pictorigo.core.models.project import SolveResult                # ✅ Root!
```

**Conclusion:** The backend API is **already correctly using** the canonical root `pictorigo` package!

### Backend's Own `pictorigo/` is Legacy Dead Code ☠️

```python
# Nothing imports from backend.pictorigo!
# The backend/pictorigo/ directory is:
# - Not imported by routers
# - Not used by the optimization code
# - Just sitting there confusing everyone
```

---

## The Cleanup Plan

### **Phase 1: Delete Dead Code** (5 minutes)

**Remove entirely:**
```bash
rm -rf backend/pictorigo/
```

**Why safe:**
1. ✅ Backend routers already import from root `pictorigo`
2. ✅ Nothing imports from `backend.pictorigo`
3. ✅ Models in root are canonical
4. ✅ Tests we created use root models

**What you lose:**
- Nothing! It's all duplicated in root with better design

---

### **Phase 2: Consolidate Tests** (30 minutes)

#### Current State:
```
backend/tests/          # 11 files - LEGACY
├── core/
│   ├── models/
│   │   ├── test_constraints.py
│   │   ├── test_entities.py
│   │   └── test_project.py
│   └── test_camera.py
├── test_api.py
└── ...

tests/                  # 3 files - NEW & CORRECT
└── integration/
    └── test_optimization_convergence.py  # ✅ Works!
```

#### Target State:
```
tests/
├── unit/                     # Fast isolated tests
│   ├── test_entities.py      # Migrate from backend/tests
│   ├── test_constraints.py   # Migrate from backend/tests
│   ├── test_camera.py        # Migrate from backend/tests
│   ├── test_factor_graph.py
│   └── test_residuals.py
│
├── integration/              # End-to-end tests
│   ├── test_optimization_convergence.py  # ✅ Already done!
│   └── test_incremental_solver.py
│
└── api/                      # Backend API tests
    ├── test_solve_endpoint.py     # Migrate from backend/tests
    ├── test_projects_endpoint.py  # Migrate from backend/tests
    └── test_synthetic_endpoint.py
```

**Migration Steps:**

1. **Move API tests to `tests/api/`**
   ```bash
   mkdir -p tests/api
   mv backend/tests/test_api.py tests/api/test_solve_endpoint.py
   # Update imports: backend.pictorigo → pictorigo
   ```

2. **Move unit tests to `tests/unit/`**
   ```bash
   mkdir -p tests/unit
   mv backend/tests/core/models/test_*.py tests/unit/
   mv backend/tests/core/test_*.py tests/unit/
   # Update imports: backend.pictorigo → pictorigo
   ```

3. **Update test imports**
   ```python
   # OLD (backend tests)
   from backend.pictorigo.core.models.entities import WorldPoint

   # NEW (root tests)
   from pictorigo.core.models.entities import WorldPoint
   ```

4. **Delete backend tests directory**
   ```bash
   rm -rf backend/tests/
   ```

---

### **Phase 3: Update Backend Structure** (15 minutes)

#### Before:
```
backend/
├── pictorigo/        ❌ DELETE
├── routers/          ✅ KEEP
├── main.py
└── tests/            ❌ DELETE
```

#### After:
```
backend/
├── routers/          ✅ API endpoints
│   ├── solve.py
│   ├── projects.py
│   └── synthetic.py
├── main.py           ✅ FastAPI app
├── config.py         ✅ Configuration
└── README.md         📝 NEW - Backend API docs
```

**Create backend README:**
```markdown
# Pictorigo Backend API

FastAPI server for Pictorigo optimization.

## Structure

- `routers/` - API endpoints
- `main.py` - FastAPI application

## Dependencies

Uses the root `pictorigo` package for all optimization logic.

## Running

\`\`\`bash
cd backend
uvicorn main:app --reload
\`\`\`
```

---

### **Phase 4: Clean Up Root Package** (30 minutes)

#### Issues to Fix:

1. **Remove unused test/synthetic code from package**
   ```bash
   # Move to separate test utilities
   mv pictorigo/core/synthetic/ tests/utils/synthetic_scenes/
   ```

2. **Organize exports clearly**
   ```python
   # pictorigo/__init__.py
   """Pictorigo - Photogrammetry optimization library."""

   __version__ = "0.1.0"

   # Core models
   from .core.models.entities import WorldPoint, Camera, Image
   from .core.models.project import Project, SolveResult
   from .core.models.constraints import (
       ImagePointConstraint,
       DistanceConstraint,
       # ... all constraints
   )

   # Optimization
   from .core.optimization.problem import OptimizationProblem
   from .core.solver.scipy_solver import SciPySolver, SolverOptions

   # Initialization
   from .core.initialization.incremental import IncrementalSolver

   __all__ = [
       "WorldPoint", "Camera", "Image",
       "Project", "SolveResult",
       "OptimizationProblem",
       "SciPySolver", "SolverOptions",
       "IncrementalSolver",
   ]
   ```

3. **Clean up camera models - ONE format only**

   **Decision needed:** Choose **optimization format** (cleaner):
   ```python
   # pictorigo/core/models/entities.py
   class Camera(BaseModel):
       """Camera with intrinsics and extrinsics."""
       id: str
       image_id: str
       K: List[float]  # [fx, fy, cx, cy, k1?, k2?]
       R: List[float]  # Axis-angle [rx, ry, rz]
       t: List[float]  # Translation [tx, ty, tz]
       lock_flags: Optional[CameraLockFlags] = None
   ```

   **Remove all converter code** - Frontend should export this format directly.

---

### **Phase 5: Update Frontend Export** (1 hour)

**Goal:** Frontend exports directly to root `pictorigo` format

1. **Update `frontend/src/types/optimization-export.ts`**
   ```typescript
   export interface CameraDto {
     id: string
     imageId: string
     intrinsics: {
       fx: number
       fy: number
       cx: number
       cy: number
       k1?: number
       k2?: number
     }
     extrinsics: {
       rotation: [number, number, number]    // axis-angle
       translation: [number, number, number]
     }
   }
   ```

2. **Remove old camera format** from backend DTOs

3. **Test data migration**
   ```bash
   # Re-export test fixture with new format
   # Update tests/fixtures/project1.json
   ```

---

## File-by-File Cleanup Checklist

### 🗑️ DELETE (Safe to Remove)

- [ ] `backend/pictorigo/` - Entire directory (unused legacy)
- [ ] `backend/tests/` - Migrate tests first, then delete
- [ ] `pictorigo/core/synthetic/` - Move to `tests/utils/`
- [ ] Test fixture converters in `tests/integration/test_optimization_convergence.py`
      (after frontend exports new format)

### 📦 MOVE

- [ ] `backend/tests/test_api.py` → `tests/api/test_solve_endpoint.py`
- [ ] `backend/tests/core/models/test_*.py` → `tests/unit/`
- [ ] `backend/tests/core/test_*.py` → `tests/unit/`
- [ ] `pictorigo/core/synthetic/` → `tests/utils/synthetic_scenes/`

### ✏️ EDIT

- [ ] `backend/routers/solve.py` - Already correct, no changes needed
- [ ] `backend/routers/projects.py` - Already correct, no changes needed
- [ ] `tests/unit/*.py` - Update imports: `backend.pictorigo` → `pictorigo`
- [ ] `tests/api/*.py` - Update imports: `backend.pictorigo` → `pictorigo`
- [ ] `pictorigo/__init__.py` - Add clean exports
- [ ] `frontend/src/types/optimization-export.ts` - Use new camera format

### 📝 CREATE

- [ ] `backend/README.md` - Backend API documentation
- [ ] `tests/README.md` - Test structure documentation
- [ ] `pictorigo/README.md` - Core library documentation

---

## Validation After Cleanup

### Test Everything Still Works

```bash
# 1. Root tests (optimization)
cd tests
python -m pytest integration/ -v

# 2. Backend tests (API)
cd tests/api
python -m pytest -v

# 3. Backend server
cd backend
uvicorn main:app --reload
# Hit endpoints, verify they work

# 4. Frontend
cd frontend
npm run dev
# Export project, verify format matches
```

---

## Final Structure (Clean & Beautiful)

```
📦 Pictorigo-oddjob
│
├── backend/                      # FastAPI server ONLY
│   ├── routers/                  # API endpoints
│   │   ├── solve.py
│   │   ├── projects.py
│   │   └── synthetic.py
│   ├── main.py                   # FastAPI app
│   ├── config.py
│   └── README.md
│
├── pictorigo/                    # Core optimization library
│   ├── __init__.py               # Clean exports
│   ├── pyproject.toml
│   └── core/
│       ├── models/               # Entities, constraints, project
│       ├── optimization/         # Factor graph, problem, residuals
│       ├── solver/               # SciPy wrapper, diagnostics
│       ├── math/                 # Camera, SE3, quaternions, robust
│       ├── initialization/       # PnP, incremental
│       └── export/               # GLTF, JSON exporters
│
├── tests/                        # All tests in one place
│   ├── fixtures/                 # Test data
│   │   └── project1.json
│   ├── utils/                    # Test utilities
│   │   └── synthetic_scenes/     # Scene generation
│   ├── unit/                     # Fast unit tests
│   │   ├── test_entities.py
│   │   ├── test_constraints.py
│   │   ├── test_camera.py
│   │   ├── test_factor_graph.py
│   │   └── test_residuals.py
│   ├── integration/              # Integration tests
│   │   ├── test_optimization_convergence.py  ✅
│   │   └── test_incremental_solver.py
│   ├── api/                      # Backend API tests
│   │   ├── test_solve_endpoint.py
│   │   └── test_projects_endpoint.py
│   └── README.md
│
└── frontend/                     # React app
    ├── src/
    │   └── types/
    │       └── optimization-export.ts  # NEW format only
    └── ...
```

---

## Benefits of Cleanup

### Before (Messy)
- ❌ Two `pictorigo` packages with different models
- ❌ Tests in two locations
- ❌ Unclear which code is canonical
- ❌ Import confusion (`backend.pictorigo` vs `pictorigo`)
- ❌ Duplicate camera formats
- ❌ Backend routers work despite the mess

### After (Clean)
- ✅ **Single source of truth**: `pictorigo/` is canonical
- ✅ **Backend is thin**: Just FastAPI routes, no business logic
- ✅ **Clear test structure**: unit / integration / api
- ✅ **One camera format**: Optimization-friendly
- ✅ **No duplication**: Every model has one home
- ✅ **Frontend exports directly** to canonical format
- ✅ **Easy to port to TypeScript** later (one clean codebase)

---

## Execution Timeline

### Immediate (Do Now - 30 min)
1. ✅ Delete `backend/pictorigo/` (safe, it's unused)
2. ✅ Create `tests/api/` and `tests/unit/` directories
3. ✅ Move backend tests to new structure
4. ✅ Update imports in moved tests

### Short Term (This Week - 2 hours)
1. ✅ Remove converter code from optimization test
2. ✅ Update frontend to export new camera format
3. ✅ Re-export test fixtures with new format
4. ✅ Move synthetic code to test utils
5. ✅ Add README files

### Medium Term (Next Sprint - 1 day)
1. ✅ Add unit tests for all residuals
2. ✅ Add integration test for incremental solver
3. ✅ Add API endpoint tests with real optimization
4. ✅ Performance benchmarking tests

---

## Risk Assessment

### What Could Go Wrong?

1. **"Backend routers stop working"**
   - ❌ Won't happen - they already use root `pictorigo`
   - ✅ Test: Run `uvicorn main:app` after cleanup

2. **"Tests break"**
   - ⚠️ Possible if imports not updated correctly
   - ✅ Mitigation: Update imports systematically, test after each move

3. **"Frontend export breaks"**
   - ⚠️ Possible when changing camera format
   - ✅ Mitigation: Update TypeScript types first, test export

4. **"Old project data incompatible"**
   - ⚠️ Possible if stored projects have old format
   - ✅ Mitigation: Add migration script or version bump

### Safety Nets

```bash
# Before cleanup - create backup branch
git checkout -b backup-before-cleanup
git push origin backup-before-cleanup

# Do cleanup on feature branch
git checkout -b cleanup-consolidation

# Test everything before merging
pytest tests/ -v
cd backend && uvicorn main:app --reload  # Test manually
cd frontend && npm run dev  # Test export

# Only merge when all green
git checkout main
git merge cleanup-consolidation
```

---

## Success Criteria

### ✅ Cleanup Complete When:

1. [ ] Only ONE `pictorigo` package exists (at root)
2. [ ] All tests are in `tests/` directory
3. [ ] Backend has no `pictorigo/` subdirectory
4. [ ] All imports work without `backend.pictorigo`
5. [ ] Frontend exports new camera format
6. [ ] All tests pass (pytest shows all green)
7. [ ] Backend API works (can hit /solve endpoint)
8. [ ] No duplicate model files
9. [ ] README files explain structure
10. [ ] You can explain the architecture in 30 seconds

**The 30-second pitch after cleanup:**
> "We have one core `pictorigo` library with optimization logic. The backend is just FastAPI routes that call into it. All tests live in `tests/`. Frontend exports directly to our canonical format. Everything is clean, no duplication, easy to maintain."

---

## Questions to Resolve

Before executing cleanup, decide:

1. **Camera format:** Keep optimization format? (Recommended: Yes)
2. **Legacy data:** Migrate old exports or version bump? (Recommended: Version bump, no legacy)
3. **Synthetic code:** Keep in package or move to tests? (Recommended: Move to tests)
4. **Export naming:** Keep "OptimizationExport" or rename? (Recommended: Keep)

---

## Commands Summary

```bash
# IMMEDIATE CLEANUP (Safe, Do Now)
rm -rf backend/pictorigo/
mkdir -p tests/{unit,integration,api,utils}

# MIGRATE TESTS
mv backend/tests/test_api.py tests/api/test_solve_endpoint.py
mv backend/tests/core/models/test_*.py tests/unit/
mv backend/tests/core/test_*.py tests/unit/

# UPDATE IMPORTS (in moved test files)
# Change: from backend.pictorigo → from pictorigo

# MOVE SYNTHETIC
mv pictorigo/core/synthetic/ tests/utils/synthetic_scenes/

# CLEANUP
rm -rf backend/tests/

# TEST
pytest tests/ -v
cd backend && uvicorn main:app --reload
```

---

## Need Help?

If something breaks during cleanup:

1. **Check imports**: Most issues are import path changes
2. **Verify PYTHONPATH**: Should include project root
3. **Check for circular imports**: Models shouldn't import from optimization
4. **Test incrementally**: Move one file, test, move next
5. **Use git**: Each step is a commit, easy to roll back

Remember: **The backend already works correctly!** This cleanup is just removing unused code and organizing tests. The risk is very low. 🎯
