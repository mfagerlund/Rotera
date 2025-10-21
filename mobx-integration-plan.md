# MobX Integration Plan

## Executive Summary

**Goal:** Replace React change detection hacks with MobX for automatic observable tracking of entity mutations.

**Timeline:** ~2 hours

**Impact:** Eliminates all manual change tracking, makes mutations work naturally (like Angular), improves performance with fine-grained reactivity.

## Current State

**Architecture:**

- Entity layer: WorldPoint, Line, Viewpoint, ImagePoint, Constraint classes
- Domain model: Mutation-based with circular references (WorldPoint ↔ Line ↔ ImagePoint)
- UI: React components
- State management: Custom hooks (useEntityProject, useDomainOperations)

**Current Problems:**

1. React can't detect entity mutations (reference-based change detection)
2. Using hacky workarounds:
   - `ObservableSet` - custom Set subclass with version counter
   - Trigger counter in `useEntityProject` to force re-renders
   - Manual `setProject()` calls after every mutation
   - Rebuilding all maps on every render
3. No fine-grained updates - any change rebuilds everything

## Problem Statement

React's reference-based change detection is incompatible with our mutation-based entity architecture. We're currently using hacky workarounds (trigger counters, manual version tracking, ObservableSet) to make React notice mutations.

**Files affected by current hacks:**

- `src/utils/ObservableSet.ts` - custom Set with version tracking
- `src/entities/project/Project.ts` - uses ObservableSet, has version property
- `src/hooks/useEntityProject.ts` - trigger counter hack
- `src/hooks/useDomainOperations.ts` - manual setProject() calls everywhere
- `src/components/MainLayout.tsx` - rebuilds all maps every render

## Solution: MobX

MobX provides automatic observable tracking for mutations - exactly like Angular's change detection, but for React.

## What MobX Does

```typescript
// Make entities observable
class WorldPoint {
  @observable name: string
  @observable lockedXyz: [number, number, number]
}

// React components auto-update when observables change
const PointList = observer(() => {
  return project.worldPoints.map(p => <div>{p.name}</div>)
  // Changing p.name automatically triggers re-render
})
```

**Key benefits:**

- Mutations just work (like Angular)
- Fine-grained reactivity (only affected components re-render)
- No manual version tracking
- No trigger hacks
- No rebuilding everything

## Implementation Steps

### 1. Install MobX (5 minutes)

```bash
npm install mobx mobx-react-lite
```

### 2. Make Entities Observable (30 minutes)

**Project.ts:**

```typescript
import { makeObservable, observable, action } from 'mobx'

export class Project {
  worldPoints: Set<WorldPoint>
  lines: Set<Line>
  viewpoints: Set<Viewpoint>
  imagePoints: Set<IImagePoint>
  constraints: Set<Constraint>

  constructor(...) {
    // ... existing constructor code ...

    makeObservable(this, {
      worldPoints: observable,
      lines: observable,
      viewpoints: observable,
      imagePoints: observable,
      constraints: observable,
      name: observable,
      addViewpoint: action,
      removeViewpoint: action,
      addWorldPoint: action,
      removeWorldPoint: action,
      // ... all other mutation methods
    })
  }

  // Remove version tracking - not needed anymore
}
```

**WorldPoint.ts, Viewpoint.ts, Line.ts, etc.:**

```typescript
import { makeObservable, observable, action } from 'mobx'

export class WorldPoint {
  constructor(...) {
    // ... existing constructor code ...

    makeObservable(this, {
      name: observable,
      lockedXyz: observable,
      optimizedXyz: observable,
      color: observable,
      isVisible: observable,
      connectedLines: observable,
      imagePoints: observable,
      // Mark mutation methods as actions
      addConnectedLine: action,
      removeConnectedLine: action,
      addImagePoint: action,
      removeImagePoint: action,
    })
  }
}
```

### 3. Update React Components (15 minutes)

**MainLayout.tsx:**

```typescript
import { observer } from 'mobx-react-lite'

export const MainLayout: React.FC = observer(() => {
  // No useMemo needed - MobX tracks dependencies automatically
  const worldPointsArray = Array.from(project?.worldPoints || [])
  const viewpointsArray = Array.from(project?.viewpoints || [])
  const linesArray = Array.from(project?.lines || [])

  // Component auto-updates when any observable changes
  return (
    // ... existing JSX
  )
})
```

**All component files:**

- Wrap with `observer()` any component that reads from entities
- Remove all useMemo for entity-derived data (MobX handles it)

### 4. Update useEntityProject Hook (10 minutes)

**useEntityProject.ts:**

```typescript
// Remove trigger counter - not needed
// Remove version tracking from useEffect
// Just use project reference directly

export const useEntityProject = () => {
  const [entityProject, setEntityProject] = useState<Project | null>(null);

  // Auto-save when ANY observable changes
  useEffect(() => {
    if (!entityProject || isLoading) return;

    // MobX autorun - runs when any observable accessed inside changes
    const disposer = autorun(() => {
      // Access project properties to track them
      const hasChanges =
        entityProject.worldPoints.size +
        entityProject.viewpoints.size +
        entityProject.lines.size;

      // Save on any change
      saveToLocalStorage(entityProject, STORAGE_KEY);
    });

    return disposer;
  }, [entityProject, isLoading]);

  return {
    project: entityProject,
    setProject: setEntityProject, // No wrapper needed
    // ...
  };
};
```

### 5. Update useDomainOperations (5 minutes)

**useDomainOperations.ts:**

```typescript
// Remove all setProject() calls!
// MobX automatically detects mutations

const addImage = async (file: File) => {
  project.addViewpoint(viewpoint);
  // That's it - UI updates automatically
};

const deleteImage = (viewpoint: Viewpoint) => {
  project.removeViewpoint(viewpoint);
  // Done - no setProject needed
};
```

### 6. Cleanup (15 minutes)

**Remove:**

- `ObservableSet.ts` - delete file
- All `project.version` code
- All `trigger` counters
- All manual `setProject()` calls after mutations
- All useMemo for entity-derived data

**Update Project.ts:**

- Change `ObservableSet<T>` back to `Set<T>`
- Remove `get version()` property
- Keep all mutation methods (now marked as `@action`)

### 7. Update Serialization (10 minutes)

**File: `src/entities/Serialization.ts`**

MobX observables work with existing serialization, but import `toJS` for safety if needed.

````typescript
import { toJS } from 'mobx'  // Optional - for explicit conversion
import { Project } from './project/Project'
// ... other imports

export class Serialization {
  static serialize(project: Project): string {
    const context = new SerializationContext()

    // Option 1: Direct access (usually works fine)
    const dto: ProjectDto = {
      name: project.name,
      worldPoints: Array.from(project.worldPoints).map(wp => wp.serialize(context)),
      viewpoints: Array.from(project.viewpoints).map(vp => vp.serialize(context)),
      lines: Array.from(project.lines).map(line => line.serialize(context)),
      imagePoints: Array.from(project.imagePoints).map(ip => (ip as ImagePoint).serialize(context)),
      constraints: Array.from(project.constraints).map(c => c.serialize(context)),
      // ... all other fields
    }

    return JSON.stringify(dto, null, 2)

    // Option 2: Use toJS if you get proxy errors
    // const plainProject = toJS(project)
    // const dto: ProjectDto = {
    //   worldPoints: Array.from(plainProject.worldPoints).map(wp => wp.serialize(context)),
    //   // ... etc
    // }
  }

  static deserialize(json: string): Project {
    const dto = JSON.parse(json) as ProjectDto
    const context = new SerializationContext()

    // CHANGE: Back to regular Set (not ObservableSet)
    const worldPoints = new Set(
      dto.worldPoints.map(wpDto => WorldPoint.deserialize(wpDto, context))
    )

    const viewpoints = new Set(
      dto.viewpoints.map(vpDto => Viewpoint.deserialize(vpDto, context))
    )

    const lines = new Set(
      dto.lines.map(lineDto => Line.deserialize(lineDto, context))
    )

    const imagePoints = new Set<IImagePoint>(
      dto.imagePoints.map(ipDto => ImagePoint.deserialize(ipDto, context))
    )

    const constraints = new Set(
      dto.constraints.map(cDto => Constraint.deserialize(cDto, context))
    )

    return Project.createFull(
      dto.name,
      worldPoints,
      lines,
      viewpoints,
      imagePoints,
      constraints,
      // ... all other fields
    )
  }
}

## Performance Characteristics

**Current approach:**

- Mutation → trigger++ → full re-render → rebuild all maps → update all components

**With MobX:**

- Mutation → MobX tracks → only affected components re-render → no rebuilding

**Example:**

```typescript
worldPoint.name = "New Name";

// Current: Everything rebuilds
// MobX: Only components displaying that specific point re-render
````

## Alternative: Hierarchical Hash (Not Recommended)

You mentioned: "project hash changes if list changes, hash = aggregate(position^item)"

**Concept:**

```typescript
class Project {
  get hash(): number {
    let h = 0
    this.worldPoints.forEach((wp, i) => h ^= (i * wp.hash))
    this.viewpoints.forEach((vp, i) => h ^= (i * vp.hash))
    return h
  }
}

// React useMemo:
}, [project.hash])
```

**Why not:**

- Still requires getter calls (less efficient than MobX)
- Order-dependent (Set iteration order matters)
- Hash collisions possible
- Doesn't solve fine-grained updates
- More complex than MobX

## Migration Risk Assessment

**Low Risk:**

- Entities don't change (just add decorators)
- UI code barely changes (wrap with observer)
- Can migrate incrementally (one component at a time)
- Easy to rollback (remove mobx, restore trigger)

**Testing Strategy:**

1. Add MobX to one entity (WorldPoint)
2. Make one component observer
3. Test mutations update UI
4. Expand to all entities
5. Remove old tracking code

## Timeline

- **Total: ~2 hours**
- Install & setup: 5 min
- Make entities observable: 30 min
- Update components: 30 min
- Update hooks: 15 min
- Cleanup old code: 30 min
- Testing: 15 min

## Documentation Updates

### CLAUDE.md

**Remove:**

```markdown
## React Re-render Pattern (NOT Angular!)

React uses **reference equality** for change detection...
setProject({ ...project }) // OLD HACK
```

**Add:**

````markdown
## MobX Observable Pattern

This project uses **MobX** for automatic change detection of entity mutations.

**CORRECT pattern for mutations:**

```typescript
// Just mutate entities directly (like Angular)
worldPoint.name = "New Name";
project.addWorldPoint(point);

// MobX automatically detects changes and updates UI
// NO setProject() calls needed
```
````

**Components:**

```typescript
import { observer } from 'mobx-react-lite'

export const MyComponent = observer(() => {
  // Automatically re-renders when any observable accessed here changes
  return <div>{worldPoint.name}</div>
})
```

**Entity classes:**

```typescript
class WorldPoint {
  constructor() {
    makeObservable(this, {
      name: observable,
      lockedXyz: observable,
      // mutation methods:
      addConnectedLine: action,
    });
  }
}
```

````

### entities/README.md

**Update:**
```markdown
## MobX Integration

All entities are MobX observables. Changes are automatically tracked.

**When adding new properties:**
1. Add to `makeObservable()` call in constructor
2. Mark as `observable` for data, `action` for mutations
3. React components wrapped with `observer()` will auto-update

**Example:**
```typescript
class Line {
  constructor() {
    makeObservable(this, {
      name: observable,           // auto-tracked
      color: observable,          // auto-tracked
      setColor: action,           // mutation method
    })
  }
}
````

````

## Step-by-Step Implementation Checklist

Use this checklist to track progress:

- [ ] 1. Install MobX: `npm install mobx mobx-react-lite`
- [ ] 2. Update `src/entities/project/Project.ts`:
  - [ ] Add MobX imports
  - [ ] Change `ObservableSet<T>` to `Set<T>` (4 places)
  - [ ] Add `makeObservable()` in constructor
  - [ ] Remove `get version()` property
  - [ ] Update `static create()` to use `Set` not `ObservableSet`
- [ ] 3. Update `src/entities/world-point/WorldPoint.ts`:
  - [ ] Add MobX imports
  - [ ] Add `makeObservable()` in constructor
- [ ] 4. Update `src/entities/viewpoint/Viewpoint.ts`:
  - [ ] Add MobX imports
  - [ ] Add `makeObservable()` in constructor
- [ ] 5. Update `src/entities/line/Line.ts`:
  - [ ] Add MobX imports
  - [ ] Add `makeObservable()` in constructor
- [ ] 6. Update `src/entities/imagePoint/ImagePoint.ts`:
  - [ ] Add MobX imports
  - [ ] Add `makeObservable()` in constructor
- [ ] 7. Update all constraint classes
- [ ] 8. Update `src/components/MainLayout.tsx`:
  - [ ] Import `observer` from mobx-react-lite
  - [ ] Wrap component with `observer()`
  - [ ] Remove all `useMemo` hooks
  - [ ] Remove console.log statements
- [ ] 9. Update `src/components/ImageNavigationToolbar.tsx`:
  - [ ] Wrap with `observer()`
- [ ] 10. Update all other components that read entity data
- [ ] 11. Update `src/hooks/useEntityProject.ts`:
  - [ ] Import `autorun` from mobx
  - [ ] Remove trigger counter
  - [ ] Replace useEffect with `autorun()`
  - [ ] Simplify setProject return
- [ ] 12. Update `src/hooks/useDomainOperations.ts`:
  - [ ] Remove ALL `setProject()` calls (search for "setProject(")
  - [ ] Remove debug console.logs
- [ ] 13. Update `src/entities/Serialization.ts`:
  - [ ] Change `ObservableSet` to `Set` in deserialize
  - [ ] Test serialization works
- [ ] 14. Cleanup:
  - [ ] Delete `src/utils/ObservableSet.ts`
  - [ ] Search codebase for "ObservableSet" - should be none left
  - [ ] Search for ".version" - remove any references
- [ ] 15. Update `CLAUDE.md` documentation
- [ ] 16. Update `src/entities/README.md` documentation
- [ ] 17. Run tests: `npm test -- --watchAll=false`
- [ ] 18. Run type check: `npm run type-check`
- [ ] 19. Manual testing:
  - [ ] Add image → appears immediately
  - [ ] Delete image → disappears immediately
  - [ ] Rename point → updates in all views
  - [ ] Reload page → changes persisted
- [ ] 20. Commit changes

## Open Questions

1. **Serialization compatibility** - Verify toJS() works with all entities (test during step 13)
2. **Performance with large datasets** - MobX is fast, but test with 1000+ points
3. **Optimization service integration** - Does it work with observables? (check optimizer.ts)

## Success Criteria

- ✅ Add image → appears immediately (no setProject call)
- ✅ Delete image → disappears immediately
- ✅ Rename point → updates everywhere it's displayed
- ✅ Auto-save triggers on any mutation
- ✅ No console errors
- ✅ All tests pass
- ✅ Code is simpler (less tracking machinery)

## Common Issues & Solutions

**Issue: "Uncaught Error: [MobX] Since strict-mode is enabled..."**
- Solution: Wrap mutations in `runInAction()` or mark methods with `@action`
- Already handled by marking all mutation methods as `action` in makeObservable

**Issue: Component not updating**
- Check: Is component wrapped with `observer()`?
- Check: Is the data being accessed actually observable?
- Debug: Add console.log inside observer component to verify it re-runs

**Issue: "makeObservable can only be used for classes with an own constructor"**
- Cause: Calling makeObservable in parent class
- Solution: Call makeObservable in the most derived class constructor

**Issue: Serialization errors with MobX proxies**
- Solution: Use `toJS()` before serialization (see step 7)

**Issue: Performance degradation**
- Cause: Too many observers tracking too much
- Solution: Use `computed` for derived values (can add later if needed)

## Rollback Plan

If MobX causes critical issues:

**Quick Rollback (restores working state):**
```bash
git stash  # Save current work
git checkout HEAD -- src/  # Restore last commit
npm install  # Restore package.json state
````

**Manual Rollback:**

1. `npm uninstall mobx mobx-react-lite`
2. Git revert entity changes (or restore from backup)
3. Restore `src/utils/ObservableSet.ts`
4. Restore trigger counter in useEntityProject
5. Restore setProject() calls in useDomainOperations
6. Restore useMemo in MainLayout

**Note:** The entity layer structure remains unchanged (just decorators added), so rollback is low-risk.

## Additional Resources

- MobX Documentation: https://mobx.js.org/
- MobX React Integration: https://mobx.js.org/react-integration.html
- Common Pitfalls: https://mobx.js.org/common-pitfalls.html

## File Summary - Quick Reference

**Files to modify:**

1. `src/entities/project/Project.ts` - Add makeObservable, remove ObservableSet
2. `src/entities/world-point/WorldPoint.ts` - Add makeObservable
3. `src/entities/viewpoint/Viewpoint.ts` - Add makeObservable
4. `src/entities/line/Line.ts` - Add makeObservable
5. `src/entities/imagePoint/ImagePoint.ts` - Add makeObservable
6. `src/entities/constraints/*.ts` - Add makeObservable to each
7. `src/components/MainLayout.tsx` - Wrap with observer, remove useMemo
8. `src/components/*.tsx` - Wrap all entity-reading components with observer
9. `src/hooks/useEntityProject.ts` - Add autorun, remove trigger
10. `src/hooks/useDomainOperations.ts` - Remove all setProject() calls
11. `src/entities/Serialization.ts` - Change ObservableSet to Set
12. `CLAUDE.md` - Update documentation
13. `src/entities/README.md` - Update documentation

**Files to delete:**

1. `src/utils/ObservableSet.ts`

**Search patterns to find:**

- "ObservableSet" - should be none after migration
- ".version" - remove any project.version references
- "setProject(project)" - remove these calls

```

```
