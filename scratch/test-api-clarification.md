# Test API Clarification Needed

I'm seeing that the test files I just "fixed" are actually using the WRONG API signatures. The plan document was based on outdated information.

## Current Issues

### WorldPoint.create
The plan said:
```typescript
WorldPoint.create('Point A')  // 1 param
WorldPoint.create('Point A', { xyz: [0, 0, 0] })  // 2 params
```

But the ACTUAL signature is:
```typescript
static create(
    name: string,
    options: {
        lockedXyz: [number | null, number | null, number | null]
        color?: string
        isVisible?: boolean
        isOrigin?: boolean
        optimizedXyz?: [number, number, number]
    }
)
```

So tests should use:
```typescript
WorldPoint.create('Point A', { optimizedXyz: [0, 0, 0] })
// OR
WorldPoint.create('Point A', { lockedXyz: [0, 0, 0] })
```

### Constraint.create signatures
The plan said constraints take object references directly, but looking at DistanceConstraint:
```typescript
static create(
    name: string,  // ❌ MISSING FROM MY FIXES!
    pointA: WorldPoint,
    pointB: WorldPoint,
    targetDistance: number,
    options: { tolerance?: number }
)
```

So I was missing the NAME parameter!

## Questions

1. Should I use `optimizedXyz` or `lockedXyz` for test points?
   - Recommendation: Use `optimizedXyz` for initial positions that the optimizer can move
   - Use `lockedXyz` with `isLocked: true` for points that shouldn't move

2. What names should I give to constraints?
   - Recommendation: Use descriptive names like "Distance A-B", "Angle at vertex", etc.

3. Are there other signature changes I'm missing?

Please review and confirm the correct API usage.



lockedXyz is when a user has specified a locked/fixed xyz for a point. optimizedXyz is the positions after the optimizer has run. any axis locked should return the same value after optimization. but generally for optimization tests, it's optimizedXyz that should be used - lockedXyz is *only* relevant when testing locking/fixing coordinates.