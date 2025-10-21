# Root Folder Cleanup Plan

**Goal:** Clean up C:\Dev\Pictorigo root folder, remove legacy code, organize documentation

---

## IMMEDIATE DELETE - Legacy/Obsolete Files

### Files
- [ ] **agents.md** - Content moved to CLAUDE.md (5 lines, outdated)
- [ ] **thoughts.md.bak** - Backup file (2.8KB)
- [ ] **build_output.txt** - Temporary build output (48KB)
- [ ] **test_projection_calc.ts** - Loose test script in root (should be in tests/)
- [ ] **watch-build.ps1** - Unused PowerShell script
- [ ] **TESTING-SUCCESS-SUMMARY.md** - Old summary
- [ ] **Makefile** - References non-existent backend/frontend structure (legacy Python project)

### Directories
- [ KEEP ] **Examples/** - Sample images (Cube/, Tower/) - not referenced in code
- [ DELETE ] **schemas/** - Contains project.json not referenced anywhere
- [ KEEP ] **tasks/** - Empty directory
- [ DELETE ] **milestones/** - Single old milestone file (M9_plan.md from Sep 27)

---

## MOVE TO docs/archive/ - Completed Planning Docs

These are completed planning documents that should be archived, not in root:

- [ COMPACT AND MOVE IF IT'S OF ANY USE ] **ENTITY_DRIVEN_OPTIMIZATION.md** - Architecture planning (16KB)
- [ DELETE  ] **IMPLEMENTATION_ROADMAP.md** - Roadmap (10KB)
- [  DELETE ] **mobx-integration-plan.md** - Completed integration (17KB, dated Oct 21)
- [  DELETE ] **serialization-implementation-plan.md** - Completed plan (54KB)
- [ DELETE  ] **serialization-refactoring.md** - Completed refactoring (16KB)

---

## MOVE TO scratch/ - Active Working Docs

These are working analysis documents:

- [ DELETE ] **analysis/** directory - Contains vanishing_line_design.md
  - Move to scratch/ or docs/ depending on relevance

---

## CONSOLIDATE - Multiple Check Scripts

Currently have 3 versions:
- **check.sh** ✓ KEEP (1.5KB, actively used, Git Bash compatible)
- **check.bat** ❌ DELETE (2.4KB, duplicate functionality)
- **check.cmd** ❌ DELETE (26 bytes, just redirects)

**Recommendation:** Keep only check.sh (works in Git Bash on Windows)

---

## KEEP - Essential Files

### Configuration Files (KEEP)
- .eslintrc.json
- .gitignore (UPDATE - see below)
- .pre-commit-config.yaml (CHECK: Still used?)
- babel.config.cjs
- index.html
- jest.config.js
- package.json, package-lock.json
- tsconfig.json, tsconfig.node.json
- vite.config.ts

### Documentation (KEEP)
- **CLAUDE.md** - Project instructions for Claude Code
- **architectural-rules.md** - Core architecture rules (16KB)
- **icons.md** - Icon reference guide (useful)
- **README.md** - Main readme
- **README-TESTING.md** - Testing documentation

### Build/Dev Scripts (KEEP)
- **beep.bat** - Audio feedback
- **check.sh** - Build verification
- **check-no-runtime-ids.ts** - Architecture enforcement (used in check.sh)
- **cl.bat** - Claude Code shortcut
- **dev.bat** - Dev server shortcut
- **run.bat** - Run shortcut
- **test.bat** - Test shortcut

### Directories (KEEP)
- .claude/
- .git/
- .github/
- .idea/ (gitignored)
- .vite/ (gitignored)
- docs/ (consolidate into this)
- node_modules/ (gitignored)
- public/
- scripts/
- scratch/
- src/
- test-data/

---

## UPDATE .gitignore

Add these entries:
```gitignore
# Scratch/working documents
scratch/

# Build outputs
build_output.txt

# Legacy
.pre-commit-config.yaml
```

---

## QUESTIONS FOR USER

1. **sync-worktrees.sh + sync.bat** - Are these still needed? Last used in git commits but for what workflow?

Delete

2. **.pre-commit-config.yaml** - Is pre-commit still being used?

Nope

3. **docs/archive/** - Keep this structure or flatten into docs/?


Delete

4. **plans/** directory - Contains LoopTrace.md. Still relevant or archive?

Delete

---

## MY RECOMMENDATIONS

### Recommended File Structure After Cleanup:

```
C:\Dev\Pictorigo\
├── .claude/                    (config)
├── .github/                    (CI/CD)
├── docs/                       (all documentation)
│   ├── archive/                (old planning docs, completed plans)
│   ├── architectural-rules.md
│   ├── icons.md
│   └── scalarAutograd-gauss-newton-spec.md
├── public/                     (assets)
├── scratch/                    (gitignored workspace)
├── scripts/                    (utility scripts)
├── src/                        (source code)
├── test-data/                  (test fixtures)
├── .eslintrc.json
├── .gitignore
├── babel.config.cjs
├── beep.bat
├── check.sh
├── check-no-runtime-ids.ts
├── CLAUDE.md
├── index.html
├── jest.config.js
├── package.json
├── README.md
├── README-TESTING.md
├── tsconfig.json
├── vite.config.ts
└── [various .bat shortcuts]
```

### Priority Actions (High Impact):
1. DELETE Examples/, schemas/, tasks/, milestones/
2. DELETE agents.md, thoughts.md.bak, build_output.txt, test_projection_calc.ts, Makefile
3. DELETE check.bat, check.cmd (keep check.sh only)
4. MOVE 5 planning .md files to docs/archive/
5. UPDATE .gitignore to ignore scratch/

---

## EXECUTION PLAN

If you approve, I will:
1. Create docs/archive/ structure if needed
2. Move completed planning docs to docs/archive/
3. Delete all legacy files/directories listed above
4. Update .gitignore
5. Run `bash check.sh` to verify everything still works
6. Commit changes with message: "Clean up root folder: remove legacy files, organize documentation"

**Estimated time:** 5 minutes
**Estimated lines affected:** ~20 deletions, ~5 moves
