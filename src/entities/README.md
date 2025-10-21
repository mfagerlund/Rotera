# Entity Architecture - DO NOT MODIFY

## CRITICAL: These entities are STABLE and LOCKED

**DO NOT modify these entity files unless explicitly requested by the user.**

The entity layer has been completely refactored and stabilized. Any changes to entities must be carefully considered and approved.

## Locked Entity Files

- `WorldPoint.ts` - Stable ✓
- `Line.ts` - Stable ✓
- `Viewpoint.ts` - Stable ✓
- `ImagePoint.ts` - Stable ✓
- `Project.ts` - Stable ✓
- `Serialization.ts` - Stable ✓

## Current Work: UI Layer Updates

**Focus on updating the UI components to work with the new entity architecture.**

Do NOT add fields, methods, or IDs to entities to make the UI work. Instead:
- Update UI code to use the new entity structure
- Use object references, NOT IDs
- Call entity methods directly
- Update any stale component code

## Key Architecture Rules

1. **Object References Only** - Entities reference other entities via objects, NEVER IDs at runtime
2. **No IDs on Entities** - IDs exist ONLY in DTOs during serialization
3. **Direct Field Access** - Access entity fields directly (no getter wrappers)
4. **Sets for Collections** - Entities use `Set<T>` for collections
5. **Global Project** - `project` is a global variable with direct access

See `CLAUDE.md` in project root for complete architectural rules.

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
```

## If You Need to Change Entities

1. **STOP** - Ask the user first
2. Explain why the change is needed
3. Wait for explicit approval
4. Document the change in this file
