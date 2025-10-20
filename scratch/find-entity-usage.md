# Finding Entity Usage in Components

## Search Patterns

Use these patterns to find components that need updating:

### WorldPoint Usage
- Search for: `\.id` in context of points
- Search for: `project.points` (old Map)
- Search for: `point.xyz`
- Search for: `getCoordinates()`

### Line Usage
- Search for: `line.id`
- Search for: `project.lines`
- Search for: `line.constraints.`
- Search for: `line.pointA.id`

### Viewpoint Usage
- Search for: `viewpoint.id`
- Search for: `project.viewpoints`
- Search for: `viewpoint.lockedXyz`

### ImagePoint Usage
- Search for: `imagePoint.id`
- Search for: `imagePoint.worldPointId`
- Search for: `imagePoint.viewpointId`

### Project Usage
- Search for: `project.id`
- Search for: `project.settings.`
- Search for: `.values()` (Map iteration)
- Search for: `.get(` (Map lookups)

## Quick Scan Commands

Run these greps to find problematic patterns:

```bash
# Find .id usage (entities shouldn't have IDs)
grep -r "\.id" src/components/ --include="*.tsx" --include="*.ts"

# Find Map usage (should be Sets now)
grep -r "\.get(" src/components/ --include="*.tsx" --include="*.ts"
grep -r "\.values()" src/components/ --include="*.tsx" --include="*.ts"

# Find settings nesting (should be flat)
grep -r "project\.settings\." src/components/ --include="*.tsx" --include="*.ts"

# Find constraint nesting (should be flat)
grep -r "\.constraints\." src/components/ --include="*.tsx" --include="*.ts"
```
