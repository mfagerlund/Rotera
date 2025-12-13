# Testing Guide for Pictorigo

This document describes the testing infrastructure for the Pictorigo photogrammetry application.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run CI tests (no watch, with coverage)
npm run test:ci
```

## Test Suite Overview

**Current Status: 56 test files, 202 passing tests**

The test suite focuses on core optimization and entity serialization logic:

### 1. Optimization Tests (47 files)
**Location:** `src/optimization/__tests__/`

These tests validate the photogrammetry solver and constraint system:

- **Golden scenario tests**: End-to-end solving with known good solutions
  - Single camera scenarios (vanishing points, direction constraints)
  - Two-camera scenarios (bundle adjustment, mixed constraints)
  - Complex scenarios (coplanarity, intrinsic constraints)
- **Mathematical correctness**: Projection, triangulation, PnP, quaternion math
- **Constraint validation**: Distance, angle, coplanarity, direction constraints
- **Regression tests**: Fixtures from production bugs to prevent re-occurrence
- **Determinism tests**: Ensures optimization produces consistent results

Key test files:
- `solving-scenarios.test.ts` - Main scenario test suite (10 scenarios)
- `golden-bundle-adjustment.test.ts` - Multi-camera bundle adjustment
- `all-constraints.test.ts` - Comprehensive constraint testing
- `pnp.test.ts` - Perspective-n-Point camera pose estimation

### 2. Entity Serialization Tests (6 files)
**Location:** `src/entities/__tests__/` and `src/entities/*/__tests__/`

Tests for JSON serialization/deserialization of entity classes:
- `WorldPoint.serialization.test.ts`
- `ImagePoint.serialization.test.ts`
- `Line.serialization.test.ts`
- `Viewpoint.serialization.test.ts`
- `SerializationContext.test.ts`
- `Serialization.integration.test.ts`

### 3. Hook Tests (1 file)
**Location:** `src/hooks/__tests__/`

- `entity-deletion.test.ts` - 16 tests validating cascading entity deletion logic

### 4. Service Tests (1 file)
**Location:** `src/services/__tests__/`

- `optimization.test.ts` - 14 tests for the optimization service wrapper

### 5. Simple Smoke Test (1 file)
**Location:** `src/tests/`

- `simple.test.ts` - Basic test to verify Jest is working

## Test Categories NOT Yet Implemented

### Component Tests
**Status:** Not implemented

The application has **46 React components** in `src/components/` with **zero component tests**.

Components that would benefit from testing:
- UI panels (CoordinateSystemPanel, ConstraintEditor, etc.)
- 3D viewer (Viewer3D)
- Point and line editors
- Search and filter components

### End-to-End Tests
**Status:** Not implemented

No E2E workflow tests exist (despite the npm scripts referencing them).

### Visual Regression Tests
**Status:** Not implemented

No visual regression tests exist.

## Test Configuration

### Jest Configuration
**File:** `jest.config.cjs`

- **Environment:** jsdom for browser simulation
- **Transform:** Uses SWC for fast TypeScript compilation
- **Module mapping:** CSS and asset file mocks
- **Test pattern:** `**/__tests__/**/*.test.ts(x)`

### Test Utilities
**File:** `src/tests/testUtils.tsx`

Provides mock data and helper functions for testing.

## Coverage

The project does **not** enforce coverage thresholds. Coverage is primarily in:
- Optimization solver logic (excellent coverage)
- Entity serialization (good coverage)
- Hook logic for entity deletion (covered)

Gaps:
- UI components (0% coverage)
- User interaction flows (0% coverage)
- Services beyond optimization (minimal coverage)

## Development Workflow

```bash
# Start development with tests
npm run dev
npm run test:watch  # In another terminal
```

## Test Benefits

The current test suite provides:
- **Solver reliability**: Mathematical correctness of optimization algorithms
- **Regression prevention**: Golden scenario tests catch solver breakage
- **Entity integrity**: Serialization tests ensure save/load works correctly
- **Fast feedback**: 202 tests run in seconds

## Next Steps

To improve test coverage, consider adding:
1. Component tests for critical UI (3D viewer, constraint editor)
2. Integration tests for user workflows
3. Service tests for export, validation, and utilities
4. Coverage thresholds once baseline is established
