- Before we're done with a task, run `bash check.sh`
- This project should currently have NO backward compability and NO legacy code. Keep it CLEAN.
- NEVER create multiple objects, classes, interfaces, or types that serve the same or similar purposes. Each concept gets ONE representation.
- Don't run the dev server. I run the dev server.
- gogo means "Start executing and don't stop until finished. Beep when done."s

## ENTITY LAYER IS LOCKED - DO NOT MODIFY

**The entity layer (`src/entities/`) has been completely refactored and is now STABLE.**

- DO NOT add fields, methods, or IDs to entities
- DO NOT modify entity class structures
- DO NOT change entity constructors or factory methods
- If UI code needs changes to work with entities, FIX THE UI CODE, not the entities
- See `src/entities/README.md` for details

**Current focus: Update UI components to work with the new entity architecture.**

## React Re-render Pattern (NOT Angular!)

React uses **reference equality** for change detection, NOT dirty checking like Angular.

**CORRECT pattern for mutations:**
```typescript
// Mutate entities/Sets directly (like Angular)
worldPoint.name = "New Name"
project.addWorldPoint(point)

// Force React re-render with object spread
setProject({ ...project })  // Creates new Project reference, keeps same Sets
```

**WRONG patterns:**
```typescript
setProject(project.clone())  // ❌ Shallow clone - doesn't work properly
setProject(project)          // ❌ Same reference - React won't detect change
```

**Why this works:**
- `{ ...project }` creates a NEW Project object → React detects change ✓
- Same Set references inside → your mutations are preserved ✓
- Entities are the same objects → all references stay valid ✓

## CRITICAL: Object References, NOT IDs

**ALWAYS use full object references. NEVER use IDs at runtime.**

- Entities reference other entities via object references (e.g., `line.pointA: WorldPoint`)
- APIs accept entity objects as parameters, NOT IDs (e.g., `createLine(pointA: WorldPoint, pointB: WorldPoint)`)
- Caller must resolve entities BEFORE calling APIs - no ID lookups inside functions
- IDs exist ONLY for serialization (DTOs) and as Map keys
- DTOs are ONLY for JSON serialization - they use IDs to avoid circular references
- The rest of the application NEVER sees DTOs or uses IDs

**Examples:**

✓ CORRECT:
```typescript
const line = new Line(pointA, pointB);
const point = line.pointA;
function createConstraint(line: Line, target: number) { ... }
```

✗ WRONG:
```typescript
const line = createLine(pointAId, pointBId);  // ❌ NO IDs
const point = project.points.get(line.pointAId);  // ❌ NO ID lookups
function createConstraint(lineId: string, target: number) { ... }  // ❌ NO ID params
```

## Key Architecture Points

- **Circular references are expected and welcome**: WorldPoint knows its Lines, Lines know their WorldPoints. Use Sets/Maps for collections.
- **Single global project variable**: `project: EntityProject` is a global variable. All code has direct access at all times.
- **No Repository pattern**: Simple functions for add/delete/query. Direct access to collections via Maps.

See architectural-rules.md for complete details.
- Do NOT use any to solve your problems. Proper casting is *important*!
- DON'T ADD FUCKING WRAPPER FUCKING FUNCTIONS TO HANDLE ID BASED CALLS, FIX THE ISSUE BY CALLING USING FULL ENTITIES.