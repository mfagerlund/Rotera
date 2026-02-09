---
name: regression-fixture
description: This skill should be used when creating regression test fixtures from .rotera project files. Triggers on words like "regression", "fixture", or "create a test for this project file".
---

# Regression Fixture

A regression fixture is a .rotera project file saved BEFORE solving, used as input to a test that calls `optimizeProject()` with production settings and asserts the result meets a quality threshold. The test must exercise the exact same code path as the UI.

## Rules

- **NEVER modify the project** in test code (no pre-setting positions, no custom options, no special flags)
- **Use `OPTIMIZE_PROJECT_DEFAULTS`** with only `verbose: false` override
- **Fixture = pre-solve state** - the file the user gives you, unmodified
- **Result must match UI** - if UI shows 1.15px, test must show ~1.15px

## Workflow

1. **Copy the file** to `src/optimization/__tests__/fixtures/Calibration/`
2. **Decide placement**: add to `regression-calibration.test.ts` (preferred) or create a separate test file if the test needs custom assertions or non-concurrent execution
3. **Write the test** using the patterns below
4. **Run and verify** the median error matches what the UI produces
5. **Set threshold** to a round number above the observed error (e.g., observed 1.15px -> threshold 2px)

## Standard Test (add to regression-calibration.test.ts)

```typescript
it.concurrent('My Fixture.rotera', async () => {
  await runTest('My Fixture.rotera', 2)  // threshold in px
})
```

Use `it(...)` instead of `it.concurrent(...)` when the test is sensitive to seeded RNG interleaving (e.g., multi-camera late PnP, underconstrained geometry).

## Custom Assertions Test (separate file or in regression-calibration.test.ts)

```typescript
it.concurrent('My Fixture.rotera', async () => {
  const jsonPath = path.join(FIXTURES_DIR, 'My Fixture.rotera')
  const jsonData = fs.readFileSync(jsonPath, 'utf8')
  const project = loadProjectFromJson(jsonData)

  const result = await optimizeProject(project, PRODUCTION_OPTIONS)

  expect(result.medianReprojectionError).toBeDefined()
  expect(result.medianReprojectionError!).toBeLessThan(3)

  // Custom assertions here (camera count, outliers, consistency, etc.)
})
```

`PRODUCTION_OPTIONS` is `{ ...OPTIMIZE_PROJECT_DEFAULTS, verbose: false }`.

## Consistency Test (for flaky/alternating solves)

```typescript
const results: number[] = []
for (let i = 0; i < 3; i++) {
  const project = loadProjectFromJson(fs.readFileSync(jsonPath, 'utf8'))
  const result = await optimizeProject(project, PRODUCTION_OPTIONS)
  results.push(result.medianReprojectionError!)
}
for (const median of results) {
  expect(median).toBeLessThan(3)
}
expect(Math.max(...results) - Math.min(...results)).toBeLessThan(1)
```
