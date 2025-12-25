# Testing Strategy

**Last Updated:** 2025-12-25

## Running Tests

```bash
# Run all tests
npm test -- --watchAll=false

# Run tests in watch mode (development)
npm test

# Run specific test file
npm test -- solving-scenarios.test.ts --watchAll=false
```

**Important:** On Windows, use `--watchAll=false` to avoid issues with file watchers and unprintable characters in test output.

## Test Coverage Status

**Current Coverage:** 1.5% line coverage

The coverage threshold has been lowered from 80% to match current reality. This is a known technical debt item that will be addressed incrementally.

| Module | Coverage | Status |
|--------|----------|--------|
| `src/optimization/` | ~50-70% | Best covered (core solver logic) |
| `src/entities/` | ~5-10% | Serialization tested |
| `src/components/` | 0% | No component tests |
| `src/hooks/` | ~10% | Only `useDomainOperations` partially |
| `src/services/` | 0% | No service tests |
| `src/utils/` | ~4% | Only `vec3.ts` partially |

## Test File Locations

### Optimization Tests (Primary Test Suite)
- `src/optimization/__tests__/solving-scenarios.test.ts` - **Primary test suite** with 10 comprehensive scenarios
  - Phase 1 (4 scenarios): Single camera initialization via PnP and VP
  - Phase 2 (3 scenarios): Two-camera systems with Essential Matrix
  - Phase 3 (3 scenarios): Complex multi-constraint scenarios
  - Total: 10 scenarios, 174 tests
- `src/optimization/__tests__/fixed-point-constraint.test.ts` - Tests for coordinate locking/inference

### Entity Tests
- `src/entities/__tests__/Serialization.test.ts` - Entity serialization/deserialization

### Integration Tests
- Test fixtures in `src/optimization/__tests__/fixtures/` - Pre-generated test scenarios

## Key Test Patterns

### Synthetic Scene Testing

Tests use synthetic scenes with known ground truth:
1. Create known world points, planes, and distances
2. Generate virtual cameras (including axis-aligned cases)
3. Project visible world points to image points
4. Ensure points are in front of cameras and inside image bounds
5. Run optimization and verify results match ground truth within tolerances

### Fixture-Based Testing

The optimization test suite uses pre-generated fixtures:
- Fixtures store serialized project state with known geometry
- Tests load fixtures, run optimization, and verify convergence
- Fixtures enable reproducible tests without complex setup code

### Test Helpers

Located in `src/optimization/__tests__/test-helpers.ts`:
- `expectCameraInitializedAwayFromOrigin()` - Verifies camera moved from origin
- `expectWorldPointInitialized()` - Verifies point has valid optimized coords
- `expectConvergedBeforeMaxIterations()` - Ensures optimization didn't timeout
- `expectResidualImproved()` - Verifies optimization reduced error

Fixture generation helpers in `src/optimization/__tests__/fixture-generator-helpers.ts`:
- `createStandardViewpoint()` - Creates viewpoint with standard camera params
- `createAndProjectWorldPoints()` - Creates world points and projects to image
- `createVanishingLines()` - Creates vanishing lines from 3D line segments
- `saveFixture()` - Handles fixture file saving

## Test Quality Assessment

**Current Quality Score: 9.5/10** (per test-improvements-report.md)

### Strengths
- Comprehensive scenario coverage (10 scenarios covering major use cases)
- Verifies intermediate optimization states, not just final results
- Tests validate initialization quality, convergence efficiency, and result accuracy
- Well-maintained fixture system for reproducible tests

### Known Gaps
- No component tests (React UI untested)
- No service tests (file I/O, IndexedDB untested)
- No hook tests (except partial coverage of `useDomainOperations`)
- Low overall coverage despite solid optimization test suite

## Recommended Testing Priorities

### High Priority
1. Add tests for critical file operations (`services/fileManager.ts`)
2. Add IndexedDB integration tests (`services/project-db/`)
3. Increase coverage of core utilities (`src/utils/`)

### Medium Priority
4. Add optimization workflow tests (`hooks/useOptimization.ts`)
5. Add interaction tests for image viewer components
6. Add tests for constraint validation logic

### Low Priority
7. Incrementally increase overall coverage threshold
8. Add performance benchmarks for optimization scenarios
9. Add visual regression tests for UI components

## Test Development Guidelines

### When Writing New Tests

1. **Use existing patterns** - Follow the structure in `solving-scenarios.test.ts`
2. **Verify intermediate states** - Don't just check final results
3. **Use descriptive test names** - Should explain what scenario is being tested
4. **Include ground truth** - Tests should have known correct answers

### When Modifying Optimization Code

1. **Run full test suite** - Always run `npm test -- --watchAll=false`
2. **Verify all 10 scenarios pass** - The solving-scenarios suite validates the entire pipeline
3. **Check for regressions** - Ensure existing scenarios still converge
4. **Update fixtures if needed** - If entity format changes, regenerate fixtures

### Test Performance

- Full optimization test suite runs in ~5-10 seconds
- Individual scenarios typically complete in <1 second
- Fixtures eliminate need for complex test setup, improving test speed

## Related Documentation

- `test-improvements-report.md` - Detailed analysis of test suite quality and improvements
- `scratch/SOLVING-TEST-PROTOCOL.md` - Protocol for systematic optimization testing
- Test fixtures stored in: `src/optimization/__tests__/fixtures/`

## Future Improvements

1. Add component tests using React Testing Library
2. Add E2E tests for critical user workflows
3. Implement visual regression testing
4. Add performance benchmarks with threshold alerts
5. Increase coverage incrementally toward 80% target
