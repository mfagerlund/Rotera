# Project Consolidation - Why This is a Mess

## The Problems

### 1. **Project is NOT in entities/**

Currently, there's NO `entities/project/Project.ts` entity class. Instead, we have:

- `types/project.ts` - Legacy interface with IDs everywhere (deprecated, but 22 files still import it)
- `types/project-entities.ts` - Contains `EntityProject` interface (NOT a class, just an interface)

**Why this is wrong:**
- Per architectural rules, EVERY domain concept should have ONE entity class in the entities folder
- Project is a core domain concept, so it MUST be `entities/project/Project.ts`
- Having it as a loose interface violates the principle

### 2. **ProjectSettings Duplication**

`ProjectSettings` is defined in BOTH:
- `types/project.ts` (lines 105-123)
- `types/project-entities.ts` (lines 30-47)

**Why this is wrong:**
- Architectural rule: "Each concept gets ONE representation"
- Two definitions means potential for drift and confusion
- Settings should be part of the Project entity OR a separate entity if it has its own lifecycle

### 3. **Using Maps Instead of Sets**

In `types/project-entities.ts`:
```typescript
worldPoints: Map<string, WorldPoint>   // ❌ WRONG
lines: Map<string, Line>                // ❌ WRONG
viewpoints: Map<string, Viewpoint>      // ❌ WRONG
```

**Why this is wrong:**
- Architectural rule Q6: "Use Sets for entity collections"
- Maps imply ID-based lookup, which violates the "no IDs at runtime" rule
- Should be: `worldPoints: Set<WorldPoint>`

### 4. **Settings as Separate Interface Instead of Embedded**

Currently:
```typescript
interface EntityProject {
  settings: ProjectSettings  // Reference to separate interface
}
```

**Why this is questionable:**
- Settings have no independent lifecycle
- Settings are not referenced by other entities
- They should just be embedded fields in the Project entity class

### 5. **No ProjectDTO in the Right Place**

Serialization exists in `store/project-serialization.ts`, but:
- There's no explicit `entities/project/ProjectDto.ts`
- The DTO interface is defined inline in project-serialization.ts
- Per architectural rules, DTOs should live alongside their entities

## The Fix

### 1. Create `entities/project/Project.ts`
A proper entity class with:
- Direct field access (no silly getters)
- Sets for collections (not Maps)
- Settings embedded as fields (not a separate interface)
- Object references only (no IDs except for serialization)

### 2. Create `entities/project/ProjectDto.ts`
For serialization ONLY with:
- IDs instead of object references
- Records/arrays for serialization
- ONLY used by project-serialization.ts

### 3. Update `store/project-serialization.ts`
- Import and use the new ProjectDto
- Keep all conversion logic sealed here

### 4. Delete the Duplicates
- Remove EntityProject interface from types/project-entities.ts
- Remove ProjectSettings interface duplicates
- Mark types/project.ts as fully deprecated (already is, just enforce it)

### 5. Update Global Variable
- Change `project-store.ts` to use the new Project entity
- Keep the simple global variable pattern

## Summary

The current structure violates these architectural rules:
1. ✗ Project is not in entities folder
2. ✗ ProjectSettings is duplicated
3. ✗ Using Maps instead of Sets (implies ID-based lookup)
4. ✗ No clear separation between Project entity and ProjectDTO
5. ✗ Settings should be embedded, not a separate interface

After consolidation:
1. ✓ `entities/project/Project.ts` - Clean entity with Sets
2. ✓ `entities/project/ProjectDto.ts` - Serialization only
3. ✓ All settings embedded directly in Project
4. ✓ ONE representation of Project concept
5. ✓ DTOs only in serialization layer
